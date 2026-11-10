import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import prisma from '../src/lib/db';
import { TouchPayProvider } from '../src/lib/payments/TouchPayProvider';
import { MockTouchPayProvider } from '../src/lib/payments/MockTouchPayProvider';

describe('TouchPay Production Payment Safety Suite', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
    vi.resetModules();
  });

  describe('1. Production Payment Intent Safety (Fail Closed)', () => {
    it('should throw an explicit security error when TOUCHPAY_API_KEY is missing in Production', async () => {
      process.env.NODE_ENV = 'production';
      delete process.env.TOUCHPAY_API_KEY;
      process.env.TOUCHPAY_FACILITY_ID = 'FACILITY_CC_01';

      const provider = new TouchPayProvider();
      const mockSpy = vi.spyOn(MockTouchPayProvider.prototype, 'createPaymentIntent');

      await expect(
        provider.createPaymentIntent({
          amount: 25.0,
          offenderId: 'A1234567',
          idempotencyKey: 'idemp-test-fail-1',
          customerEmail: 'family@canteen.local',
        })
      ).rejects.toThrow(/Live TOUCHPAY_API_KEY is missing, empty, or invalid/);

      expect(mockSpy).not.toHaveBeenCalled();
    });

    it('should throw an explicit security error when TOUCHPAY_API_KEY contains "test" in Production', async () => {
      process.env.NODE_ENV = 'production';
      process.env.TOUCHPAY_API_KEY = 'tp_test_secret_key_12345';
      process.env.TOUCHPAY_FACILITY_ID = 'FACILITY_CC_01';

      const provider = new TouchPayProvider();
      const mockSpy = vi.spyOn(MockTouchPayProvider.prototype, 'createPaymentIntent');

      await expect(
        provider.createPaymentIntent({
          amount: 25.0,
          offenderId: 'A1234567',
          idempotencyKey: 'idemp-test-fail-2',
          customerEmail: 'family@canteen.local',
        })
      ).rejects.toThrow(/test keys prohibited in Production/);

      expect(mockSpy).not.toHaveBeenCalled();
    });

    it('should throw an explicit security error when TOUCHPAY_FACILITY_ID is missing in Production', async () => {
      process.env.NODE_ENV = 'production';
      process.env.TOUCHPAY_API_KEY = 'tp_live_real_institutional_key_999';
      delete process.env.TOUCHPAY_FACILITY_ID;

      const provider = new TouchPayProvider();
      const mockSpy = vi.spyOn(MockTouchPayProvider.prototype, 'createPaymentIntent');

      await expect(
        provider.createPaymentIntent({
          amount: 25.0,
          offenderId: 'A1234567',
          idempotencyKey: 'idemp-test-fail-3',
          customerEmail: 'family@canteen.local',
        })
      ).rejects.toThrow(/TOUCHPAY_FACILITY_ID is missing in Production/);

      expect(mockSpy).not.toHaveBeenCalled();
    });

    it('should allow payment intent creation in Development using mock fallback', async () => {
      process.env.NODE_ENV = 'development';
      process.env.TOUCHPAY_API_KEY = 'tp_test_dev_key';

      const provider = new TouchPayProvider();
      const intent = await provider.createPaymentIntent({
        amount: 25.0,
        offenderId: 'A1234567',
        idempotencyKey: `idemp-dev-${Date.now()}`,
        customerEmail: 'family@canteen.local',
      });

      expect(intent.status).toBe('PENDING');
      expect(intent.amount).toBe(25.0);
      expect(intent.providerRef).toMatch(/^TP-\d+$/);
    });
  });

  describe('2. Production Payment Confirmation Safety (Fail Closed)', () => {
    it('should throw an explicit configuration error when Supabase credentials are missing in Production', async () => {
      process.env.NODE_ENV = 'production';
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      delete process.env.SUPABASE_URL;
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;

      const provider = new TouchPayProvider();
      const mockSpy = vi.spyOn(MockTouchPayProvider.prototype, 'processPaymentConfirmation');

      await expect(
        provider.processPaymentConfirmation('TP-999999', 'idemp-test-conf-1', 25.0)
      ).rejects.toThrow(/SUPABASE_SERVICE_ROLE_KEY and SUPABASE_URL.*are required for atomic deposit confirmation in Production/);

      expect(mockSpy).not.toHaveBeenCalled();
    });

    it('should throw and never fall back to mock when Supabase RPC fails in Production', async () => {
      process.env.NODE_ENV = 'production';
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'test_service_role_key';
      process.env.SUPABASE_URL = 'https://mock-facility.supabase.co';

      // Mock createAdminClient to simulate an RPC failure
      vi.doMock('@/lib/supabase/admin', () => ({
        createAdminClient: () => ({
          from: () => ({
            select: () => ({
              eq: () => ({
                single: async () => ({ data: { amount: 25.0 }, error: null }),
              }),
            }),
          }),
          rpc: async () => ({
            data: null,
            error: { message: 'Database connection refused: RPC transaction failed.' },
          }),
        }),
      }));

      const provider = new TouchPayProvider();
      const mockSpy = vi.spyOn(MockTouchPayProvider.prototype, 'processPaymentConfirmation');

      await expect(
        provider.processPaymentConfirmation('TP-999999', 'idemp-test-conf-rpc-fail', 25.0)
      ).rejects.toThrow(/Supabase RPC process_confirmed_touchpay_deposit failed: Database connection refused/);

      expect(mockSpy).not.toHaveBeenCalled();
    });

    it('should allow payment confirmation in Development falling back to local transaction if Supabase is unconfigured', async () => {
      process.env.NODE_ENV = 'development';
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      delete process.env.SUPABASE_URL;
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;

      // Seed a test deposit
      const providerRef = `TP-DEV-${Date.now().toString().slice(-5)}`;
      await prisma.deposit.create({
        data: {
          offenderId: 'A1234567',
          amount: 10.0,
          fee: 3.5,
          totalPaid: 13.5,
          provider: 'TOUCHPAY',
          providerRef,
          status: 'PENDING',
          idempotencyKey: `idemp-${providerRef}`,
        },
      });

      const provider = new TouchPayProvider();
      const result = await provider.processPaymentConfirmation(providerRef, `idemp-${providerRef}`, 10.0);

      expect(result.success).toBe(true);
      const updatedDeposit = await prisma.deposit.findUnique({ where: { providerRef } });
      expect(updatedDeposit?.status).toBe('SUCCEEDED');
    });
  });

  describe('3. Production Webhook Security', () => {
    it('should reject webhook in Production if TOUCHPAY_WEBHOOK_SECRET is missing', async () => {
      process.env.NODE_ENV = 'production';
      delete process.env.TOUCHPAY_WEBHOOK_SECRET;

      const provider = new TouchPayProvider();
      const result = await provider.verifyWebhook(
        { 'x-touchpay-signature': 'any-signature' },
        JSON.stringify({ providerRef: 'TP-123456', idempotencyKey: 'idemp-1', amount: 50 })
      );

      expect(result.valid).toBe(false);
      expect(result.error).toContain('TouchPay webhook secret not configured on the server');
    });

    it('should reject "test_" signature prefix in Production', async () => {
      process.env.NODE_ENV = 'production';
      process.env.TOUCHPAY_WEBHOOK_SECRET = 'live_whsec_12345';

      const provider = new TouchPayProvider();
      const body = JSON.stringify({
        event: 'payment.succeeded',
        providerRef: 'TP-123456',
        idempotencyKey: 'idemp-1',
        amount: 50,
      });

      const result = await provider.verifyWebhook(
        {
          'x-touchpay-signature': 'test_bypass_sig',
          'x-touchpay-timestamp': Date.now().toString(),
        },
        body
      );

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid HMAC webhook signature');
    });
  });
});
