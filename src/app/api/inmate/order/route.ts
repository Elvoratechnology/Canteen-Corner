import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getCurrentSession } from '@/lib/auth';
import { logAuditAction } from '@/lib/audit';
import { toDecimal, toMoneyNumber, toMoneyString, Prisma } from '@/lib/money';
import { z } from 'zod';

const OrderItemSchema = z.object({
  productId: z.string().min(1),
  quantity: z.number().int().positive('Quantity must be at least 1'),
});

const SubmitOrderSchema = z.object({
  items: z.array(OrderItemSchema).min(1, 'Cart cannot be empty'),
});

export async function POST(req: NextRequest) {
  try {
    const session = await getCurrentSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (session.role !== 'INMATE' || !session.offenderId) {
      return NextResponse.json({ error: 'Forbidden: Inmate privileges required.' }, { status: 403 });
    }

    const body = await req.json();
    const parseResult = SubmitOrderSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: parseResult.error.errors[0]?.message || 'Invalid order data.' },
        { status: 400 }
      );
    }

    const { items } = parseResult.data;

    // Run order submission inside a database transaction
    const result = await prisma.$transaction(async (tx) => {
      // 1. Fetch current offender with fresh lock/state
      const offender = await tx.offender.findUnique({
        where: { id: session.offenderId },
      });

      if (!offender) {
        throw new Error('OFFENDER_NOT_FOUND');
      }

      // Check account lockout status
      if (offender.pinLockedUntil && offender.pinLockedUntil > new Date()) {
        throw new Error('ACCOUNT_LOCKED: Inmate account is temporarily locked due to failed PIN attempts.');
      }

      if (offender.userId) {
        const user = await tx.user.findUnique({ where: { id: offender.userId } });
        if (user && user.lockedUntil && user.lockedUntil > new Date()) {
          throw new Error('ACCOUNT_LOCKED: Inmate account is currently locked.');
        }
      }

      // 2. Aggregate quantities by productId to prevent duplicate item stock bypass
      const aggregatedItemsMap = new Map<string, number>();
      for (const item of items) {
        const currentQty = aggregatedItemsMap.get(item.productId) || 0;
        aggregatedItemsMap.set(item.productId, currentQty + item.quantity);
      }

      const productIds = Array.from(aggregatedItemsMap.keys());
      const products = await tx.product.findMany({
        where: { id: { in: productIds } },
      });

      const productMap = new Map(products.map((p) => [p.id, p]));

      let calculatedSubtotal = toDecimal(0);
      const orderItemsToCreate: Array<{
        productId: string;
        quantity: number;
        unitPrice: Prisma.Decimal;
        totalPrice: Prisma.Decimal;
        name: string;
      }> = [];

      for (const [productId, quantity] of Array.from(aggregatedItemsMap.entries())) {
        const prod = productMap.get(productId);
        if (!prod || !prod.active) {
          throw new Error(`Product not found or inactive.`);
        }

        // Enforce facility ownership isolation
        if ((prod as any).facilityId && (prod as any).facilityId !== offender.facilityId) {
          throw new Error(`SECURITY VIOLATION: Product "${prod.name}" does not belong to your assigned facility.`);
        }

        if (prod.stock < quantity) {
          throw new Error(
            `Insufficient stock for "${prod.name}". Only ${prod.stock} available (requested: ${quantity}).`
          );
        }

        const itemTotal = prod.price.times(quantity);
        calculatedSubtotal = calculatedSubtotal.plus(itemTotal);

        orderItemsToCreate.push({
          productId: prod.id,
          quantity,
          unitPrice: prod.price,
          totalPrice: itemTotal,
          name: prod.name,
        });
      }

      const orderTotal = calculatedSubtotal; // Zero tax on institutional commissary items

      // 3. Rule: Block if order total > balance
      if (orderTotal.greaterThan(offender.balance)) {
        throw new Error(
          `Insufficient funds. Order total (${toMoneyString(orderTotal, true)}) exceeds your available balance (${toMoneyString(offender.balance, true)}).`
        );
      }

      // 4. Rule: Block if weekly spending + order total > weekly limit
      const remainingWeeklyLimit = offender.weeklyLimit.minus(offender.currentWeeklySpent);
      const safeRemainingLimit = remainingWeeklyLimit.greaterThan(0) ? remainingWeeklyLimit : toDecimal(0);
      if (offender.currentWeeklySpent.plus(orderTotal).greaterThan(offender.weeklyLimit)) {
        throw new Error(
          `Weekly spending limit exceeded. Order total (${toMoneyString(orderTotal, true)}) exceeds your remaining limit of ${toMoneyString(safeRemainingLimit, true)} (${toMoneyString(offender.weeklyLimit, true)}/wk limit).`
        );
      }

      // 5. Generate unique Order Number: #CC-xxxxx (5 random digits)
      const randomNum = Math.floor(10000 + Math.random() * 90000);
      const orderNumber = `#CC-${randomNum}`;
      const barcode = `BC-CC-${randomNum}`;

      // Expected delivery: next Thursday 14:00
      const nextDelivery = new Date();
      const currentDay = nextDelivery.getDay();
      const daysUntilThursday = (4 + 7 - currentDay) % 7 || 7;
      nextDelivery.setDate(nextDelivery.getDate() + daysUntilThursday);
      nextDelivery.setHours(14, 0, 0, 0);

      // 6. Deduct stock from each aggregated product conditionally (GAP-05 Oversold Protection)
      // Set transaction authorization config in PostgreSQL if RLS / balance trigger is active
      if (process.env.DATABASE_URL?.startsWith('postgres')) {
        await tx.$executeRawUnsafe(`SELECT set_config('canteen.authorized_transaction', 'true', true);`).catch(() => {});
      }

      for (const [productId, quantity] of Array.from(aggregatedItemsMap.entries())) {
        const prod = productMap.get(productId);
        const stockUpdate = await tx.product.updateMany({
          where: {
            id: productId,
            stock: { gte: quantity },
          },
          data: {
            stock: { decrement: quantity },
          },
        });

        if (stockUpdate.count === 0) {
          throw new Error(
            `Insufficient stock for "${prod?.name || productId}". Product inventory changed during checkout.`
          );
        }
      }

      // 7. Atomic conditional balance deduction & weekly spent increment (GAP-03 Concurrency Protection)
      const balanceUpdate = await tx.offender.updateMany({
        where: {
          id: offender.id,
          balance: { gte: orderTotal },
        },
        data: {
          balance: { decrement: orderTotal },
          currentWeeklySpent: { increment: orderTotal },
        },
      });

      if (balanceUpdate.count === 0) {
        throw new Error(
          `Insufficient funds. Your available balance is insufficient to complete this order.`
        );
      }

      // Read authoritative post-deduction balance from database to record exact ledger snapshot
      const freshOffender = await tx.offender.findUniqueOrThrow({
        where: { id: offender.id },
      });
      const balanceAfter = freshOffender.balance;
      const balanceBefore = balanceAfter.plus(orderTotal);
      const newWeeklySpent = freshOffender.currentWeeklySpent;

      // 8. Create Order record
      const createdOrder = await tx.order.create({
        data: {
          orderNumber,
          offenderId: offender.id,
          status: 'PROCESSING',
          subtotal: calculatedSubtotal,
          tax: toDecimal(0.0),
          total: orderTotal,
          expectedDeliveryDate: nextDelivery,
          barcode,
          items: {
            create: orderItemsToCreate.map((item) => ({
              productId: item.productId,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              totalPrice: item.totalPrice,
            })),
          },
        },
        include: {
          items: { include: { product: true } },
        },
      });

      // 9. Create PickingList entry for Warehouse queue
      await tx.pickingList.create({
        data: {
          orderId: createdOrder.id,
          status: 'PENDING',
        },
      });

      // 10. Record OrderStatusHistory
      await tx.orderStatusHistory.create({
        data: {
          orderId: createdOrder.id,
          newStatus: 'PROCESSING',
          changedBy: `OFFENDER_${offender.id}`,
          notes: 'Order submitted by offender at kiosk/tablet.',
        },
      });

      // 11. Create Double-Entry Ledger Record
      await tx.ledgerEntry.create({
        data: {
          offenderId: offender.id,
          type: 'COMMISSARY_ORDER',
          debit: orderTotal,
          credit: toDecimal(0.0),
          balanceBefore,
          balanceAfter,
          referenceType: 'ORDER',
          referenceId: orderNumber,
          description: `Commissary purchase order ${orderNumber}`,
        },
      });

      // 12. Create Notification
      await tx.notification.create({
        data: {
          offenderId: offender.id,
          type: 'ORDER_RECEIVED',
          title: `Order Received (${orderNumber})`,
          message: `Your commissary order for ${toMoneyString(orderTotal, true)} has been submitted and is processing for delivery on ${nextDelivery.toLocaleDateString()}.`,
        },
      });

      const remLimitAfter = offender.weeklyLimit.minus(newWeeklySpent);
      return {
        order: createdOrder,
        balanceBefore,
        balanceAfter,
        remainingWeeklyLimit: remLimitAfter.greaterThan(0) ? remLimitAfter : toDecimal(0),
      };
    });

    // Write audit log
    await logAuditAction({
      action: 'COMMISSARY_ORDER_SUBMITTED',
      actorId: session.offenderId,
      actorRole: 'INMATE',
      resourceType: 'ORDER',
      resourceId: result.order.id,
      metadata: {
        orderNumber: result.order.orderNumber,
        total: toMoneyNumber(result.order.total),
        newBalance: toMoneyNumber(result.balanceAfter),
      },
    });

    return NextResponse.json({
      success: true,
      order: {
        id: result.order.id,
        orderNumber: result.order.orderNumber,
        total: toMoneyNumber(result.order.total),
        expectedDeliveryDate: result.order.expectedDeliveryDate.toISOString(),
        status: result.order.status,
        newBalance: toMoneyNumber(result.balanceAfter),
        remainingWeeklyLimit: toMoneyNumber(result.remainingWeeklyLimit),
        itemsCount: result.order.items.length,
      },
    });
  } catch (error: any) {
    console.error('Order submission error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to place order.' },
      { status: 400 }
    );
  }
}

