import { describe, it, expect, beforeEach } from 'vitest';
import prisma from '@/lib/db';
import {
  toDecimal,
  toMoneyNumber,
  toMoneyString,
  moneyAdd,
  moneySub,
  moneyMul,
  moneyDiv,
  moneyCents,
  serializeOrder,
  serializeOffender,
  serializeDeposit,
  serializeProduct,
  serializeLedgerEntry,
  serializeFacility,
  serializeGiftPackage,
  Prisma,
} from '@/lib/money';

describe('Phase 8F.6: Financial Precision Hardening Tests', () => {
  describe('1. Decimal Utility Arithmetic & Precision', () => {
    it('eliminates IEEE 754 binary floating-point rounding errors (0.10 + 0.20)', () => {
      // In binary floating-point: 0.1 + 0.2 === 0.30000000000000004
      const floatSum = 0.10 + 0.20;
      expect(floatSum).not.toBe(0.30);

      // In Decimal arithmetic: exactly 0.30
      const decSum = moneyAdd(0.10, 0.20);
      expect(decSum.toString()).toBe('0.3');
      expect(toMoneyString(decSum)).toBe('0.30');
      expect(toMoneyNumber(decSum)).toBe(0.30);
    });

    it('handles exact sub-dollar increments: $0.01, $0.10, $0.29, $0.99 without drift', () => {
      let sum = toDecimal(0);
      sum = moneyAdd(sum, 0.01);
      sum = moneyAdd(sum, 0.10);
      sum = moneyAdd(sum, 0.29);
      sum = moneyAdd(sum, 0.99);

      // 0.01 + 0.10 + 0.29 + 0.99 = 1.39
      expect(sum.toString()).toBe('1.39');
      expect(toMoneyNumber(sum)).toBe(1.39);
      expect(moneyCents(sum)).toBe(139);
    });

    it('performs exact multiplication and half-up rounding', () => {
      // 3 items @ $1.29 = $3.87
      const total = moneyMul(1.29, 3);
      expect(total.toString()).toBe('3.87');
      expect(toMoneyNumber(total)).toBe(3.87);

      // 7 items @ $0.33 = $2.31
      const total2 = moneyMul(0.33, 7);
      expect(total2.toString()).toBe('2.31');
    });

    it('correctly calculates integer cents for gateway payloads', () => {
      expect(moneyCents('19.99')).toBe(1999);
      expect(moneyCents(19.99)).toBe(1999);
      expect(moneyCents(toDecimal('0.05'))).toBe(5);
      expect(moneyCents(100.00)).toBe(10000);
    });
  });

  describe('2. DTO Serialization at API Boundaries', () => {
    it('serializes Order DTO converting Decimals to numbers for frontend contract safety', () => {
      const mockOrder = {
        id: 'ord-123',
        orderNumber: '#CC-10001',
        subtotal: new Prisma.Decimal('42.50'),
        tax: new Prisma.Decimal('0.00'),
        total: new Prisma.Decimal('42.50'),
        items: [
          {
            id: 'item-1',
            productId: 'p-1',
            quantity: 2,
            unitPrice: new Prisma.Decimal('21.25'),
            totalPrice: new Prisma.Decimal('42.50'),
          },
        ],
      };

      const serialized = serializeOrder(mockOrder);
      expect(serialized).not.toBeNull();
      expect(typeof serialized!.subtotal).toBe('number');
      expect(serialized!.subtotal).toBe(42.50);
      expect(typeof serialized!.total).toBe('number');
      expect(serialized!.total).toBe(42.50);
      expect(typeof serialized!.items[0].unitPrice).toBe('number');
      expect(serialized!.items[0].unitPrice).toBe(21.25);
      expect(typeof serialized!.items[0].totalPrice).toBe('number');
      expect(serialized!.items[0].totalPrice).toBe(42.50);

      // Verify frontend .toFixed(2) call succeeds without error
      expect(serialized!.total.toFixed(2)).toBe('42.50');
    });

    it('serializes Offender DTO converting Decimals to numbers', () => {
      const mockOffender = {
        id: 'A1234567',
        name: 'John Smith',
        balance: new Prisma.Decimal('82.50'),
        weeklyLimit: new Prisma.Decimal('100.00'),
        currentWeeklySpent: new Prisma.Decimal('17.50'),
      };

      const serialized = serializeOffender(mockOffender);
      expect(serialized).not.toBeNull();
      expect(typeof serialized!.balance).toBe('number');
      expect(serialized!.balance).toBe(82.50);
      expect(typeof serialized!.weeklyLimit).toBe('number');
      expect(serialized!.weeklyLimit).toBe(100.00);
      expect(typeof serialized!.currentWeeklySpent).toBe('number');
      expect(serialized!.currentWeeklySpent).toBe(17.50);
      expect(serialized!.balance.toFixed(2)).toBe('82.50');
    });

    it('serializes Deposit DTO converting Decimals to numbers', () => {
      const mockDeposit = {
        id: 'dep-123',
        amount: new Prisma.Decimal('50.00'),
        fee: new Prisma.Decimal('3.50'),
        totalPaid: new Prisma.Decimal('53.50'),
      };

      const serialized = serializeDeposit(mockDeposit);
      expect(serialized).not.toBeNull();
      expect(typeof serialized!.amount).toBe('number');
      expect(serialized!.amount).toBe(50.00);
      expect(typeof serialized!.fee).toBe('number');
      expect(serialized!.fee).toBe(3.50);
      expect(typeof serialized!.totalPaid).toBe('number');
      expect(serialized!.totalPaid).toBe(53.50);
    });

    it('serializes Product, Facility, and GiftPackage DTOs', () => {
      const prod = serializeProduct({ id: 'p1', price: new Prisma.Decimal('3.99') });
      expect(prod!.price).toBe(3.99);

      const fac = serializeFacility({ id: 'f1', maxWeeklySpend: new Prisma.Decimal('150.00'), maxDepositAmount: new Prisma.Decimal('300.00') });
      expect(fac!.maxWeeklySpend).toBe(150.00);
      expect(fac!.maxDepositAmount).toBe(300.00);

      const pkg = serializeGiftPackage({ id: 'gp1', totalValue: new Prisma.Decimal('28.75') });
      expect(pkg!.totalValue).toBe(28.75);
    });
  });

  describe('3. Database Decimal Storage & Transactions', () => {
    it('verifies Offender monetary columns are stored and queried as Prisma.Decimal instances', async () => {
      const offender = await prisma.offender.findUniqueOrThrow({
        where: { id: 'A1234567' },
      });

      expect(offender.balance).toBeInstanceOf(Prisma.Decimal);
      expect(offender.weeklyLimit).toBeInstanceOf(Prisma.Decimal);
      expect(offender.currentWeeklySpent).toBeInstanceOf(Prisma.Decimal);
    });

    it('verifies Product price is stored and queried as Prisma.Decimal instance', async () => {
      const ramen = await prisma.product.findUniqueOrThrow({
        where: { sku: 'SNK-001' },
      });

      expect(ramen.price).toBeInstanceOf(Prisma.Decimal);
      expect(ramen.price.toNumber()).toBe(1.50);
    });

    it('executes atomic Decimal balance adjustment and ledger record without float drift', async () => {
      const offender = await prisma.offender.findUniqueOrThrow({ where: { id: 'A1234567' } });
      const initialBalance = offender.balance;
      const creditIncrement = toDecimal('12.37');

      // Atomic increment
      await prisma.$transaction(async (tx) => {
        await tx.offender.update({
          where: { id: 'A1234567' },
          data: { balance: { increment: creditIncrement } },
        });

        const fresh = await tx.offender.findUniqueOrThrow({ where: { id: 'A1234567' } });
        const expectedNew = initialBalance.plus(creditIncrement);
        expect(fresh.balance.equals(expectedNew)).toBe(true);

        // Reverse for test idempotency
        await tx.offender.update({
          where: { id: 'A1234567' },
          data: { balance: { decrement: creditIncrement } },
        });
      });

      const finalOffender = await prisma.offender.findUniqueOrThrow({ where: { id: 'A1234567' } });
      expect(finalOffender.balance.equals(initialBalance)).toBe(true);
    });
  });
});
