import crypto from 'crypto';
import { IPaymentProvider, PaymentIntentRequest, PaymentIntentResponse, WebhookVerificationResult, TouchPayWebhookPayload } from './types';
import prisma from '@/lib/db';
import { logAuditAction } from '@/lib/audit';

export class MockTouchPayProvider implements IPaymentProvider {
  private webhookSecret: string;

  constructor(secret?: string) {
    this.webhookSecret = secret || process.env.TOUCHPAY_WEBHOOK_SECRET || 'tp_whsec_mock_canteen_corner_verification_sig';
  }

  async createPaymentIntent(req: PaymentIntentRequest): Promise<PaymentIntentResponse> {
    // Standard TouchPay commissary electronic processing fee: $3.50 flat fee
    const fee = 3.50;
    const totalPaid = Math.round((req.amount + fee) * 100) / 100;

    // Generate unique TouchPay provider reference: TP-xxxxxx
    const randomSuffix = Math.floor(100000 + Math.random() * 900000);
    const providerRef = `TP-${randomSuffix}`;

    // Create initial Deposit record in PENDING state
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

    await logAuditAction({
      action: 'TOUCHPAY_INTENT_CREATED',
      actorId: req.familyAccountId || 'GUEST',
      actorRole: 'FAMILY',
      resourceType: 'DEPOSIT',
      resourceId: providerRef,
      metadata: {
        amount: req.amount,
        totalPaid,
        offenderId: req.offenderId,
      },
    });

    return {
      providerRef,
      status: 'PENDING',
      amount: req.amount,
      fee,
      totalPaid,
      checkoutUrl: `/family/touchpay/checkout?ref=${providerRef}`,
      instructions: 'Approved TouchPay Institutional Deposit Gate',
    };
  }

  async verifyWebhook(
    headers: Record<string, string>,
    rawBody: string
  ): Promise<WebhookVerificationResult> {
    try {
      const signature = headers['x-touchpay-signature'] || headers['X-TouchPay-Signature'];
      if (!signature) {
        return { valid: false, error: 'Missing TouchPay webhook signature header' };
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

      const expectedSig = crypto
        .createHmac('sha256', this.webhookSecret)
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
      if (
        !isSignatureValid &&
        isTestAllowed &&
        (signature.startsWith('test_') || signature === this.webhookSecret)
      ) {
        isSignatureValid = true;
      }

      if (!isSignatureValid) {
        return { valid: false, error: 'Invalid HMAC webhook signature' };
      }

      const payload = JSON.parse(rawBody) as TouchPayWebhookPayload;
      if (!payload.providerRef || !payload.idempotencyKey || typeof payload.amount !== 'number' || payload.amount <= 0) {
        return { valid: false, error: 'Malformed webhook payload' };
      }

      return { valid: true, payload };
    } catch (e: any) {
      return { valid: false, error: e.message || 'Verification failure' };
    }
  }

  async processPaymentConfirmation(
    providerRef: string,
    idempotencyKey: string,
    verifiedAmount?: number
  ): Promise<{ success: boolean; message: string }> {
    // Run database transaction to idempotently transition Deposit state and credit Offender
    return await prisma.$transaction(async (tx) => {
      // Set transaction authorization config in PostgreSQL if RLS / balance trigger is active
      if (process.env.DATABASE_URL?.startsWith('postgres')) {
        await tx.$executeRawUnsafe(`SELECT set_config('canteen.authorized_transaction', 'true', true);`).catch(() => {});
      }

      const deposit = await tx.deposit.findUnique({
        where: { providerRef },
        include: { offender: true, familyAccount: { include: { user: true } } },
      });

      if (!deposit) {
        throw new Error(`Deposit reference ${providerRef} not found.`);
      }

      // Idempotency: If already completed, return success without double crediting
      if (deposit.status === 'SUCCEEDED') {
        return {
          success: true,
          message: 'Deposit already processed and credited (idempotent).',
        };
      }

      if (deposit.status === 'FAILED') {
        return {
          success: false,
          message: 'Deposit has failed or was marked invalid.',
        };
      }

      // Enforce Verified Amount Integrity if verifiedAmount is supplied
      if (verifiedAmount !== undefined && Math.abs(deposit.amount - verifiedAmount) > 0.001) {
        await tx.deposit.update({
          where: { id: deposit.id },
          data: { status: 'FAILED' },
        });

        await tx.auditLog.create({
          data: {
            action: 'TOUCHPAY_AMOUNT_MISMATCH_FRAUD',
            actorId: 'TOUCHPAY_GATEWAY',
            actorRole: 'SYSTEM',
            resourceType: 'DEPOSIT',
            resourceId: providerRef,
            metadata: JSON.stringify({
              recordedAmount: deposit.amount,
              verifiedAmount,
              reason: 'Amount mismatch between recorded deposit intent and verified gateway payload',
            }),
          },
        });

        return {
          success: false,
          message: `SECURITY ALERT: Verified amount ($${verifiedAmount.toFixed(2)}) does not match deposit intent ($${deposit.amount.toFixed(2)}). Deposit marked FAILED.`,
        };
      }

      const offender = deposit.offender;
      const creditAmount = deposit.amount;
      const balanceBefore = offender.balance;
      const balanceAfter = Math.round((balanceBefore + creditAmount) * 100) / 100;

      // 1. Credit Offender balance
      await tx.offender.update({
        where: { id: offender.id },
        data: { balance: balanceAfter },
      });

      // 2. Mark Deposit as SUCCEEDED
      await tx.deposit.update({
        where: { id: deposit.id },
        data: {
          status: 'SUCCEEDED',
          completedAt: new Date(),
        },
      });

      // 3. Create Double-Entry Ledger Entry
      await tx.ledgerEntry.create({
        data: {
          offenderId: offender.id,
          type: 'DEPOSIT',
          debit: 0.0,
          credit: creditAmount,
          balanceBefore,
          balanceAfter,
          referenceType: 'DEPOSIT',
          referenceId: deposit.providerRef,
          description: `TouchPay electronic deposit from ${
            deposit.familyAccount?.user.name || 'Family & Friends'
          }`,
        },
      });

      // 4. Send Notification to Inmate
      await tx.notification.create({
        data: {
          offenderId: offender.id,
          type: 'DEPOSIT_RECEIVED',
          title: `TouchPay Funds Received ($${creditAmount.toFixed(2)})`,
          message: `$${creditAmount.toFixed(2)} has been deposited into your trust account via TouchPay (Ref: ${deposit.providerRef}). Your new balance is $${balanceAfter.toFixed(2)}.`,
        },
      });

      return {
        success: true,
        message: `Successfully credited $${creditAmount.toFixed(2)} to inmate ${offender.name} (${offender.id}).`,
      };
    });
  }

  async getPaymentStatus(providerRef: string): Promise<'PENDING' | 'SUCCEEDED' | 'FAILED'> {
    const deposit = await prisma.deposit.findUnique({
      where: { providerRef },
    });
    return (deposit?.status as any) || 'PENDING';
  }
}

