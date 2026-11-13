import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'crypto';
import prisma from '../src/lib/db';
import { getPaymentProvider } from '../src/lib/payments';

describe('Phase 3: Electronic Payments (Stripe/PayPal) & Family Portal Verification', () => {
  beforeEach(async () => {
    // Reset John Smith's balance
    await prisma.offender.update({
      where: { id: 'A1234567' },
      data: { balance: 82.50 },
    });
  });

  it('should initialize a payment intent with PENDING status and valid provider reference', async () => {
    const provider = getPaymentProvider();
    const familyUser = await prisma.user.findUniqueOrThrow({
      where: { email: 'family@canteen.local' },
      include: { familyAccount: true },
    });

    const idempotencyKey = `idemp-test-${Date.now()}`;
    const intent = await provider.createPaymentIntent({
      amount: 50.00,
      offenderId: 'A1234567',
      familyAccountId: familyUser.familyAccount?.id,
      idempotencyKey,
      customerEmail: 'family@canteen.local',
    });

    expect(intent.providerRef).toMatch(/^(cs_test_|cs_live_)/);
    expect(intent.status).toBe('PENDING');
    expect(intent.amount).toBe(50.00);
    expect(intent.fee).toBe(3.50);
    expect(intent.totalPaid).toBe(53.50);

    // Verify Deposit record exists in PENDING state
    const depositRecord = await prisma.deposit.findUnique({
      where: { providerRef: intent.providerRef },
    });
    expect(depositRecord).toBeDefined();
    expect(depositRecord?.status).toBe('PENDING');

    // Inmate balance must NOT be credited yet
    const offender = await prisma.offender.findUniqueOrThrow({ where: { id: 'A1234567' } });
    expect(offender.balance).toBe(82.50);
  });

  it('should credit inmate account only upon confirmed success and record in double-entry ledger', async () => {
    const provider = getPaymentProvider();
    const idempotencyKey = `idemp-confirm-${Date.now()}`;

    const intent = await provider.createPaymentIntent({
      amount: 25.00,
      offenderId: 'A1234567',
      idempotencyKey,
      customerEmail: 'family@canteen.local',
    });

    // Process confirmation
    const result = await provider.processPaymentConfirmation(intent.providerRef, idempotencyKey);
    expect(result.success).toBe(true);

    // Offender balance must increase by $25.00 (from 82.50 to 107.50)
    const offender = await prisma.offender.findUniqueOrThrow({ where: { id: 'A1234567' } });
    expect(offender.balance).toBe(107.50);

    // Deposit must be SUCCEEDED
    const deposit = await prisma.deposit.findUniqueOrThrow({ where: { providerRef: intent.providerRef } });
    expect(deposit.status).toBe('SUCCEEDED');
    expect(deposit.completedAt).toBeDefined();

    // Double-entry ledger entry must exist with credit = 25.00
    const ledger = await prisma.ledgerEntry.findFirst({
      where: { referenceId: intent.providerRef },
    });
    expect(ledger).toBeDefined();
    expect(ledger?.type).toBe('DEPOSIT');
    expect(ledger?.credit).toBe(25.00);
    expect(ledger?.balanceBefore).toBe(82.50);
    expect(ledger?.balanceAfter).toBe(107.50);
  });

  it('should enforce idempotency and prevent double-crediting if confirmation is triggered multiple times', async () => {
    const provider = getPaymentProvider();
    const idempotencyKey = `idemp-double-${Date.now()}`;

    const intent = await provider.createPaymentIntent({
      amount: 30.00,
      offenderId: 'A1234567',
      idempotencyKey,
      customerEmail: 'family@canteen.local',
    });

    // 1st confirmation
    await provider.processPaymentConfirmation(intent.providerRef, idempotencyKey);
    const offenderAfterFirst = await prisma.offender.findUniqueOrThrow({ where: { id: 'A1234567' } });
    expect(offenderAfterFirst.balance).toBe(112.50); // 82.50 + 30.00

    // 2nd confirmation with same providerRef
    const secondResult = await provider.processPaymentConfirmation(intent.providerRef, idempotencyKey);
    expect(secondResult.success).toBe(true);

    // Balance MUST NOT double credit
    const offenderAfterSecond = await prisma.offender.findUniqueOrThrow({ where: { id: 'A1234567' } });
    expect(offenderAfterSecond.balance).toBe(112.50);
  });

  it('should detect and reject amount mismatch fraud during payment confirmation', async () => {
    const provider = getPaymentProvider();
    const idempotencyKey = `idemp-mismatch-${Date.now()}`;

    const intent = await provider.createPaymentIntent({
      amount: 20.00,
      offenderId: 'A1234567',
      idempotencyKey,
      customerEmail: 'family@canteen.local',
    });

    // Attempt confirmation with mismatched amount ($100.00 instead of $20.00)
    const result = await provider.processPaymentConfirmation(intent.providerRef, idempotencyKey, 100.00);
    expect(result.success).toBe(false);
    expect(result.message).toContain('SECURITY ALERT: Verified amount');

    // Offender balance must NOT change
    const offender = await prisma.offender.findUniqueOrThrow({ where: { id: 'A1234567' } });
    expect(offender.balance).toBe(82.50);

    // Deposit must be marked FAILED
    const deposit = await prisma.deposit.findUniqueOrThrow({ where: { providerRef: intent.providerRef } });
    expect(deposit.status).toBe('FAILED');
  });

  it('should verify payment webhook signatures cryptographically and reject tampering', async () => {
    const provider = getPaymentProvider();
    const secret = process.env.STRIPE_WEBHOOK_SECRET || 'whsec_test_mock_secret_key_12345';

    const validPayload = JSON.stringify({
      id: 'evt_test_12345',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_mock_123',
          payment_status: 'paid',
          amount_total: 2500,
          metadata: {
            depositId: 'dep-123',
            offenderId: 'A1234567',
            idempotencyKey: 'idemp-hook-1',
          },
        },
      },
    });

    const nowSeconds = Math.floor(Date.now() / 1000);
    const validSig = crypto.createHmac('sha256', secret).update(`${nowSeconds}.${validPayload}`).digest('hex');

    // 1. Valid webhook
    const validResult = await provider.verifyWebhook(
      {
        'stripe-signature': `t=${nowSeconds},v1=${validSig}`,
      },
      validPayload
    );
    expect(validResult.valid).toBe(true);
    expect(validResult.payload?.providerRef).toBe('cs_test_mock_123');

    // 2. Tampered signature
    const invalidResult = await provider.verifyWebhook(
      {
        'stripe-signature': `t=${nowSeconds},v1=0000000000000000000000000000000000000000000000000000000000000000`,
      },
      validPayload
    );
    expect(invalidResult.valid).toBe(false);
    expect(invalidResult.error).toContain('Invalid Stripe HMAC');

    // 3. Missing signature
    const missingSigResult = await provider.verifyWebhook({}, validPayload);
    expect(missingSigResult.valid).toBe(false);
    expect(missingSigResult.error).toContain('Missing stripe-signature header');

    // 4. Expired timestamp (> 5 minutes ago)
    const oldSeconds = nowSeconds - 600;
    const expiredSig = crypto.createHmac('sha256', secret).update(`${oldSeconds}.${validPayload}`).digest('hex');
    const expiredResult = await provider.verifyWebhook(
      {
        'stripe-signature': `t=${oldSeconds},v1=${expiredSig}`,
      },
      validPayload
    );
    expect(expiredResult.valid).toBe(false);
    expect(expiredResult.error).toContain('replay protection window');
  });
});
