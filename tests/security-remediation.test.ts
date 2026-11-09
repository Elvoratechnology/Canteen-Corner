import { describe, it, expect, beforeEach, vi, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import * as auth from '@/lib/auth';

// Import route handlers under test
import { GET as getFamilyGiftPackages, POST as submitGiftPackage } from '@/app/api/family/gift-packages/route';
import { POST as createDepositIntent } from '@/app/api/family/deposits/intent/route';
import { GET as getInventory, POST as restockInventory } from '@/app/api/warehouse/inventory/route';
import { GET as getManifests, POST as createManifest } from '@/app/api/warehouse/manifests/route';
import { GET as getWarehouseOrdersQueue } from '@/app/api/warehouse/orders/route';
import { GET as getWarehouseOrder, PATCH as updateWarehouseOrder } from '@/app/api/warehouse/orders/[id]/route';
import { POST as simulateDepositConfirm } from '@/app/api/family/deposits/simulate-confirm/route';
import { GET as searchOffenders } from '@/app/api/family/offenders/search/route';
import { GET as getInmateCatalog } from '@/app/api/inmate/catalog/route';

vi.mock('@/lib/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth')>();
  return {
    ...actual,
    getCurrentSession: vi.fn(),
  };
});

describe('Critical Application Security Remediation Suite', () => {
  const FACILITY_A = 'FACILITY_CC_01';
  const FACILITY_B = 'FACILITY_TEST_02';

  let familyUser: any;
  let familyAccount: any;
  let offenderA: any;
  let offenderB: any;
  let productA: any;
  let productB: any;
  let orderA: any;
  let orderB: any;

  beforeEach(async () => {
    // 1. Ensure Facility B exists for cross-facility testing
    await prisma.facility.upsert({
      where: { id: FACILITY_B },
      update: { name: 'West Regional Facility' },
      create: {
        id: FACILITY_B,
        name: 'West Regional Facility',
        maxWeeklySpend: 100,
        maxDepositAmount: 300,
        weeklyResetDay: 0,
        giftPackagesEnabled: true,
      },
    });

    // 2. Fetch or create test offenders in both facilities
    offenderA = await prisma.offender.findUniqueOrThrow({
      where: { id: 'A1234567' },
      include: { facility: true },
    });

    offenderB = await prisma.offender.upsert({
      where: { id: 'B9999999' },
      update: { facilityId: FACILITY_B },
      create: {
        id: 'B9999999',
        name: 'Robert Davis',
        facilityId: FACILITY_B,
        unit: 'Unit 9',
        housing: 'Cell 902',
        pinHash: 'testpin',
        balance: 50.0,
      },
      include: { facility: true },
    });

    // 3. Demo family user & account
    familyUser = await prisma.user.findUniqueOrThrow({
      where: { email: 'family@canteen.local' },
      include: { familyAccount: true },
    });
    familyAccount = familyUser.familyAccount;

    // 4. Products for facility A and B
    productA = await prisma.product.findUniqueOrThrow({ where: { sku: 'PC-002' } }); // Soap
    await prisma.product.update({
      where: { id: productA.id },
      data: { facilityId: FACILITY_A },
    });

    productB = await prisma.product.upsert({
      where: { sku: 'TEST-FACB-001' },
      update: { facilityId: FACILITY_B },
      create: {
        sku: 'TEST-FACB-001',
        name: 'Facility B Special Shampoo',
        category: 'Personal Care',
        price: 3.50,
        stock: 50,
        reorderLevel: 10,
        facilityId: FACILITY_B,
      },
    });

    // 5. Clean up any existing test orders and manifests
    await prisma.orderItem.deleteMany({
      where: { order: { orderNumber: { in: ['#TEST-ORDA', '#TEST-ORDB'] } } },
    });
    await prisma.pickingList.deleteMany({
      where: { order: { orderNumber: { in: ['#TEST-ORDA', '#TEST-ORDB'] } } },
    });
    await prisma.orderStatusHistory.deleteMany({
      where: { order: { orderNumber: { in: ['#TEST-ORDA', '#TEST-ORDB'] } } },
    });
    await prisma.order.deleteMany({
      where: { orderNumber: { in: ['#TEST-ORDA', '#TEST-ORDB'] } },
    });

    orderA = await prisma.order.create({
      data: {
        orderNumber: '#TEST-ORDA',
        offenderId: offenderA.id,
        status: 'PACKED',
        subtotal: 7.00,
        total: 7.00,
        expectedDeliveryDate: new Date(),
        barcode: 'BC-TEST-ORDA',
        items: {
          create: [{ productId: productA.id, quantity: 2, unitPrice: 3.50, totalPrice: 7.00 }],
        },
      },
      include: { offender: true },
    });

    orderB = await prisma.order.create({
      data: {
        orderNumber: '#TEST-ORDB',
        offenderId: offenderB.id,
        status: 'PACKED',
        subtotal: 3.50,
        total: 3.50,
        expectedDeliveryDate: new Date(),
        barcode: 'BC-TEST-ORDB',
        items: {
          create: [{ productId: productB.id, quantity: 1, unitPrice: 3.50, totalPrice: 3.50 }],
        },
      },
      include: { offender: true },
    });
  });

  afterAll(async () => {
    // Cleanup test records
    await prisma.orderItem.deleteMany({
      where: { order: { orderNumber: { in: ['#TEST-ORDA', '#TEST-ORDB'] } } },
    });
    await prisma.order.deleteMany({
      where: { orderNumber: { in: ['#TEST-ORDA', '#TEST-ORDB'] } },
    });
    await prisma.product.deleteMany({
      where: { sku: 'TEST-FACB-001' },
    });
    await prisma.manifest.deleteMany({
      where: { manifestNumber: { startsWith: '#MN-' } },
    });
  });

  // =========================================================================
  // Finding 1: Family Gift Package Submission Authorization
  // =========================================================================
  describe('1. Family Gift Package Submission (Approved Links)', () => {
    it('should reject gift package submission if family has NO relationship link to offender', async () => {
      vi.mocked(auth.getCurrentSession).mockResolvedValue({
        userId: familyUser.id,
        name: familyUser.name,
        role: 'FAMILY',
      });

      // Offender B has no relationship link with familyAccount
      const req = new NextRequest('http://localhost:3000/api/family/gift-packages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          offenderId: offenderB.id,
          packageName: 'Holiday Care Box',
          items: [{ productId: productA.id, quantity: 1 }],
        }),
      });

      const res = await submitGiftPackage(req);
      const data = await res.json();

      expect(res.status).toBe(403);
      expect(data.error).toContain('approved family relationship is required');
    });

    it('should reject gift package submission if relationship link is BLOCKED or PENDING', async () => {
      vi.mocked(auth.getCurrentSession).mockResolvedValue({
        userId: familyUser.id,
        name: familyUser.name,
        role: 'FAMILY',
      });

      // Temporarily set link with Offender A to BLOCKED
      await prisma.familyOffenderLink.update({
        where: {
          familyAccountId_offenderId: {
            familyAccountId: familyAccount.id,
            offenderId: offenderA.id,
          },
        },
        data: { status: 'BLOCKED' },
      });

      const req = new NextRequest('http://localhost:3000/api/family/gift-packages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          offenderId: offenderA.id,
          packageName: 'Blocked Attempt Box',
          items: [{ productId: productA.id, quantity: 1 }],
        }),
      });

      const res = await submitGiftPackage(req);
      const data = await res.json();

      expect(res.status).toBe(403);
      expect(data.error).toContain('approved family relationship is required');

      // Restore link to APPROVED
      await prisma.familyOffenderLink.update({
        where: {
          familyAccountId_offenderId: {
            familyAccountId: familyAccount.id,
            offenderId: offenderA.id,
          },
        },
        data: { status: 'APPROVED' },
      });
    });

    it('should allow gift package submission when link is APPROVED', async () => {
      vi.mocked(auth.getCurrentSession).mockResolvedValue({
        userId: familyUser.id,
        name: familyUser.name,
        role: 'FAMILY',
      });

      const req = new NextRequest('http://localhost:3000/api/family/gift-packages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          offenderId: offenderA.id,
          packageName: 'Approved Care Box',
          items: [{ productId: productA.id, quantity: 1 }],
        }),
      });

      const res = await submitGiftPackage(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.giftPackage.status).toBe('PENDING');

      // Cleanup created gift package
      await prisma.giftPackage.delete({ where: { id: data.giftPackage.id } });
    });
  });

  // =========================================================================
  // Finding 2: Family Deposit Intent Authorization
  // =========================================================================
  describe('2. Family Deposit Intent (Approved Links)', () => {
    it('should reject deposit intent when family has NO relationship link to offender', async () => {
      vi.mocked(auth.getCurrentSession).mockResolvedValue({
        userId: familyUser.id,
        name: familyUser.name,
        role: 'FAMILY',
      });

      // No link exists for Offender B
      const req = new NextRequest('http://localhost:3000/api/family/deposits/intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          offenderId: offenderB.id,
          amount: 50.00,
        }),
      });

      const res = await createDepositIntent(req);
      const data = await res.json();

      expect(res.status).toBe(403);
      expect(data.error).toContain('approved family relationship is required');
    });

    it('should allow deposit intent when family has an APPROVED link', async () => {
      vi.mocked(auth.getCurrentSession).mockResolvedValue({
        userId: familyUser.id,
        name: familyUser.name,
        role: 'FAMILY',
      });

      const req = new NextRequest('http://localhost:3000/api/family/deposits/intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          offenderId: offenderA.id,
          amount: 25.00,
        }),
      });

      const res = await createDepositIntent(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.intent.providerRef).toMatch(/^TP-\d+$/);

      // Cleanup
      await prisma.deposit.delete({ where: { providerRef: data.intent.providerRef } });
    });
  });

  // =========================================================================
  // Finding 3: Warehouse Inventory Facility Isolation
  // =========================================================================
  describe('3. Warehouse Inventory Facility Isolation', () => {
    it('should restrict inventory GET queries to supervisor facility and omit other facilities', async () => {
      vi.mocked(auth.getCurrentSession).mockResolvedValue({
        userId: 'supervisor-1',
        name: 'Supervisor Vance',
        role: 'WAREHOUSE_SUPERVISOR',
        facilityId: FACILITY_A,
      });

      const res = await getInventory();
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.products).toBeDefined();

      // Product B belongs to Facility B and must NOT appear in Facility A inventory
      const foundProductB = data.products.find((p: any) => p.id === productB.id);
      expect(foundProductB).toBeUndefined();

      // Product A belongs to Facility A and must appear
      const foundProductA = data.products.find((p: any) => p.id === productA.id);
      expect(foundProductA).toBeDefined();
    });

    it('should reject restock of a product belonging to another facility (403)', async () => {
      vi.mocked(auth.getCurrentSession).mockResolvedValue({
        userId: 'supervisor-1',
        name: 'Supervisor Vance',
        role: 'WAREHOUSE_SUPERVISOR',
        facilityId: FACILITY_A,
      });

      // Supervisor from Facility A attempts to restock Product B belonging to Facility B
      const req = new NextRequest('http://localhost:3000/api/warehouse/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: productB.id,
          quantity: 20,
        }),
      });

      const res = await restockInventory(req);
      const data = await res.json();

      expect(res.status).toBe(403);
      expect(data.error).toContain('Product belongs to another facility');
    });

    it('should allow restock of a product belonging to the same facility', async () => {
      vi.mocked(auth.getCurrentSession).mockResolvedValue({
        userId: 'supervisor-1',
        name: 'Supervisor Vance',
        role: 'WAREHOUSE_SUPERVISOR',
        facilityId: FACILITY_A,
      });

      const req = new NextRequest('http://localhost:3000/api/warehouse/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: productA.id,
          quantity: 10,
        }),
      });

      const res = await restockInventory(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
    });
  });

  // =========================================================================
  // Finding 4: Warehouse Manifests Facility Isolation
  // =========================================================================
  describe('4. Warehouse Manifests Facility Isolation', () => {
    it('should filter eligible unassigned orders and manifests to session.facilityId', async () => {
      vi.mocked(auth.getCurrentSession).mockResolvedValue({
        userId: 'supervisor-1',
        name: 'Supervisor Vance',
        role: 'WAREHOUSE_SUPERVISOR',
        facilityId: FACILITY_A,
      });

      const res = await getManifests();
      const data = await res.json();

      expect(res.status).toBe(200);
      // Order A belongs to Offender A in Facility A -> eligible
      const hasOrderA = data.eligibleOrders.some((o: any) => o.id === orderA.id);
      expect(hasOrderA).toBe(true);

      // Order B belongs to Offender B in Facility B -> must NOT appear
      const hasOrderB = data.eligibleOrders.some((o: any) => o.id === orderB.id);
      expect(hasOrderB).toBe(false);
    });

    it('should reject manifest creation when selecting orders from another facility', async () => {
      vi.mocked(auth.getCurrentSession).mockResolvedValue({
        userId: 'supervisor-1',
        name: 'Supervisor Vance',
        role: 'WAREHOUSE_SUPERVISOR',
        facilityId: FACILITY_A,
      });

      const req = new NextRequest('http://localhost:3000/api/warehouse/manifests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          unit: 'Unit 9',
          deliveryDate: new Date().toISOString(),
          orderIds: [orderB.id], // Order B is from Facility B
        }),
      });

      const res = await createManifest(req);
      const data = await res.json();

      expect(res.status).toBe(403);
      expect(data.error).toContain('belong to another facility');
    });

    it('should successfully create manifest for same-facility orders using session.facilityId', async () => {
      vi.mocked(auth.getCurrentSession).mockResolvedValue({
        userId: 'supervisor-1',
        name: 'Supervisor Vance',
        role: 'WAREHOUSE_SUPERVISOR',
        facilityId: FACILITY_A,
      });

      const req = new NextRequest('http://localhost:3000/api/warehouse/manifests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          unit: 'Unit 4',
          deliveryDate: new Date().toISOString(),
          orderIds: [orderA.id],
        }),
      });

      const res = await createManifest(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.manifest.facilityId).toBe(FACILITY_A);
    });
  });

  // =========================================================================
  // Finding 5: Warehouse Order Status Update IDOR & Isolation
  // =========================================================================
  describe('5. Warehouse Order Status Update Cross-Facility IDOR Protection', () => {
    it('should reject viewing order details when order belongs to another facility (403)', async () => {
      vi.mocked(auth.getCurrentSession).mockResolvedValue({
        userId: 'supervisor-1',
        name: 'Supervisor Vance',
        role: 'WAREHOUSE_SUPERVISOR',
        facilityId: FACILITY_A,
      });

      // Supervisor from Facility A attempts to view Order B from Facility B
      const req = new NextRequest(`http://localhost:3000/api/warehouse/orders/${orderB.id}`);
      const res = await getWarehouseOrder(req, { params: { id: orderB.id } });
      const data = await res.json();

      expect(res.status).toBe(403);
      expect(data.error).toContain('Order belongs to another facility');
    });

    it('should reject order status mutation when order belongs to another facility (403)', async () => {
      vi.mocked(auth.getCurrentSession).mockResolvedValue({
        userId: 'supervisor-1',
        name: 'Supervisor Vance',
        role: 'WAREHOUSE_SUPERVISOR',
        facilityId: FACILITY_A,
      });

      // Supervisor from Facility A attempts to mutate Order B from Facility B
      const req = new NextRequest(`http://localhost:3000/api/warehouse/orders/${orderB.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'MARK_PACKED',
        }),
      });

      const res = await updateWarehouseOrder(req, { params: { id: orderB.id } });
      const data = await res.json();

      expect(res.status).toBe(403);
      expect(data.error).toContain('Order belongs to another facility');
    });
  });

  // =========================================================================
  // Finding 6: TouchPay Simulation Rejection in Production
  // =========================================================================
  describe('6. TouchPay Simulation Production Protection', () => {
    const originalEnv = process.env.NODE_ENV;

    it('should return 404 in production regardless of ENABLE_TOUCHPAY_SIMULATION flag', async () => {
      process.env.NODE_ENV = 'production';
      process.env.ENABLE_TOUCHPAY_SIMULATION = 'true';

      const req = new NextRequest('http://localhost:3000/api/family/deposits/simulate-confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerRef: 'TP-123456' }),
      });

      const res = await simulateDepositConfirm(req);
      const data = await res.json();

      expect(res.status).toBe(404);
      expect(data.error).toBe('Not Found');

      process.env.NODE_ENV = originalEnv;
      delete process.env.ENABLE_TOUCHPAY_SIMULATION;
    });
  });

  // =========================================================================
  // Finding 7: Family Offender Search Response Location Redaction
  // =========================================================================
  describe('7. Family Offender Search Information Disclosure', () => {
    it('should return matching offenders WITHOUT exposing unit, housing, or cell location', async () => {
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

      for (const item of data.offenders) {
        expect(item.id).toBeDefined();
        expect(item.name).toBeDefined();
        expect(item.facilityName).toBeDefined();

        // Security requirement: unit, housing, and cell locations must be omitted
        expect(item).not.toHaveProperty('unit');
        expect(item).not.toHaveProperty('housing');
        expect(item).not.toHaveProperty('cell');
      }
    });
  });

  // =========================================================================
  // Batch 2, Finding 1: Inmate Catalog Facility Isolation
  // =========================================================================
  describe('8. Inmate Catalog Facility Isolation', () => {
    it('should exclude foreign-facility products and return only current facility or global products', async () => {
      vi.mocked(auth.getCurrentSession).mockResolvedValue({
        offenderId: offenderA.id,
        name: offenderA.name,
        role: 'INMATE',
        facilityId: FACILITY_A,
      });

      const req = new NextRequest('http://localhost:3000/api/inmate/catalog');
      const res = await getInmateCatalog(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.products).toBeDefined();

      // Product A belongs to Facility A -> must appear
      const hasProductA = data.products.some((p: any) => p.id === productA.id);
      expect(hasProductA).toBe(true);

      // Product B belongs to Facility B -> must be EXCLUDED
      const hasProductB = data.products.some((p: any) => p.id === productB.id);
      expect(hasProductB).toBe(false);
    });

    it('should return 403 when inmate is not assigned to any facility', async () => {
      vi.mocked(auth.getCurrentSession).mockResolvedValue({
        offenderId: 'UNKNOWN_OR_UNASSIGNED',
        name: 'Unassigned Inmate',
        role: 'INMATE',
        facilityId: undefined,
      });

      const req = new NextRequest('http://localhost:3000/api/inmate/catalog');
      const res = await getInmateCatalog(req);
      const data = await res.json();

      expect(res.status).toBe(403);
      expect(data.error).toContain('Offender is not assigned to a facility');
    });
  });

  // =========================================================================
  // Batch 2, Finding 2: Warehouse Orders Queue Isolation & Missing FacilityId
  // =========================================================================
  describe('9. Warehouse Orders Queue Isolation', () => {
    it('should reject warehouse orders queue request if supervisor has no facilityId (403)', async () => {
      vi.mocked(auth.getCurrentSession).mockResolvedValue({
        userId: 'supervisor-nofacility',
        name: 'Unassigned Supervisor',
        role: 'WAREHOUSE_SUPERVISOR',
        facilityId: undefined,
      });

      const req = new NextRequest('http://localhost:3000/api/warehouse/orders');
      const res = await getWarehouseOrdersQueue(req);
      const data = await res.json();

      expect(res.status).toBe(403);
      expect(data.error).toContain('User is not assigned to a facility');
    });

    it('should reject inventory GET request if supervisor has no facilityId (403)', async () => {
      vi.mocked(auth.getCurrentSession).mockResolvedValue({
        userId: 'supervisor-nofacility',
        name: 'Unassigned Supervisor',
        role: 'WAREHOUSE_SUPERVISOR',
        facilityId: undefined,
      });

      const res = await getInventory();
      const data = await res.json();

      expect(res.status).toBe(403);
      expect(data.error).toContain('User is not assigned to a facility');
    });

    it('should return ONLY orders belonging to session.facilityId in warehouse queue', async () => {
      vi.mocked(auth.getCurrentSession).mockResolvedValue({
        userId: 'supervisor-facA',
        name: 'Supervisor Vance',
        role: 'WAREHOUSE_SUPERVISOR',
        facilityId: FACILITY_A,
      });

      const req = new NextRequest('http://localhost:3000/api/warehouse/orders');
      const res = await getWarehouseOrdersQueue(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.orders).toBeDefined();

      // Order A belongs to Offender A in Facility A -> must be present
      const hasOrderA = data.orders.some((o: any) => o.id === orderA.id);
      expect(hasOrderA).toBe(true);

      // Order B belongs to Offender B in Facility B -> must NOT be present
      const hasOrderB = data.orders.some((o: any) => o.id === orderB.id);
      expect(hasOrderB).toBe(false);
    });
  });

  // =========================================================================
  // Batch 2, Finding 3: Global Product Restock Protection
  // =========================================================================
  describe('10. Global Product Restock Protection', () => {
    it('should reject restock of a shared global product (facilityId = null) with 403', async () => {
      // Ramen noodles (SNK-001) is a shared global staple (facilityId: null)
      const globalRamen = await prisma.product.findUniqueOrThrow({ where: { sku: 'SNK-001' } });
      expect(globalRamen.facilityId).toBeNull();

      vi.mocked(auth.getCurrentSession).mockResolvedValue({
        userId: 'supervisor-1',
        name: 'Supervisor Vance',
        role: 'WAREHOUSE_SUPERVISOR',
        facilityId: FACILITY_A,
      });

      const req = new NextRequest('http://localhost:3000/api/warehouse/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: globalRamen.id,
          quantity: 50,
        }),
      });

      const res = await restockInventory(req);
      const data = await res.json();

      expect(res.status).toBe(403);
      expect(data.error).toContain('Cannot restock shared global catalog products');
    });
  });

  // =========================================================================
  // Batch 2, Finding 4: Historical Gift Package Location Redaction
  // =========================================================================
  describe('11. Historical Gift Package Location Redaction', () => {
    it('should redact unit and housing from historical gift package offender detail in GET', async () => {
      vi.mocked(auth.getCurrentSession).mockResolvedValue({
        userId: familyUser.id,
        name: familyUser.name,
        role: 'FAMILY',
      });

      // Create a test gift package in database for familyAccount and offenderA
      const testPkg = await prisma.giftPackage.create({
        data: {
          offenderId: offenderA.id,
          familyAccountId: familyAccount.id,
          packageName: 'Historical Inspection Box',
          itemsJson: JSON.stringify([{ productId: productA.id, name: 'Soap', quantity: 2, price: 2.00, subtotal: 4.00 }]),
          totalValue: 4.00,
          status: 'APPROVED',
        },
      });

      const res = await getFamilyGiftPackages();
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.packages).toBeDefined();

      const retrievedPkg = data.packages.find((p: any) => p.id === testPkg.id);
      expect(retrievedPkg).toBeDefined();
      expect(retrievedPkg.offender).toBeDefined();
      expect(retrievedPkg.offender.id).toBe(offenderA.id);
      expect(retrievedPkg.offender.name).toBe(offenderA.name);

      // Security requirement: unit and housing must be redacted from offender in history
      expect(retrievedPkg.offender).not.toHaveProperty('unit');
      expect(retrievedPkg.offender).not.toHaveProperty('housing');

      // Cleanup
      await prisma.giftPackage.delete({ where: { id: testPkg.id } });
    });
  });
});

