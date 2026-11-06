import prisma from './db';

export async function logAuditAction(params: {
  action: string;
  actorId: string;
  actorRole: string;
  resourceType: string;
  resourceId?: string;
  ipAddress?: string;
  metadata?: Record<string, unknown>;
}) {
  try {
    // Redact any potential PII or secrets from metadata
    let safeMetadata = '';
    if (params.metadata) {
      const sanitized = { ...params.metadata };
      const sensitiveKeys = ['pin', 'password', 'token', 'secret', 'cardNumber', 'cvv'];
      for (const key of Object.keys(sanitized)) {
        if (sensitiveKeys.some((s) => key.toLowerCase().includes(s))) {
          sanitized[key] = '[REDACTED]';
        }
      }
      safeMetadata = JSON.stringify(sanitized);
    }

    await prisma.auditLog.create({
      data: {
        action: params.action,
        actorId: params.actorId,
        actorRole: params.actorRole,
        ipAddress: params.ipAddress || 'unknown',
        resourceType: params.resourceType,
        resourceId: params.resourceId || null,
        metadata: safeMetadata || null,
      },
    });
  } catch (error) {
    console.error('Failed to write audit log:', error);
  }
}

