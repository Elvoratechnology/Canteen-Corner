import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getCurrentSession } from '@/lib/auth';

export async function GET(req: NextRequest) {
  try {
    const session = await getCurrentSession();
    if (!session || session.role !== 'INMATE' || !session.offenderId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Derive the inmate's facilityId from the authenticated session and verified offender record
    const offender = await prisma.offender.findUnique({
      where: { id: session.offenderId },
      select: { facilityId: true },
    });

    const facilityId = session.facilityId || offender?.facilityId;
    if (!facilityId) {
      return NextResponse.json(
        { error: 'Offender is not assigned to a facility.' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const category = searchParams.get('category');
    const search = searchParams.get('search');

    // Return only active products belonging to the inmate's facility or explicitly shared products (facilityId: null)
    const whereClause: any = {
      active: true,
      AND: [
        {
          OR: [
            { facilityId: facilityId },
            { facilityId: null },
          ],
        },
      ],
    };

    if (category && category !== 'All') {
      whereClause.category = category;
    }

    if (search && search.trim() !== '') {
      whereClause.AND.push({
        OR: [
          { name: { contains: search.trim() } },
          { description: { contains: search.trim() } },
          { category: { contains: search.trim() } },
        ],
      });
    }

    const products = await prisma.product.findMany({
      where: whereClause,
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });

    const categories = [
      'All',
      'Snacks',
      'Beverages',
      'Personal Care',
      'Stationery',
      'Health & Wellness',
    ];

    return NextResponse.json({
      products,
      categories,
    });
  } catch (error) {
    console.error('Error fetching catalog:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

