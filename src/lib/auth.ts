import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import prisma from './db';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'canteen-corner-super-secure-production-jwt-key-2026-correctional-facility'
);

export interface SessionPayload {
  userId?: string;
  offenderId?: string;
  name: string;
  role: 'INMATE' | 'FAMILY' | 'WAREHOUSE_PICKER' | 'WAREHOUSE_SUPERVISOR' | 'ADMIN';
  email?: string;
  staffId?: string;
  facilityId?: string;
}

const COOKIE_NAME = 'canteen_session';

export async function signSession(payload: SessionPayload): Promise<string> {
  // Session timeout: 2 hours for normal users, or 30 mins for inmates on shared kiosks
  const expiresIn = payload.role === 'INMATE' ? '30m' : '4h';
  return await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(JWT_SECRET);
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

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

