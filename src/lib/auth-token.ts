if (typeof window !== 'undefined') {
  throw new Error('SERVER-ONLY MODULE: src/lib/auth-token.ts can only be executed in a server environment.');
}

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
  tokenVersion?: number;
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

  const trimmed = secret.trim();

  // In production, enforce minimum 32 characters and reject common insecure values
  if (process.env.NODE_ENV === 'production') {
    if (trimmed.length < 32) {
      throw new Error(
        'SERVER CONFIGURATION ERROR: JWT_SECRET must be at least 32 characters long in production mode.'
      );
    }
    const insecurePlaceholders = [
      'secret',
      'changeme',
      'development',
      'dev-secret',
      'placeholder',
      'test-secret',
      'replace_with_a_secure_random_secret',
      'canteen-corner-super-secret-jwt-key-change-in-production',
    ];
    if (insecurePlaceholders.some(p => trimmed.toLowerCase() === p)) {
      throw new Error(
        'SERVER CONFIGURATION ERROR: Insecure default JWT_SECRET detected in production environment. A cryptographically secure random secret is required.'
      );
    }
  }

  return new TextEncoder().encode(trimmed);
}

export async function signSession(payload: SessionPayload): Promise<string> {
  const secretKey = getJwtSecretKey();
  const nowInSeconds = Math.floor(Date.now() / 1000);
  const sessionData: SessionPayload = {
    ...payload,
    tokenVersion: payload.tokenVersion ?? 0,
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

/**
 * Determines whether authentication session cookies must enforce the `Secure` attribute.
 *
 * SECURITY INVARIANT:
 * 1. In standard production (NODE_ENV === 'production'), cookies MUST ALWAYS be Secure (HTTPS only).
 * 2. An isolated client evaluation exception is ONLY granted when ALL of the following strict conditions are met:
 *    - NODE_ENV === 'production'
 *    - CANTEEN_EVALUATION_MODE === 'true' (server-only environment flag)
 *    - ALLOW_HTTP_EVALUATION === 'true' (explicit opt-in flag)
 *    - DATABASE_URL explicitly points to the isolated local SQLite evaluation database (contains 'evaluation.db')
 *      AND does NOT reference PostgreSQL or remote databases under any circumstance.
 * 3. PostgreSQL configurations must NEVER qualify for the HTTP evaluation exception.
 * 4. If any condition is missing, false, invalid, or unexpected, the cookie MUST retain secure: true in production.
 * 5. In development (NODE_ENV !== 'production'), secure is false to permit localhost development without TLS.
 */
export function isSecureCookieRequired(): boolean {
  if (process.env.NODE_ENV !== 'production') {
    return false;
  }

  // Under production NODE_ENV:
  const isEvalMode = process.env.CANTEEN_EVALUATION_MODE === 'true';
  const isAllowHttp = process.env.ALLOW_HTTP_EVALUATION === 'true';
  const dbUrl = (process.env.DATABASE_URL || '').trim();

  // Defense-in-depth: PostgreSQL configurations MUST NEVER qualify for the HTTP evaluation exception
  const isPostgres =
    dbUrl.startsWith('postgres://') ||
    dbUrl.startsWith('postgresql://') ||
    dbUrl.includes('supabase') ||
    dbUrl.includes('pooler.supabase.com');

  if (isPostgres) {
    return true;
  }

  // Strict exact-path validation: Accept ONLY the exact authorized evaluation SQLite database paths.
  // Rejects suffixes (.bak), prefixes, path traversal (..), query parameters, subdirectories, or alternate protocols.
  const exactAcceptedEvaluationPaths = [
    'file:./evaluation.db',
    'file:.\\evaluation.db',
    'file:evaluation.db',
  ];

  const isSqliteEvaluation = exactAcceptedEvaluationPaths.includes(dbUrl);

  if (isEvalMode && isAllowHttp && isSqliteEvaluation) {
    return false;
  }

  // Default fail-safe for production: enforce Secure cookies
  return true;
}

/**
 * Generates standard session cookie options enforcing security boundaries.
 * 
 * @param maxAgeSeconds Lifetime of the cookie in seconds (e.g. 1800 for 30m, 14400 for 4h, 0 for deletion)
 */
export function getSessionCookieOptions(maxAgeSeconds: number = 4 * 60 * 60) {
  return {
    httpOnly: true,
    secure: isSecureCookieRequired(),
    sameSite: 'lax' as const,
    path: '/',
    maxAge: maxAgeSeconds,
  };
}

