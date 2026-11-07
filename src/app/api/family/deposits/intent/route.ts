import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getCurrentSession } from '@/lib/auth';
import { getPaymentProvider } from '@/lib/payments';
import { z } from 'zod';

const DepositIntentSchema = z.object({
  offenderId: z.string().min(1, 'Offender ID is required'),
  amount: z.number().positive('Deposit amount must be positive').max(300, 'Maximum single deposit is $300.00'),
});

export async function POST(req: NextRequest) {
  try {
    const session = await getCurrentSession();
    if (!session || session.role !== 'FAMILY') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const result = DepositIntentSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { error: result.error.errors[0]?.message || 'Invalid deposit amount' },
        { status: 400 }
      );
    }

    const { offenderId, amount } = result.data;

    const offender = await prisma.offender.findUnique({
      where: { id: offenderId },
      include: { facility: true },
    });

    if (!offender) {
      return NextResponse.json({ error: 'Offender not found.' }, { status: 404 });
    }

    if (amount > offender.facility.maxDepositAmount) {
      return NextResponse.json(
        { error: `Facility deposit limit is $${offender.facility.maxDepositAmount.toFixed(2)}.` },
        { status: 400 }
      );
    }

    // Get family account ID
    const familyAccount = await prisma.familyAccount.findUnique({
      where: { userId: session.userId },
    });

    if (!familyAccount) {
      return NextResponse.json({ error: 'Family account record not found.' }, { status: 403 });
    }

    const idempotencyKey = `idemp-${offender.id}-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    const provider = getPaymentProvider();

    const intent = await provider.createPaymentIntent({
      amount,
      offenderId: offender.id,
      familyAccountId: familyAccount?.id,
      idempotencyKey,
      customerEmail: session.email || 'customer@touchpay.direct',
    });

    return NextResponse.json({
      success: true,
      intent,
      offender: {
        id: offender.id,
        name: offender.name,
        facilityName: offender.facility.name,
      },
    });
  } catch (error: any) {
    console.error('Error creating deposit intent:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to initialize TouchPay deposit.' },
      { status: 500 }
    );
  }
}

