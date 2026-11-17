import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getCurrentSession } from '@/lib/auth';
import { toDecimal, toMoneyNumber } from '@/lib/money';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await getCurrentSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (session.role !== 'INMATE' || !session.offenderId) {
      return NextResponse.json({ error: 'Forbidden: Inmate privileges required.' }, { status: 403 });
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

    const remLimit = offender.weeklyLimit.minus(offender.currentWeeklySpent);
    const remainingLimit = remLimit.greaterThan(0) ? remLimit : toDecimal(0);
    const availableSpending = offender.balance.lessThan(remainingLimit) ? offender.balance : remainingLimit;

    const lastDeposit = offender.deposits[0] || null;

    return NextResponse.json({
      currentBalance: toMoneyNumber(offender.balance),
      weeklyLimit: toMoneyNumber(offender.weeklyLimit),
      currentWeeklySpent: toMoneyNumber(offender.currentWeeklySpent),
      remainingLimit: toMoneyNumber(remainingLimit),
      availableSpending: toMoneyNumber(availableSpending),
      lastDeposit: lastDeposit
        ? {
            amount: toMoneyNumber(lastDeposit.amount),
            date: lastDeposit.createdAt.toISOString(),
            providerRef: lastDeposit.providerRef,
          }
        : null,
      ledgerEntries: offender.ledgerEntries.map((l) => ({
        id: l.id,
        type: l.type,
        debit: toMoneyNumber(l.debit),
        credit: toMoneyNumber(l.credit),
        balanceBefore: toMoneyNumber(l.balanceBefore),
        balanceAfter: toMoneyNumber(l.balanceAfter),
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
