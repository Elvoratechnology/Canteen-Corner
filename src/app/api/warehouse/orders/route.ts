import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getCurrentSession } from '@/lib/auth';

export async function GET(req: NextRequest) {
  try {
    const session = await getCurrentSession();
    if (!session || !['WAREHOUSE_PICKER', 'WAREHOUSE_SUPERVISOR', 'ADMIN'].includes(session.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const statusFilter = searchParams.get('status');
    const search = searchParams.get('search');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = 20;

    const whereClause: any = {};

    if (statusFilter && statusFilter !== 'ALL') {
      whereClause.status = statusFilter;
    }

    if (search && search.trim() !== '') {
      whereClause.OR = [
        { orderNumber: { contains: search.trim() } },
        { offender: { name: { contains: search.trim() } } },
        { offender: { id: { contains: search.trim().toUpperCase() } } },
      ];
    }

    const [orders, totalCount] = await Promise.all([
      prisma.order.findMany({
        where: whereClause,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: (page - 1) * limit,
        include: {
          offender: {
            select: { id: true, name: true, unit: true, housing: true },
          },
          items: {
            include: { product: true },
          },
          pickingList: {
            include: { pickerUser: { select: { id: true, name: true } } },
          },
        },
      }),
      prisma.order.count({ where: whereClause }),
    ]);

    return NextResponse.json({
      orders,
      pagination: {
        page,
        limit,
        total: totalCount,
        pages: Math.ceil(totalCount / limit),
      },
    });
  } catch (error) {
    console.error('Error fetching warehouse orders:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

