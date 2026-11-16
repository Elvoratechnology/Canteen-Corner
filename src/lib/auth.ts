import { cookies } from 'next/headers';
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

export async function getCurrentSession(): Promise<SessionPayload | null> {
  const cookieStore = cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return await verifySession(token);
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
