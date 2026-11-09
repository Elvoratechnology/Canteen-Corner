import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getCurrentSession } from '@/lib/auth';
import { logAuditAction } from '@/lib/audit';
import { z } from 'zod';

export async function GET() {
  try {
    const session = await getCurrentSession();
    if (!session || !['WAREHOUSE_PICKER', 'WAREHOUSE_SUPERVISOR', 'ADMIN'].includes(session.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!session.facilityId) {
      return NextResponse.json({ error: 'User is not assigned to a facility.' }, { status: 403 });
    }

    const manifests = await prisma.manifest.findMany({
      where: { facilityId: session.facilityId },
      orderBy: { createdAt: 'desc' },
      include: {
        facility: { select: { name: true } },
        orders: {
          include: {
            offender: { select: { id: true, name: true, unit: true, housing: true } },
            items: { include: { product: true } },
          },
        },
      },
    });

    // Also get PACKED orders eligible for manifest generation (not yet assigned to a manifest) for this facility
    const eligibleOrders = await prisma.order.findMany({
      where: {
        status: { in: ['PACKED', 'OUT_FOR_DELIVERY'] },
        manifestId: null,
        offender: { facilityId: session.facilityId },
      },
      include: {
        offender: { select: { id: true, name: true, unit: true, housing: true } },
        items: { include: { product: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    return NextResponse.json({ manifests, eligibleOrders });
  } catch (error) {
    console.error('Error fetching manifests:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

const GenerateManifestSchema = z.object({
  unit: z.string().min(1, 'Unit is required'),
  housing: z.string().optional(),
  deliveryDate: z.string().min(1, 'Delivery date is required'),
  orderIds: z.array(z.string()).min(1, 'At least one order must be selected'),
});

export async function POST(req: NextRequest) {
  try {
    const session = await getCurrentSession();
    if (!session || !['WAREHOUSE_SUPERVISOR', 'ADMIN'].includes(session.role)) {
      return NextResponse.json(
        { error: 'Only supervisors can generate delivery manifests.' },
        { status: 403 }
      );
    }

    if (!session.facilityId) {
      return NextResponse.json({ error: 'User is not assigned to a facility.' }, { status: 403 });
    }

    const body = await req.json();
    const result = GenerateManifestSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { error: result.error.errors[0]?.message || 'Invalid manifest data' },
        { status: 400 }
      );
    }

    const { unit, housing, deliveryDate, orderIds } = result.data;

    // Use the authenticated supervisor's session.facilityId (remove hardcoded facility selection)
    const facility = await prisma.facility.findUnique({
      where: { id: session.facilityId },
    });
    if (!facility) {
      return NextResponse.json({ error: 'Facility not found' }, { status: 404 });
    }

    // Fetch the selected orders ensuring all belong to the authenticated supervisor's facility
    const orders = await prisma.order.findMany({
      where: {
        id: { in: orderIds },
        offender: { facilityId: session.facilityId },
      },
      include: { items: true },
    });

    if (orders.length !== orderIds.length) {
      return NextResponse.json(
        { error: 'One or more selected orders are invalid or belong to another facility.' },
        { status: 403 }
      );
    }

    const totalItems = orders.reduce(
      (sum, o) => sum + o.items.reduce((s, i) => s + i.quantity, 0),
      0
    );

    const dateStr = new Date(deliveryDate)
      .toISOString()
      .slice(0, 10)
      .replace(/-/g, '');
    const unitCode = unit.replace(/\s+/g, '');
    const manifestNumber = `#MN-${dateStr}-${unitCode}`;

    // Check for duplicate manifest number, append suffix if needed
    const existing = await prisma.manifest.findUnique({
      where: { manifestNumber },
    });
    const finalNumber = existing
      ? `${manifestNumber}-${Math.floor(Math.random() * 900 + 100)}`
      : manifestNumber;

    const manifest = await prisma.$transaction(async (tx) => {
      const created = await tx.manifest.create({
        data: {
          manifestNumber: finalNumber,
          facilityId: facility.id,
          unit,
          housing: housing || null,
          deliveryDate: new Date(deliveryDate),
          status: 'GENERATED',
          totalOrders: orders.length,
          totalItems,
        },
      });

      // Link orders to this manifest and set status to OUT_FOR_DELIVERY
      await tx.order.updateMany({
        where: { id: { in: orderIds } },
        data: {
          manifestId: created.id,
          status: 'OUT_FOR_DELIVERY',
        },
      });

      return await tx.manifest.findUnique({
        where: { id: created.id },
        include: {
          facility: { select: { name: true } },
          orders: {
            include: {
              offender: { select: { id: true, name: true, unit: true, housing: true } },
              items: { include: { product: true } },
            },
          },
        },
      });
    });

    await logAuditAction({
      action: 'MANIFEST_GENERATED',
      actorId: session.userId || 'unknown',
      actorRole: session.role,
      resourceType: 'MANIFEST',
      resourceId: manifest?.id,
      metadata: {
        manifestNumber: finalNumber,
        unit,
        totalOrders: orders.length,
        totalItems,
      },
    });

    return NextResponse.json({ success: true, manifest });
  } catch (error: any) {
    console.error('Manifest generation error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate manifest' },
      { status: 500 }
    );
  }
}

