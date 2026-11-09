import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getCurrentSession } from '@/lib/auth';
import { logAuditAction } from '@/lib/audit';
import { z } from 'zod';

const SubmitGiftPackageSchema = z.object({
  offenderId: z.string().min(1),
  packageName: z.string().min(2),
  items: z.array(
    z.object({
      productId: z.string(),
      quantity: z.number().int().positive(),
    })
  ).min(1, 'Package must contain at least one item'),
});

export async function GET() {
  try {
    const session = await getCurrentSession();
    if (!session || session.role !== 'FAMILY') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const familyAccount = await prisma.familyAccount.findUnique({
      where: { userId: session.userId },
    });

    if (!familyAccount) {
      return NextResponse.json({ packages: [], approvedProducts: [] });
    }

    // Get facility status from default facility
    const facility = await prisma.facility.findFirst();
    const giftPackagesEnabled = facility?.giftPackagesEnabled ?? true;

    const packages = await prisma.giftPackage.findMany({
      where: { familyAccountId: familyAccount.id },
      orderBy: { createdAt: 'desc' },
      include: {
        offender: {
          select: { id: true, name: true },
        },
      },
    });

    const approvedProducts = await prisma.product.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
    });

    return NextResponse.json({
      giftPackagesEnabled,
      packages,
      approvedProducts,
    });
  } catch (error) {
    console.error('Error fetching gift packages:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getCurrentSession();
    if (!session || session.role !== 'FAMILY') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const familyAccount = await prisma.familyAccount.findUnique({
      where: { userId: session.userId },
    });

    if (!familyAccount) {
      return NextResponse.json({ error: 'Family account not found' }, { status: 404 });
    }

    const body = await req.json();
    const result = SubmitGiftPackageSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { error: result.error.errors[0]?.message || 'Invalid package submission' },
        { status: 400 }
      );
    }

    const { offenderId, packageName, items } = result.data;

    const offender = await prisma.offender.findUnique({
      where: { id: offenderId },
      include: { facility: true },
    });

    if (!offender) {
      return NextResponse.json({ error: 'Offender not found' }, { status: 404 });
    }

    // Require an APPROVED family_offender_links relationship belonging to the authenticated family account and requested offender
    const approvedLink = await prisma.familyOffenderLink.findFirst({
      where: {
        familyAccountId: familyAccount.id,
        offenderId: offender.id,
        status: 'APPROVED',
      },
    });

    if (!approvedLink) {
      return NextResponse.json(
        { error: 'You are not authorized to send gift packages to this offender. An approved family relationship is required.' },
        { status: 403 }
      );
    }

    if (!offender.facility.giftPackagesEnabled) {
      return NextResponse.json(
        { error: 'Care gift packages are currently disabled by facility policy.' },
        { status: 403 }
      );
    }

    // Calculate total value
    const productIds = items.map((i) => i.productId);
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
    });

    const productMap = new Map(products.map((p) => [p.id, p]));
    let totalValue = 0;
    const itemDetails = items.map((i) => {
      const prod = productMap.get(i.productId);
      const price = prod?.price || 0;
      totalValue += price * i.quantity;
      return {
        productId: i.productId,
        name: prod?.name || 'Item',
        quantity: i.quantity,
        price,
        subtotal: price * i.quantity,
      };
    });

    totalValue = Math.round(totalValue * 100) / 100;

    const createdPackage = await prisma.giftPackage.create({
      data: {
        offenderId: offender.id,
        familyAccountId: familyAccount.id,
        packageName,
        itemsJson: JSON.stringify(itemDetails),
        totalValue,
        status: 'PENDING',
      },
    });

    await logAuditAction({
      action: 'GIFT_PACKAGE_SUBMITTED',
      actorId: familyAccount.id,
      actorRole: 'FAMILY',
      resourceType: 'GIFT_PACKAGE',
      resourceId: createdPackage.id,
      metadata: { offenderId: offender.id, totalValue },
    });

    return NextResponse.json({
      success: true,
      giftPackage: createdPackage,
      message: 'Gift package submitted and queued for facility staff inspection and approval.',
    });
  } catch (error: any) {
    console.error('Error submitting gift package:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to submit gift package' },
      { status: 500 }
    );
  }
}

