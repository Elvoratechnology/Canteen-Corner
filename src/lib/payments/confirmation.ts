import prisma from '@/lib/db';
import { logAuditAction } from '@/lib/audit';

export interface ProcessConfirmationOptions {
  providerRef: string;
  idempotencyKey: string;
  verifiedAmount?: number;
  currency?: string;
  expectedProvider?: 'STRIPE' | 'PAYPAL' | 'TOUCHPAY';
}

export interface ConfirmationResult {
  success: boolean;
  message: string;
  alreadyProcessed?: boolean;
}

/**
 * Shared confirmation engine for all payment providers (Stripe, PayPal).
 * Handles transaction validation, amount and currency checks, idempotency,
 * and atomic wallet crediting via Supabase RPC in production or transactional fallback in development.
 */
export async function processVerifiedDepositConfirmation(
  options: ProcessConfirmationOptions
): Promise<ConfirmationResult> {
  const { providerRef, idempotencyKey, verifiedAmount, currency = 'USD', expectedProvider } = options;

  if (currency.toUpperCase() !== 'USD') {
    throw new Error(`Unsupported currency: ${currency}. Canteen Corner institutional trust accounts only accept USD.`);
  }

  const isProduction = process.env.NODE_ENV === 'production';
  const hasSupabaseUrl = Boolean(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL);
  const hasServiceRoleKey = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);

  // 1. Production Execution Path: Strict Supabase RPC confirmation
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
        .select('amount, provider, facility_id')
        .eq('provider_ref', providerRef)
        .single();

      if (depErr || !dep) {
        throw new Error(depErr?.message || `Deposit reference ${providerRef} not found.`);
      }
      amountToVerify = dep.amount;
    }

    // Call authoritative atomic procedure in Supabase
    const providerToProcess = expectedProvider || 'STRIPE';

    if (providerToProcess === 'TOUCHPAY') {
      // Legacy backward-compatibility ONLY for historical TouchPay records
      const { data, error } = await adminClient.rpc('process_confirmed_touchpay_deposit', {
        p_provider_ref: providerRef,
        p_idempotency_key: idempotencyKey,
        p_verified_amount: amountToVerify,
        p_currency: 'USD',
      });

      if (error) {
        throw new Error(`Legacy TouchPay confirmation RPC failed: ${error.message}`);
      }

      const isSuccess = data?.status === 'SUCCEEDED' || data?.alreadyProcessed === true;
      return {
        success: isSuccess,
        alreadyProcessed: data?.alreadyProcessed === true,
        message: data?.message || (isSuccess ? 'Deposit confirmed successfully via legacy RPC.' : 'Deposit confirmation rejected.'),
      };
    }

    // For STRIPE and PAYPAL: Strictly require process_confirmed_electronic_deposit.
    // Fail closed immediately if missing, never falling back to legacy TouchPay RPC.
    const { data, error } = await adminClient.rpc('process_confirmed_electronic_deposit', {
      p_provider_ref: providerRef,
      p_idempotency_key: idempotencyKey,
      p_verified_amount: amountToVerify,
      p_currency: 'USD',
      p_provider: providerToProcess,
    });

    if (error) {
      if (error.code === 'PGRST202' || error.code === '42883' || error.message?.includes('Could not find the function')) {
        throw new Error(
          `Production Security Configuration Error: The required generalized electronic confirmation RPC "process_confirmed_electronic_deposit" is missing from the database. Live ${providerToProcess} deposits fail closed and will not fall back to legacy TouchPay functions.`
        );
      }
      throw new Error(`Deposit confirmation RPC failed: ${error.message}`);
    }

    const isSuccess = data?.status === 'SUCCEEDED' || data?.alreadyProcessed === true;
    return {
      success: isSuccess,
      alreadyProcessed: data?.alreadyProcessed === true,
      message: data?.message || (isSuccess ? 'Deposit confirmed successfully via RPC.' : 'Deposit confirmation rejected.'),
    };
  }

  // 2. Development / Local Environment Path
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

      const rpcName = (expectedProvider || 'STRIPE') === 'TOUCHPAY'
        ? 'process_confirmed_touchpay_deposit'
        : 'process_confirmed_electronic_deposit';

      const rpcParams: Record<string, unknown> = {
        p_provider_ref: providerRef,
        p_idempotency_key: idempotencyKey,
        p_verified_amount: amountToVerify,
        p_currency: 'USD',
      };
      if (rpcName === 'process_confirmed_electronic_deposit') {
        rpcParams.p_provider = expectedProvider || 'STRIPE';
      }

      const { data, error } = await adminClient.rpc(rpcName, rpcParams);

      if (error) {
        throw new Error(error.message);
      }

      const isSuccess = data?.status === 'SUCCEEDED' || data?.alreadyProcessed === true;
      return {
        success: isSuccess,
        alreadyProcessed: data?.alreadyProcessed === true,
        message: data?.message || 'Deposit confirmed successfully via RPC.',
      };
    } catch (err: any) {
      console.warn('Supabase RPC confirmation attempt, falling back to database transaction:', err?.message);
    }
  }

  // Local Prisma Transactional Fallback (SQLite / Local Dev)
  return await prisma.$transaction(async (tx) => {
    if (process.env.DATABASE_URL?.startsWith('postgres')) {
      await tx.$executeRawUnsafe(`SELECT set_config('canteen.authorized_transaction', 'true', true);`).catch(() => {});
    }

    const deposit = await tx.deposit.findUnique({
      where: { providerRef },
      include: {
        offender: {
          include: { facility: true },
        },
        familyAccount: {
          include: { user: true },
        },
      },
    });

    if (!deposit) {
      throw new Error(`Deposit reference ${providerRef} not found.`);
    }

    // Provider check if specified
    if (expectedProvider && deposit.provider !== expectedProvider) {
      throw new Error(`Deposit provider mismatch: expected ${expectedProvider}, found ${deposit.provider}.`);
    }

    // Exact Replay Idempotency
    if (deposit.status === 'SUCCEEDED') {
      return {
        success: true,
        alreadyProcessed: true,
        message: 'Deposit already processed and credited (idempotent).',
      };
    }

    if (deposit.status === 'FAILED') {
      return {
        success: false,
        alreadyProcessed: false,
        message: 'Deposit has failed or was marked invalid.',
      };
    }

    // Cross-Idempotency Protection
    if (deposit.idempotencyKey !== idempotencyKey) {
      throw new Error(`Idempotency key mismatch for provider reference ${providerRef}.`);
    }

    // Amount Precision and Integrity Verification using exact integer cents
    if (verifiedAmount !== undefined) {
      const depositCents = Math.round(deposit.amount * 100);
      const verifiedCents = Math.round(verifiedAmount * 100);

      if (depositCents !== verifiedCents) {
        await tx.deposit.update({
          where: { id: deposit.id },
          data: { status: 'FAILED' },
        });

        await tx.auditLog.create({
          data: {
            action: 'PAYMENT_AMOUNT_MISMATCH_FRAUD',
            actorId: deposit.provider,
            actorRole: 'SYSTEM',
            resourceType: 'DEPOSIT',
            resourceId: providerRef,
            metadata: JSON.stringify({
              recordedAmount: deposit.amount,
              verifiedAmount,
              recordedCents: depositCents,
              verifiedCents,
              provider: deposit.provider,
              reason: 'Amount mismatch between recorded deposit intent and verified gateway payload',
            }),
          },
        });

        return {
          success: false,
          alreadyProcessed: false,
          message: `SECURITY ALERT: Verified amount ($${verifiedAmount.toFixed(2)}) does not match deposit intent ($${deposit.amount.toFixed(2)}). Deposit marked FAILED.`,
        };
      }
    }

    // Facility Deposit Limit Verification
    const maxDeposit = deposit.offender.facility?.maxDepositAmount ?? 300.0;
    if (deposit.amount > maxDeposit) {
      await tx.deposit.update({
        where: { id: deposit.id },
        data: { status: 'FAILED' },
      });

      return {
        success: false,
        alreadyProcessed: false,
        message: `Deposit amount ($${deposit.amount.toFixed(2)}) exceeds facility maximum deposit limit ($${maxDeposit.toFixed(2)}).`,
      };
    }

    const offender = deposit.offender;
    const creditAmount = deposit.amount;
    const balanceBefore = offender.balance;
    const balanceAfter = Math.round((balanceBefore + creditAmount) * 100) / 100;

    // 1. Credit Inmate Account
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

    // 3. Double-entry Ledger Entry
    const providerLabel = deposit.provider === 'STRIPE' ? 'Stripe' : deposit.provider === 'PAYPAL' ? 'PayPal' : 'Electronic';
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
        description: `${providerLabel} electronic deposit from ${
          deposit.familyAccount?.user.name || 'Family & Friends'
        }`,
      },
    });

    // 4. Inmate Notification
    await tx.notification.create({
      data: {
        offenderId: offender.id,
        type: 'DEPOSIT_RECEIVED',
        title: `${providerLabel} Funds Received ($${creditAmount.toFixed(2)})`,
        message: `$${creditAmount.toFixed(2)} has been deposited into your trust account via ${providerLabel} (Ref: ${deposit.providerRef}). Your new balance is $${balanceAfter.toFixed(2)}.`,
      },
    });

    // 5. System Audit Action
    await tx.auditLog.create({
      data: {
        action: `${deposit.provider}_DEPOSIT_CONFIRMED`,
        actorId: `${deposit.provider}_GATEWAY`,
        actorRole: 'SYSTEM',
        resourceType: 'DEPOSIT',
        resourceId: providerRef,
        metadata: JSON.stringify({
          amount: creditAmount,
          currency: 'USD',
          provider: deposit.provider,
          offenderId: offender.id,
          newBalance: balanceAfter,
        }),
      },
    });

    return {
      success: true,
      alreadyProcessed: false,
      message: `Successfully credited $${creditAmount.toFixed(2)} to inmate ${offender.name} (${offender.id}).`,
    };
  });
}

