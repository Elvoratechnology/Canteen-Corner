import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getCurrentSession } from '@/lib/auth';

export async function GET() {
  try {
    const session = await getCurrentSession();
    if (!session || session.role !== 'INMATE' || !session.offenderId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const offender = await prisma.offender.findUnique({
      where: { id: session.offenderId },
      include: {
        deposits: {
          where: { status: 'SUCCEEDED' },
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
        ledgerEntries: {
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
      },
    });

    if (!offender) {
      return NextResponse.json({ error: 'Offender not found' }, { status: 404 });
    }

    const remainingLimit = Math.max(0, offender.weeklyLimit - offender.currentWeeklySpent);
    const availableSpending = Math.min(offender.balance, remainingLimit);

    const lastDeposit = offender.deposits[0] || null;

    return NextResponse.json({
      currentBalance: offender.balance,
      weeklyLimit: offender.weeklyLimit,
      currentWeeklySpent: offender.currentWeeklySpent,
      remainingLimit,
      availableSpending,
      lastDeposit: lastDeposit
        ? {
            amount: lastDeposit.amount,
            date: lastDeposit.createdAt.toISOString(),
            providerRef: lastDeposit.providerRef,
          }
        : null,
      ledgerEntries: offender.ledgerEntries.map((l) => ({
        id: l.id,
        type: l.type,
        debit: l.debit,
        credit: l.credit,
        balanceBefore: l.balanceBefore,
        balanceAfter: l.balanceAfter,
        description: l.description,
        referenceId: l.referenceId,
        date: l.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error('Error fetching inmate balance details:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

