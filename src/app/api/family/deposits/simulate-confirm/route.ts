import { NextRequest, NextResponse } from 'next/server';
import { getPaymentProvider } from '@/lib/payments';
import prisma from '@/lib/db';
import { getCurrentSession } from '@/lib/auth';
import { z } from 'zod';

const ConfirmSchema = z.object({
  providerRef: z.string().min(1),
});

export async function POST(req: NextRequest) {
  try {
    // Return 404 in production regardless of ENABLE_TOUCHPAY_SIMULATION
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'Not Found' }, { status: 404 });
    }

    const session = await getCurrentSession();
    if (!session || session.role !== 'FAMILY') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const result = ConfirmSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json({ error: 'Missing provider reference' }, { status: 400 });
    }

    const { providerRef } = result.data;
    const deposit = await prisma.deposit.findUnique({
      where: { providerRef },
    });

    if (!deposit) {
      return NextResponse.json({ error: 'Deposit not found' }, { status: 404 });
    }

    // Verify deposit ownership: family user can only interact with their own deposit intents
    const familyAccount = await prisma.familyAccount.findUnique({
      where: { userId: session.userId },
    });

    if (!familyAccount || deposit.familyAccountId !== familyAccount.id) {
      return NextResponse.json(
        { error: 'SECURITY VIOLATION: You are not authorized to confirm this deposit.' },
        { status: 403 }
      );
    }

    const provider = getPaymentProvider();
    const confirmation = await provider.processPaymentConfirmation(
      providerRef,
      deposit.idempotencyKey
    );

    const updatedDeposit = await prisma.deposit.findUnique({
      where: { providerRef },
      include: { offender: true },
    });

    return NextResponse.json({
      success: true,
      deposit: updatedDeposit,
      message: confirmation.message,
    });
  } catch (error: any) {
    console.error('Confirmation error:', error);
    return NextResponse.json(
      { error: error.message || 'Payment confirmation failed' },
      { status: 400 }
    );
  }
}

