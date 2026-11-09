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

    // Restrict product queries to supervisor/picker's session facility or global items
    const products = await prisma.product.findMany({
      where: {
        OR: [
          { facilityId: session.facilityId },
          { facilityId: null },
        ],
      },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
      include: {
        _count: { select: { orderItems: true } },
      },
    });

    // Flagged products: at or below reorder level
    const shortages = products.filter((p) => p.stock <= p.reorderLevel);

    // For each shortage, find affected PROCESSING orders in the same facility
    const affectedOrders = await Promise.all(
      shortages.map(async (prod) => {
        const affected = await prisma.order.findMany({
          where: {
            status: 'PROCESSING',
            items: { some: { productId: prod.id } },
            offender: { facilityId: session.facilityId },
          },
          include: {
            offender: { select: { id: true, name: true, unit: true } },
            items: { where: { productId: prod.id } },
          },
        });
        return { productId: prod.id, productName: prod.name, affectedOrders: affected };
      })
    );

    return NextResponse.json({
      products,
      shortages: shortages.map((s) => ({
        id: s.id,
        sku: s.sku,
        name: s.name,
        category: s.category,
        stock: s.stock,
        reorderLevel: s.reorderLevel,
        severity: s.stock === 0 ? 'OUT_OF_STOCK' : 'LOW_STOCK',
      })),
      affectedOrdersByProduct: affectedOrders,
    });
  } catch (error) {
    console.error('Error fetching inventory:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

const RestockSchema = z.object({
  productId: z.string().min(1),
  quantity: z.number().int().positive('Restock quantity must be a positive integer'),
  notes: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const session = await getCurrentSession();
    if (!session || !['WAREHOUSE_SUPERVISOR', 'ADMIN'].includes(session.role)) {
      return NextResponse.json(
        { error: 'Only supervisors can restock inventory.' },
        { status: 403 }
      );
    }

    if (!session.facilityId) {
      return NextResponse.json({ error: 'User is not assigned to a facility.' }, { status: 403 });
    }

    const body = await req.json();
    const result = RestockSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { error: result.error.errors[0]?.message || 'Invalid restock data' },
        { status: 400 }
      );
    }

    const { productId, quantity, notes } = result.data;

    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    // Prevent facility supervisors from modifying shared global stock (facilityId = null)
    if (!product.facilityId) {
      return NextResponse.json(
        { error: 'Access denied: Cannot restock shared global catalog products. Facility supervisors may only restock facility-specific inventory.' },
        { status: 403 }
      );
    }

    // Verify product facility ownership before restocking to prevent cross-facility modifications
    if (product.facilityId !== session.facilityId) {
      return NextResponse.json(
        { error: 'Access denied: Product belongs to another facility.' },
        { status: 403 }
      );
    }

    const updatedProduct = await prisma.product.update({
      where: { id: productId },
      data: { stock: { increment: quantity } },
    });

    await logAuditAction({
      action: 'INVENTORY_RESTOCK',
      actorId: session.userId || 'unknown',
      actorRole: session.role,
      resourceType: 'PRODUCT',
      resourceId: productId,
      metadata: {
        productName: product.name,
        sku: product.sku,
        previousStock: product.stock,
        addedQuantity: quantity,
        newStock: updatedProduct.stock,
        notes,
      },
    });

    return NextResponse.json({
      success: true,
      product: updatedProduct,
      message: `Restocked ${product.name}: +${quantity} units (new stock: ${updatedProduct.stock})`,
    });
  } catch (error: any) {
    console.error('Restock error:', error);
    return NextResponse.json({ error: error.message || 'Restock failed' }, { status: 500 });
  }
}

