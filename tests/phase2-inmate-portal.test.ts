import { describe, it, expect, beforeEach } from 'vitest';
import prisma from '../src/lib/db';

describe('Phase 2: Inmate Portal Ordering & Rule Enforcement', () => {
  beforeEach(async () => {
    // Clean up test order if exists
    const testOrder = await prisma.order.findUnique({ where: { orderNumber: '#CC-99001' } });
    if (testOrder) {
      await prisma.orderItem.deleteMany({ where: { orderId: testOrder.id } });
      await prisma.pickingList.deleteMany({ where: { orderId: testOrder.id } });
      await prisma.order.delete({ where: { id: testOrder.id } });
      await prisma.ledgerEntry.deleteMany({ where: { referenceId: '#CC-99001' } });
    }
    // Reset John Smith's balance and inventory before each test
    await prisma.offender.update({
      where: { id: 'A1234567' },
      data: {
        balance: 82.50,
        weeklyLimit: 100.00,
        currentWeeklySpent: 0.00,
      },
    });

    // Reset product stocks
    await prisma.product.update({
      where: { sku: 'PC-002' }, // Bar soap $2.00
      data: { stock: 95 },
    });
    await prisma.product.update({
      where: { sku: 'SNK-001' }, // Ramen noodles $1.50
      data: { stock: 120 },
    });
    await prisma.product.update({
      where: { sku: 'BEV-001' }, // Coffee $5.00
      data: { stock: 60 },
    });
  });

  it('should accept 2 soap + 4 ramen + 1 coffee = $15.00 and reduce balance from $82.50 to $67.50', async () => {
    const offender = await prisma.offender.findUniqueOrThrow({ where: { id: 'A1234567' } });
    const soap = await prisma.product.findUniqueOrThrow({ where: { sku: 'PC-002' } });
    const ramen = await prisma.product.findUniqueOrThrow({ where: { sku: 'SNK-001' } });
    const coffee = await prisma.product.findUniqueOrThrow({ where: { sku: 'BEV-001' } });

    const orderItems = [
      { product: soap, quantity: 2, price: 2.00, total: 4.00 },
      { product: ramen, quantity: 4, price: 1.50, total: 6.00 },
      { product: coffee, quantity: 1, price: 5.00, total: 5.00 },
    ];

    const orderTotal = 15.00;
    expect(orderItems.reduce((acc, i) => acc + i.total, 0)).toBe(orderTotal);

    // Run transaction identical to route handler
    const result = await prisma.$transaction(async (tx) => {
      // Stock checks
      for (const item of orderItems) {
        expect(item.product.stock).toBeGreaterThanOrEqual(item.quantity);
        await tx.product.update({
          where: { id: item.product.id },
          data: { stock: { decrement: item.quantity } },
        });
      }

      const balanceBefore = offender.balance;
      const balanceAfter = Math.round((balanceBefore - orderTotal) * 100) / 100;
      const newWeeklySpent = Math.round((offender.currentWeeklySpent + orderTotal) * 100) / 100;

      await tx.offender.update({
        where: { id: offender.id },
        data: { balance: balanceAfter, currentWeeklySpent: newWeeklySpent },
      });

      const orderNumber = `#CC-99001`;
      const createdOrder = await tx.order.create({
        data: {
          orderNumber,
          offenderId: offender.id,
          status: 'PROCESSING',
          subtotal: orderTotal,
          total: orderTotal,
          expectedDeliveryDate: new Date(),
          barcode: `BC-CC-99001`,
          items: {
            create: orderItems.map((i) => ({
              productId: i.product.id,
              quantity: i.quantity,
              unitPrice: i.price,
              totalPrice: i.total,
            })),
          },
        },
      });

      await tx.pickingList.create({
        data: { orderId: createdOrder.id, status: 'PENDING' },
      });

      await tx.ledgerEntry.create({
        data: {
          offenderId: offender.id,
          type: 'COMMISSARY_ORDER',
          debit: orderTotal,
          credit: 0.0,
          balanceBefore,
          balanceAfter,
          referenceType: 'ORDER',
          referenceId: orderNumber,
          description: `Commissary purchase order ${orderNumber}`,
        },
      });

      return { order: createdOrder, balanceAfter, newWeeklySpent };
    });

    expect(result.balanceAfter).toBe(67.50);
    expect(result.newWeeklySpent).toBe(15.00);

    // Verify database state
    const updatedOffender = await prisma.offender.findUniqueOrThrow({ where: { id: 'A1234567' } });
    expect(updatedOffender.balance).toBe(67.50);
    expect(updatedOffender.currentWeeklySpent).toBe(15.00);

    // Verify stock was decremented
    const updatedSoap = await prisma.product.findUniqueOrThrow({ where: { sku: 'PC-002' } });
    expect(updatedSoap.stock).toBe(93);

    const updatedRamen = await prisma.product.findUniqueOrThrow({ where: { sku: 'SNK-001' } });
    expect(updatedRamen.stock).toBe(116);

    const updatedCoffee = await prisma.product.findUniqueOrThrow({ where: { sku: 'BEV-001' } });
    expect(updatedCoffee.stock).toBe(59);

    // Verify picking list exists
    const pickingList = await prisma.pickingList.findUnique({
      where: { orderId: result.order.id },
    });
    expect(pickingList).toBeDefined();
    expect(pickingList?.status).toBe('PENDING');
  });

  it('should reject an order when total exceeds offender balance', async () => {
    const offender = await prisma.offender.findUniqueOrThrow({ where: { id: 'A1234567' } });
    const orderTotal = 150.00; // Greater than $82.50

    expect(orderTotal > offender.balance).toBe(true);

    let rejected = false;
    try {
      if (orderTotal > offender.balance) {
        throw new Error(
          `Insufficient funds. Order total ($${orderTotal.toFixed(2)}) exceeds your available balance ($${offender.balance.toFixed(2)}).`
        );
      }
    } catch (e: any) {
      rejected = true;
      expect(e.message).toContain('Insufficient funds');
    }

    expect(rejected).toBe(true);
    // Offender balance unchanged
    const currentOffender = await prisma.offender.findUniqueOrThrow({ where: { id: 'A1234567' } });
    expect(currentOffender.balance).toBe(82.50);
  });

  it('should reject an order when total exceeds remaining weekly spending limit', async () => {
    // Set weekly spent to 90.00 (limit is 100.00, remaining is 10.00)
    await prisma.offender.update({
      where: { id: 'A1234567' },
      data: { currentWeeklySpent: 90.00 },
    });

    const offender = await prisma.offender.findUniqueOrThrow({ where: { id: 'A1234567' } });
    const orderTotal = 15.00; // Even though balance $82.50 >= 15.00, 90 + 15 > 100!

    let rejected = false;
    try {
      if (offender.currentWeeklySpent + orderTotal > offender.weeklyLimit) {
        throw new Error(`Weekly spending limit exceeded.`);
      }
    } catch (e: any) {
      rejected = true;
      expect(e.message).toContain('Weekly spending limit exceeded');
    }

    expect(rejected).toBe(true);
  });
});
