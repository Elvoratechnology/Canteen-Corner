import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import * as auth from '@/lib/auth';
import { POST as createDepositIntent } from '@/app/api/family/deposits/intent/route';
import { GET as searchOffenders } from '@/app/api/family/offenders/search/route';
import { GET as getFamilyDeposits } from '@/app/api/family/deposits/route';

vi.mock('@/lib/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth')>();
  return {
    ...actual,
    getCurrentSession: vi.fn(),
  };
});

describe('Phase 3: Family Portal Mobile-First Optimization & Security Suite', () => {
  let familyUser: any;
  let familyAccount: any;
  let offender: any;

  beforeEach(async () => {
    // 1. Get or create seeded family user
    familyUser = await prisma.user.findFirst({
      where: { role: 'FAMILY' },
      include: { familyAccount: true },
    });

    if (!familyUser) {
      familyUser = await prisma.user.create({
        data: {
          email: 'family.test@canteen.local',
          name: 'Sarah Smith',
          role: 'FAMILY',
          passwordHash: 'dummy-hash',
          familyAccount: {
            create: {
              relationship: 'Mother',
            },
          },
        },
        include: { familyAccount: true },
      });
    }

    familyAccount = familyUser.familyAccount;

    // 2. Fetch seeded offender John Smith
    offender = await prisma.offender.findUniqueOrThrow({
      where: { id: 'A1234567' },
      include: { facility: true },
    });

    // 3. Ensure approved link exists
    await prisma.familyOffenderLink.upsert({
      where: {
        familyAccountId_offenderId: {
          familyAccountId: familyAccount.id,
          offenderId: offender.id,
        },
      },
      update: { status: 'APPROVED' },
      create: {
        familyAccountId: familyAccount.id,
        offenderId: offender.id,
        status: 'APPROVED',
      },
    });
  });

  describe('1. Family Deposit Presets & Intent Calculation', () => {
    it('should correctly calculate $3.50 electronic processing fee for preset $50.00', async () => {
      vi.mocked(auth.getCurrentSession).mockResolvedValue({
        userId: familyUser.id,
        name: familyUser.name,
        role: 'FAMILY',
      });

      const req = new NextRequest('http://localhost:3000/api/family/deposits/intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          offenderId: offender.id,
          amount: 50.00,
          provider: 'stripe',
        }),
      });

      const res = await createDepositIntent(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.intent).toBeDefined();
      expect(data.intent.amount).toBe(50.00);
      expect(data.intent.fee).toBe(3.50);
      expect(data.intent.totalPaid).toBe(53.50);
      expect(data.intent.provider).toBe('STRIPE');
      expect(data.intent.providerRef).toMatch(/^cs_/);
    });

    it('should calculate identical transparent fee structure for PayPal provider', async () => {
      vi.mocked(auth.getCurrentSession).mockResolvedValue({
        userId: familyUser.id,
        name: familyUser.name,
        role: 'FAMILY',
      });

      const req = new NextRequest('http://localhost:3000/api/family/deposits/intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          offenderId: offender.id,
          amount: 150.00,
          provider: 'paypal',
        }),
      });

      const res = await createDepositIntent(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.intent).toBeDefined();
      expect(data.intent.amount).toBe(150.00);
      expect(data.intent.fee).toBe(3.50);
      expect(data.intent.totalPaid).toBe(153.50);
      expect(data.intent.provider).toBe('PAYPAL');
      expect(data.intent.providerRef).toMatch(/^ORDER-PAYPAL-/);
    });

    it('should reject deposit amounts exceeding facility maximum limit ($300.00)', async () => {
      vi.mocked(auth.getCurrentSession).mockResolvedValue({
        userId: familyUser.id,
        name: familyUser.name,
        role: 'FAMILY',
      });

      const req = new NextRequest('http://localhost:3000/api/family/deposits/intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          offenderId: offender.id,
          amount: 350.00, // Facility limit is 300
          provider: 'stripe',
        }),
      });

      const res = await createDepositIntent(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toContain('Maximum single deposit is $300.00');
    });

    it('should reject zero or negative deposit amounts', async () => {
      vi.mocked(auth.getCurrentSession).mockResolvedValue({
        userId: familyUser.id,
        name: familyUser.name,
        role: 'FAMILY',
      });

      const req = new NextRequest('http://localhost:3000/api/family/deposits/intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          offenderId: offender.id,
          amount: 0,
          provider: 'stripe',
        }),
      });

      const res = await createDepositIntent(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toContain('Deposit amount must be positive');
    });
  });

  describe('2. Inmate Search & Privacy Boundary', () => {
    it('should return matching inmates without exposing housing, cell, or unit location', async () => {
      vi.mocked(auth.getCurrentSession).mockResolvedValue({
        userId: familyUser.id,
        name: familyUser.name,
        role: 'FAMILY',
      });

      const req = new NextRequest('http://localhost:3000/api/family/offenders/search?q=Smith');
      const res = await searchOffenders(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.offenders).toBeDefined();
      expect(data.offenders.length).toBeGreaterThan(0);

      const smith = data.offenders.find((o: any) => o.id === 'A1234567');
      expect(smith).toBeDefined();
      expect(smith.name).toBe('John Smith');
      expect(smith.facilityName).toBeDefined();
      expect(smith.maxDepositAmount).toBe(300);

      // Verify privacy boundaries
      expect(smith.unit).toBeUndefined();
      expect(smith.housing).toBeUndefined();
      expect(smith.cell).toBeUndefined();
    });
  });

  describe('3. Deposit History Audit Access', () => {
    it('should return historical deposits for authenticated family sponsor', async () => {
      vi.mocked(auth.getCurrentSession).mockResolvedValue({
        userId: familyUser.id,
        name: familyUser.name,
        role: 'FAMILY',
      });

      const res = await getFamilyDeposits();
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.deposits).toBeDefined();
      expect(Array.isArray(data.deposits)).toBe(true);

      // Verify that every deposit contains providerRef, amount, fee, and offender info
      for (const dep of data.deposits) {
        expect(dep.providerRef).toBeDefined();
        expect(typeof dep.amount).toBe('number');
        expect(typeof dep.fee).toBe('number');
        expect(dep.offender).toBeDefined();
      }
    });
  });
});

