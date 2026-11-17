import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getCurrentSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await getCurrentSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (session.role !== 'INMATE' || !session.offenderId) {
      return NextResponse.json({ error: 'Forbidden: Inmate privileges required.' }, { status: 403 });
    }

    const messages = await prisma.notification.findMany({
      where: { offenderId: session.offenderId },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ messages });
  } catch (error) {
    console.error('Error fetching messages:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

