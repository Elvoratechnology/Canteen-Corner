import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getCurrentSession } from '@/lib/auth';

export async function GET(req: NextRequest) {
  try {
    const session = await getCurrentSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (session.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Forbidden: Administrator privileges required.' },
        { status: 403 }
      );
    }

    const [
      inmatesCount,
      facilitiesCount,
      productsCount,
      ordersCount,
      pendingOrdersCount,
      staffCount,
      depositsAgg,
      recentAuditLogs,
      facilities,
    ] = await Promise.all([
      prisma.offender.count(),
      prisma.facility.count(),
      prisma.product.count(),
      prisma.order.count(),
      prisma.order.count({ where: { status: { in: ['PROCESSING', 'PACKED'] } } }),
      prisma.user.count({ where: { role: { in: ['WAREHOUSE_PICKER', 'WAREHOUSE_SUPERVISOR', 'ADMIN'] } } }),
      prisma.deposit.aggregate({
        _sum: { amount: true, fee: true, totalPaid: true },
        where: { status: 'SUCCEEDED' },
      }),
      prisma.auditLog.findMany({
        take: 15,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.facility.findMany({
        orderBy: { name: 'asc' },
        include: {
          _count: {
            select: { offenders: true, products: true, users: true },
          },
        },
      }),
    ]);

    return NextResponse.json({
      success: true,
      stats: {
        inmatesCount,
        facilitiesCount,
        productsCount,
        ordersCount,
        pendingOrdersCount,
        staffCount,
        totalDepositsVolume: depositsAgg._sum.amount || 0,
        totalFeesCollected: depositsAgg._sum.fee || 0,
        totalPaid: depositsAgg._sum.totalPaid || 0,
      },
      recentAuditLogs,
      facilities,
    });
  } catch (error: any) {
    console.error('Admin stats error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

