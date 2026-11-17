import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import * as auth from '@/lib/auth';
import { GET as getAdminStats } from '@/app/api/admin/stats/route';
import { GET as getAdminUsers, POST as createAdminUser, PATCH as updateAdminUser } from '@/app/api/admin/users/route';
import { GET as getAdminInmates, PATCH as updateAdminInmate } from '@/app/api/admin/inmates/route';
import { GET as getAdminProducts, POST as createAdminProduct, PATCH as updateAdminProduct } from '@/app/api/admin/products/route';
import { GET as getAdminFacilities, PATCH as updateAdminFacility } from '@/app/api/admin/facilities/route';

vi.mock('@/lib/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth')>();
  return {
    ...actual,
    getCurrentSession: vi.fn(),
  };
});

describe('Phase 5: Admin Portal Mobile Optimization & RBAC Security Suite', () => {
  const FACILITY_ID = 'FACILITY_CC_01';
  let adminSession: any;
  let supervisorSession: any;
  let pickerSession: any;
  let familySession: any;
  let inmateSession: any;
  let testOffender: any;

  beforeEach(async () => {
    // 1. Fetch real seeded admin from DB
    const realAdmin = await prisma.user.findFirst({
      where: { role: 'ADMIN' },
    });

    // 2. Setup session mocks
    adminSession = {
      userId: realAdmin?.id || 'admin-user-id',
      email: realAdmin?.email || 'admin@canteen.local',
      staffId: realAdmin?.staffId || 'ADM-01',
      role: 'ADMIN',
      facilityId: FACILITY_ID,
    };

    supervisorSession = {
      userId: 'supervisor-user-id',
      email: 'supervisor@canteen.local',
      role: 'WAREHOUSE_SUPERVISOR',
      facilityId: FACILITY_ID,
    };

    pickerSession = {
      userId: 'picker-user-id',
      email: 'picker@canteen.local',
      role: 'WAREHOUSE_PICKER',
      facilityId: FACILITY_ID,
    };

    familySession = {
      userId: 'family-user-id',
      email: 'family@canteen.local',
      role: 'FAMILY',
      facilityId: null,
    };

    inmateSession = {
      offenderId: 'A1234567',
      role: 'INMATE',
      facilityId: FACILITY_ID,
    };

    // 2. Fetch a test offender (e.g. John Smith or any offender in the facility)
    testOffender = await prisma.offender.findFirst({
      where: { facilityId: FACILITY_ID },
    });
  });

  describe('1. Authentication & RBAC Enforcement', () => {
    it('returns 401 Unauthorized for unauthenticated requests across all admin endpoints', async () => {
      vi.mocked(auth.getCurrentSession).mockResolvedValue(null);

      const dummyReq = new NextRequest('http://localhost:3000/api/admin/stats');

      const resStats = await getAdminStats(dummyReq);
      expect(resStats.status).toBe(401);

      const resUsers = await getAdminUsers(dummyReq);
      expect(resUsers.status).toBe(401);

      const resInmates = await getAdminInmates(dummyReq);
      expect(resInmates.status).toBe(401);

      const resProducts = await getAdminProducts(dummyReq);
      expect(resProducts.status).toBe(401);

      const resFacilities = await getAdminFacilities(dummyReq);
      expect(resFacilities.status).toBe(401);
    });

    it('returns 403 Forbidden for non-admin roles (Picker, Supervisor, Family, Inmate)', async () => {
      const nonAdminSessions = [pickerSession, supervisorSession, familySession, inmateSession];

      for (const nonAdmin of nonAdminSessions) {
        vi.mocked(auth.getCurrentSession).mockResolvedValue(nonAdmin as any);

        const dummyReq = new NextRequest('http://localhost:3000/api/admin/stats');
        const resStats = await getAdminStats(dummyReq);
        expect(resStats.status).toBe(403);

        const resUsers = await getAdminUsers(dummyReq);
        expect(resUsers.status).toBe(403);

        const resInmates = await getAdminInmates(dummyReq);
        expect(resInmates.status).toBe(403);
      }
    });

    it('allows access (200) for authenticated ADMIN sessions', async () => {
      vi.mocked(auth.getCurrentSession).mockResolvedValue(adminSession);

      const req = new NextRequest('http://localhost:3000/api/admin/stats');
      const res = await getAdminStats(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data).toHaveProperty('stats');
      expect(data.stats).toHaveProperty('inmatesCount');
      expect(data.stats).toHaveProperty('productsCount');
      expect(data.stats).toHaveProperty('ordersCount');
      expect(data.stats).toHaveProperty('totalDepositsVolume');
      expect(Array.isArray(data.recentAuditLogs)).toBe(true);
      expect(Array.isArray(data.facilities)).toBe(true);
    });
  });

  describe('2. User and Staff Management', () => {
    it('allows Admin to list users', async () => {
      vi.mocked(auth.getCurrentSession).mockResolvedValue(adminSession);

      const req = new NextRequest('http://localhost:3000/api/admin/users');
      const res = await getAdminUsers(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(Array.isArray(data.users)).toBe(true);
      expect(data.users.length).toBeGreaterThan(0);
    });

    it('allows Admin to create and update staff accounts', async () => {
      vi.mocked(auth.getCurrentSession).mockResolvedValue(adminSession);

      const uniqueEmail = `teststaff_${Date.now()}@canteen.local`;
      const createReq = new NextRequest('http://localhost:3000/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Phase 5 Test Staff',
          email: uniqueEmail,
          role: 'WAREHOUSE_PICKER',
          password: 'TestPassword123!',
          facilityId: FACILITY_ID,
        }),
      });

      const createRes = await createAdminUser(createReq);
      expect(createRes.status).toBe(200);
      const createdData = await createRes.json();
      expect(createdData.user).toHaveProperty('id');
      expect(createdData.user.email).toBe(uniqueEmail);

      // Lock account
      const lockReq = new NextRequest('http://localhost:3000/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: createdData.user.id,
          action: 'LOCK',
        }),
      });

      const lockRes = await updateAdminUser(lockReq);
      expect(lockRes.status).toBe(200);
      const lockedData = await lockRes.json();
      expect(lockedData.user.lockedUntil).not.toBeNull();

      // Clean up test user
      await prisma.user.delete({ where: { id: createdData.user.id } });
    });

    it('rejects Admin self-lock attempt with HTTP 400', async () => {
      vi.mocked(auth.getCurrentSession).mockResolvedValue(adminSession);

      const req = new NextRequest('http://localhost:3000/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: adminSession.userId,
          action: 'LOCK',
        }),
      });

      const res = await updateAdminUser(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain('Administrative self-lockout is prohibited');
    });

    it('rejects Admin self-demotion attempt with HTTP 400', async () => {
      vi.mocked(auth.getCurrentSession).mockResolvedValue(adminSession);

      const req = new NextRequest('http://localhost:3000/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: adminSession.userId,
          action: 'CHANGE_ROLE',
          newRole: 'WAREHOUSE_PICKER',
        }),
      });

      const res = await updateAdminUser(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain('Administrative self-demotion is prohibited');
    });
  });

  describe('3. Inmate Management & Double-Entry Ledger Auditing', () => {
    it('allows Admin to list all inmates with balances and limits', async () => {
      vi.mocked(auth.getCurrentSession).mockResolvedValue(adminSession);

      const req = new NextRequest('http://localhost:3000/api/admin/inmates');
      const res = await getAdminInmates(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(Array.isArray(data.offenders)).toBe(true);
      expect(data.offenders.length).toBeGreaterThan(0);
      expect(data.offenders[0]).toHaveProperty('balance');
      expect(data.offenders[0]).toHaveProperty('weeklyLimit');
    });

    it('enforces double-entry ledger entries and audit logging on balance adjustments', async () => {
      vi.mocked(auth.getCurrentSession).mockResolvedValue(adminSession);
      expect(testOffender).toBeDefined();

      const initialBalance = Number(testOffender.balance);
      const adjustmentAmount = 10.0; // Credit $10.00
      const auditReason = 'Phase 5 automated test ledger adjustment verification';

      const patchReq = new NextRequest('http://localhost:3000/api/admin/inmates', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          offenderId: testOffender.id,
          action: 'ADJUST_BALANCE',
          amount: adjustmentAmount,
          reason: auditReason,
        }),
      });

      const patchRes = await updateAdminInmate(patchReq);
      expect(patchRes.status).toBe(200);
      const patchData = await patchRes.json();
      expect(patchData.offender.balance).toBeCloseTo(initialBalance + adjustmentAmount, 2);

      // Verify double-entry ledger entry was created
      const ledgerEntry = await prisma.ledgerEntry.findFirst({
        where: {
          offenderId: testOffender.id,
          description: { contains: auditReason },
        },
        orderBy: { createdAt: 'desc' },
      });

      expect(ledgerEntry).toBeDefined();
      expect(ledgerEntry?.type).toBe('ADJUSTMENT');
      expect(Number(ledgerEntry?.credit)).toBeCloseTo(adjustmentAmount, 2);
      expect(Number(ledgerEntry?.balanceBefore)).toBeCloseTo(initialBalance, 2);
      expect(Number(ledgerEntry?.balanceAfter)).toBeCloseTo(initialBalance + adjustmentAmount, 2);

      // Verify audit log record
      const auditLog = await prisma.auditLog.findFirst({
        where: {
          action: 'ADMIN_ADJUST_BALANCE',
          resourceId: testOffender.id,
        },
        orderBy: { createdAt: 'desc' },
      });
      expect(auditLog).toBeDefined();

      // Reverse adjustment to restore baseline database state exactly
      const revertReq = new NextRequest('http://localhost:3000/api/admin/inmates', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          offenderId: testOffender.id,
          action: 'ADJUST_BALANCE',
          amount: -adjustmentAmount,
          reason: 'Phase 5 automated test restore baseline balance',
        }),
      });
      await updateAdminInmate(revertReq);
    });

    it('rejects balance adjustment that results in negative balance and rolls back transaction', async () => {
      vi.mocked(auth.getCurrentSession).mockResolvedValue(adminSession);
      expect(testOffender).toBeDefined();

      const currentBalance = Number(testOffender.balance);
      // An overdraft amount greater than current balance
      const excessiveDebit = -(currentBalance + 50.0);

      const patchReq = new NextRequest('http://localhost:3000/api/admin/inmates', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          offenderId: testOffender.id,
          action: 'ADJUST_BALANCE',
          amount: excessiveDebit,
          reason: 'Test negative balance rejection and rollback',
        }),
      });

      const patchRes = await updateAdminInmate(patchReq);
      expect(patchRes.status).toBe(400);
      const data = await patchRes.json();
      expect(data.error).toContain('negative balance');

      // Verify offender balance was unchanged
      const unchangedOffender = await prisma.offender.findUnique({
        where: { id: testOffender.id },
      });
      expect(Number(unchangedOffender?.balance)).toBeCloseTo(currentBalance, 2);

      // Verify no ledger entry was created for this failed attempt
      const orphanLedger = await prisma.ledgerEntry.findFirst({
        where: {
          offenderId: testOffender.id,
          description: { contains: 'Test negative balance rejection and rollback' },
        },
      });
      expect(orphanLedger).toBeNull();
    });

    it('allows Admin to reset PIN lock and update weekly spending limits', async () => {
      vi.mocked(auth.getCurrentSession).mockResolvedValue(adminSession);

      const resetReq = new NextRequest('http://localhost:3000/api/admin/inmates', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          offenderId: testOffender.id,
          action: 'RESET_PIN_LOCK',
          reason: 'Phase 5 PIN lock reset test',
        }),
      });

      const resetRes = await updateAdminInmate(resetReq);
      expect(resetRes.status).toBe(200);
      const resetData = await resetRes.json();
      expect(resetData.success).toBe(true);

      const off = await prisma.offender.findUnique({ where: { id: testOffender.id } });
      expect(off?.failedPinAttempts).toBe(0);
      expect(off?.pinLockedUntil).toBeNull();
    });
  });

  describe('4. Product Catalog & Inventory Governance', () => {
    it('allows Admin to create, price, and adjust stock for catalog products', async () => {
      vi.mocked(auth.getCurrentSession).mockResolvedValue(adminSession);

      const testSku = `SKU-P5-${Date.now()}`;
      const createReq = new NextRequest('http://localhost:3000/api/admin/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sku: testSku,
          name: 'Phase 5 Test Item',
          category: 'Snacks',
          price: 3.75,
          stock: 50,
          reorderLevel: 10,
          facilityId: FACILITY_ID,
        }),
      });

      const createRes = await createAdminProduct(createReq);
      expect(createRes.status).toBe(200);
      const createdData = await createRes.json();
      expect(createdData.product.sku).toBe(testSku);

      // Update product price & stock
      const patchReq = new NextRequest('http://localhost:3000/api/admin/products', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: createdData.product.id,
          price: 4.25,
          stock: 65,
        }),
      });

      const patchRes = await updateAdminProduct(patchReq);
      expect(patchRes.status).toBe(200);
      const patchedData = await patchRes.json();
      expect(patchedData.product.price).toBe(4.25);
      expect(patchedData.product.stock).toBe(65);

      // Clean up test product
      await prisma.product.delete({ where: { id: createdData.product.id } });
    });
  });

  describe('5. Facility Configuration & Rules', () => {
    it('allows Admin to read and update facility operational rules', async () => {
      vi.mocked(auth.getCurrentSession).mockResolvedValue(adminSession);

      const getReq = new NextRequest('http://localhost:3000/api/admin/facilities');
      const getRes = await getAdminFacilities(getReq);
      expect(getRes.status).toBe(200);
      const facilitiesData = await getRes.json();
      expect(facilitiesData.facilities.length).toBeGreaterThan(0);

      const targetFacility = facilitiesData.facilities[0];

      // Update facility policies
      const updateReq = new NextRequest('http://localhost:3000/api/admin/facilities', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: targetFacility.id,
          maxWeeklySpend: 150.0,
          giftPackagesEnabled: false,
        }),
      });

      const updateRes = await updateAdminFacility(updateReq);
      expect(updateRes.status).toBe(200);
      const updatedData = await updateRes.json();
      expect(updatedData.facility.maxWeeklySpend).toBe(150.0);
      expect(updatedData.facility.giftPackagesEnabled).toBe(false);

      // Revert to original settings
      const revertReq = new NextRequest('http://localhost:3000/api/admin/facilities', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: targetFacility.id,
          maxWeeklySpend: targetFacility.maxWeeklySpend,
          giftPackagesEnabled: targetFacility.giftPackagesEnabled,
        }),
      });
      await updateAdminFacility(revertReq);
    });
  });
});
