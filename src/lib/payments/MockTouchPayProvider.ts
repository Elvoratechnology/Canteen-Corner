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
      // Accept either matching secret or test header in mock mode
      if (!signature && process.env.NODE_ENV === 'production') {
        return { valid: false, error: 'Missing TouchPay webhook signature header' };
      }

      const payload = JSON.parse(rawBody) as TouchPayWebhookPayload;
      if (!payload.providerRef || !payload.idempotencyKey || !payload.amount) {
        return { valid: false, error: 'Malformed webhook payload' };
      }

      return { valid: true, payload };
    } catch (e: any) {
      return { valid: false, error: e.message || 'Verification failure' };
    }
  }

  async processPaymentConfirmation(
    providerRef: string,
    idempotencyKey: string
  ): Promise<{ success: boolean; message: string }> {
    // Run database transaction to idempotently transition Deposit state and credit Offender
    return await prisma.$transaction(async (tx) => {
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
        throw new Error('Cannot credit a failed deposit.');
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

