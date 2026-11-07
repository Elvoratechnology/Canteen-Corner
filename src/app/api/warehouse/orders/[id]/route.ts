import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getCurrentSession } from '@/lib/auth';
import { logAuditAction } from '@/lib/audit';
import { z } from 'zod';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getCurrentSession();
    if (!session || !['WAREHOUSE_PICKER', 'WAREHOUSE_SUPERVISOR', 'ADMIN'].includes(session.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const order = await prisma.order.findUnique({
      where: { id: params.id },
      include: {
        offender: {
          select: { id: true, name: true, unit: true, housing: true, facility: true },
        },
        items: { include: { product: true } },
        statusHistory: { orderBy: { createdAt: 'asc' } },
        pickingList: {
          include: {
            pickerUser: { select: { id: true, name: true, staffId: true } },
          },
        },
      },
    });

    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    if (session.facilityId && (order.offender as any)?.facilityId && (order.offender as any).facilityId !== session.facilityId) {
      return NextResponse.json({ error: 'Access denied: Order belongs to another facility.' }, { status: 403 });
    }

    return NextResponse.json({ order });
  } catch (error) {
    console.error('Error fetching order detail:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

const UpdateStatusSchema = z.object({
  action: z.enum(['START_PICKING', 'MARK_PACKED', 'OUT_FOR_DELIVERY', 'DELIVER', 'SCAN_BARCODE']),
  barcode: z.string().optional(),
  notes: z.string().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getCurrentSession();
    if (!session || !['WAREHOUSE_PICKER', 'WAREHOUSE_SUPERVISOR', 'ADMIN'].includes(session.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const result = UpdateStatusSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { error: result.error.errors[0]?.message || 'Invalid action' },
        { status: 400 }
      );
    }

    const { action, barcode, notes } = result.data;
    const order = await prisma.order.findUnique({
      where: { id: params.id },
      include: { pickingList: true, offender: true },
    });

    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    if (session.facilityId && (order.offender as any)?.facilityId && (order.offender as any).facilityId !== session.facilityId) {
      return NextResponse.json({ error: 'Access denied: Order belongs to another facility.' }, { status: 403 });
    }

    let newStatus = order.status;
    let pickingUpdate: any = {};

    switch (action) {
      case 'START_PICKING':
        if (order.status !== 'PROCESSING') {
          return NextResponse.json({ error: 'Order must be in PROCESSING status to begin picking.' }, { status: 400 });
        }
        newStatus = 'PROCESSING'; // Stay in processing until packed
        pickingUpdate = {
          status: 'PICKING',
          pickerUserId: session.userId,
          startedAt: new Date(),
        };
        break;

      case 'SCAN_BARCODE':
        // Verify scanned barcode matches order
        if (barcode && barcode !== order.barcode) {
          return NextResponse.json({ error: `Scanned barcode "${barcode}" does not match order ${order.orderNumber}.` }, { status: 400 });
        }
        break;

      case 'MARK_PACKED':
        newStatus = 'PACKED';
        pickingUpdate = {
          status: 'PACKED',
          completedAt: new Date(),
        };
        break;

      case 'OUT_FOR_DELIVERY':
        if (session.role !== 'WAREHOUSE_SUPERVISOR' && session.role !== 'ADMIN') {
          return NextResponse.json({ error: 'Only supervisors can dispatch orders for delivery.' }, { status: 403 });
        }
        newStatus = 'OUT_FOR_DELIVERY';
        break;

      case 'DELIVER':
        newStatus = 'DELIVERED';
        break;
    }

    // Update order status
    const updatedOrder = await prisma.$transaction(async (tx) => {
      if (newStatus !== order.status) {
        await tx.order.update({
          where: { id: order.id },
          data: {
            status: newStatus,
            ...(newStatus === 'DELIVERED' ? { deliveredAt: new Date() } : {}),
            ...(newStatus === 'PACKED' ? { packedAt: new Date() } : {}),
          },
        });

        await tx.orderStatusHistory.create({
          data: {
            orderId: order.id,
            previousStatus: order.status,
            newStatus,
            changedBy: session.userId || `STAFF_${session.staffId}`,
            notes: notes || `Status changed via warehouse portal by ${session.name}`,
          },
        });

        // Send notification to inmate
        if (['PACKED', 'OUT_FOR_DELIVERY', 'DELIVERED'].includes(newStatus)) {
          const statusMessages: Record<string, { title: string; msg: string }> = {
            PACKED: {
              title: `Order Packed (${order.orderNumber})`,
              msg: `Your commissary package has been picked and packaged. It will be dispatched to your housing area during the next scheduled distribution.`,
            },
            OUT_FOR_DELIVERY: {
              title: `Order Out for Delivery (${order.orderNumber})`,
              msg: `Your commissary package is now out for delivery. Distribution staff will deliver to your unit shortly.`,
            },
            DELIVERED: {
              title: `Order Delivered (${order.orderNumber})`,
              msg: `Your commissary package has been successfully delivered to your housing area.`,
            },
          };

          const notifInfo = statusMessages[newStatus];
          if (notifInfo) {
            await tx.notification.create({
              data: {
                offenderId: order.offenderId,
                type: 'ORDER_STATUS',
                title: notifInfo.title,
                message: notifInfo.msg,
              },
            });
          }
        }
      }

      if (Object.keys(pickingUpdate).length > 0 && order.pickingList) {
        await tx.pickingList.update({
          where: { orderId: order.id },
          data: pickingUpdate,
        });
      }

      return await tx.order.findUnique({
        where: { id: order.id },
        include: {
          offender: { select: { id: true, name: true, unit: true, housing: true } },
          items: { include: { product: true } },
          statusHistory: { orderBy: { createdAt: 'asc' } },
          pickingList: true,
        },
      });
    });

    await logAuditAction({
      action: `WAREHOUSE_ORDER_${action}`,
      actorId: session.userId || 'unknown',
      actorRole: session.role,
      resourceType: 'ORDER',
      resourceId: order.id,
      metadata: { orderId: order.id, orderNumber: order.orderNumber, newStatus },
    });

    return NextResponse.json({ success: true, order: updatedOrder });
  } catch (error: any) {
    console.error('Error updating order status:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update order status.' },
      { status: 500 }
    );
  }
}

