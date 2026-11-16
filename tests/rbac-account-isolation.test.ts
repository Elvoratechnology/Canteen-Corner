import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import * as auth from '@/lib/auth';
import { signSession } from '@/lib/auth-token';
import { middleware } from '@/middleware';

// Route handlers
import { GET as getAdminStats } from '@/app/api/admin/stats/route';
import { GET as getAdminUsers } from '@/app/api/admin/users/route';
import { GET as getAdminInmates, PATCH as patchAdminInmates } from '@/app/api/admin/inmates/route';
import { GET as getAdminProducts } from '@/app/api/admin/products/route';
import { GET as getAdminFacilities } from '@/app/api/admin/facilities/route';

import { GET as getWarehouseOrders } from '@/app/api/warehouse/orders/route';
import { PATCH as patchWarehouseOrder } from '@/app/api/warehouse/orders/[id]/route';
import { POST as postWarehouseManifest } from '@/app/api/warehouse/manifests/route';
import { POST as postWarehouseInventory } from '@/app/api/warehouse/inventory/route';

import { GET as getInmateOrders } from '@/app/api/inmate/orders/route';
import { GET as getInmateOrderDetail } from '@/app/api/inmate/orders/[id]/route';
import { GET as getInmateBalance } from '@/app/api/inmate/balance/route';
import { POST as postInmateOrder } from '@/app/api/inmate/order/route';
import { PATCH as patchInmateMessageRead } from '@/app/api/inmate/messages/[id]/read/route';

import { GET as getFamilyDeposits } from '@/app/api/family/deposits/route';
import { POST as postFamilyDepositIntent } from '@/app/api/family/deposits/intent/route';
import { GET as getFamilyGiftPackages, POST as postFamilyGiftPackage } from '@/app/api/family/gift-packages/route';

import { POST as logoutPost } from '@/app/api/auth/me/route';

vi.mock('@/lib/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth')>();
  return {
    ...actual,
    getCurrentSession: vi.fn(),
  };
});

describe('CANTEEN CORNER — RBAC & Account Isolation Comprehensive Verification', () => {
  const FACILITY_ID = 'FACILITY_CC_01';
  let adminUser: any;
  let supervisorUser: any;
  let pickerUser: any;
  let familyUser1: any;
  let familyUser2: any;
  let familyAccount1: any;
  let familyAccount2: any;
  let inmate1: any;
  let inmate2: any;
  let sampleOrderInmate1: any;
  let sampleOrderInmate2: any;
  let sampleNotification1: any;
  let sampleNotification2: any;
  let sampleProduct: any;

  beforeEach(async () => {
    // 1. Fetch Admin
    adminUser = await prisma.user.findFirst({ where: { role: 'ADMIN' } });

    // 2. Fetch Supervisor & Picker
    supervisorUser = await prisma.user.findFirst({ where: { role: 'WAREHOUSE_SUPERVISOR' } });
    pickerUser = await prisma.user.findFirst({ where: { role: 'WAREHOUSE_PICKER' } });

    // 3. Fetch Inmates
    const inmates = await prisma.offender.findMany({ take: 2 });
    inmate1 = inmates[0];
    inmate2 = inmates[1];

    // 4. Fetch Family Users & Accounts
    const familyAccounts = await prisma.familyAccount.findMany({
      include: { user: true, familyOffenderLinks: true },
      take: 2,
    });
    if (familyAccounts.length >= 1) {
      familyAccount1 = familyAccounts[0];
      familyUser1 = familyAccounts[0].user;
    }
    if (familyAccounts.length >= 2) {
      familyAccount2 = familyAccounts[1];
      familyUser2 = familyAccounts[1].user;
    }

    // 5. Fetch Orders
    if (inmate1) {
      sampleOrderInmate1 = await prisma.order.findFirst({
        where: { offenderId: inmate1.id },
      });
      if (!sampleOrderInmate1) {
        sampleOrderInmate1 = await prisma.order.create({
          data: {
            orderNumber: `ORD-ISO-${Date.now()}-1`,
            offenderId: inmate1.id,
            subtotal: 5.0,
            total: 5.0,
            status: 'PROCESSING',
            barcode: `BC-ISO-${Date.now()}-1`,
            expectedDeliveryDate: new Date(),
          },
        });
      }
    }

    if (inmate2) {
      sampleOrderInmate2 = await prisma.order.findFirst({
        where: { offenderId: inmate2.id },
      });
      if (!sampleOrderInmate2) {
        sampleOrderInmate2 = await prisma.order.create({
          data: {
            orderNumber: `ORD-ISO-${Date.now()}-2`,
            offenderId: inmate2.id,
            subtotal: 7.0,
            total: 7.0,
            status: 'PROCESSING',
            barcode: `BC-ISO-${Date.now()}-2`,
            expectedDeliveryDate: new Date(),
          },
        });
      }
    }

    // 6. Fetch / Create Notifications
    if (inmate1) {
      sampleNotification1 = await prisma.notification.findFirst({
        where: { offenderId: inmate1.id },
      });
      if (!sampleNotification1) {
        sampleNotification1 = await prisma.notification.create({
          data: {
            offenderId: inmate1.id,
            title: 'Welcome 1',
            message: 'Notification for Inmate 1',
            type: 'SYSTEM',
            read: false,
          },
        });
      }
    }

    if (inmate2) {
      sampleNotification2 = await prisma.notification.findFirst({
        where: { offenderId: inmate2.id },
      });
      if (!sampleNotification2) {
        sampleNotification2 = await prisma.notification.create({
          data: {
            offenderId: inmate2.id,
            title: 'Welcome 2',
            message: 'Notification for Inmate 2',
            type: 'SYSTEM',
            read: false,
          },
        });
      }
    }

    // 7. Fetch Product
    sampleProduct = await prisma.product.findFirst({
      where: { facilityId: FACILITY_ID },
    });
  });

  // SCENARIO 1: Admin cannot access picker operations without a picker session
  it('Scenario 1: Admin cannot access picker operations without a picker session', async () => {
    vi.mocked(auth.getCurrentSession).mockResolvedValue({
      userId: adminUser?.id || 'admin-id',
      name: 'System Admin',
      role: 'ADMIN',
      facilityId: FACILITY_ID,
    });

    const req = new NextRequest(`http://localhost:3000/api/warehouse/orders/${sampleOrderInmate1.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'START_PICKING' }),
    });

    const res = await patchWarehouseOrder(req, { params: { id: sampleOrderInmate1.id } });
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toContain('Warehouse operational privileges required');
  });

  // SCENARIO 2: Admin cannot access supervisor operations without a supervisor session
  it('Scenario 2: Admin cannot access supervisor operations without a supervisor session', async () => {
    vi.mocked(auth.getCurrentSession).mockResolvedValue({
      userId: adminUser?.id || 'admin-id',
      name: 'System Admin',
      role: 'ADMIN',
      facilityId: FACILITY_ID,
    });

    // 2a. Admin attempting to generate manifests
    const manifestReq = new NextRequest('http://localhost:3000/api/warehouse/manifests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        unit: 'Unit 4',
        deliveryDate: new Date().toISOString(),
        orderIds: [sampleOrderInmate1.id],
      }),
    });
    const manifestRes = await postWarehouseManifest(manifestReq);
    expect(manifestRes.status).toBe(403);
    const manifestData = await manifestRes.json();
    expect(manifestData.error).toContain('Only supervisors can generate delivery manifests');

    // 2b. Admin attempting to restock warehouse inventory
    const restockReq = new NextRequest('http://localhost:3000/api/warehouse/inventory', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        productId: sampleProduct?.id || 'prod-id',
        quantity: 25,
      }),
    });
    const restockRes = await postWarehouseInventory(restockReq);
    expect(restockRes.status).toBe(403);
    const restockData = await restockRes.json();
    expect(restockData.error).toContain('Only supervisors can restock inventory');
  });

  // SCENARIO 3: Picker receives 403 on Admin pages/APIs
  it('Scenario 3: Picker receives 403 on Admin pages/APIs', async () => {
    vi.mocked(auth.getCurrentSession).mockResolvedValue({
      userId: pickerUser?.id || 'picker-id',
      name: 'Warehouse Picker',
      role: 'WAREHOUSE_PICKER',
      facilityId: FACILITY_ID,
    });

    // Test Admin Stats API
    const statsReq = new NextRequest('http://localhost:3000/api/admin/stats');
    const statsRes = await getAdminStats(statsReq);
    expect(statsRes.status).toBe(403);

    // Test Admin Users API
    const usersReq = new NextRequest('http://localhost:3000/api/admin/users');
    const usersRes = await getAdminUsers(usersReq);
    expect(usersRes.status).toBe(403);

    // Test Admin Inmates API
    const inmatesReq = new NextRequest('http://localhost:3000/api/admin/inmates');
    const inmatesRes = await getAdminInmates(inmatesReq);
    expect(inmatesRes.status).toBe(403);

    // Test Admin Facilities API
    const facilitiesReq = new NextRequest('http://localhost:3000/api/admin/facilities');
    const facilitiesRes = await getAdminFacilities(facilitiesReq);
    expect(facilitiesRes.status).toBe(403);

    // Test Middleware for Admin Web Page
    const pickerToken = await signSession({
      userId: pickerUser?.id || 'picker-id',
      name: 'Warehouse Picker',
      role: 'WAREHOUSE_PICKER',
    });
    const pageReq = new NextRequest('http://localhost:3000/admin', {
      headers: { cookie: `canteen_session=${pickerToken}` },
    });
    const mwRes = await middleware(pageReq);
    expect(mwRes.status).toBe(307);
    expect(mwRes.headers.get('location')).toContain('/access-denied');
    expect(mwRes.headers.get('location')).toContain('required=ADMIN');
  });

  // SCENARIO 4: Supervisor receives 403 on Admin-only pages/APIs
  it('Scenario 4: Supervisor receives 403 on Admin-only pages/APIs', async () => {
    vi.mocked(auth.getCurrentSession).mockResolvedValue({
      userId: supervisorUser?.id || 'sup-id',
      name: 'Warehouse Supervisor',
      role: 'WAREHOUSE_SUPERVISOR',
      facilityId: FACILITY_ID,
    });

    const req = new NextRequest('http://localhost:3000/api/admin/users');
    const res = await getAdminUsers(req);
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toContain('Administrator privileges required');

    // Test Middleware for Supervisor visiting /admin
    const supToken = await signSession({
      userId: supervisorUser?.id || 'sup-id',
      name: 'Warehouse Supervisor',
      role: 'WAREHOUSE_SUPERVISOR',
    });
    const pageReq = new NextRequest('http://localhost:3000/admin', {
      headers: { cookie: `canteen_session=${supToken}` },
    });
    const mwRes = await middleware(pageReq);
    expect(mwRes.status).toBe(307);
    expect(mwRes.headers.get('location')).toContain('/access-denied');
  });

  // SCENARIO 5: Inmate cannot access another inmate's records (IDOR test)
  it("Scenario 5: Inmate cannot access another inmate's records (IDOR test)", async () => {
    // Authenticated as Inmate 1
    vi.mocked(auth.getCurrentSession).mockResolvedValue({
      offenderId: inmate1.id,
      name: inmate1.name,
      role: 'INMATE',
      facilityId: FACILITY_ID,
    });

    // 5a. Attempt to fetch Inmate 2's order detail directly by order ID
    const req = new NextRequest(`http://localhost:3000/api/inmate/orders/${sampleOrderInmate2.id}`);
    const res = await getInmateOrderDetail(req, { params: { id: sampleOrderInmate2.id } });
    expect(res.status).toBe(404); // IDOR prevented: scoped where { id, offenderId } returns 404

    // 5b. Attempt to fetch orders list: verify only Inmate 1's orders are returned
    const listRes = await getInmateOrders();
    const listData = await listRes.json();
    expect(listRes.status).toBe(200);
    for (const o of listData.orders) {
      expect(o.offenderId).toBe(inmate1.id);
      expect(o.offenderId).not.toBe(inmate2.id);
    }

    // 5c. Attempt to mark Inmate 2's notification as read
    const patchReq = new NextRequest(`http://localhost:3000/api/inmate/messages/${sampleNotification2.id}/read`, {
      method: 'PATCH',
    });
    const patchRes = await patchInmateMessageRead(patchReq, { params: { id: sampleNotification2.id } });
    expect(patchRes.status).toBe(200);
    // Verify Inmate 2's notification was NOT altered
    const unreadCheck = await prisma.notification.findUnique({
      where: { id: sampleNotification2.id },
    });
    expect(unreadCheck?.read).toBe(false);
  });

  // SCENARIO 6: Family cannot access another family's account
  it("Scenario 6: Family cannot access another family's account", async () => {
    // Authenticate as Family 1
    vi.mocked(auth.getCurrentSession).mockResolvedValue({
      userId: familyUser1?.id || 'fam-1',
      name: 'Family One',
      role: 'FAMILY',
    });

    const res = await getFamilyDeposits();
    expect(res.status).toBe(200);
    const data = await res.json();

    // Verify all returned deposits belong strictly to Family 1
    for (const dep of data.deposits) {
      expect(dep.familyAccountId).toBe(familyAccount1?.id);
      if (familyAccount2) {
        expect(dep.familyAccountId).not.toBe(familyAccount2.id);
      }
    }
  });

  // SCENARIO 7: Family cannot access unlinked inmate information
  it('Scenario 7: Family cannot access unlinked inmate information', async () => {
    // Authenticate as Family 1
    vi.mocked(auth.getCurrentSession).mockResolvedValue({
      userId: familyUser1?.id || 'fam-1',
      name: 'Family One',
      role: 'FAMILY',
      email: familyUser1?.email || 'family1@test.local',
    });

    // Find an unlinked offender
    const unlinkedOffender = await prisma.offender.findFirst({
      where: {
        familyOffenderLinks: {
          none: { familyAccountId: familyAccount1?.id },
        },
      },
    });

    if (unlinkedOffender) {
      // 7a. Attempt to initiate deposit for unlinked offender
      const depReq = new NextRequest('http://localhost:3000/api/family/deposits/intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          offenderId: unlinkedOffender.id,
          amount: 25.0,
        }),
      });
      const depRes = await postFamilyDepositIntent(depReq);
      expect(depRes.status).toBe(403);
      const depData = await depRes.json();
      expect(depData.error).toContain('approved family relationship is required');

      // 7b. Attempt to submit gift package for unlinked offender
      const pkgReq = new NextRequest('http://localhost:3000/api/family/gift-packages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          offenderId: unlinkedOffender.id,
          packageName: 'Care Box',
          items: [{ productId: sampleProduct?.id || 'prod-id', quantity: 1 }],
        }),
      });
      const pkgRes = await postFamilyGiftPackage(pkgReq);
      expect(pkgRes.status).toBe(403);
      const pkgData = await pkgRes.json();
      expect(pkgData.error).toContain('approved family relationship is required');
    }
  });

  // SCENARIO 8: Picker cannot perform Supervisor-only manifest generation (403)
  it('Scenario 8: Picker cannot perform Supervisor-only manifest generation (403)', async () => {
    vi.mocked(auth.getCurrentSession).mockResolvedValue({
      userId: pickerUser?.id || 'picker-id',
      name: 'Marcus Picker',
      role: 'WAREHOUSE_PICKER',
      facilityId: FACILITY_ID,
    });

    const req = new NextRequest('http://localhost:3000/api/warehouse/manifests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        unit: 'Unit 4',
        deliveryDate: new Date().toISOString(),
        orderIds: [sampleOrderInmate1.id],
      }),
    });

    const res = await postWarehouseManifest(req);
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toContain('Only supervisors can generate delivery manifests');
  });

  // SCENARIO 9: Unauthenticated users receive 401 on protected APIs and redirect on pages
  it('Scenario 9: Unauthenticated users receive 401 on protected APIs and redirect on pages', async () => {
    vi.mocked(auth.getCurrentSession).mockResolvedValue(null);

    // API 401 checks
    const reqAdmin = new NextRequest('http://localhost:3000/api/admin/users');
    expect((await getAdminUsers(reqAdmin)).status).toBe(401);

    const reqWarehouse = new NextRequest('http://localhost:3000/api/warehouse/orders');
    expect((await getWarehouseOrders(reqWarehouse)).status).toBe(401);

    const reqInmate = new NextRequest('http://localhost:3000/api/inmate/balance');
    expect((await getInmateBalance()).status).toBe(401);

    const reqFamily = new NextRequest('http://localhost:3000/api/family/deposits');
    expect((await getFamilyDeposits()).status).toBe(401);

    // Middleware Page Redirect checks
    const pageAdmin = new NextRequest('http://localhost:3000/admin');
    const resAdmin = await middleware(pageAdmin);
    expect(resAdmin.status).toBe(307);
    expect(resAdmin.headers.get('location')).toContain('/admin/login');

    const pageWarehouse = new NextRequest('http://localhost:3000/warehouse');
    const resWarehouse = await middleware(pageWarehouse);
    expect(resWarehouse.status).toBe(307);
    expect(resWarehouse.headers.get('location')).toContain('/warehouse/login');

    const pageInmate = new NextRequest('http://localhost:3000/inmate');
    const resInmate = await middleware(pageInmate);
    expect(resInmate.status).toBe(307);
    expect(resInmate.headers.get('location')).toContain('/inmate/login');

    const pageFamily = new NextRequest('http://localhost:3000/family');
    const resFamily = await middleware(pageFamily);
    expect(resFamily.status).toBe(307);
    expect(resFamily.headers.get('location')).toContain('/family/login');
  });

  // SCENARIO 10: Changing URL paths does not bypass authorization
  it('Scenario 10: Changing URL paths does not bypass authorization', async () => {
    // An inmate trying to access admin through path traversal or alternative sub-paths
    const inmateToken = await signSession({
      offenderId: inmate1.id,
      name: inmate1.name,
      role: 'INMATE',
    });

    const deepAdminReq = new NextRequest('http://localhost:3000/admin/settings/sub', {
      headers: { cookie: `canteen_session=${inmateToken}` },
    });
    const deepAdminRes = await middleware(deepAdminReq);
    expect(deepAdminRes.status).toBe(307);
    expect(deepAdminRes.headers.get('location')).toContain('/access-denied');

    const apiTraversalReq = new NextRequest('http://localhost:3000/api/admin/users', {
      headers: { cookie: `canteen_session=${inmateToken}` },
    });
    const apiTraversalRes = await middleware(apiTraversalReq);
    expect(apiTraversalRes.status).toBe(403);
  });

  // SCENARIO 11: Tampering with account IDs in request bodies does not access other users' data
  it("Scenario 11: Tampering with account IDs in request bodies does not access other users' data", async () => {
    // Ensure Inmate 1 has sufficient balance and reset spending
    await prisma.offender.update({
      where: { id: inmate1.id },
      data: { balance: 50.0, currentWeeklySpent: 0.0, weeklyLimit: 100.0 },
    });

    // Authenticate as Inmate 1
    vi.mocked(auth.getCurrentSession).mockResolvedValue({
      offenderId: inmate1.id,
      name: inmate1.name,
      role: 'INMATE',
      facilityId: FACILITY_ID,
    });

    // Inmate 1 tries to inject offenderId = inmate2.id in order body
    const req = new NextRequest('http://localhost:3000/api/inmate/order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        offenderId: inmate2.id, // Tampered ID
        items: [{ productId: sampleProduct.id, quantity: 1 }],
      }),
    });

    const res = await postInmateOrder(req);
    expect(res.status).toBe(200);
    const data = await res.json();

    // Verify order was created for Inmate 1 (the session owner), NOT Inmate 2!
    const createdOrder = await prisma.order.findUnique({
      where: { id: data.order.id },
    });
    expect(createdOrder?.offenderId).toBe(inmate1.id);
    expect(createdOrder?.offenderId).not.toBe(inmate2.id);
  });

  // SCENARIO 12: Logging out invalidates session cookie
  it('Scenario 12: Logging out invalidates session cookie', async () => {
    const res = await logoutPost();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);

    // Verify Set-Cookie header expires canteen_session
    const cookieHeader = res.headers.get('set-cookie');
    expect(cookieHeader).toContain('canteen_session=;');
    expect(cookieHeader).toContain('Max-Age=0');
  });

  // SCENARIO 13: Switching between accounts requires explicit authentication
  it('Scenario 13: Switching between accounts requires explicit authentication', async () => {
    // An Inmate session cannot silently authenticate or morph into Admin
    const inmateToken = await signSession({
      offenderId: inmate1.id,
      name: inmate1.name,
      role: 'INMATE',
    });

    const adminPageReq = new NextRequest('http://localhost:3000/admin', {
      headers: { cookie: `canteen_session=${inmateToken}` },
    });
    const res = await middleware(adminPageReq);

    // Must be denied, never switched
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/access-denied');
    expect(res.headers.get('location')).not.toContain('/admin');
  });

  // SCENARIO 14: Facility isolation remains strictly enforced across warehouse and inmate queries
  it('Scenario 14: Facility isolation remains strictly enforced across warehouse and inmate queries', async () => {
    // Create an order in a foreign facility
    const foreignFacility = await prisma.facility.create({
      data: {
        id: `FAC-FOREIGN-${Date.now()}`,
        name: 'Foreign Facility',
        maxWeeklySpend: 100,
        maxDepositAmount: 200,
      },
    });

    const foreignOffender = await prisma.offender.create({
      data: {
        id: `OFF-FOREIGN-${Date.now()}`,
        name: 'Foreign Offender',
        facilityId: foreignFacility.id,
        unit: 'Unit 9',
        housing: 'Block Z',
        pinHash: 'test',
        balance: 50.0,
      },
    });

    const foreignOrder = await prisma.order.create({
      data: {
        orderNumber: `ORD-FOREIGN-${Date.now()}`,
        offenderId: foreignOffender.id,
        subtotal: 10.0,
        total: 10.0,
        status: 'PROCESSING',
        barcode: `BC-FOREIGN-${Date.now()}`,
        expectedDeliveryDate: new Date(),
      },
    });

    // Local supervisor attempts to view/modify foreign order
    vi.mocked(auth.getCurrentSession).mockResolvedValue({
      userId: supervisorUser?.id || 'sup-id',
      name: 'Local Supervisor',
      role: 'WAREHOUSE_SUPERVISOR',
      facilityId: FACILITY_ID,
    });

    const req = new NextRequest(`http://localhost:3000/api/warehouse/orders/${foreignOrder.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'START_PICKING' }),
    });

    const res = await patchWarehouseOrder(req, { params: { id: foreignOrder.id } });
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toContain('Order belongs to another facility');
  });

  // SCENARIO 15: Admin retains all explicitly authorized administrative functions
  it('Scenario 15: Admin retains all explicitly authorized administrative functions', async () => {
    vi.mocked(auth.getCurrentSession).mockResolvedValue({
      userId: adminUser?.id || 'admin-id',
      name: 'System Administrator',
      role: 'ADMIN',
    });

    // 15a. Admin can view system stats
    const statsRes = await getAdminStats(new NextRequest('http://localhost:3000/api/admin/stats'));
    expect(statsRes.status).toBe(200);
    const statsData = await statsRes.json();
    expect(statsData.stats).toBeDefined();

    // 15b. Admin can view users list
    const usersRes = await getAdminUsers(new NextRequest('http://localhost:3000/api/admin/users'));
    expect(usersRes.status).toBe(200);

    // 15c. Admin can view and manage inmates
    const inmatesRes = await getAdminInmates(new NextRequest('http://localhost:3000/api/admin/inmates'));
    expect(inmatesRes.status).toBe(200);

    // 15d. Admin can view product catalog
    const productsRes = await getAdminProducts(new NextRequest('http://localhost:3000/api/admin/products'));
    expect(productsRes.status).toBe(200);

    // 15e. Admin can view facilities
    const facilitiesRes = await getAdminFacilities(new NextRequest('http://localhost:3000/api/admin/facilities'));
    expect(facilitiesRes.status).toBe(200);
  });

  // SCENARIO 16: Existing payment, order, inventory, and account workflows remain intact
  it('Scenario 16: Existing payment, order, inventory, and account workflows remain intact', async () => {
    // 16a. Inmate can read balance
    vi.mocked(auth.getCurrentSession).mockResolvedValue({
      offenderId: inmate1.id,
      name: inmate1.name,
      role: 'INMATE',
      facilityId: FACILITY_ID,
    });
    const balRes = await getInmateBalance();
    expect(balRes.status).toBe(200);
    const balData = await balRes.json();
    expect(balData.currentBalance).toBeDefined();

    // 16b. Supervisor can read warehouse orders queue
    vi.mocked(auth.getCurrentSession).mockResolvedValue({
      userId: supervisorUser?.id || 'sup-id',
      name: 'Warehouse Supervisor',
      role: 'WAREHOUSE_SUPERVISOR',
      facilityId: FACILITY_ID,
    });
    const ordersRes = await getWarehouseOrders(new NextRequest('http://localhost:3000/api/warehouse/orders'));
    expect(ordersRes.status).toBe(200);
    const ordersData = await ordersRes.json();
    expect(ordersData.orders).toBeDefined();
  });
});
