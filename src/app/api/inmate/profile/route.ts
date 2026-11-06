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
        facility: true,
        deposits: {
          where: { status: 'SUCCEEDED' },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!offender) {
      return NextResponse.json({ error: 'Offender not found' }, { status: 404 });
    }

    // Weekly reset check: if lastWeeklyReset was before the most recent facility reset day
    const now = new Date();
    const facilityResetDay = offender.facility.weeklyResetDay; // 0 = Sunday
    const lastReset = new Date(offender.lastWeeklyReset);
    const dayDiff = Math.floor((now.getTime() - lastReset.getTime()) / (1000 * 60 * 60 * 24));
    
    // Check if a reset day has passed
    let currentWeeklySpent = offender.currentWeeklySpent;
    if (dayDiff >= 7 || (now.getDay() === facilityResetDay && lastReset.getDay() !== facilityResetDay)) {
      currentWeeklySpent = 0.0;
      await prisma.offender.update({
        where: { id: offender.id },
        data: {
          currentWeeklySpent: 0.0,
          lastWeeklyReset: now,
        },
      });
    }

    // Compute next delivery date (e.g. next Thursday)
    const nextDelivery = new Date();
    const currentDay = nextDelivery.getDay();
    const daysUntilThursday = (4 + 7 - currentDay) % 7 || 7; // Delivery every Thursday
    nextDelivery.setDate(nextDelivery.getDate() + daysUntilThursday);
    nextDelivery.setHours(14, 0, 0, 0);

    const remainingWeeklyLimit = Math.max(0, offender.weeklyLimit - currentWeeklySpent);
    // Effective available spending is min(balance, remainingWeeklyLimit)
    const availableSpending = Math.min(offender.balance, remainingWeeklyLimit);

    const lastDeposit = offender.deposits[0] || null;

    const unreadCount = await prisma.notification.count({
      where: { offenderId: offender.id, read: false },
    });

    return NextResponse.json({
      offender: {
        id: offender.id,
        name: offender.name,
        unit: offender.unit,
        housing: offender.housing,
        balance: offender.balance,
        weeklyLimit: offender.weeklyLimit,
        currentWeeklySpent: currentWeeklySpent,
        remainingWeeklyLimit: remainingWeeklyLimit,
        availableSpending: availableSpending,
        nextDeliveryDate: nextDelivery.toISOString(),
        lastDeposit: lastDeposit
          ? {
              amount: lastDeposit.amount,
              date: lastDeposit.createdAt.toISOString(),
              ref: lastDeposit.providerRef,
            }
          : null,
        unreadNotifications: unreadCount,
      },
      facility: {
        name: offender.facility.name,
        giftPackagesEnabled: offender.facility.giftPackagesEnabled,
      },
    });
  } catch (error) {
    console.error('Error fetching inmate profile:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

