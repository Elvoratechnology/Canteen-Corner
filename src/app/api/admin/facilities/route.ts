import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getCurrentSession } from '@/lib/auth';
import { logAuditAction } from '@/lib/audit';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const session = await getCurrentSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (session.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden: Administrator privileges required.' }, { status: 403 });
    }

    const facilities = await prisma.facility.findMany({
      orderBy: { name: 'asc' },
      include: {
        _count: {
          select: { offenders: true, products: true, users: true, manifests: true },
        },
      },
    });

    return NextResponse.json({ facilities });
  } catch (error) {
    console.error('Admin facilities GET error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

const UpdateFacilitySchema = z.object({
  id: z.string().min(1),
  maxWeeklySpend: z.number().positive().optional(),
  maxDepositAmount: z.number().positive().optional(),
  weeklyResetDay: z.number().min(0).max(6).optional(),
  giftPackagesEnabled: z.boolean().optional(),
});

export async function PATCH(req: NextRequest) {
  try {
    const session = await getCurrentSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (session.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden: Administrator privileges required.' }, { status: 403 });
    }

    const body = await req.json();
    const result = UpdateFacilitySchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json({ error: result.error.errors[0]?.message || 'Invalid facility data' }, { status: 400 });
    }

    const { id, maxWeeklySpend, maxDepositAmount, weeklyResetDay, giftPackagesEnabled } = result.data;
    const existing = await prisma.facility.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Facility not found' }, { status: 404 });
    }

    const updated = await prisma.facility.update({
      where: { id },
      data: {
        ...(maxWeeklySpend !== undefined ? { maxWeeklySpend } : {}),
        ...(maxDepositAmount !== undefined ? { maxDepositAmount } : {}),
        ...(weeklyResetDay !== undefined ? { weeklyResetDay } : {}),
        ...(giftPackagesEnabled !== undefined ? { giftPackagesEnabled } : {}),
      },
    });

    await logAuditAction({
      action: 'ADMIN_UPDATE_FACILITY_CONFIG',
      actorId: session.userId || 'admin',
      actorRole: session.role,
      resourceType: 'FACILITY',
      resourceId: id,
      metadata: { previous: existing, updated },
    });

    return NextResponse.json({ success: true, facility: updated });
  } catch (error: any) {
    console.error('Admin facilities PATCH error:', error);
    return NextResponse.json({ error: error.message || 'Server error' }, { status: 500 });
  }
}

