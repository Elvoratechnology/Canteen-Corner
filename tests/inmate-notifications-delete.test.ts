import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import * as auth from '@/lib/auth';

import { DELETE as deleteMessageById } from '@/app/api/inmate/messages/[id]/route';
import { DELETE as deleteMessagesBatch, GET as getMessages } from '@/app/api/inmate/messages/route';

vi.mock('@/lib/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth')>();
  return {
    ...actual,
    getCurrentSession: vi.fn(),
  };
});

describe('CANTEEN CORNER — Inmate Notification Deletion & Isolation Suite', () => {
  let inmate1: any;
  let inmate2: any;
  let notif1: any;
  let notif2: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    const inmates = await prisma.offender.findMany({ take: 2 });
    inmate1 = inmates[0];
    inmate2 = inmates[1];

    if (!inmate1 || !inmate2) {
      throw new Error('Required test offenders not found in test database');
    }

    // Clean up test notifications
    await prisma.notification.deleteMany({
      where: {
        offenderId: { in: [inmate1.id, inmate2.id] },
      },
    });

    // Seed test notifications
    notif1 = await prisma.notification.create({
      data: {
        offenderId: inmate1.id,
        type: 'ORDER_RECEIVED',
        title: 'Order Confirmation #1',
        message: 'Your order was successfully placed.',
        read: false,
      },
    });

    notif2 = await prisma.notification.create({
      data: {
        offenderId: inmate2.id,
        type: 'DEPOSIT_RECEIVED',
        title: 'Deposit Received',
        message: 'A deposit was credited.',
        read: false,
      },
    });
  });

  it('1. Unauthenticated request to delete notification is rejected with 401', async () => {
    vi.mocked(auth.getCurrentSession).mockResolvedValue(null);

    const req = new NextRequest(`http://localhost:3000/api/inmate/messages/${notif1.id}`, {
      method: 'DELETE',
    });
    const res = await deleteMessageById(req, { params: { id: notif1.id } });
    expect(res.status).toBe(401);
  });

  it('2. Inmate can successfully delete their own notification by ID', async () => {
    vi.mocked(auth.getCurrentSession).mockResolvedValue({
      offenderId: inmate1.id,
      inmateNumber: 'A1234567',
      name: inmate1.name || 'Test Inmate',
      role: 'INMATE',
    });

    const req = new NextRequest(`http://localhost:3000/api/inmate/messages/${notif1.id}`, {
      method: 'DELETE',
    });
    const res = await deleteMessageById(req, { params: { id: notif1.id } });
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);

    const check = await prisma.notification.findUnique({
      where: { id: notif1.id },
    });
    expect(check).toBeNull();
  });

  it("3. Cross-inmate isolation: Inmate 1 CANNOT delete Inmate 2's notification", async () => {
    vi.mocked(auth.getCurrentSession).mockResolvedValue({
      offenderId: inmate1.id,
      inmateNumber: 'A1234567',
      name: inmate1.name || 'Test Inmate',
      role: 'INMATE',
    });

    const req = new NextRequest(`http://localhost:3000/api/inmate/messages/${notif2.id}`, {
      method: 'DELETE',
    });
    const res = await deleteMessageById(req, { params: { id: notif2.id } });
    expect(res.status).toBe(404);

    // Verify notif2 still exists in database intact
    const check = await prisma.notification.findUnique({
      where: { id: notif2.id },
    });
    expect(check).not.toBeNull();
    expect(check?.id).toBe(notif2.id);
  });

  it('4. Inmate can clear all their own notifications without affecting others', async () => {
    // Create an extra notification for Inmate 1
    await prisma.notification.create({
      data: {
        offenderId: inmate1.id,
        type: 'ORDER_STATUS',
        title: 'Order Status Update',
        message: 'Order is packed.',
        read: true,
      },
    });

    vi.mocked(auth.getCurrentSession).mockResolvedValue({
      offenderId: inmate1.id,
      inmateNumber: 'A1234567',
      name: inmate1.name || 'Test Inmate',
      role: 'INMATE',
    });

    const req = new NextRequest('http://localhost:3000/api/inmate/messages', {
      method: 'DELETE',
    });
    const res = await deleteMessagesBatch(req);
    expect(res.status).toBe(200);

    // Verify Inmate 1 has 0 notifications
    const inmate1Notifs = await prisma.notification.findMany({
      where: { offenderId: inmate1.id },
    });
    expect(inmate1Notifs.length).toBe(0);

    // Verify Inmate 2 notification was untouched
    const inmate2Notifs = await prisma.notification.findMany({
      where: { offenderId: inmate2.id },
    });
    expect(inmate2Notifs.length).toBe(1);
    expect(inmate2Notifs[0].id).toBe(notif2.id);
  });
});
