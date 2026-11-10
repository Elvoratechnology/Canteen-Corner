import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { POST } from '../src/app/api/payments/touchpay/webhook/route';
import * as auditModule from '../src/lib/audit';
import * as paymentsModule from '../src/lib/payments';

describe('TouchPay Webhook Route - Confirmation & Failure Handling', () => {
  const originalEnv = process.env;
  const webhookSecret = 'test_webhook_secret_key_12345';

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    process.env.TOUCHPAY_WEBHOOK_SECRET = webhookSecret;
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  function createSignedRequest(payload: Record<string, unknown>, secret = webhookSecret): NextRequest {
    const rawBody = JSON.stringify(payload);
    const timestamp = Date.now().toString();
    const signature = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

    return new NextRequest('http://localhost:3000/api/payments/touchpay/webhook', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-touchpay-signature': signature,
        'x-touchpay-timestamp': timestamp,
      },
      body: rawBody,
    });
  }

  it('1. should process a successful RPC confirmation and record a SUCCEEDED audit log', async () => {
    const auditSpy = vi.spyOn(auditModule, 'logAuditAction').mockResolvedValue();
    const mockProvider = {
      verifyWebhook: vi.fn().mockResolvedValue({
        valid: true,
        payload: {
          event: 'payment.succeeded',
          providerRef: 'TP-100001',
          idempotencyKey: 'idemp-succ-1',
          amount: 50.0,
        },
      }),
      processPaymentConfirmation: vi.fn().mockResolvedValue({
        success: true,
        message: 'Deposit confirmed successfully via Supabase RPC.',
      }),
      createPaymentIntent: vi.fn(),
      getPaymentStatus: vi.fn(),
    };
    vi.spyOn(paymentsModule, 'getPaymentProvider').mockReturnValue(mockProvider as any);

    const req = createSignedRequest({
      event: 'payment.succeeded',
      providerRef: 'TP-100001',
      idempotencyKey: 'idemp-succ-1',
      amount: 50.0,
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.received).toBe(true);
    expect(body.processed).toBe(true);
    expect(body.message).toBe('Deposit confirmed successfully via Supabase RPC.');

    expect(auditSpy).toHaveBeenCalledWith({
      action: 'TOUCHPAY_WEBHOOK_PROCESSED',
      actorId: 'TOUCHPAY_GATEWAY',
      actorRole: 'SYSTEM',
      resourceType: 'DEPOSIT',
      resourceId: 'TP-100001',
      metadata: { status: 'SUCCEEDED', message: 'Deposit confirmed successfully via Supabase RPC.' },
    });
  });

  it('2. should handle an already-processed idempotent result gracefully as success', async () => {
    const auditSpy = vi.spyOn(auditModule, 'logAuditAction').mockResolvedValue();
    const mockProvider = {
      verifyWebhook: vi.fn().mockResolvedValue({
        valid: true,
        payload: {
          event: 'payment.succeeded',
          providerRef: 'TP-100002',
          idempotencyKey: 'idemp-idemp-2',
          amount: 25.0,
        },
      }),
      processPaymentConfirmation: vi.fn().mockResolvedValue({
        success: true,
        message: 'Deposit already processed and credited (idempotent).',
      }),
      createPaymentIntent: vi.fn(),
      getPaymentStatus: vi.fn(),
    };
    vi.spyOn(paymentsModule, 'getPaymentProvider').mockReturnValue(mockProvider as any);

    const req = createSignedRequest({
      event: 'payment.succeeded',
      providerRef: 'TP-100002',
      idempotencyKey: 'idemp-idemp-2',
      amount: 25.0,
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.received).toBe(true);
    expect(body.processed).toBe(true);
    expect(body.message).toContain('idempotent');

    expect(auditSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'TOUCHPAY_WEBHOOK_PROCESSED',
        metadata: { status: 'SUCCEEDED', message: 'Deposit already processed and credited (idempotent).' },
      })
    );
  });

  it('3. should handle RPC business failure (success: false) by acknowledging with processed: false and recording rejection audit', async () => {
    const auditSpy = vi.spyOn(auditModule, 'logAuditAction').mockResolvedValue();
    const mockProvider = {
      verifyWebhook: vi.fn().mockResolvedValue({
        valid: true,
        payload: {
          event: 'payment.succeeded',
          providerRef: 'TP-100003',
          idempotencyKey: 'idemp-mismatch-3',
          amount: 999.0,
        },
      }),
      processPaymentConfirmation: vi.fn().mockResolvedValue({
        success: false,
        message: 'Security Alert: Deposit amount mismatch. Deposit marked FAILED.',
      }),
      createPaymentIntent: vi.fn(),
      getPaymentStatus: vi.fn(),
    };
    vi.spyOn(paymentsModule, 'getPaymentProvider').mockReturnValue(mockProvider as any);

    const req = createSignedRequest({
      event: 'payment.succeeded',
      providerRef: 'TP-100003',
      idempotencyKey: 'idemp-mismatch-3',
      amount: 999.0,
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.received).toBe(true);
    expect(body.processed).toBe(false);
    expect(body.message).toContain('Deposit amount mismatch');

    // Confirm TOUCHPAY_CONFIRMATION_REJECTED was logged with FAILED status
    expect(auditSpy).toHaveBeenCalledWith({
      action: 'TOUCHPAY_CONFIRMATION_REJECTED',
      actorId: 'TOUCHPAY_GATEWAY',
      actorRole: 'SYSTEM',
      resourceType: 'DEPOSIT',
      resourceId: 'TP-100003',
      metadata: { status: 'FAILED', message: 'Security Alert: Deposit amount mismatch. Deposit marked FAILED.' },
    });

    // Confirm SUCCEEDED was NEVER logged
    const succeededLogs = auditSpy.mock.calls.filter(
      (call) => (call[0]?.metadata as any)?.status === 'SUCCEEDED'
    );
    expect(succeededLogs).toHaveLength(0);
  });

  it('4. should return HTTP 500 when processPaymentConfirmation throws an RPC/connectivity error to allow provider retries', async () => {
    const auditSpy = vi.spyOn(auditModule, 'logAuditAction').mockResolvedValue();
    const mockProvider = {
      verifyWebhook: vi.fn().mockResolvedValue({
        valid: true,
        payload: {
          event: 'payment.succeeded',
          providerRef: 'TP-100004',
          idempotencyKey: 'idemp-err-4',
          amount: 50.0,
        },
      }),
      processPaymentConfirmation: vi.fn().mockRejectedValue(
        new Error('Supabase RPC process_confirmed_touchpay_deposit failed: Connection timeout.')
      ),
      createPaymentIntent: vi.fn(),
      getPaymentStatus: vi.fn(),
    };
    vi.spyOn(paymentsModule, 'getPaymentProvider').mockReturnValue(mockProvider as any);

    const req = createSignedRequest({
      event: 'payment.succeeded',
      providerRef: 'TP-100004',
      idempotencyKey: 'idemp-err-4',
      amount: 50.0,
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toContain('Connection timeout');

    // Neither success nor rejection should be logged as a completed webhook
    const completedWebhookLogs = auditSpy.mock.calls.filter(
      (call) => call[0]?.action === 'TOUCHPAY_WEBHOOK_PROCESSED'
    );
    expect(completedWebhookLogs).toHaveLength(0);
  });

  it('5. should strictly reject webhook with 401 when signature is invalid', async () => {
    const auditSpy = vi.spyOn(auditModule, 'logAuditAction').mockResolvedValue();
    const req = createSignedRequest(
      { event: 'payment.succeeded', providerRef: 'TP-100005', idempotencyKey: 'idemp-5', amount: 50.0 },
      'wrong_tampered_secret'
    );

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error).toContain('Invalid');
    expect(auditSpy).not.toHaveBeenCalled();
  });
});
