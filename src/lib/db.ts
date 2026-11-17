import { PrismaClient } from '@prisma/client';

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

export const prisma =
  global.prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  global.prisma = prisma;
}

export default prisma;

/**
 * Generates a database-compatible case-insensitive text search condition.
 * - Under PostgreSQL: provides `{ contains: value, mode: 'insensitive' }`
 * - Under SQLite: provides `{ contains: value }` (SQLite comparisons are case-insensitive by default)
 */
export function caseInsensitiveContains(value: string): any {
  const isPostgres = process.env.DATABASE_URL?.startsWith('postgres');
  return isPostgres
    ? { contains: value, mode: 'insensitive' }
    : { contains: value };
}

