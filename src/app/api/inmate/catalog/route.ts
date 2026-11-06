import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getCurrentSession } from '@/lib/auth';

export async function GET(req: NextRequest) {
  try {
    const session = await getCurrentSession();
    if (!session || session.role !== 'INMATE') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const category = searchParams.get('category');
    const search = searchParams.get('search');

    const whereClause: any = {
      active: true,
    };

    if (category && category !== 'All') {
      whereClause.category = category;
    }

    if (search && search.trim() !== '') {
      whereClause.OR = [
        { name: { contains: search.trim() } },
        { description: { contains: search.trim() } },
        { category: { contains: search.trim() } },
      ];
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

