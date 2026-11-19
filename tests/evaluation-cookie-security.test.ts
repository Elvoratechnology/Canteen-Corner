import { describe, it, expect, afterEach } from 'vitest';
import { isSecureCookieRequired, getSessionCookieOptions } from '@/lib/auth';

describe('Evaluation Cookie Security & Database Awareness Suite', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalDatabaseUrl = process.env.DATABASE_URL;
  const originalEvalMode = process.env.CANTEEN_EVALUATION_MODE;
  const originalAllowHttp = process.env.ALLOW_HTTP_EVALUATION;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    process.env.DATABASE_URL = originalDatabaseUrl;
    process.env.CANTEEN_EVALUATION_MODE = originalEvalMode;
    process.env.ALLOW_HTTP_EVALUATION = originalAllowHttp;
  });

  describe('isSecureCookieRequired()', () => {
    it('returns false in non-production development environments', () => {
      process.env.NODE_ENV = 'development';
      expect(isSecureCookieRequired()).toBe(false);

      process.env.NODE_ENV = 'test';
      expect(isSecureCookieRequired()).toBe(false);
    });

    it('enforces secure: true in standard production deployments', () => {
      process.env.NODE_ENV = 'production';
      delete process.env.CANTEEN_EVALUATION_MODE;
      delete process.env.ALLOW_HTTP_EVALUATION;
      process.env.DATABASE_URL = 'postgresql://postgres:pass@db.supabase.co:5432/postgres';

      expect(isSecureCookieRequired()).toBe(true);
    });

    it('grants evaluation exception only for exact authorized SQLite paths', () => {
      process.env.NODE_ENV = 'production';
      process.env.CANTEEN_EVALUATION_MODE = 'true';
      process.env.ALLOW_HTTP_EVALUATION = 'true';

      // 3 Authorized Exact Paths:
      process.env.DATABASE_URL = 'file:./evaluation.db';
      expect(isSecureCookieRequired()).toBe(false);

      process.env.DATABASE_URL = 'file:.\\evaluation.db';
      expect(isSecureCookieRequired()).toBe(false);

      process.env.DATABASE_URL = 'file:evaluation.db';
      expect(isSecureCookieRequired()).toBe(false);
    });

    it('strictly REJECTS path traversal, suffixes, prefixes, query parameters, and subdirectories', () => {
      process.env.NODE_ENV = 'production';
      process.env.CANTEEN_EVALUATION_MODE = 'true';
      process.env.ALLOW_HTTP_EVALUATION = 'true';

      const rejectedPaths = [
        'file:./evaluation.db.bak',
        'file:./evaluation.db.old',
        'file:./not-evaluation.db',
        'file:./fake_evaluation.db',
        'file:./evaluation.db2',
        'file:../evaluation.db',
        'file:../../evaluation.db',
        'file:..\\evaluation.db',
        'file:./prisma/evaluation.db',
        'file:./subfolder/evaluation.db',
        'file:./evaluation.db?mode=ro',
        'file:./evaluation.db?connection_limit=1',
        'file:./evaluation.db#anchor',
        'evaluation.db',
        'sqlite://evaluation.db',
        'mysql://root@localhost/evaluation.db',
        '',
      ];

      for (const rejectedPath of rejectedPaths) {
        process.env.DATABASE_URL = rejectedPath;
        expect(isSecureCookieRequired(), `Expected path "${rejectedPath}" to enforce secure: true`).toBe(true);
      }
    });

    it('NEVER grants HTTP exception for PostgreSQL databases even if all flags are set', () => {
      process.env.NODE_ENV = 'production';
      process.env.CANTEEN_EVALUATION_MODE = 'true';
      process.env.ALLOW_HTTP_EVALUATION = 'true';
      process.env.DATABASE_URL = 'postgresql://user:pass@ep-cool-db.us-east-1.aws.neon.tech/neondb';

      expect(isSecureCookieRequired()).toBe(true);
    });

    it('NEVER grants HTTP exception for Supabase URLs even if evaluation.db is in query params', () => {
      process.env.NODE_ENV = 'production';
      process.env.CANTEEN_EVALUATION_MODE = 'true';
      process.env.ALLOW_HTTP_EVALUATION = 'true';
      process.env.DATABASE_URL = 'postgres://postgres.abc:pass@aws-0-us-east-1.pooler.supabase.com:6543/postgres?search=evaluation.db';

      expect(isSecureCookieRequired()).toBe(true);
    });

    it('refuses HTTP exception if DATABASE_URL points to dev.db instead of evaluation.db', () => {
      process.env.NODE_ENV = 'production';
      process.env.CANTEEN_EVALUATION_MODE = 'true';
      process.env.ALLOW_HTTP_EVALUATION = 'true';
      process.env.DATABASE_URL = 'file:./prisma/dev.db';

      expect(isSecureCookieRequired()).toBe(true);
    });

    it('refuses HTTP exception if CANTEEN_EVALUATION_MODE is missing or not true', () => {
      process.env.NODE_ENV = 'production';
      process.env.CANTEEN_EVALUATION_MODE = 'false';
      process.env.ALLOW_HTTP_EVALUATION = 'true';
      process.env.DATABASE_URL = 'file:./evaluation.db';

      expect(isSecureCookieRequired()).toBe(true);

      delete process.env.CANTEEN_EVALUATION_MODE;
      expect(isSecureCookieRequired()).toBe(true);
    });

    it('refuses HTTP exception if ALLOW_HTTP_EVALUATION is missing or not true', () => {
      process.env.NODE_ENV = 'production';
      process.env.CANTEEN_EVALUATION_MODE = 'true';
      process.env.ALLOW_HTTP_EVALUATION = 'false';
      process.env.DATABASE_URL = 'file:./evaluation.db';

      expect(isSecureCookieRequired()).toBe(true);

      delete process.env.ALLOW_HTTP_EVALUATION;
      expect(isSecureCookieRequired()).toBe(true);
    });
  });

  describe('getSessionCookieOptions()', () => {
    it('returns standardized cookie options with correct maxAge and properties', () => {
      process.env.NODE_ENV = 'production';
      process.env.CANTEEN_EVALUATION_MODE = 'true';
      process.env.ALLOW_HTTP_EVALUATION = 'true';
      process.env.DATABASE_URL = 'file:./evaluation.db';

      const options = getSessionCookieOptions(1800);
      expect(options).toEqual({
        httpOnly: true,
        secure: false,
        sameSite: 'lax',
        path: '/',
        maxAge: 1800,
      });

      // Default 4-hour maxAge
      const defaultOptions = getSessionCookieOptions();
      expect(defaultOptions.maxAge).toBe(14400);
    });

    it('enforces secure: true in getSessionCookieOptions in standard production', () => {
      process.env.NODE_ENV = 'production';
      delete process.env.CANTEEN_EVALUATION_MODE;
      delete process.env.ALLOW_HTTP_EVALUATION;
      process.env.DATABASE_URL = 'postgresql://supabase.pooler:6543/postgres';

      const options = getSessionCookieOptions(14400);
      expect(options.secure).toBe(true);
      expect(options.httpOnly).toBe(true);
      expect(options.sameSite).toBe('lax');
      expect(options.path).toBe('/');
    });
  });
});
