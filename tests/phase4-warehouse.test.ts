import { describe, it, expect, beforeEach } from 'vitest';
import prisma from '../src/lib/db';

describe('Phase 4: Warehouse Fulfillment, Shortages & Manifest Verification', () => {
  let testOrderId: string;

  beforeEach(async () => {
    // Clean up any previous Phase 4 test orders or manifests
    const existingOrder = await prisma.order.findUnique({
      where: { orderNumber: '#CC-77001' },
    });
    if (existingOrder) {
      await prisma.orderItem.deleteMany({ where: { orderId: existingOrder.id } });
      await prisma.pickingList.deleteMany({ where: { orderId: existingOrder.id } });
      await prisma.orderStatusHistory.deleteMany({ where: { orderId: existingOrder.id } });
      await prisma.order.delete({ where: { id: existingOrder.id } });
    }

    await prisma.manifest.deleteMany({
      where: { manifestNumber: { startsWith: '#MN-TEST' } },
    });

    // Reset Vitamins stock to normal
    await prisma.product.update({
      where: { sku: 'HW-001' },
      data: { stock: 40, reorderLevel: 10 },
    });

    // Create a fresh PROCESSING order for warehouse testing
    const soap = await prisma.product.findUniqueOrThrow({ where: { sku: 'PC-002' } });
    const vitamins = await prisma.product.findUniqueOrThrow({ where: { sku: 'HW-001' } });

    const createdOrder = await prisma.order.create({
      data: {
        orderNumber: '#CC-77001',
        offenderId: 'A1234567',
        status: 'PROCESSING',
        subtotal: 8.50,
        total: 8.50,
        expectedDeliveryDate: new Date(),
        barcode: 'BC-CC-77001',
        items: {
          create: [
            { productId: soap.id, quantity: 2, unitPrice: 2.00, totalPrice: 4.00 },
            { productId: vitamins.id, quantity: 1, unitPrice: 4.50, totalPrice: 4.50 },
          ],
        },
        pickingList: {
          create: { status: 'PENDING' },
        },
      },
    });

    testOrderId = createdOrder.id;
  });

  it('should pick, package, scan barcode, and include the order in a delivery manifest', async () => {
    const picker = await prisma.user.findUniqueOrThrow({
      where: { email: 'picker@canteen.local' },
    });

    // 1. Start Picking
    await prisma.pickingList.update({
      where: { orderId: testOrderId },
      data: {
        status: 'PICKING',
        pickerUserId: picker.id,
        startedAt: new Date(),
      },
    });

    const pickingState = await prisma.pickingList.findUniqueOrThrow({
      where: { orderId: testOrderId },
    });
    expect(pickingState.status).toBe('PICKING');

    // 2. Scan Barcode & Package
    const order = await prisma.order.findUniqueOrThrow({ where: { id: testOrderId } });
    expect(order.barcode).toBe('BC-CC-77001');

    await prisma.order.update({
      where: { id: testOrderId },
      data: { status: 'PACKED', packedAt: new Date() },
    });
    await prisma.pickingList.update({
      where: { orderId: testOrderId },
      data: { status: 'PACKED', completedAt: new Date() },
    });

    const packedOrder = await prisma.order.findUniqueOrThrow({ where: { id: testOrderId } });
    expect(packedOrder.status).toBe('PACKED');

    // 3. Include in a Delivery Manifest
    const facility = await prisma.facility.findFirstOrThrow();
    const manifest = await prisma.manifest.create({
      data: {
        manifestNumber: '#MN-TEST-U4',
        facilityId: facility.id,
        unit: 'Unit 4',
        housing: 'Cell Block B',
        deliveryDate: new Date(),
        status: 'GENERATED',
        totalOrders: 1,
        totalItems: 3,
      },
    });

    await prisma.order.update({
      where: { id: testOrderId },
      data: {
        manifestId: manifest.id,
        status: 'OUT_FOR_DELIVERY',
      },
    });

    const manifestedOrder = await prisma.order.findUniqueOrThrow({
      where: { id: testOrderId },
      include: { manifest: true },
    });

    expect(manifestedOrder.status).toBe('OUT_FOR_DELIVERY');
    expect(manifestedOrder.manifest?.manifestNumber).toBe('#MN-TEST-U4');
  });

  it('should automatically flag items at or below reorder level in shortages and list affected orders', async () => {
    // Drop Vitamins stock (reorderLevel = 10) down to 5
    const vitamins = await prisma.product.update({
      where: { sku: 'HW-001' },
      data: { stock: 5 },
    });

    expect(vitamins.stock).toBeLessThanOrEqual(vitamins.reorderLevel);

    // Query all products at or below reorderLevel
    const allProducts = await prisma.product.findMany();
    const shortages = allProducts.filter((p) => p.stock <= p.reorderLevel);

    const flaggedVitamins = shortages.find((s) => s.sku === 'HW-001');
    expect(flaggedVitamins).toBeDefined();

    // Find affected PROCESSING orders containing HW-001
    const affectedOrders = await prisma.order.findMany({
      where: {
        status: 'PROCESSING',
        items: { some: { productId: vitamins.id } },
      },
    });

    expect(affectedOrders.some((o) => o.orderNumber === '#CC-77001')).toBe(true);

    // Restock Vitamins (+50) and verify shortage clears
    const restocked = await prisma.product.update({
      where: { id: vitamins.id },
      data: { stock: { increment: 50 } },
    });
    expect(restocked.stock).toBe(55);
    expect(restocked.stock > restocked.reorderLevel).toBe(true);
  });
});

