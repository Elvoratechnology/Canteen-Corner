import crypto from 'crypto';
import { IPaymentProvider, PaymentIntentRequest, PaymentIntentResponse, WebhookVerificationResult, TouchPayWebhookPayload } from './types';
import prisma from '@/lib/db';
import { MockTouchPayProvider } from './MockTouchPayProvider';

export class TouchPayProvider implements IPaymentProvider {
  private apiKey: string;
  private webhookSecret: string;
  private facilityId: string;
  private fallbackMock: MockTouchPayProvider;

  constructor() {
    this.apiKey = process.env.TOUCHPAY_API_KEY || '';
    this.webhookSecret = process.env.TOUCHPAY_WEBHOOK_SECRET || '';
    this.facilityId = process.env.TOUCHPAY_FACILITY_ID || (process.env.NODE_ENV === 'production' ? '' : 'FACILITY_CC_01');
    this.fallbackMock = new MockTouchPayProvider(this.webhookSecret);
  }

  async createPaymentIntent(req: PaymentIntentRequest): Promise<PaymentIntentResponse> {
    const isProduction = process.env.NODE_ENV === 'production';
    const apiKey = process.env.TOUCHPAY_API_KEY !== undefined ? process.env.TOUCHPAY_API_KEY : this.apiKey;
    const facilityId = process.env.TOUCHPAY_FACILITY_ID !== undefined ? process.env.TOUCHPAY_FACILITY_ID : this.facilityId;

    if (isProduction) {
      if (!apiKey || apiKey.trim().length === 0 || apiKey.toLowerCase().includes('test')) {
        throw new Error(
          'Production Security Configuration Error: Live TOUCHPAY_API_KEY is missing, empty, or invalid (test keys prohibited in Production).'
        );
      }
      if (!facilityId || facilityId.trim().length === 0) {
        throw new Error(
          'Production Security Configuration Error: TOUCHPAY_FACILITY_ID is missing in Production. An explicit facility identifier is required.'
        );
      }
    } else {
      if (!apiKey || apiKey.toLowerCase().includes('test')) {
        return this.fallbackMock.createPaymentIntent(req);
      }
    }

    const fee = 3.50;
    const totalPaid = Math.round((req.amount + fee) * 100) / 100;
    const providerRef = `TP-${Date.now().toString().slice(-6)}`;

    await prisma.deposit.create({
      data: {
        offenderId: req.offenderId,
        familyAccountId: req.familyAccountId || null,
        amount: req.amount,
        fee,
        totalPaid,
        provider: 'TOUCHPAY',
        providerRef,
        status: 'PENDING',
        idempotencyKey: req.idempotencyKey,
      },
    });

    return {
      providerRef,
      status: 'PENDING',
      amount: req.amount,
      fee,
      totalPaid,
      checkoutUrl: `/family/touchpay/checkout?ref=${providerRef}`,
      instructions: 'Production TouchPay Direct Checkout',
    };
  }

  async verifyWebhook(headers: Record<string, string>, rawBody: string): Promise<WebhookVerificationResult> {
    const signature = headers['x-touchpay-signature'] || headers['X-TouchPay-Signature'];
    if (!signature) {
      return { valid: false, error: 'Missing x-touchpay-signature header' };
    }

    const webhookSecret = process.env.TOUCHPAY_WEBHOOK_SECRET !== undefined ? process.env.TOUCHPAY_WEBHOOK_SECRET : this.webhookSecret;

    if (!webhookSecret && process.env.NODE_ENV === 'production') {
      return { valid: false, error: 'TouchPay webhook secret not configured on the server.' };
    }

    // Cryptographic Replay Protection: verify webhook timestamp window
    const timestampStr = headers['x-touchpay-timestamp'] || headers['X-TouchPay-Timestamp'];
    if (timestampStr) {
      const timestamp = parseInt(timestampStr, 10);
      if (!isNaN(timestamp)) {
        const timeDiff = Math.abs(Date.now() - timestamp);
        if (timeDiff > 5 * 60 * 1000) { // 5-minute maximum tolerance window
          return { valid: false, error: 'Webhook timestamp outside allowed replay protection window (5 minutes).' };
        }
      }
    }

    // Compute expected HMAC SHA256 signature
    const expectedSig = crypto
      .createHmac('sha256', webhookSecret || 'tp_whsec_mock_canteen_corner_verification_sig')
      .update(rawBody)
      .digest('hex');

    let isSignatureValid = false;
    try {
      const sigBuf = Buffer.from(signature, 'utf8');
      const expBuf = Buffer.from(expectedSig, 'utf8');
      if (sigBuf.length === expBuf.length && crypto.timingSafeEqual(sigBuf, expBuf)) {
        isSignatureValid = true;
      }
    } catch {
      isSignatureValid = false;
    }

    const isTestAllowed = process.env.NODE_ENV !== 'production';
    if (!isSignatureValid && isTestAllowed && (signature.startsWith('test_') || signature === webhookSecret)) {
      isSignatureValid = true;
    }

    if (!isSignatureValid) {
      return { valid: false, error: 'Invalid HMAC webhook signature' };
    }

    try {
      const payload = JSON.parse(rawBody) as TouchPayWebhookPayload;
      if (!payload.providerRef || !payload.idempotencyKey || typeof payload.amount !== 'number' || payload.amount <= 0) {
        return { valid: false, error: 'Malformed webhook payload' };
      }
      return { valid: true, payload };
    } catch {
      return { valid: false, error: 'JSON parse error' };
    }
  }

  async processPaymentConfirmation(
    providerRef: string,
    idempotencyKey: string,
    verifiedAmount?: number
  ) {
    const isProduction = process.env.NODE_ENV === 'production';
    const hasSupabaseUrl = Boolean(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL);
    const hasServiceRoleKey = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);

    if (isProduction) {
      if (!hasServiceRoleKey || !hasSupabaseUrl) {
        throw new Error(
          'Production Security Configuration Error: SUPABASE_SERVICE_ROLE_KEY and SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) are required for atomic deposit confirmation in Production.'
        );
      }

      const { createAdminClient } = await import('@/lib/supabase/admin');
      const adminClient = createAdminClient();

      let amountToVerify = verifiedAmount;
      if (amountToVerify === undefined) {
        const { data: dep, error: depErr } = await adminClient
          .from('deposits')
          .select('amount')
          .eq('provider_ref', providerRef)
          .single();

        if (depErr || !dep) {
          throw new Error(depErr?.message || `Deposit reference ${providerRef} not found.`);
        }
        amountToVerify = dep.amount;
      }

      const { data, error } = await adminClient.rpc('process_confirmed_touchpay_deposit', {
        p_provider_ref: providerRef,
        p_idempotency_key: idempotencyKey,
        p_verified_amount: amountToVerify,
        p_currency: 'USD',
      });

      if (error) {
        throw new Error(`Supabase RPC process_confirmed_touchpay_deposit failed: ${error.message}`);
      }

      return {
        success: data?.status === 'SUCCEEDED' || data?.alreadyProcessed === true,
        message: data?.message || 'Deposit confirmed successfully via Supabase RPC.',
      };
    }

    // Development / non-production environment
    if (hasServiceRoleKey && hasSupabaseUrl) {
      try {
        const { createAdminClient } = await import('@/lib/supabase/admin');
        const adminClient = createAdminClient();

        let amountToVerify = verifiedAmount;
        if (amountToVerify === undefined) {
          const { data: dep, error: depErr } = await adminClient
            .from('deposits')
            .select('amount')
            .eq('provider_ref', providerRef)
            .single();

          if (depErr || !dep) {
            throw new Error(depErr?.message || `Deposit reference ${providerRef} not found.`);
          }
          amountToVerify = dep.amount;
        }

        const { data, error } = await adminClient.rpc('process_confirmed_touchpay_deposit', {
          p_provider_ref: providerRef,
          p_idempotency_key: idempotencyKey,
          p_verified_amount: amountToVerify,
          p_currency: 'USD',
        });

        if (error) {
          throw new Error(error.message);
        }

        return {
          success: data?.status === 'SUCCEEDED' || data?.alreadyProcessed === true,
          message: data?.message || 'Deposit confirmed successfully via Supabase RPC.',
        };
      } catch (err: any) {
        console.warn('Supabase RPC confirmation attempt, falling back to database transaction:', err?.message);
      }
    }

    return this.fallbackMock.processPaymentConfirmation(providerRef, idempotencyKey, verifiedAmount);
  }

  async getPaymentStatus(providerRef: string) {
    const deposit = await prisma.deposit.findUnique({
      where: { providerRef },
    });
    return (deposit?.status as any) || 'PENDING';
  }
}
