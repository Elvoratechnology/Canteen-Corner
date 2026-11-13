import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { StripeProvider } from '../src/lib/payments/StripeProvider';
import { POST as stripeWebhookHandler } from '../src/app/api/payments/stripe/webhook/route';
import * as auditModule from '../src/lib/audit';
import * as adminModule from '../src/lib/supabase/admin';
import prisma from '../src/lib/db';

describe('Stripe Provider & Webhook Verification Suite', () => {
  const originalEnv = process.env;
  const webhookSecret = 'whsec_test_secret_stripe_12345';

  beforeEach(async () => {
    process.env = { ...originalEnv };
    process.env.STRIPE_WEBHOOK_SECRET = webhookSecret;

    // Reset John Smith's balance for stateful tests
    await prisma.offender.update({
      where: { id: 'A1234567' },
      data: { balance: 82.50 },
    });
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  function createSignedStripeRequest(payload: Record<string, unknown>, secret = webhookSecret, timestampOffset = 0): NextRequest {
    const rawBody = JSON.stringify(payload);
    const timestamp = Math.floor((Date.now() + timestampOffset) / 1000).toString();
    const signedPayload = `${timestamp}.${rawBody}`;
    const signature = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex');

    return new NextRequest('http://localhost:3000/api/payments/stripe/webhook', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'stripe-signature': `t=${timestamp},v1=${signature}`,
      },
      body: rawBody,
    });
  }

  describe('1. Production Security & Fail-Closed Guard', () => {
    it('should throw an explicit error in Production when STRIPE_SECRET_KEY is missing', async () => {
      (process.env as any).NODE_ENV = 'production';
      delete process.env.STRIPE_SECRET_KEY;

      const provider = new StripeProvider();
      await expect(
        provider.createPaymentIntent({
          amount: 50.0,
          offenderId: 'A1234567',
          idempotencyKey: 'idemp-stripe-fail-1',
          customerEmail: 'family@canteen.local',
          provider: 'STRIPE',
        })
      ).rejects.toThrow(/Live STRIPE_SECRET_KEY is missing, empty, or invalid/);
    });

    it('should throw an explicit error in Production when STRIPE_SECRET_KEY is a test key', async () => {
      (process.env as any).NODE_ENV = 'production';
      process.env.STRIPE_SECRET_KEY = 'sk_test_mock_secret_key_123';

      const provider = new StripeProvider();
      await expect(
        provider.createPaymentIntent({
          amount: 50.0,
          offenderId: 'A1234567',
          idempotencyKey: 'idemp-stripe-fail-2',
          customerEmail: 'family@canteen.local',
          provider: 'STRIPE',
        })
      ).rejects.toThrow(/test keys prohibited in Production/);
    });
  });

  describe('2. Intent Creation & Metadata Configuration', () => {
    it('should create a valid Stripe deposit intent with PENDING state in development', async () => {
      (process.env as any).NODE_ENV = 'development';
      const provider = new StripeProvider();

      const intent = await provider.createPaymentIntent({
        amount: 35.0,
        offenderId: 'A1234567',
        idempotencyKey: `idemp-stripe-${Date.now()}`,
        customerEmail: 'family@canteen.local',
        provider: 'STRIPE',
      });

      expect(intent.provider).toBe('STRIPE');
      expect(intent.status).toBe('PENDING');
      expect(intent.amount).toBe(35.0);
      expect(intent.fee).toBe(3.50);
      expect(intent.totalPaid).toBe(38.50);
      expect(intent.providerRef).toMatch(/^cs_live_\d+_[a-f0-9]+$/);
      expect(intent.checkoutUrl).toContain(intent.providerRef);
    });

    it('METADATA PROPAGATION: should explicitly configure client_reference_id, session metadata, and payment_intent_data.metadata', async () => {
      (process.env as any).NODE_ENV = 'development';
      const provider = new StripeProvider();
      const idemp = `idemp-meta-${Date.now()}`;

      const intent = await provider.createPaymentIntent({
        amount: 50.0,
        offenderId: 'A1234567',
        idempotencyKey: idemp,
        customerEmail: 'family@canteen.local',
        provider: 'STRIPE',
      });

      const params = intent.sessionParams as any;
      expect(params).toBeDefined();

      // 1. client_reference_id matches deposit providerRef
      expect(params.client_reference_id).toBe(intent.providerRef);

      // 2. Checkout Session metadata explicitly contains providerRef, idempotencyKey, offenderId
      expect(params.metadata.providerRef).toBe(intent.providerRef);
      expect(params.metadata.idempotencyKey).toBe(idemp);
      expect(params.metadata.offenderId).toBe('A1234567');

      // 3. payment_intent_data.metadata explicitly configured so PaymentIntent receives identical tracking
      expect(params.payment_intent_data).toBeDefined();
      expect(params.payment_intent_data.metadata.providerRef).toBe(intent.providerRef);
      expect(params.payment_intent_data.metadata.idempotencyKey).toBe(idemp);
      expect(params.payment_intent_data.metadata.offenderId).toBe('A1234567');
    });
  });

  describe('3. Webhook Signature Verification & Replay Defense', () => {
    it('should reject requests with missing stripe-signature header (401)', async () => {
      const req = new NextRequest('http://localhost:3000/api/payments/stripe/webhook', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type: 'payment_intent.succeeded' }),
      });

      const res = await stripeWebhookHandler(req);
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toContain('Missing stripe-signature header');
    });

    it('should reject tampered HMAC signature (401)', async () => {
      const req = createSignedStripeRequest(
        { type: 'payment_intent.succeeded', id: 'cs_123', amount: 5000 },
        'wrong_secret_key'
      );

      const res = await stripeWebhookHandler(req);
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toContain('Invalid Stripe HMAC webhook signature');
    });

    it('should reject webhook timestamps outside the 5-minute replay window', async () => {
      const req = createSignedStripeRequest(
        { type: 'payment_intent.succeeded', id: 'cs_123', amount: 5000 },
        webhookSecret,
        -10 * 60 * 1000
      );

      const res = await stripeWebhookHandler(req);
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toContain('replay protection window');
    });
  });

  describe('4. Confirmation Settlement & Failure Safety', () => {
    it('should handle successful payment_intent.succeeded with status "succeeded"', async () => {
      const auditSpy = vi.spyOn(auditModule, 'logAuditAction').mockResolvedValue();
      const mockConfirm = vi.spyOn(StripeProvider.prototype, 'processPaymentConfirmation').mockResolvedValue({
        success: true,
        message: 'Deposit confirmed successfully via Stripe.',
      });

      const req = createSignedStripeRequest({
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: 'pi_test_intent_100',
            status: 'succeeded',
            amount: 5000,
            currency: 'usd',
            metadata: { providerRef: 'cs_test_session_100', idempotencyKey: 'idemp-stripe-100' },
          },
        },
      });

      const res = await stripeWebhookHandler(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.received).toBe(true);
      expect(data.processed).toBe(true);
      // Correlated providerRef from metadata
      expect(mockConfirm).toHaveBeenCalledWith('cs_test_session_100', 'idemp-stripe-100', 50.0, 'USD');

      expect(auditSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'STRIPE_WEBHOOK_PROCESSED',
          metadata: { status: 'SUCCEEDED', message: 'Deposit confirmed successfully via Stripe.' },
        })
      );
    });

    it('SAFETY: should defer crediting if checkout.session.completed has payment_status !== "paid"', async () => {
      const auditSpy = vi.spyOn(auditModule, 'logAuditAction').mockResolvedValue();
      const mockConfirm = vi.spyOn(StripeProvider.prototype, 'processPaymentConfirmation').mockResolvedValue({
        success: true,
        message: 'Deposit confirmed',
      });

      const req = createSignedStripeRequest({
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test_unpaid_1',
            payment_status: 'unpaid',
            amount_total: 4000,
            currency: 'usd',
            metadata: { idempotencyKey: 'idemp-unpaid-1' },
          },
        },
      });

      const res = await stripeWebhookHandler(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.received).toBe(true);
      expect(data.processed).toBe(false);
      expect(data.status).toBe('UNPAID');
      expect(mockConfirm).not.toHaveBeenCalled();

      expect(auditSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'STRIPE_UNPAID_SESSION_IGNORED',
          metadata: { paymentStatus: 'unpaid', event: 'checkout.session.completed' },
        })
      );
    });

    it('SAFETY: should reject foreign non-USD currency deposits (400)', async () => {
      const auditSpy = vi.spyOn(auditModule, 'logAuditAction').mockResolvedValue();
      const mockConfirm = vi.spyOn(StripeProvider.prototype, 'processPaymentConfirmation').mockResolvedValue({
        success: true,
        message: 'Deposit confirmed',
      });

      const req = createSignedStripeRequest({
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test_eur_1',
            payment_status: 'paid',
            amount_total: 5000,
            currency: 'eur',
            metadata: { idempotencyKey: 'idemp-eur-1' },
          },
        },
      });

      const res = await stripeWebhookHandler(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain('Unsupported currency');
      expect(mockConfirm).not.toHaveBeenCalled();

      expect(auditSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'STRIPE_CURRENCY_MISMATCH_REJECTED',
          metadata: { currency: 'EUR', status: 'REJECTED' },
        })
      );
    });

    it('DUPLICATE PROTECTION: should acknowledge legitimate duplicate events with HTTP 200 without double crediting', async () => {
      const auditSpy = vi.spyOn(auditModule, 'logAuditAction').mockResolvedValue();
      vi.spyOn(StripeProvider.prototype, 'processPaymentConfirmation').mockResolvedValue({
        success: true,
        alreadyProcessed: true,
        message: 'Deposit already processed and credited (idempotent).',
      });

      const req = createSignedStripeRequest({
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: 'pi_test_dup_1',
            status: 'succeeded',
            amount: 5000,
            currency: 'usd',
            metadata: { providerRef: 'cs_test_dup_session_1', idempotencyKey: 'idemp-dup-1' },
          },
        },
      });

      const res = await stripeWebhookHandler(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.received).toBe(true);
      expect(data.processed).toBe(false);
      expect(data.duplicate).toBe(true);

      expect(auditSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'STRIPE_WEBHOOK_DUPLICATE_ACKNOWLEDGED',
          metadata: { status: 'SUCCEEDED', duplicate: true, message: expect.any(String) },
        })
      );
    });

    it('EVENT CORRELATION: both checkout.session.completed and payment_intent.succeeded resolve to the exact same deposit with zero double crediting', async () => {
      const provider = new StripeProvider();
      const idemp = `idemp-corr-flow-${Date.now()}`;

      // 1. Create deposit intent for $25.00
      const intent = await provider.createPaymentIntent({
        amount: 25.0,
        offenderId: 'A1234567',
        idempotencyKey: idemp,
        customerEmail: 'family@canteen.local',
        provider: 'STRIPE',
      });

      // 2. Deliver Event 1: checkout.session.completed (ID is session ID)
      const sessionReq = createSignedStripeRequest({
        type: 'checkout.session.completed',
        data: {
          object: {
            id: intent.providerRef,
            payment_status: 'paid',
            amount_total: 2500,
            currency: 'usd',
            client_reference_id: intent.providerRef,
            metadata: {
              providerRef: intent.providerRef,
              idempotencyKey: idemp,
              offenderId: 'A1234567',
            },
          },
        },
      });

      const sessionRes = await stripeWebhookHandler(sessionReq);
      expect(sessionRes.status).toBe(200);
      const sessionData = await sessionRes.json();
      expect(sessionData.processed).toBe(true);

      // Verify balance increased once (82.50 + 25.00 = 107.50)
      const offenderAfterFirst = await prisma.offender.findUniqueOrThrow({ where: { id: 'A1234567' } });
      expect(offenderAfterFirst.balance).toBe(107.50);

      // 3. Deliver Event 2: payment_intent.succeeded (ID is pi_..., but metadata correlates to intent.providerRef)
      const piReq = createSignedStripeRequest({
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: 'pi_unrelated_id_999999',
            status: 'succeeded',
            amount: 2500,
            currency: 'usd',
            metadata: {
              providerRef: intent.providerRef,
              idempotencyKey: idemp,
              offenderId: 'A1234567',
            },
          },
        },
      });

      const piRes = await stripeWebhookHandler(piReq);
      expect(piRes.status).toBe(200);
      const piData = await piRes.json();
      expect(piData.received).toBe(true);
      expect(piData.processed).toBe(false);
      expect(piData.duplicate).toBe(true);

      // Balance must NOT double credit
      const offenderAfterSecond = await prisma.offender.findUniqueOrThrow({ where: { id: 'A1234567' } });
      expect(offenderAfterSecond.balance).toBe(107.50);
    });

    it('RPC SAFETY: Stripe fails closed in Production when process_confirmed_electronic_deposit is missing and NEVER calls legacy TouchPay RPC', async () => {
      (process.env as any).NODE_ENV = 'production';
      process.env.SUPABASE_URL = 'https://mock.supabase.co';
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock_service_key';

      const mockRpc = vi.fn().mockResolvedValue({
        data: null,
        error: { code: 'PGRST202', message: 'Could not find the function public.process_confirmed_electronic_deposit in the schema cache' },
      });

      vi.spyOn(adminModule, 'createAdminClient').mockReturnValue({
        rpc: mockRpc,
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { amount: 50.0, provider: 'STRIPE' }, error: null }),
            }),
          }),
        }),
      } as any);

      const provider = new StripeProvider();
      await expect(
        provider.processPaymentConfirmation('cs_test_fail_closed_1', 'idemp-fail-1', 50.0)
      ).rejects.toThrow(/The required generalized electronic confirmation RPC "process_confirmed_electronic_deposit" is missing from the database/);

      // Prove that process_confirmed_touchpay_deposit was NEVER called as a fallback for Stripe
      const touchpayCalls = mockRpc.mock.calls.filter((c: any) => c[0] === 'process_confirmed_touchpay_deposit');
      expect(touchpayCalls).toHaveLength(0);
    });

    it('EXACT USD CENT VALIDATION: detects and rejects even a 1-cent amount mismatch ($50.00 vs $50.01)', async () => {
      (process.env as any).NODE_ENV = 'development';
      const provider = new StripeProvider();
      const idemp = `idemp-cent-mismatch-${Date.now()}`;

      const intent = await provider.createPaymentIntent({
        amount: 50.0,
        offenderId: 'A1234567',
        idempotencyKey: idemp,
        customerEmail: 'family@canteen.local',
        provider: 'STRIPE',
      });

      // Confirm with 1 cent discrepancy ($50.01)
      const result = await provider.processPaymentConfirmation(intent.providerRef, idemp, 50.01);
      expect(result.success).toBe(false);
      expect(result.message).toContain('SECURITY ALERT: Verified amount');

      // Balance must remain unchanged at $82.50
      const offender = await prisma.offender.findUniqueOrThrow({ where: { id: 'A1234567' } });
      expect(offender.balance).toBe(82.50);

      // Deposit marked FAILED
      const deposit = await prisma.deposit.findUniqueOrThrow({ where: { providerRef: intent.providerRef } });
      expect(deposit.status).toBe('FAILED');
    });

    it('should handle business rejection (success: false) safely without logging SUCCEEDED', async () => {
      const auditSpy = vi.spyOn(auditModule, 'logAuditAction').mockResolvedValue();
      vi.spyOn(StripeProvider.prototype, 'processPaymentConfirmation').mockResolvedValue({
        success: false,
        message: 'Security Alert: Deposit amount mismatch.',
      });

      const req = createSignedStripeRequest({
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test_fraud_200',
            payment_status: 'paid',
            amount: 9999,
            currency: 'usd',
            metadata: { idempotencyKey: 'idemp-stripe-200' },
          },
        },
      });

      const res = await stripeWebhookHandler(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.received).toBe(true);
      expect(data.processed).toBe(false);

      expect(auditSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'STRIPE_CONFIRMATION_REJECTED',
          metadata: { status: 'FAILED', message: 'Security Alert: Deposit amount mismatch.' },
        })
      );

      const succeededLogs = auditSpy.mock.calls.filter(
        (c) => (c[0]?.metadata as any)?.status === 'SUCCEEDED'
      );
      expect(succeededLogs).toHaveLength(0);
    });

    it('should return HTTP 500 when confirmation throws an RPC or connection error to trigger Stripe retries', async () => {
      vi.spyOn(StripeProvider.prototype, 'processPaymentConfirmation').mockRejectedValue(
        new Error('Supabase RPC network connection timeout')
      );

      const req = createSignedStripeRequest({
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: 'cs_test_retry_300',
            status: 'succeeded',
            amount: 2500,
            currency: 'usd',
            metadata: { idempotencyKey: 'idemp-stripe-300' },
          },
        },
      });

      const res = await stripeWebhookHandler(req);
      expect(res.status).toBe(500);
      const data = await res.json();
      expect(data.error).toContain('network connection timeout');
    });
  });
});
