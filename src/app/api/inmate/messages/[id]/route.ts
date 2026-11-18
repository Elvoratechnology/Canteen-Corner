import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getCurrentSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getCurrentSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (session.role !== 'INMATE' || !session.offenderId) {
      return NextResponse.json({ error: 'Forbidden: Inmate privileges required.' }, { status: 403 });
    }

    // RBAC: Only delete notification if it belongs to the authenticated offender
    const result = await prisma.notification.deleteMany({
      where: {
        id: params.id,
        offenderId: session.offenderId,
      },
    });

    if (result.count === 0) {
      return NextResponse.json({ error: 'Notification not found or access denied' }, { status: 404 });
    }

    return NextResponse.json({ success: true, count: result.count });
  } catch (error) {
    console.error('Error deleting notification:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
