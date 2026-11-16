import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { signSession, verifySession, INMATE_MAX_INACTIVITY_SECONDS, SessionPayload } from '@/lib/auth';

describe('Phase 2: Inmate Kiosk Inactivity & Virtual Keypad Security Suite', () => {
  const originalEnvSecret = process.env.JWT_SECRET;
  const testSecret = 'test-suite-secure-random-jwt-secret-key-32chars-minimum!!';

  beforeEach(() => {
    process.env.JWT_SECRET = testSecret;
  });

  afterEach(() => {
    process.env.JWT_SECRET = originalEnvSecret;
  });

  it('should accept active inmate session within the 15-minute inactivity window', async () => {
    const now = Math.floor(Date.now() / 1000);
    const payload: SessionPayload = {
      offenderId: 'A1234567',
      name: 'John Smith',
      role: 'INMATE',
      facilityId: '11111111-1111-1111-1111-111111111111',
      lastActivity: now - 300, // 5 minutes ago
    };

    const token = await signSession(payload);
    const verified = await verifySession(token);

    expect(verified).not.toBeNull();
    expect(verified?.offenderId).toBe('A1234567');
    expect(verified?.role).toBe('INMATE');
  });

  it('should reject and invalidate inmate session when inactivity exceeds 15 minutes', async () => {
    const now = Math.floor(Date.now() / 1000);
    const payload: SessionPayload = {
      offenderId: 'A1234567',
      name: 'John Smith',
      role: 'INMATE',
      facilityId: '11111111-1111-1111-1111-111111111111',
      lastActivity: now - (INMATE_MAX_INACTIVITY_SECONDS + 10), // 15 mins + 10 seconds ago
    };

    const token = await signSession(payload);
    const verified = await verifySession(token);

    expect(verified).toBeNull(); // Server-enforced inactivity invalidation
  });

  it('should not subject staff or family accounts to kiosk inactivity expiration', async () => {
    const now = Math.floor(Date.now() / 1000);
    const familyPayload: SessionPayload = {
      userId: 'user-family-123',
      name: 'Sarah Smith',
      role: 'FAMILY',
      lastActivity: now - (INMATE_MAX_INACTIVITY_SECONDS + 500), // Inactive for > 20 mins
    };

    const token = await signSession(familyPayload);
    const verified = await verifySession(token);

    expect(verified).not.toBeNull();
    expect(verified?.role).toBe('FAMILY');
  });

  it('should automatically embed current timestamp in lastActivity when not explicitly passed', async () => {
    const payload: SessionPayload = {
      offenderId: 'A1234567',
      name: 'John Smith',
      role: 'INMATE',
    };

    const token = await signSession(payload);
    const verified = await verifySession(token);

    expect(verified).not.toBeNull();
    expect(typeof verified?.lastActivity).toBe('number');
    const now = Math.floor(Date.now() / 1000);
    expect(Math.abs((verified?.lastActivity || 0) - now)).toBeLessThan(5);
  });
});

