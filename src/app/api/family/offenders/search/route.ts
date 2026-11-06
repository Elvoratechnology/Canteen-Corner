import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getCurrentSession } from '@/lib/auth';

export async function GET(req: NextRequest) {
  try {
    const session = await getCurrentSession();
    if (!session || session.role !== 'FAMILY') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const query = searchParams.get('q');

    if (!query || query.trim().length < 2) {
      return NextResponse.json({ offenders: [] });
    }

    const trimmed = query.trim();

    const offenders = await prisma.offender.findMany({
      where: {
        OR: [
          { id: { contains: trimmed.toUpperCase() } },
          { name: { contains: trimmed } },
        ],
      },
      include: {
        facility: {
          select: {
            id: true,
            name: true,
            maxDepositAmount: true,
            giftPackagesEnabled: true,
          },
        },
      },
      take: 5,
    });

    return NextResponse.json({
      offenders: offenders.map((o) => ({
        id: o.id,
        name: o.name,
        unit: o.unit,
        housing: o.housing,
        facilityName: o.facility.name,
        maxDepositAmount: o.facility.maxDepositAmount,
        giftPackagesEnabled: o.facility.giftPackagesEnabled,
      })),
    });
  } catch (error) {
    console.error('Offender search error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

