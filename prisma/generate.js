/**
 * Canteen Corner — Dynamic Prisma Client Generation Router
 * 
 * Automatically selects the appropriate Prisma schema depending on the configured database driver:
 * - Hosted PostgreSQL (e.g., Supabase / Neon / Railway): prisma/schema.postgresql.prisma
 * - Local Development / Unit Testing (SQLite): prisma/schema.prisma
 * 
 * Resolution Order:
 * 1. process.env.DATABASE_URL (top precedence - e.g. Vercel, Docker, shell environment)
 * 2. .env file in project root (local fallback if process.env is not exported)
 * 3. Default fallback: SQLite (prisma/schema.prisma)
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/**
 * Extracts the DATABASE_URL from process environment or parses local .env file.
 * Pure function: does not initiate any network or database activity.
 *
 * @param {string|undefined} processUrl - Explicit environment variable
 * @param {string|undefined} envFilePath - Path to .env file to inspect as fallback
 * @returns {string} Trimmed database URL or empty string
 */
function extractDatabaseUrl(processUrl, envFilePath) {
  // 1. Process environment variable has top precedence (Vercel, Docker, CI, exported shell vars)
  if (processUrl && typeof processUrl === 'string' && processUrl.trim().length > 0) {
    return processUrl.trim();
  }

  // 2. Fall back to inspecting .env file on disk
  const targetFile = envFilePath || path.join(process.cwd(), '.env');
  if (fs.existsSync(targetFile)) {
    try {
      const content = fs.readFileSync(targetFile, 'utf8');
      const lines = content.split(/\r?\n/);
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const match = trimmed.match(/^DATABASE_URL\s*=\s*(.*)$/);
        if (match) {
          let val = match[1].trim();
          // Strip surrounding quotes
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1).trim();
          } else if (val.startsWith('"') && val.includes('"', 1)) {
            val = val.slice(1, val.indexOf('"', 1)).trim();
          } else if (val.startsWith("'") && val.includes("'", 1)) {
            val = val.slice(1, val.indexOf("'", 1)).trim();
          } else {
            // Strip unquoted inline comments
            val = val.split('#')[0].trim();
          }
          if (val) return val;
        }
      }
    } catch (_) {
      // Ignore file reading errors and fall through
    }
  }

  return '';
}

/**
 * Determines whether a database connection URL targets PostgreSQL or SQLite.
 * Handles postgresql://, postgres://, query parameters, uppercase/mixed-case protocols,
 * and leading/trailing whitespace.
 *
 * @param {string} rawUrl - Database connection URL
 * @returns {'postgresql'|'sqlite'} Database driver
 */
function detectDatabaseDriver(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return 'sqlite';
  }

  const trimmed = rawUrl.trim().toLowerCase();
  if (
    trimmed.startsWith('postgresql://') ||
    trimmed.startsWith('postgres://') ||
    trimmed.startsWith('postgresql:') ||
    trimmed.startsWith('postgres:')
  ) {
    return 'postgresql';
  }

  return 'sqlite';
}

/**
 * Resolves the relative path to the appropriate Prisma schema.
 *
 * @param {string} rawUrl - Database connection URL
 * @returns {string} Relative path to schema file
 */
function resolveSchemaPath(rawUrl) {
  const driver = detectDatabaseDriver(rawUrl);
  return driver === 'postgresql'
    ? 'prisma/schema.postgresql.prisma'
    : 'prisma/schema.prisma';
}

/**
 * Main execution function invoked during build steps.
 */
function runGeneration(customEnv) {
  const env = customEnv || process.env;
  const dbUrl = extractDatabaseUrl(env.DATABASE_URL);
  const driver = detectDatabaseDriver(dbUrl);
  const schemaPath = resolveSchemaPath(dbUrl);

  console.log(`[PRISMA GENERATE] Selected Schema: ${schemaPath} (Driver: ${driver === 'postgresql' ? 'PostgreSQL' : 'SQLite'})`);

  try {
    execSync(`npx prisma generate --schema=${schemaPath}`, {
      stdio: 'inherit',
      env: { ...process.env, ...customEnv }
    });
  } catch (err) {
    console.error(`[PRISMA GENERATE ERROR] Failed to generate Prisma Client for ${schemaPath}:`, err.message);
    process.exit(1);
  }
}

// Automatically execute if run as CLI script
if (require.main === module) {
  runGeneration();
}

module.exports = {
  extractDatabaseUrl,
  detectDatabaseDriver,
  resolveSchemaPath,
  runGeneration
};
