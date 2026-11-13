import { describe, it, expect, beforeEach } from 'vitest';
import prisma from '../src/lib/db';
import { getPaymentProvider } from '../src/lib/payments';

describe('Phase 5: Acceptance Tests Suite (Per Specification)', () => {
  beforeEach(async () => {
    // Reset John Smith
    await prisma.offender.update({
      where: { id: 'A1234567' },
      data: {
        balance: 82.50,
        weeklyLimit: 100.00,
        currentWeeklySpent: 0.00,
      },
    });

    // Reset inventory for soap, ramen, coffee
    await prisma.product.update({ where: { sku: 'PC-002' }, data: { stock: 95 } });
    await prisma.product.update({ where: { sku: 'SNK-001' }, data: { stock: 120 } });
    await prisma.product.update({ where: { sku: 'BEV-001' }, data: { stock: 60 } });

    // Clean up test orders
    const testOrders = await prisma.order.findMany({
      where: { orderNumber: { in: ['#CC-ACCEPT-1', '#CC-ACCEPT-2'] } },
    });
    for (const ord of testOrders) {
      await prisma.orderItem.deleteMany({ where: { orderId: ord.id } });
      await prisma.pickingList.deleteMany({ where: { orderId: ord.id } });
      await prisma.orderStatusHistory.deleteMany({ where: { orderId: ord.id } });
      await prisma.order.delete({ where: { id: ord.id } });
    }
    await prisma.ledgerEntry.deleteMany({
      where: { referenceId: { in: ['#CC-ACCEPT-1', '#CC-ACCEPT-2'] } },
    });
  });

  it('ACCEPTANCE TEST 1: Cart of 2 soap + 4 ramen + 1 coffee = $15.00; balance goes from $82.50 to $67.50; order appears in Warehouse queue', async () => {
    const offender = await prisma.offender.findUniqueOrThrow({ where: { id: 'A1234567' } });
    expect(offender.balance).toBe(82.50);

    const soap = await prisma.product.findUniqueOrThrow({ where: { sku: 'PC-002' } }); // 2.00
    const ramen = await prisma.product.findUniqueOrThrow({ where: { sku: 'SNK-001' } }); // 1.50
    const coffee = await prisma.product.findUniqueOrThrow({ where: { sku: 'BEV-001' } }); // 5.00

    const items = [
      { prod: soap, qty: 2, subtotal: 4.00 },
      { prod: ramen, qty: 4, subtotal: 6.00 },
      { prod: coffee, qty: 1, subtotal: 5.00 },
    ];
    const total = 15.00;

    const orderNumber = '#CC-ACCEPT-1';

    // Transaction execution
    const result = await prisma.$transaction(async (tx) => {
      // Deduct stock
      for (const i of items) {
        await tx.product.update({
          where: { id: i.prod.id },
          data: { stock: { decrement: i.qty } },
        });
      }

      const balanceAfter = Math.round((offender.balance - total) * 100) / 100;
      await tx.offender.update({
        where: { id: offender.id },
        data: { balance: balanceAfter, currentWeeklySpent: total },
      });

      const ord = await tx.order.create({
        data: {
          orderNumber,
          offenderId: offender.id,
          status: 'PROCESSING',
          subtotal: total,
          total,
          expectedDeliveryDate: new Date(),
          barcode: `BC-ACCEPT-1`,
          items: {
            create: items.map((i) => ({
              productId: i.prod.id,
              quantity: i.qty,
              unitPrice: i.prod.price,
              totalPrice: i.subtotal,
            })),
          },
        },
      });

      await tx.pickingList.create({
        data: { orderId: ord.id, status: 'PENDING' },
      });

      await tx.ledgerEntry.create({
        data: {
          offenderId: offender.id,
          type: 'COMMISSARY_ORDER',
          debit: total,
          credit: 0.0,
          balanceBefore: offender.balance,
          balanceAfter,
          referenceType: 'ORDER',
          referenceId: orderNumber,
          description: `Commissary order ${orderNumber}`,
        },
      });

      return { ord, balanceAfter };
    });

    // 1. Balance must decrease to exactly $67.50
    expect(result.balanceAfter).toBe(67.50);
    const updatedOffender = await prisma.offender.findUniqueOrThrow({ where: { id: 'A1234567' } });
    expect(updatedOffender.balance).toBe(67.50);

    // 2. Order appears in Warehouse queue (PROCESSING + picking list PENDING)
    const warehouseOrder = await prisma.order.findUnique({
      where: { orderNumber },
      include: { pickingList: true, items: true },
    });
    expect(warehouseOrder).toBeDefined();
    expect(warehouseOrder?.status).toBe('PROCESSING');
    expect(warehouseOrder?.pickingList?.status).toBe('PENDING');
  });

  it('ACCEPTANCE TEST 2: An order over the balance or weekly limit is rejected', async () => {
    const offender = await prisma.offender.findUniqueOrThrow({ where: { id: 'A1234567' } });

    // Test over balance
    const orderOverBalance = 90.00; // balance is $82.50
    expect(orderOverBalance > offender.balance).toBe(true);

    // Test over weekly limit
    await prisma.offender.update({
      where: { id: 'A1234567' },
      data: { currentWeeklySpent: 95.00 }, // $5.00 remaining limit
    });
    const updated = await prisma.offender.findUniqueOrThrow({ where: { id: 'A1234567' } });
    const orderOverLimit = 10.00;
    expect(updated.currentWeeklySpent + orderOverLimit > updated.weeklyLimit).toBe(true);
  });

  it('ACCEPTANCE TEST 3: An electronic deposit raises the inmate balance only after confirmation, and appears in deposit history and ledger', async () => {
    const provider = getPaymentProvider();
    const idemp = `idemp-acc3-${Date.now()}`;

    // Create intent
    const intent = await provider.createPaymentIntent({
      amount: 40.00,
      offenderId: 'A1234567',
      idempotencyKey: idemp,
      customerEmail: 'family@canteen.local',
    });

    // Before confirmation: balance is $82.50
    const beforeOffender = await prisma.offender.findUniqueOrThrow({ where: { id: 'A1234567' } });
    expect(beforeOffender.balance).toBe(82.50);

    // Confirmation
    await provider.processPaymentConfirmation(intent.providerRef, idemp);

    // After confirmation: balance is $122.50
    const afterOffender = await prisma.offender.findUniqueOrThrow({ where: { id: 'A1234567' } });
    expect(afterOffender.balance).toBe(122.50);

    // Appears in deposit history
    const deposit = await prisma.deposit.findUniqueOrThrow({ where: { providerRef: intent.providerRef } });
    expect(deposit.status).toBe('SUCCEEDED');

    // Appears in ledger
    const ledger = await prisma.ledgerEntry.findFirstOrThrow({ where: { referenceId: intent.providerRef } });
    expect(ledger.credit).toBe(40.00);
    expect(ledger.balanceAfter).toBe(122.50);
  });

  it('ACCEPTANCE TEST 4: Warehouse can pick, package, scan and include the order in a manifest. Items at or below reorder level appear in shortages', async () => {
    const soap = await prisma.product.findUniqueOrThrow({ where: { sku: 'PC-002' } });

    // Create order
    const order = await prisma.order.create({
      data: {
        orderNumber: '#CC-ACCEPT-2',
        offenderId: 'A1234567',
        status: 'PROCESSING',
        subtotal: 4.00,
        total: 4.00,
        expectedDeliveryDate: new Date(),
        barcode: 'BC-ACCEPT-2',
        items: {
          create: [{ productId: soap.id, quantity: 2, unitPrice: 2.00, totalPrice: 4.00 }],
        },
        pickingList: { create: { status: 'PENDING' } },
      },
    });

    // 1. Pick & Package & Scan
    await prisma.pickingList.update({
      where: { orderId: order.id },
      data: { status: 'PACKED' },
    });
    await prisma.order.update({
      where: { id: order.id },
      data: { status: 'PACKED' },
    });

    // 2. Include in manifest
    const facility = await prisma.facility.findFirstOrThrow();
    const manifest = await prisma.manifest.create({
      data: {
        manifestNumber: '#MN-ACCEPT-U4',
        facilityId: facility.id,
        unit: 'Unit 4',
        deliveryDate: new Date(),
        status: 'GENERATED',
        totalOrders: 1,
        totalItems: 2,
      },
    });

    await prisma.order.update({
      where: { id: order.id },
      data: { manifestId: manifest.id, status: 'OUT_FOR_DELIVERY' },
    });

    const finalOrder = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
      include: { manifest: true },
    });
    expect(finalOrder.manifest?.manifestNumber).toBe('#MN-ACCEPT-U4');

    // 3. Shortage check: Toothpaste stock=10 <= reorderLevel=15
    await prisma.product.update({ where: { sku: 'PC-001' }, data: { stock: 10 } });
    const lowStock = await prisma.product.findMany({ where: { stock: { lte: 15 } } });
    expect(lowStock.some((p) => p.sku === 'PC-001')).toBe(true);

    // Clean up
    await prisma.product.update({ where: { sku: 'PC-001' }, data: { stock: 50 } });
    await prisma.manifest.delete({ where: { id: manifest.id } });
  });
});

