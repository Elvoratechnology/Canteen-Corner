import { describe, it, expect, beforeEach } from 'vitest';
import prisma from '../src/lib/db';
import bcrypt from 'bcryptjs';

describe('Phase 1: Foundation, Seed Data & Authentication Verification', () => {
  beforeEach(async () => {
    await prisma.offender.update({
      where: { id: 'A1234567' },
      data: { balance: 82.50, weeklyLimit: 100.00, currentWeeklySpent: 0.00 },
    });
  });
  it('should have seeded Offender John Smith with exact specs', async () => {
    const offender = await prisma.offender.findUnique({
      where: { id: 'A1234567' },
      include: { facility: true },
    });

    expect(offender).toBeDefined();
    expect(offender?.name).toBe('John Smith');
    expect(offender?.balance).toBe(82.50);
    expect(offender?.weeklyLimit).toBe(100.00);
    expect(offender?.unit).toBe('Unit 4');

    const pinMatch = await bcrypt.compare('1234', offender!.pinHash);
    expect(pinMatch).toBe(true);

    const wrongPin = await bcrypt.compare('9999', offender!.pinHash);
    expect(wrongPin).toBe(false);
  });

  it('should have all 9 required products with exact prices', async () => {
    const products = await prisma.product.findMany({
      orderBy: { sku: 'asc' },
    });

    expect(products.length).toBe(9);

    const priceMap = products.reduce((acc, p) => {
      acc[p.name] = p.price;
      return acc;
    }, {} as Record<string, number>);

    expect(priceMap['Ramen noodles']).toBe(1.50);
    expect(priceMap['Peanut butter']).toBe(2.50);
    expect(priceMap['Coffee']).toBe(5.00);
    expect(priceMap['Biscuits']).toBe(1.20);
    expect(priceMap['Toothpaste']).toBe(1.80);
    expect(priceMap['Bar soap']).toBe(2.00);
    expect(priceMap['Writing pad']).toBe(1.50);
    expect(priceMap['Envelopes (10)']).toBe(1.00);
    expect(priceMap['Vitamins']).toBe(4.50);
  });

  it('should have the 3 past delivered orders for John Smith', async () => {
    const orders = await prisma.order.findMany({
      where: { offenderId: 'A1234567', status: 'DELIVERED' },
      orderBy: { orderNumber: 'desc' },
      include: { items: true },
    });

    expect(orders.length).toBe(3);

    const orderTotals = orders.reduce((acc, o) => {
      acc[o.orderNumber] = o.total;
      return acc;
    }, {} as Record<string, number>);

    expect(orderTotals['#24512']).toBe(22.00);
    expect(orderTotals['#24110']).toBe(17.25);
    expect(orderTotals['#23780']).toBe(20.50);

    orders.forEach((o) => {
      expect(o.status).toBe('DELIVERED');
      expect(o.items.length).toBeGreaterThan(0);
    });
  });

  it('should have demo family and warehouse staff accounts', async () => {
    const familyUser = await prisma.user.findUnique({
      where: { email: 'family@canteen.local' },
      include: { familyAccount: true },
    });
    expect(familyUser).toBeDefined();
    expect(familyUser?.role).toBe('FAMILY');
    expect(familyUser?.familyAccount).toBeDefined();

    const pickerUser = await prisma.user.findUnique({
      where: { email: 'picker@canteen.local' },
    });
    expect(pickerUser).toBeDefined();
    expect(pickerUser?.role).toBe('WAREHOUSE_PICKER');
    expect(pickerUser?.staffId).toBe('STF-01');

    const supervisorUser = await prisma.user.findUnique({
      where: { email: 'supervisor@canteen.local' },
    });
    expect(supervisorUser).toBeDefined();
    expect(supervisorUser?.role).toBe('WAREHOUSE_SUPERVISOR');
    expect(supervisorUser?.staffId).toBe('STF-02');
  });

  it('should maintain double-entry ledger tracking for inmate initial balance', async () => {
    const entries = await prisma.ledgerEntry.findMany({
      where: { offenderId: 'A1234567' },
    });
    expect(entries.length).toBeGreaterThanOrEqual(1);
    const initialEntry = entries[0];
    expect(initialEntry.credit).toBe(82.50);
    expect(initialEntry.balanceAfter).toBe(82.50);
  });
});
