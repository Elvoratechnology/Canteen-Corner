import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getCurrentSession } from '@/lib/auth';

// Rate limiter: Max 20 searches per 60 seconds per family account to prevent roster enumeration
const searchRateLimits = new Map<string, { count: number; resetTime: number }>();

function checkSearchRateLimit(userId: string): boolean {
  const now = Date.now();
  const userLimit = searchRateLimits.get(userId);

  if (!userLimit || now > userLimit.resetTime) {
    searchRateLimits.set(userId, { count: 1, resetTime: now + 60000 });
    return true;
  }

  if (userLimit.count >= 20) {
    return false;
  }

  userLimit.count += 1;
  return true;
}

export async function GET(req: NextRequest) {
  try {
    const session = await getCurrentSession();
    if (!session || session.role !== 'FAMILY') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const rateLimitKey = session.userId || 'family_session';
    if (!checkSearchRateLimit(rateLimitKey)) {
      return NextResponse.json(
        { error: 'Search rate limit exceeded. Please wait a minute before searching again.' },
        { status: 429 }
      );
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

