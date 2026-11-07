import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import prisma from './db';

/**
 * Retrieves and validates the server-side JWT secret key.
 * 
 * SECURITY MANDATE:
 * 1. Read exclusively from process.env.JWT_SECRET.
 * 2. Fail securely with a configuration error if missing or empty.
 * 3. Never use or generate a hardcoded default fallback.
 * 4. Never print or reveal the secret value in logs or client exceptions.
 */
function getJwtSecretKey(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret || typeof secret !== 'string' || secret.trim().length === 0) {
    throw new Error(
      'SERVER CONFIGURATION ERROR: JWT_SECRET environment variable is missing or empty. A secure random secret is required to sign and verify sessions.'
    );
  }
  return new TextEncoder().encode(secret.trim());
}

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
  const secretKey = getJwtSecretKey();
  // Session timeout: 4 hours for normal users, or 30 mins for inmates on shared kiosks
  const expiresIn = payload.role === 'INMATE' ? '30m' : '4h';
  return await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(secretKey);
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  // Validates server configuration before verifying token integrity
  const secretKey = getJwtSecretKey();
  try {
    const { payload } = await jwtVerify(token, secretKey);
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

