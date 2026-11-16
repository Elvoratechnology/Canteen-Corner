import { SignJWT, jwtVerify } from 'jose';

export interface SessionPayload {
  userId?: string;
  offenderId?: string;
  name: string;
  role: 'INMATE' | 'FAMILY' | 'WAREHOUSE_PICKER' | 'WAREHOUSE_SUPERVISOR' | 'ADMIN';
  email?: string;
  staffId?: string;
  facilityId?: string;
  lastActivity?: number;
}

export const COOKIE_NAME = 'canteen_session';

/** Server-enforced inactivity limit for inmate terminals (15 minutes) */
export const INMATE_MAX_INACTIVITY_SECONDS = 15 * 60;

/**
 * Retrieves and validates the server-side JWT secret key.
 * 
 * SECURITY MANDATE:
 * 1. Read exclusively from process.env.JWT_SECRET.
 * 2. Fail securely with a configuration error if missing or empty.
 * 3. Never use or generate a hardcoded default fallback.
 * 4. Never print or reveal the secret value in logs or client exceptions.
 */
export function getJwtSecretKey(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret || typeof secret !== 'string' || secret.trim().length === 0) {
    throw new Error(
      'SERVER CONFIGURATION ERROR: JWT_SECRET environment variable is missing or empty. A secure random secret is required to sign and verify sessions.'
    );
  }
  return new TextEncoder().encode(secret.trim());
}

export async function signSession(payload: SessionPayload): Promise<string> {
  const secretKey = getJwtSecretKey();
  const nowInSeconds = Math.floor(Date.now() / 1000);
  const sessionData: SessionPayload = {
    ...payload,
    lastActivity: payload.lastActivity ?? nowInSeconds,
  };
  // Session timeout: 4 hours for normal users, or 30 mins for inmates on shared kiosks
  const expiresIn = payload.role === 'INMATE' ? '30m' : '4h';
  return await new SignJWT({ ...sessionData })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(secretKey);
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  const secretKey = getJwtSecretKey();
  try {
    const { payload } = await jwtVerify(token, secretKey);
    const session = payload as unknown as SessionPayload;

    // Server-enforced inactivity expiration for inmate sessions
    if (session.role === 'INMATE' && typeof session.lastActivity === 'number') {
      const nowInSeconds = Math.floor(Date.now() / 1000);
      if (nowInSeconds - session.lastActivity > INMATE_MAX_INACTIVITY_SECONDS) {
        // Expired due to server-enforced inactivity gap
        return null;
      }
    }

    return session;
  } catch {
    return null;
  }
}

