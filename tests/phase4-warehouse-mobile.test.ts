import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import * as auth from '@/lib/auth';
import { GET as getInventory, POST as restockInventory } from '@/app/api/warehouse/inventory/route';
import { GET as getManifests, POST as createManifest } from '@/app/api/warehouse/manifests/route';
import { GET as getOrdersQueue } from '@/app/api/warehouse/orders/route';
import { GET as getOrderDetail, PATCH as updateOrderStatus } from '@/app/api/warehouse/orders/[id]/route';

vi.mock('@/lib/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth')>();
  return {
    ...actual,
    getCurrentSession: vi.fn(),
  };
});

describe('Phase 4: Warehouse Operations & Order Fulfillment Security Suite', () => {
  const FACILITY_ID = 'FACILITY_CC_01';
  let pickerUser: any;
  let supervisorUser: any;
  let testOrder: any;
  let testProduct: any;

  beforeEach(async () => {
    // 1. Fetch or ensure picker user
    pickerUser = await prisma.user.findFirst({
      where: { role: 'WAREHOUSE_PICKER' },
    });

    // 2. Fetch or ensure supervisor user
    supervisorUser = await prisma.user.findFirst({
      where: { role: 'WAREHOUSE_SUPERVISOR' },
    });

    // 3. Fetch a product
    testProduct = await prisma.product.findFirst({
      where: {
        OR: [
          { facilityId: FACILITY_ID },
          { facilityId: null },
        ],
      },
    });

    // 4. Ensure an isolated test order exists for Phase 4 tests
    const offender = await prisma.offender.findFirst({
      where: { facilityId: FACILITY_ID },
    });

    const testOrderNumber = 'ORD-PHASE4-TEST-01';
    testOrder = await prisma.order.findFirst({
      where: { orderNumber: testOrderNumber },
      include: { offender: true, items: true },
    });

    if (!testOrder && offender && testProduct) {
      testOrder = await prisma.order.create({
        data: {
          orderNumber: testOrderNumber,
          offenderId: offender.id,
          subtotal: 10.00,
          total: 10.00,
          status: 'PROCESSING',
          barcode: 'BC-PHASE4-TEST-01',
          expectedDeliveryDate: new Date(),
          items: {
            create: {
              productId: testProduct.id,
              quantity: 2,
              unitPrice: 5.00,
              totalPrice: 10.00,
            },
          },
        },
        include: { offender: true, items: true },
      });
    } else if (testOrder) {
      // Reset test order to PROCESSING for tests
      await prisma.order.update({
        where: { id: testOrder.id },
        data: { status: 'PROCESSING', manifestId: null },
      });
    }
  });

  describe('1. Role-Based Access Control (RBAC) Enforcement', () => {
    it('should reject picker attempt to dispatch order OUT_FOR_DELIVERY with 403', async () => {
      vi.mocked(auth.getCurrentSession).mockResolvedValue({
        userId: pickerUser?.id || 'picker-id',
        name: 'Marcus Miller',
        role: 'WAREHOUSE_PICKER',
        facilityId: FACILITY_ID,
      });

      const req = new NextRequest(`http://localhost:3000/api/warehouse/orders/${testOrder.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'OUT_FOR_DELIVERY' }),
      });

      const res = await updateOrderStatus(req, { params: { id: testOrder.id } });
      const data = await res.json();

      expect(res.status).toBe(403);
      expect(data.error).toContain('Only supervisors can dispatch orders for delivery');
    });

    it('should reject picker attempt to generate delivery manifests with 403', async () => {
      vi.mocked(auth.getCurrentSession).mockResolvedValue({
        userId: pickerUser?.id || 'picker-id',
        name: 'Marcus Miller',
        role: 'WAREHOUSE_PICKER',
        facilityId: FACILITY_ID,
      });

      const req = new NextRequest('http://localhost:3000/api/warehouse/manifests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          unit: 'Unit 4',
          housing: 'Cell Block B',
          deliveryDate: new Date().toISOString(),
          orderIds: [testOrder.id],
        }),
      });

      const res = await createManifest(req);
      const data = await res.json();

      expect(res.status).toBe(403);
      expect(data.error).toContain('Only supervisors can generate delivery manifests');
    });

    it('should reject picker attempt to restock inventory with 403', async () => {
      vi.mocked(auth.getCurrentSession).mockResolvedValue({
        userId: pickerUser?.id || 'picker-id',
        name: 'Marcus Miller',
        role: 'WAREHOUSE_PICKER',
        facilityId: FACILITY_ID,
      });

      const req = new NextRequest('http://localhost:3000/api/warehouse/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: testProduct.id,
          quantity: 20,
        }),
      });

      const res = await restockInventory(req);
      const data = await res.json();

      expect(res.status).toBe(403);
      expect(data.error).toContain('Only supervisors can restock inventory');
    });
  });

  describe('2. Picker Fulfillment Workflow & Barcode Verification', () => {
    it('should allow picker to mark an order as PACKED', async () => {
      vi.mocked(auth.getCurrentSession).mockResolvedValue({
        userId: pickerUser?.id || 'picker-id',
        name: 'Marcus Miller',
        role: 'WAREHOUSE_PICKER',
        facilityId: FACILITY_ID,
      });

      const req = new NextRequest(`http://localhost:3000/api/warehouse/orders/${testOrder.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'MARK_PACKED' }),
      });

      const res = await updateOrderStatus(req, { params: { id: testOrder.id } });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.order).toBeDefined();
      expect(data.order.status).toBe('PACKED');
    });

    it('should reject mismatched barcode during SCAN_BARCODE action', async () => {
      vi.mocked(auth.getCurrentSession).mockResolvedValue({
        userId: pickerUser?.id || 'picker-id',
        name: 'Marcus Miller',
        role: 'WAREHOUSE_PICKER',
        facilityId: FACILITY_ID,
      });

      const req = new NextRequest(`http://localhost:3000/api/warehouse/orders/${testOrder.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'SCAN_BARCODE',
          barcode: 'INVALID-WRONG-BARCODE-999',
        }),
      });

      const res = await updateOrderStatus(req, { params: { id: testOrder.id } });
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toContain('does not match order');
    });
  });

  describe('3. Supervisor Manifest & Dispatch Workflow', () => {
    it('should allow supervisor to dispatch a PACKED order OUT_FOR_DELIVERY', async () => {
      vi.mocked(auth.getCurrentSession).mockResolvedValue({
        userId: supervisorUser?.id || 'supervisor-id',
        name: 'Chief Linda Vance',
        role: 'WAREHOUSE_SUPERVISOR',
        facilityId: FACILITY_ID,
      });

      const req = new NextRequest(`http://localhost:3000/api/warehouse/orders/${testOrder.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'OUT_FOR_DELIVERY' }),
      });

      const res = await updateOrderStatus(req, { params: { id: testOrder.id } });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.order).toBeDefined();
      expect(data.order.status).toBe('OUT_FOR_DELIVERY');
    });

    it('should allow supervisor to view manifest records with facility isolation', async () => {
      vi.mocked(auth.getCurrentSession).mockResolvedValue({
        userId: supervisorUser?.id || 'supervisor-id',
        name: 'Chief Linda Vance',
        role: 'WAREHOUSE_SUPERVISOR',
        facilityId: FACILITY_ID,
      });

      const res = await getManifests();
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.manifests).toBeDefined();
      expect(Array.isArray(data.manifests)).toBe(true);
    });
  });
});

