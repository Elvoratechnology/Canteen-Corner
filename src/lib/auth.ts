import { cookies } from 'next/headers';
import prisma from './db';
import {
  SessionPayload,
  COOKIE_NAME,
  INMATE_MAX_INACTIVITY_SECONDS,
  getJwtSecretKey,
  signSession,
  verifySession,
} from './auth-token';

export type { SessionPayload };
export { COOKIE_NAME, INMATE_MAX_INACTIVITY_SECONDS, getJwtSecretKey, signSession, verifySession };

/**
 * Validates the session payload against the authoritative database state.
 * Enforces:
 * 1. Token version verification (server-side session revocation / logout / password change).
 * 2. Active account lock verification (user.lockedUntil and offender.pinLockedUntil).
 * 3. Fresh role verification (rejects sessions with stale, demoted, or escalated roles).
 * 4. Fresh facility assignment verification (rejects warehouse staff accessing unauthorized facilities).
 */
export async function validateSessionAccount(
  session: SessionPayload | null
): Promise<SessionPayload | null> {
  if (!session) return null;

  try {
    const now = new Date();

    if (session.role === 'INMATE' && session.offenderId) {
      const offender = await prisma.offender.findUnique({
        where: { id: session.offenderId },
        select: {
          id: true,
          facilityId: true,
          pinLockedUntil: true,
          tokenVersion: true,
          user: {
            select: {
              lockedUntil: true,
              tokenVersion: true,
            },
          },
        },
      });

      if (!offender) return null;

      // Inmate PIN Lock Check
      if (offender.pinLockedUntil && offender.pinLockedUntil > now) {
        return null;
      }
      if (offender.user?.lockedUntil && offender.user.lockedUntil > now) {
        return null;
      }

      // Token Version Check (revocation)
      const expectedTv = offender.tokenVersion ?? 0;
      const sessionTv = session.tokenVersion ?? 0;
      if (sessionTv !== expectedTv) {
        return null;
      }

      // Facility Alignment Check
      if (session.facilityId && offender.facilityId !== session.facilityId) {
        return null;
      }

      return session;
    }

    if (session.userId) {
      const user = await prisma.user.findUnique({
        where: { id: session.userId },
        select: {
          id: true,
          role: true,
          facilityId: true,
          lockedUntil: true,
          tokenVersion: true,
        },
      });

      if (!user) return null;

      // Account Lock Check
      if (user.lockedUntil && user.lockedUntil > now) {
        return null;
      }

      // Token Version Check (revocation)
      const expectedTv = user.tokenVersion ?? 0;
      const sessionTv = session.tokenVersion ?? 0;
      if (sessionTv !== expectedTv) {
        return null;
      }

      // Role Staleness Check (demotions / privilege revocation)
      if (user.role !== session.role) {
        return null;
      }

      // Warehouse Facility Scope Check
      if (
        (session.role === 'WAREHOUSE_PICKER' || session.role === 'WAREHOUSE_SUPERVISOR') &&
        user.facilityId !== session.facilityId
      ) {
        return null;
      }

      return session;
    }

    return null;
  } catch (err) {
    console.error('validateSessionAccount database error:', err);
    return null;
  }
}

export async function getCurrentSession(): Promise<SessionPayload | null> {
  const cookieStore = cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  const session = await verifySession(token);
  if (!session) return null;
  return await validateSessionAccount(session);
}

export async function requireSession(allowedRoles?: string[]): Promise<SessionPayload> {
  const session = await getCurrentSession();
  if (!session) {
    throw new Error('UNAUTHORIZED');
  }
  if (allowedRoles && !allowedRoles.includes(session.role)) {
    throw new Error('FORBIDDEN');
  }
  return session;
}
