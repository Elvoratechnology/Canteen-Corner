import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getCurrentSession } from '@/lib/auth';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getCurrentSession();
    if (!session || session.role !== 'INMATE' || !session.offenderId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const order = await prisma.order.findFirst({
      where: {
        id: params.id,
        offenderId: session.offenderId,
      },
      include: {
        items: {
          include: { product: true },
        },
        statusHistory: {
          orderBy: { createdAt: 'desc' },
        },
        offender: {
          select: { name: true, unit: true, housing: true },
        },
      },
    });

    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    return NextResponse.json({ order });
  } catch (error) {
    console.error('Error fetching order detail:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

