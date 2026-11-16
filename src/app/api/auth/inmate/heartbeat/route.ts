import { NextResponse } from 'next/server';
import { getCurrentSession, signSession, INMATE_MAX_INACTIVITY_SECONDS } from '@/lib/auth';

/**
 * Server-Enforced Kiosk Inactivity Heartbeat
 * 
 * SECURITY MANDATE:
 * - Only authenticated INMATE sessions can refresh their inactivity timestamp.
 * - If the session has already expired on the server, reject with 401 Unauthorized.
 * - Never issue extended sessions to unauthenticated or unauthorized callers.
 */
export async function POST() {
  try {
    const session = await getCurrentSession();

    if (!session || session.role !== 'INMATE') {
      return NextResponse.json(
        { error: 'Session has expired due to inactivity. Please log in again.' },
        { status: 401 }
      );
    }

    // Refresh lastActivity timestamp on the server
    const updatedToken = await signSession({
      ...session,
      lastActivity: Math.floor(Date.now() / 1000),
    });

    const response = NextResponse.json({
      success: true,
      remainingSeconds: INMATE_MAX_INACTIVITY_SECONDS,
      refreshedAt: new Date().toISOString(),
    });

    response.cookies.set('canteen_session', updatedToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 30 * 60,
    });

    return response;
  } catch (error) {
    console.error('Inactivity heartbeat error:', error);
    return NextResponse.json(
      { error: 'Failed to refresh session.' },
      { status: 500 }
    );
  }
}

