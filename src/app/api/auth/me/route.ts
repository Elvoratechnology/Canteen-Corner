import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/lib/auth';
import prisma from '@/lib/db';
import { serializeOffender } from '@/lib/money';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await getCurrentSession();
    if (!session) {
      return NextResponse.json({ authenticated: false, session: null }, { status: 401 });
    }

    if (session.role === 'INMATE' && session.offenderId) {
      const offender = await prisma.offender.findUnique({
        where: { id: session.offenderId },
        include: { facility: true },
      });

      if (!offender) {
        return NextResponse.json({ authenticated: false, session: null }, { status: 404 });
      }

      // Explicitly sanitize and never expose pinHash in session queries
      const { pinHash, ...safeOffender } = offender;

      return NextResponse.json({
        authenticated: true,
        session,
        offender: serializeOffender(safeOffender),
      });
    }

    if (session.userId) {
      const user = await prisma.user.findUnique({
        where: { id: session.userId },
        include: { familyAccount: true },
      });
      return NextResponse.json({
        authenticated: true,
        session,
        user: {
          id: user?.id,
          name: user?.name,
          email: user?.email,
          role: user?.role,
          staffId: user?.staffId,
          familyAccount: user?.familyAccount,
        },
      });
    }

    return NextResponse.json({ authenticated: true, session });
  } catch (error) {
    console.error('Session retrieval error:', error);
    return NextResponse.json({ authenticated: false, session: null }, { status: 500 });
  }
}

export async function POST() {
  try {
    const session = await getCurrentSession();
    if (session) {
      if (session.role === 'INMATE' && session.offenderId) {
        await prisma.offender.update({
          where: { id: session.offenderId },
          data: { tokenVersion: { increment: 1 } },
        }).catch(() => {});
      } else if (session.userId) {
        await prisma.user.update({
          where: { id: session.userId },
          data: { tokenVersion: { increment: 1 } },
        }).catch(() => {});
      }
    }
  } catch {
    // Proceed with clearing client cookie regardless of database error
  }

  const response = NextResponse.json({ success: true, message: 'Logged out successfully' });
  response.cookies.set('canteen_session', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
  return response;
}

