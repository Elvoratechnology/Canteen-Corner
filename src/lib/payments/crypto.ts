import crypto from 'crypto';

/**
 * Validates HMAC SHA-256 signatures with constant-time comparison to prevent timing attacks.
 */
export function verifyHmacSha256Signature(
  rawBody: string,
  signature: string,
  secret: string
): boolean {
  if (!signature || !secret || !rawBody) return false;

  try {
    const expectedSig = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    const sigBuf = Buffer.from(signature, 'utf8');
    const expBuf = Buffer.from(expectedSig, 'utf8');

    if (sigBuf.length !== expBuf.length) return false;
    return crypto.timingSafeEqual(sigBuf, expBuf);
  } catch {
    return false;
  }
}

/**
 * Checks that a webhook timestamp is within the allowable tolerance window (default: 5 minutes)
 * to protect against replay attacks.
 */
export function isTimestampWithinTolerance(
  timestampStr: string | number | undefined,
  maxToleranceMs: number = 5 * 60 * 1000
): { valid: boolean; error?: string } {
  if (!timestampStr) {
    return { valid: true }; // Timestamp header absent
  }

  let timestampMs: number;

  if (typeof timestampStr === 'number') {
    timestampMs = timestampStr < 1e11 ? timestampStr * 1000 : timestampStr;
  } else {
    const trimmed = timestampStr.trim();
    if (/^\d+$/.test(trimmed)) {
      const num = parseInt(trimmed, 10);
      timestampMs = num < 1e11 ? num * 1000 : num;
    } else {
      const parsed = Date.parse(trimmed);
      if (isNaN(parsed)) {
        return { valid: false, error: 'Invalid timestamp header format.' };
      }
      timestampMs = parsed;
    }
  }

  const timeDiff = Math.abs(Date.now() - timestampMs);

  if (timeDiff > maxToleranceMs) {
    return {
      valid: false,
      error: `Webhook timestamp outside allowed replay protection window (${Math.round(maxToleranceMs / 60000)} minutes).`,
    };
  }

  return { valid: true };
}
