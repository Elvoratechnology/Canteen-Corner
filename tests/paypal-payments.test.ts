import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { PayPalProvider } from '../src/lib/payments/PayPalProvider';
import { POST as payPalWebhookHandler } from '../src/app/api/payments/paypal/webhook/route';
import * as auditModule from '../src/lib/audit';
import * as adminModule from '../src/lib/supabase/admin';
import prisma from '../src/lib/db';

describe('PayPal Provider & Webhook Verification Suite', () => {
  const originalEnv = process.env;
  const webhookId = 'mock_paypal_webhook_id_12345';

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.PAYPAL_WEBHOOK_ID = webhookId;
    process.env.PAYPAL_CLIENT_ID = 'test_paypal_client_id';
    process.env.PAYPAL_CLIENT_SECRET = 'test_paypal_client_secret';
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  function createSignedPayPalRequest(
    payload: Record<string, unknown>,
    transmissionId = 'tx-123456789',
    timestamp = new Date().toISOString(),
    signature = 'test_sig_mock_valid_123',
    certUrl = 'https://api.sandbox.paypal.com/v1/notifications/certs/CERT-123',
    authAlgo = 'SHA256withRSA'
  ): NextRequest {
    const rawBody = JSON.stringify(payload);

    return new NextRequest('http://localhost:3000/api/payments/paypal/webhook', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'paypal-transmission-id': transmissionId,
        'paypal-transmission-time': timestamp,
        'paypal-transmission-sig': signature,
        'paypal-cert-url': certUrl,
        'paypal-auth-algo': authAlgo,
      },
      body: rawBody,
    });
  }

  describe('1. Production Security & Fail-Closed Guard', () => {
    it('should throw an explicit error in Production when PAYPAL_CLIENT_ID or SECRET is missing', async () => {
      (process.env as any).NODE_ENV = 'production';
      delete process.env.PAYPAL_CLIENT_ID;
      delete process.env.PAYPAL_CLIENT_SECRET;

      const provider = new PayPalProvider();
      await expect(
        provider.createPaymentIntent({
          amount: 50.0,
          offenderId: 'A1234567',
          idempotencyKey: 'idemp-paypal-fail-1',
          customerEmail: 'family@canteen.local',
          provider: 'PAYPAL',
        })
      ).rejects.toThrow(/Live PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET are required in Production/);
    });

    it('should fail closed in Production when mock signatures are submitted (401)', async () => {
      (process.env as any).NODE_ENV = 'production';
      process.env.PAYPAL_WEBHOOK_ID = 'live_wh_id_real';

      const req = createSignedPayPalRequest(
        { event_type: 'PAYMENT.CAPTURE.COMPLETED', id: 'ORDER-123', amount: { value: '50.00', currency_code: 'USD' } },
        'tx-test-999',
        new Date().toISOString(),
        'test_mock_bypass_signature'
      );

      const res = await payPalWebhookHandler(req);
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toContain('Mock signatures prohibited in Production');
    });
  });

  describe('2. Intent Creation & Capture in Development', () => {
    it('should create a valid PayPal deposit order with PENDING state in development', async () => {
      (process.env as any).NODE_ENV = 'development';
      const provider = new PayPalProvider();

      const intent = await provider.createPaymentIntent({
        amount: 45.0,
        offenderId: 'A1234567',
        idempotencyKey: `idemp-paypal-${Date.now()}`,
        customerEmail: 'family@canteen.local',
        provider: 'PAYPAL',
      });

      expect(intent.provider).toBe('PAYPAL');
      expect(intent.status).toBe('PENDING');
      expect(intent.amount).toBe(45.0);
      expect(intent.fee).toBe(3.50);
      expect(intent.totalPaid).toBe(48.50);
      expect(intent.providerRef).toMatch(/^ORDER-PAYPAL-\d+-[A-F0-9]+$/);
      expect(intent.checkoutUrl).toContain(intent.providerRef);
    });
  });

  describe('3. Webhook Transmission Verification & Domain Guard', () => {
    it('should reject requests with missing PayPal transmission headers (401)', async () => {
      const req = new NextRequest('http://localhost:3000/api/payments/paypal/webhook', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ event_type: 'PAYMENT.CAPTURE.COMPLETED' }),
      });

      const res = await payPalWebhookHandler(req);
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toContain('Missing required PayPal transmission verification headers');
    });

    it('should reject requests with untrusted cert URL domain in Production (401)', async () => {
      (process.env as any).NODE_ENV = 'production';
      process.env.PAYPAL_WEBHOOK_ID = 'live_wh_id_real';

      const req = createSignedPayPalRequest(
        { event_type: 'PAYMENT.CAPTURE.COMPLETED', id: 'ORDER-123' },
        'tx-test-999',
        new Date().toISOString(),
        'real_sig',
        'https://malicious-evilhacker.com/certs/fake.crt'
      );

      const res = await payPalWebhookHandler(req);
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toContain('Untrusted PayPal certificate URL domain');
    });

    it('should reject tampered transmission signature (401)', async () => {
      const req = createSignedPayPalRequest(
        { event_type: 'PAYMENT.CAPTURE.COMPLETED', id: 'ORDER-123', amount: '50.00' },
        'tx-test-888',
        new Date().toISOString(),
        'tampered_bad_signature'
      );

      const res = await payPalWebhookHandler(req);
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toContain('Invalid PayPal webhook signature');
    });

    it('should verify official PayPal API endpoint verify-webhook-signature', async () => {
      const provider = new PayPalProvider();

      const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(async (url: any) => {
        if (url.toString().includes('/v1/oauth2/token')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ access_token: 'mock_oauth_access_token' }),
          } as any;
        }
        if (url.toString().includes('/v1/notifications/verify-webhook-signature')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ verification_status: 'SUCCESS' }),
          } as any;
        }
        return { ok: false, status: 404 } as any;
      });

      const result = await provider.verifyWithPayPalApi({
        authAlgo: 'SHA256withRSA',
        certUrl: 'https://api.sandbox.paypal.com/v1/notifications/certs/CERT-123',
        transmissionId: 'tx-test-123',
        transmissionSig: 'real_sig_123',
        transmissionTime: new Date().toISOString(),
        webhookId: 'test_wh_id',
        rawBody: JSON.stringify({ id: 'test' }),
      });

      expect(result.valid).toBe(true);
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe('4. Confirmation Settlement & Failure Safety', () => {
    it('CRITICAL SAFETY: CHECKOUT.ORDER.APPROVED must NEVER credit wallet balance directly', async () => {
      const auditSpy = vi.spyOn(auditModule, 'logAuditAction').mockResolvedValue();
      const mockConfirm = vi.spyOn(PayPalProvider.prototype, 'processPaymentConfirmation').mockResolvedValue({
        success: true,
        message: 'Deposit confirmed',
      });

      const req = createSignedPayPalRequest({
        event_type: 'CHECKOUT.ORDER.APPROVED',
        resource: {
          id: 'ORDER-PAYPAL-APPROVED-123',
          amount: { value: '50.00', currency_code: 'USD' },
        },
      });

      const res = await payPalWebhookHandler(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.received).toBe(true);
      expect(data.processed).toBe(false);
      expect(data.status).toBe('PENDING_CAPTURE');
      expect(mockConfirm).not.toHaveBeenCalled();

      expect(auditSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'PAYPAL_ORDER_APPROVED_AWAITING_CAPTURE',
          metadata: { event: 'CHECKOUT.ORDER.APPROVED', status: 'PENDING_CAPTURE' },
        })
      );
    });

    it('should reject non-USD foreign currency deposits (400)', async () => {
      const auditSpy = vi.spyOn(auditModule, 'logAuditAction').mockResolvedValue();
      const mockConfirm = vi.spyOn(PayPalProvider.prototype, 'processPaymentConfirmation').mockResolvedValue({
        success: true,
        message: 'Deposit confirmed',
      });

      const req = createSignedPayPalRequest({
        event_type: 'PAYMENT.CAPTURE.COMPLETED',
        resource: {
          id: 'CAPTURE-PAYPAL-EUR-1',
          custom_id: 'ORDER-PAYPAL-EUR-1',
          amount: { value: '50.00', currency_code: 'EUR' },
        },
      });

      const res = await payPalWebhookHandler(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain('Unsupported currency');
      expect(mockConfirm).not.toHaveBeenCalled();

      expect(auditSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'PAYPAL_CURRENCY_MISMATCH_REJECTED',
          metadata: { currency: 'EUR', status: 'REJECTED' },
        })
      );
    });

    it('should handle PAYMENT.CAPTURE.COMPLETED and log PAYPAL_WEBHOOK_PROCESSED', async () => {
      const auditSpy = vi.spyOn(auditModule, 'logAuditAction').mockResolvedValue();
      const mockConfirm = vi.spyOn(PayPalProvider.prototype, 'processPaymentConfirmation').mockResolvedValue({
        success: true,
        message: 'Deposit confirmed successfully via PayPal.',
      });

      const req = createSignedPayPalRequest({
        event_type: 'PAYMENT.CAPTURE.COMPLETED',
        resource: {
          id: 'CAPTURE-PAYPAL-777',
          custom_id: 'ORDER-PAYPAL-777',
          amount: { value: '45.00', currency_code: 'USD' },
        },
      });

      const res = await payPalWebhookHandler(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.received).toBe(true);
      expect(data.processed).toBe(true);
      expect(mockConfirm).toHaveBeenCalledWith('ORDER-PAYPAL-777', 'ORDER-PAYPAL-777', 45.0, 'USD');

      expect(auditSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'PAYPAL_WEBHOOK_PROCESSED',
          metadata: { status: 'SUCCEEDED', message: 'Deposit confirmed successfully via PayPal.' },
        })
      );
    });

    it('should acknowledge duplicate webhooks without crediting again (HTTP 200 duplicate: true)', async () => {
      const auditSpy = vi.spyOn(auditModule, 'logAuditAction').mockResolvedValue();
      vi.spyOn(PayPalProvider.prototype, 'processPaymentConfirmation').mockResolvedValue({
        success: true,
        alreadyProcessed: true,
        message: 'Deposit was already confirmed and credited previously.',
      });

      const req = createSignedPayPalRequest({
        event_type: 'PAYMENT.CAPTURE.COMPLETED',
        resource: {
          id: 'CAPTURE-PAYPAL-DUP-1',
          custom_id: 'ORDER-PAYPAL-DUP-1',
          amount: { value: '30.00', currency_code: 'USD' },
        },
      });

      const res = await payPalWebhookHandler(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.received).toBe(true);
      expect(data.processed).toBe(false);
      expect(data.duplicate).toBe(true);

      expect(auditSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'PAYPAL_WEBHOOK_DUPLICATE_ACKNOWLEDGED',
          metadata: { status: 'SUCCEEDED', duplicate: true, message: expect.any(String) },
        })
      );
    });

    it('should handle business rejection (success: false) safely without logging SUCCEEDED', async () => {
      const auditSpy = vi.spyOn(auditModule, 'logAuditAction').mockResolvedValue();
      vi.spyOn(PayPalProvider.prototype, 'processPaymentConfirmation').mockResolvedValue({
        success: false,
        message: 'Security Alert: Deposit amount mismatch.',
      });

      const req = createSignedPayPalRequest({
        event_type: 'PAYMENT.CAPTURE.COMPLETED',
        resource: {
          id: 'CAPTURE-PAYPAL-666',
          custom_id: 'ORDER-PAYPAL-666',
          amount: { value: '1000.00', currency_code: 'USD' },
        },
      });

      const res = await payPalWebhookHandler(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.received).toBe(true);
      expect(data.processed).toBe(false);

      expect(auditSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'PAYPAL_CONFIRMATION_REJECTED',
          metadata: { status: 'FAILED', message: 'Security Alert: Deposit amount mismatch.' },
        })
      );

      const succeededLogs = auditSpy.mock.calls.filter(
        (c) => (c[0]?.metadata as any)?.status === 'SUCCEEDED'
      );
      expect(succeededLogs).toHaveLength(0);
    });

    it('should return HTTP 500 when confirmation throws an RPC or connection error to trigger PayPal retries', async () => {
      vi.spyOn(PayPalProvider.prototype, 'processPaymentConfirmation').mockRejectedValue(
        new Error('PayPal settlement database timeout')
      );

      const req = createSignedPayPalRequest({
        event_type: 'PAYMENT.CAPTURE.COMPLETED',
        resource: {
          id: 'CAPTURE-PAYPAL-555',
          custom_id: 'ORDER-PAYPAL-555',
          amount: { value: '25.00', currency_code: 'USD' },
        },
      });

      const res = await payPalWebhookHandler(req);
      expect(res.status).toBe(500);
      const data = await res.json();
      expect(data.error).toContain('database timeout');
    });

    it('RPC SAFETY: PayPal fails closed in Production when process_confirmed_electronic_deposit is missing and NEVER calls legacy TouchPay RPC', async () => {
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
              single: vi.fn().mockResolvedValue({ data: { amount: 45.0, provider: 'PAYPAL' }, error: null }),
            }),
          }),
        }),
      } as any);

      const provider = new PayPalProvider();
      await expect(
        provider.processPaymentConfirmation('ORDER-PAYPAL-FAIL-1', 'idemp-fail-1', 45.0)
      ).rejects.toThrow(/The required generalized electronic confirmation RPC "process_confirmed_electronic_deposit" is missing from the database/);

      // Verify legacy TouchPay RPC was NEVER called
      const touchpayCalls = mockRpc.mock.calls.filter((c: any) => c[0] === 'process_confirmed_touchpay_deposit');
      expect(touchpayCalls).toHaveLength(0);
    });

    it('EXACT USD CENT VALIDATION: detects and rejects even a 1-cent amount mismatch ($45.00 vs $45.01) in PayPal confirmation', async () => {
      (process.env as any).NODE_ENV = 'development';
      const provider = new PayPalProvider();
      const idemp = `idemp-paypal-cent-${Date.now()}`;

      const intent = await provider.createPaymentIntent({
        amount: 45.0,
        offenderId: 'A1234567',
        idempotencyKey: idemp,
        customerEmail: 'family@canteen.local',
        provider: 'PAYPAL',
      });

      // Confirm with 1 cent discrepancy ($45.01)
      const result = await provider.processPaymentConfirmation(intent.providerRef, idemp, 45.01);
      expect(result.success).toBe(false);
      expect(result.message).toContain('SECURITY ALERT: Verified amount');

      // Balance must remain unchanged at $82.50
      const offender = await prisma.offender.findUniqueOrThrow({ where: { id: 'A1234567' } });
      expect(offender.balance).toBe(82.50);

      // Deposit marked FAILED
      const deposit = await prisma.deposit.findUniqueOrThrow({ where: { providerRef: intent.providerRef } });
      expect(deposit.status).toBe('FAILED');
    });
  });
});
