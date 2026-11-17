import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import * as auth from '@/lib/auth';
import { signSession, verifySession, getJwtSecretKey } from '@/lib/auth-token';
import { validateSessionAccount } from '@/lib/auth';
import { processVerifiedDepositConfirmation } from '@/lib/payments/confirmation';

// Route handlers
import { POST as logoutPost } from '@/app/api/auth/me/route';
import { PATCH as patchAdminUser } from '@/app/api/admin/users/route';
import { PATCH as patchAdminInmate } from '@/app/api/admin/inmates/route';
import { POST as postInmateOrder } from '@/app/api/inmate/order/route';

describe('CANTEEN CORNER — PHASE 8C Security Hardening, Session Revocation & Financial Integrity Suite', () => {
  const FACILITY_ID = 'FACILITY_CC_01';
  let adminUser: any;
  let supervisorUser: any;
  let pickerUser: any;
  let inmateOffender: any;
  let sampleProduct: any;

  beforeEach(async () => {
    adminUser = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
    supervisorUser = await prisma.user.findFirst({ where: { role: 'WAREHOUSE_SUPERVISOR' } });
    pickerUser = await prisma.user.findFirst({ where: { role: 'WAREHOUSE_PICKER' } });
    inmateOffender = await prisma.offender.findFirst({
      where: { id: 'A1234567' },
      include: { user: true },
    });
    sampleProduct = await prisma.product.findFirst({
      where: { active: true },
    });
  });

  // 1. GAP-01: SERVER-SIDE SESSION REVOCATION & TOKEN VERSIONING
  describe('GAP-01: Database-Backed Session Revocation', () => {
    it('should invalidate token after logout by incrementing tokenVersion', async () => {
      if (!adminUser) return;

      const initialUser = await prisma.user.findUniqueOrThrow({ where: { id: adminUser.id } });
      const currentTv = initialUser.tokenVersion;

      // Issue token with current token version
      const token = await signSession({
        userId: adminUser.id,
        name: adminUser.name,
        role: 'ADMIN',
        tokenVersion: currentTv,
      });

      // Verify token is valid initially
      const decoded = await verifySession(token);
      expect(decoded).not.toBeNull();
      const validatedBefore = await validateSessionAccount(decoded);
      expect(validatedBefore).not.toBeNull();
      expect(validatedBefore?.userId).toBe(adminUser.id);

      // Simulate active session calling logout
      vi.spyOn(auth, 'getCurrentSession').mockResolvedValueOnce(decoded);
      const logoutRes = await logoutPost();
      expect(logoutRes.status).toBe(200);

      // Verify user tokenVersion was incremented in the database
      const postLogoutUser = await prisma.user.findUniqueOrThrow({ where: { id: adminUser.id } });
      expect(postLogoutUser.tokenVersion).toBeGreaterThan(currentTv);

      // Verify that the old token is now REJECTED by validateSessionAccount
      const validatedAfter = await validateSessionAccount(decoded);
      expect(validatedAfter).toBeNull();

      vi.restoreAllMocks();
    });

    it('should reject tokens with missing or mismatched token versions', async () => {
      if (!supervisorUser) return;

      const tokenStaleTv = await signSession({
        userId: supervisorUser.id,
        name: supervisorUser.name,
        role: 'WAREHOUSE_SUPERVISOR',
        facilityId: FACILITY_ID,
        tokenVersion: 99999, // Non-matching tokenVersion
      });

      const decoded = await verifySession(tokenStaleTv);
      const validation = await validateSessionAccount(decoded);
      expect(validation).toBeNull();
    });
  });

  // 2. GAP-02: ACTIVE ACCOUNT LOCK ENFORCEMENT
  describe('GAP-02: Active Account Lock Enforcement', () => {
    it('should reject active session immediately when user account is locked', async () => {
      if (!supervisorUser) return;

      const user = await prisma.user.findUniqueOrThrow({ where: { id: supervisorUser.id } });
      const token = await signSession({
        userId: user.id,
        name: user.name,
        role: 'WAREHOUSE_SUPERVISOR',
        facilityId: FACILITY_ID,
        tokenVersion: user.tokenVersion,
      });

      const decoded = await verifySession(token);
      expect(await validateSessionAccount(decoded)).not.toBeNull();

      // Lock account in database
      await prisma.user.update({
        where: { id: user.id },
        data: { lockedUntil: new Date(Date.now() + 60 * 60 * 1000) },
      });

      try {
        // Active session must now be rejected
        const lockedValidation = await validateSessionAccount(decoded);
        expect(lockedValidation).toBeNull();
      } finally {
        // Unlock
        await prisma.user.update({
          where: { id: user.id },
          data: { lockedUntil: null },
        });
      }
    });

    it('should reject active inmate session when inmate PIN is locked', async () => {
      if (!inmateOffender) return;

      const offender = await prisma.offender.findUniqueOrThrow({ where: { id: inmateOffender.id } });
      const token = await signSession({
        offenderId: offender.id,
        name: offender.name,
        role: 'INMATE',
        facilityId: offender.facilityId,
        tokenVersion: offender.tokenVersion,
      });

      const decoded = await verifySession(token);
      expect(await validateSessionAccount(decoded)).not.toBeNull();

      // Lock inmate PIN
      await prisma.offender.update({
        where: { id: offender.id },
        data: { pinLockedUntil: new Date(Date.now() + 60 * 60 * 1000) },
      });

      try {
        const lockedValidation = await validateSessionAccount(decoded);
        expect(lockedValidation).toBeNull();
      } finally {
        await prisma.offender.update({
          where: { id: offender.id },
          data: { pinLockedUntil: null },
        });
      }
    });
  });

  // 3. GAP-04: STALE JWT PRIVILEGE & FACILITY REASSIGNMENT PROTECTION
  describe('GAP-04: Stale JWT Privilege & Facility Protection', () => {
    it('should reject session when role has been demoted in database', async () => {
      if (!supervisorUser) return;

      const user = await prisma.user.findUniqueOrThrow({ where: { id: supervisorUser.id } });
      // Token claims WAREHOUSE_SUPERVISOR
      const token = await signSession({
        userId: user.id,
        name: user.name,
        role: 'WAREHOUSE_SUPERVISOR',
        facilityId: FACILITY_ID,
        tokenVersion: user.tokenVersion,
      });

      const decoded = await verifySession(token);
      expect(await validateSessionAccount(decoded)).not.toBeNull();

      // Demote user in database to WAREHOUSE_PICKER
      await prisma.user.update({
        where: { id: user.id },
        data: { role: 'WAREHOUSE_PICKER' },
      });

      try {
        // Old token claiming SUPERVISOR must be rejected due to role mismatch
        const result = await validateSessionAccount(decoded);
        expect(result).toBeNull();
      } finally {
        // Restore role
        await prisma.user.update({
          where: { id: user.id },
          data: { role: 'WAREHOUSE_SUPERVISOR' },
        });
      }
    });

    it('should reject session when warehouse user is reassigned to another facility', async () => {
      if (!supervisorUser) return;

      // Ensure second facility exists
      await prisma.facility.upsert({
        where: { id: 'FACILITY_CC_02' },
        update: {},
        create: {
          id: 'FACILITY_CC_02',
          name: 'North Facility',
        },
      });

      const user = await prisma.user.findUniqueOrThrow({ where: { id: supervisorUser.id } });
      const token = await signSession({
        userId: user.id,
        name: user.name,
        role: 'WAREHOUSE_SUPERVISOR',
        facilityId: FACILITY_ID,
        tokenVersion: user.tokenVersion,
      });

      const decoded = await verifySession(token);
      expect(await validateSessionAccount(decoded)).not.toBeNull();

      // Reassign user to FACILITY_CC_02
      await prisma.user.update({
        where: { id: user.id },
        data: { facilityId: 'FACILITY_CC_02' },
      });

      try {
        // Token tied to FACILITY_CC_01 must be rejected
        const result = await validateSessionAccount(decoded);
        expect(result).toBeNull();
      } finally {
        await prisma.user.update({
          where: { id: user.id },
          data: { facilityId: FACILITY_ID },
        });
      }
    });
  });

  // 4. GAP-03: ATOMIC FINANCIAL TRANSACTIONS & IDEMPOTENCY
  describe('GAP-03: Atomic Financial Transactions & Concurrency', () => {
    it('should reject order when balance is insufficient (never go negative)', async () => {
      if (!inmateOffender || !sampleProduct) return;

      // Set inmate balance to $5.00
      await prisma.offender.update({
        where: { id: inmateOffender.id },
        data: { balance: 5.00, weeklyLimit: 100.00, currentWeeklySpent: 0.00 },
      });

      // Attempt order costing more than balance
      vi.spyOn(auth, 'getCurrentSession').mockResolvedValue({
        offenderId: inmateOffender.id,
        name: inmateOffender.name,
        role: 'INMATE',
        facilityId: inmateOffender.facilityId,
      });

      // Price * qty > 5.00
      const qty = Math.ceil(10 / sampleProduct.price);
      const req = new NextRequest('http://localhost:3000/api/inmate/order', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          items: [{ productId: sampleProduct.id, quantity: qty }],
        }),
      });

      const res = await postInmateOrder(req);
      expect(res.status).toBe(400);

      // Verify balance was NOT deducted
      const finalOffender = await prisma.offender.findUniqueOrThrow({ where: { id: inmateOffender.id } });
      expect(Number(finalOffender.balance)).toBe(5.00);

      vi.restoreAllMocks();
    });

    it('should guarantee deposit idempotency: duplicate webhook cannot credit twice', async () => {
      if (!inmateOffender) return;

      const initialBalance = 50.00;
      await prisma.offender.update({
        where: { id: inmateOffender.id },
        data: { balance: initialBalance },
      });

      const providerRef = `DEP-IDEM-TEST-${Date.now()}`;
      const idempotencyKey = `IDEM-KEY-${Date.now()}`;
      const depositAmount = 25.00;

      // Create deposit in PENDING status
      await prisma.deposit.create({
        data: {
          offenderId: inmateOffender.id,
          amount: depositAmount,
          fee: 2.50,
          totalPaid: 27.50,
          currency: 'USD',
          provider: 'STRIPE',
          providerRef,
          status: 'PENDING',
          idempotencyKey,
        },
      });

      // First confirmation delivery
      const firstResult = await processVerifiedDepositConfirmation({
        providerRef,
        idempotencyKey,
        verifiedAmount: depositAmount,
        currency: 'USD',
        expectedProvider: 'STRIPE',
      });

      expect(firstResult.success).toBe(true);
      expect(firstResult.alreadyProcessed).toBeFalsy();

      // Check balance was incremented exactly once
      const afterFirst = await prisma.offender.findUniqueOrThrow({ where: { id: inmateOffender.id } });
      expect(Number(afterFirst.balance)).toBe(initialBalance + depositAmount);

      // Second duplicate delivery (replay)
      const secondResult = await processVerifiedDepositConfirmation({
        providerRef,
        idempotencyKey,
        verifiedAmount: depositAmount,
        currency: 'USD',
        expectedProvider: 'STRIPE',
      });

      expect(secondResult.success).toBe(true);
      expect(secondResult.alreadyProcessed).toBe(true);

      // Balance MUST remain unchanged (credited exactly once)
      const afterSecond = await prisma.offender.findUniqueOrThrow({ where: { id: inmateOffender.id } });
      expect(Number(afterSecond.balance)).toBe(initialBalance + depositAmount);
    });

    it('should atomically process administrative balance adjustment and reject negative balance', async () => {
      if (!inmateOffender || !adminUser) return;

      await prisma.offender.update({
        where: { id: inmateOffender.id },
        data: { balance: 20.00 },
      });

      vi.spyOn(auth, 'getCurrentSession').mockResolvedValue({
        userId: adminUser.id,
        name: adminUser.name,
        role: 'ADMIN',
      });

      // Attempt to deduct $30.00 (more than available $20.00)
      const req = new NextRequest('http://localhost:3000/api/admin/inmates', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          offenderId: inmateOffender.id,
          action: 'ADJUST_BALANCE',
          amount: -30.00,
          reason: 'Test negative debit rejection',
        }),
      });

      const res = await patchAdminInmate(req);
      expect(res.status).toBe(400); // Bad Request: Adjustment would result in a negative balance
      const data = await res.json();
      expect(data.error).toContain('negative balance');

      const check = await prisma.offender.findUniqueOrThrow({ where: { id: inmateOffender.id } });
      expect(Number(check.balance)).toBe(20.00);

      vi.restoreAllMocks();
    });
  });

  // 5. GAP-05: INVENTORY OVERSOLD PROTECTION
  describe('GAP-05: Inventory Concurrency & Oversold Protection', () => {
    it('should reject order when inventory is insufficient (stock never negative)', async () => {
      if (!inmateOffender || !sampleProduct) return;

      // Set product stock to 2 units
      await prisma.product.update({
        where: { id: sampleProduct.id },
        data: { stock: 2 },
      });

      await prisma.offender.update({
        where: { id: inmateOffender.id },
        data: { balance: 500.00, weeklyLimit: 500.00, currentWeeklySpent: 0.00 },
      });

      vi.spyOn(auth, 'getCurrentSession').mockResolvedValue({
        offenderId: inmateOffender.id,
        name: inmateOffender.name,
        role: 'INMATE',
        facilityId: inmateOffender.facilityId,
      });

      // Request 5 units (exceeds 2 available)
      const req = new NextRequest('http://localhost:3000/api/inmate/order', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          items: [{ productId: sampleProduct.id, quantity: 5 }],
        }),
      });

      const res = await postInmateOrder(req);
      expect(res.status).toBe(400);

      const prodCheck = await prisma.product.findUniqueOrThrow({ where: { id: sampleProduct.id } });
      expect(prodCheck.stock).toBe(2);

      vi.restoreAllMocks();
    });
  });

  // 6. GAP-06: JWT SECRET SECURITY & PRODUCTION ENFORCEMENT
  describe('GAP-06: JWT Secret Production Enforcement', () => {
    const originalEnv = process.env.NODE_ENV;
    const originalSecret = process.env.JWT_SECRET;

    afterEach(() => {
      (process.env as any).NODE_ENV = originalEnv;
      process.env.JWT_SECRET = originalSecret;
    });

    it('should reject weak secrets (<32 characters) in production mode', () => {
      (process.env as any).NODE_ENV = 'production';
      process.env.JWT_SECRET = 'short-secret-key-123';

      expect(() => getJwtSecretKey()).toThrowError(
        /SERVER CONFIGURATION ERROR: JWT_SECRET must be at least 32 characters long in production mode/
      );
    });

    it('should reject insecure default placeholder secrets in production mode', () => {
      (process.env as any).NODE_ENV = 'production';
      process.env.JWT_SECRET = 'canteen-corner-super-secret-jwt-key-change-in-production';

      expect(() => getJwtSecretKey()).toThrowError(
        /SERVER CONFIGURATION ERROR: Insecure default JWT_SECRET detected in production environment/
      );
    });

    it('should accept strong 32+ character secret in production mode', () => {
      (process.env as any).NODE_ENV = 'production';
      process.env.JWT_SECRET = 'a-very-strong-production-jwt-secret-key-with-high-entropy-64bytes!';

      const key = getJwtSecretKey();
      expect(key).toBeInstanceOf(Uint8Array);
      expect(key.length).toBeGreaterThanOrEqual(32);
    });
  });
});
