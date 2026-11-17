import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getCurrentSession } from '@/lib/auth';
import { logAuditAction } from '@/lib/audit';
import { toDecimal, toMoneyNumber, serializeProduct } from '@/lib/money';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const session = await getCurrentSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (session.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden: Administrator privileges required.' }, { status: 403 });
    }

    const products = await prisma.product.findMany({
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
      include: {
        facility: { select: { id: true, name: true } },
        _count: { select: { orderItems: true } },
      },
    });

    return NextResponse.json({ products: products.map(serializeProduct) });
  } catch (error) {
    console.error('Admin products GET error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

const CreateProductSchema = z.object({
  sku: z.string().trim().min(3, 'Valid SKU is required'),
  name: z.string().trim().min(2, 'Name is required'),
  category: z.string().trim().min(2, 'Category is required'),
  price: z.number().positive('Price must be positive'),
  stock: z.number().int().nonnegative('Stock cannot be negative'),
  reorderLevel: z.number().int().nonnegative('Reorder level cannot be negative').default(15),
  description: z.string().optional(),
  facilityId: z.string().optional().nullable(),
});

export async function POST(req: NextRequest) {
  try {
    const session = await getCurrentSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (session.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden: Administrator privileges required.' }, { status: 403 });
    }

    const body = await req.json();
    const result = CreateProductSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json({ error: result.error.errors[0]?.message || 'Invalid product data' }, { status: 400 });
    }

    const { sku, name, category, price, stock, reorderLevel, description, facilityId } = result.data;
    const existing = await prisma.product.findUnique({ where: { sku: sku.toUpperCase() } });
    if (existing) {
      return NextResponse.json({ error: `Product with SKU ${sku.toUpperCase()} already exists.` }, { status: 409 });
    }

    const product = await prisma.product.create({
      data: {
        sku: sku.toUpperCase(),
        name,
        category,
        price: toDecimal(price),
        stock,
        reorderLevel,
        description,
        facilityId: facilityId || null,
        active: true,
      },
    });

    await logAuditAction({
      action: 'ADMIN_CREATE_PRODUCT',
      actorId: session.userId || 'admin',
      actorRole: session.role,
      resourceType: 'PRODUCT',
      resourceId: product.id,
      metadata: { sku: product.sku, name: product.name, price: toMoneyNumber(product.price), stock: product.stock },
    });

    return NextResponse.json({ success: true, product: serializeProduct(product) });
  } catch (error: any) {
    console.error('Admin products POST error:', error);
    return NextResponse.json({ error: error.message || 'Server error' }, { status: 500 });
  }
}

const UpdateProductSchema = z.object({
  id: z.string().min(1),
  price: z.number().positive().optional(),
  stock: z.number().int().nonnegative().optional(),
  reorderLevel: z.number().int().nonnegative().optional(),
  active: z.boolean().optional(),
});

export async function PATCH(req: NextRequest) {
  try {
    const session = await getCurrentSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (session.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden: Administrator privileges required.' }, { status: 403 });
    }

    const body = await req.json();
    const result = UpdateProductSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json({ error: result.error.errors[0]?.message || 'Invalid product data' }, { status: 400 });
    }

    const { id, price, stock, reorderLevel, active } = result.data;
    const existing = await prisma.product.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    const updated = await prisma.product.update({
      where: { id },
      data: {
        ...(price !== undefined ? { price: toDecimal(price) } : {}),
        ...(stock !== undefined ? { stock } : {}),
        ...(reorderLevel !== undefined ? { reorderLevel } : {}),
        ...(active !== undefined ? { active } : {}),
      },
    });

    await logAuditAction({
      action: 'ADMIN_UPDATE_PRODUCT',
      actorId: session.userId || 'admin',
      actorRole: session.role,
      resourceType: 'PRODUCT',
      resourceId: id,
      metadata: { sku: existing.sku, previousStock: existing.stock, newStock: updated.stock, previousPrice: toMoneyNumber(existing.price), newPrice: toMoneyNumber(updated.price) },
    });

    return NextResponse.json({ success: true, product: serializeProduct(updated) });
  } catch (error: any) {
    console.error('Admin products PATCH error:', error);
    return NextResponse.json({ error: error.message || 'Server error' }, { status: 500 });
  }
}

