import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { signSession, verifySession, SessionPayload } from '@/lib/auth';

describe('JWT Secret Security & Validation Suite', () => {
  const originalEnvSecret = process.env.JWT_SECRET;
  const testSecret = 'test-suite-secure-random-jwt-secret-key-32chars-minimum!!';

  beforeEach(() => {
    process.env.JWT_SECRET = testSecret;
  });

  afterEach(() => {
    process.env.JWT_SECRET = originalEnvSecret;
  });

  it('should successfully sign and verify a session with a valid secret', async () => {
    const payload: SessionPayload = {
      offenderId: 'A1234567',
      name: 'John Smith',
      role: 'INMATE',
      facilityId: '11111111-1111-1111-1111-111111111111',
    };

    const token = await signSession(payload);
    expect(token).toBeDefined();
    expect(typeof token).toBe('string');

    const verified = await verifySession(token);
    expect(verified).not.toBeNull();
    expect(verified?.offenderId).toBe('A1234567');
    expect(verified?.role).toBe('INMATE');
  });

  it('should fail securely and throw when JWT_SECRET is missing during signSession', async () => {
    delete process.env.JWT_SECRET;

    const payload: SessionPayload = {
      offenderId: 'A1234567',
      name: 'John Smith',
      role: 'INMATE',
    };

    await expect(signSession(payload)).rejects.toThrowError(
      /SERVER CONFIGURATION ERROR: JWT_SECRET environment variable is missing or empty/
    );
  });

  it('should fail securely and throw when JWT_SECRET is an empty string during signSession', async () => {
    process.env.JWT_SECRET = '   ';

    const payload: SessionPayload = {
      offenderId: 'A1234567',
      name: 'John Smith',
      role: 'INMATE',
    };

    await expect(signSession(payload)).rejects.toThrowError(
      /SERVER CONFIGURATION ERROR: JWT_SECRET environment variable is missing or empty/
    );
  });

  it('should fail securely and throw when JWT_SECRET is missing during verifySession', async () => {
    const token = await signSession({
      offenderId: 'A1234567',
      name: 'John Smith',
      role: 'INMATE',
    });

    delete process.env.JWT_SECRET;

    await expect(verifySession(token)).rejects.toThrowError(
      /SERVER CONFIGURATION ERROR: JWT_SECRET environment variable is missing or empty/
    );
  });

  it('should reject a tampered token and return null', async () => {
    const token = await signSession({
      offenderId: 'A1234567',
      name: 'John Smith',
      role: 'INMATE',
    });

    // Tamper with payload by corrupting middle segment of JWT
    const parts = token.split('.');
    expect(parts.length).toBe(3);
    const tamperedToken = `${parts[0]}.eyJuYW1lIjoiSGFja2VyIn0.${parts[2]}`;

    const result = await verifySession(tamperedToken);
    expect(result).toBeNull();
  });

  it('should reject a token signed with a different secret and return null', async () => {
    const token = await signSession({
      offenderId: 'A1234567',
      name: 'John Smith',
      role: 'INMATE',
    });

    // Switch secret to an alien key
    process.env.JWT_SECRET = 'different-key-alien-signature-verification-test-string!';

    const result = await verifySession(token);
    expect(result).toBeNull();
  });
});

