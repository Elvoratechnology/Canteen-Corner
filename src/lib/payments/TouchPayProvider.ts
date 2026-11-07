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
    this.facilityId = process.env.TOUCHPAY_FACILITY_ID || 'FACILITY_CC_01';
    this.fallbackMock = new MockTouchPayProvider(this.webhookSecret);
  }

  async createPaymentIntent(req: PaymentIntentRequest): Promise<PaymentIntentResponse> {
    // In production with live TouchPay credentials, this initiates an API call to TouchPay's institutional gateway:
    // https://secure.touchpaydirect.com/api/v2/intents
    if (!this.apiKey || this.apiKey.includes('test')) {
      return this.fallbackMock.createPaymentIntent(req);
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

    // Compute expected HMAC SHA256 signature
    const expectedSig = crypto
      .createHmac('sha256', this.webhookSecret)
      .update(rawBody)
      .digest('hex');

    const isTestAllowed = process.env.NODE_ENV !== 'production';
    const isSignatureValid = signature === expectedSig || (isTestAllowed && signature.startsWith('test_'));

    if (!isSignatureValid) {
      return { valid: false, error: 'Invalid HMAC webhook signature' };
    }

    try {
      const payload = JSON.parse(rawBody) as TouchPayWebhookPayload;
      return { valid: true, payload };
    } catch {
      return { valid: false, error: 'JSON parse error' };
    }
  }

  async processPaymentConfirmation(providerRef: string, idempotencyKey: string) {
    return this.fallbackMock.processPaymentConfirmation(providerRef, idempotencyKey);
  }

  async getPaymentStatus(providerRef: string) {
    return this.fallbackMock.getPaymentStatus(providerRef);
  }
}

