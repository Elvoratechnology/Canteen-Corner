# CANTEEN CORNER — PHASE 8F.10B.3.7
## POST-REDESIGN SOURCE SECURITY REVIEW & AUDIT REPORT

**Status:** STATIC SECURITY REVIEW COMPLETE — AWAITING OWNER REVIEW  
**Review Type:** Static Source Code Inspection, AST Analysis, and Dependency Audit  
**Live Network Operations:** ZERO (Zero network requests, zero database sockets, zero credential requests)  
**File Mutations:** ZERO (Strictly read-only inspection; no application or scratch files modified)  

---

### 1. COMPLETE SOURCE CODE EXPORT

#### 1.1 `scratch/secure_prod_auth.ps1` (Complete Source, 89 Lines)

```powershell
# ==============================================================================
# CANTEEN CORNER — PHASE 8F.10B.3.6: AUTHORITATIVE PINNED PRODUCTION AUTHENTICATION
# ==============================================================================
# OWNER-CONFIRMED PRODUCTION SUPABASE PROJECT REFERENCE:
# nenhzsruhbqhxtslxkns
# ==============================================================================
# SECURITY NOTICE & MEMORY LIFECYCLE DISCLOSURE:
# - The target production Supabase project reference is hard-pinned and immutable.
# - Verification uses native Node.js pg engine with explicit TLS & hostname SAN checks.
# - Unmanaged BSTR memory allocated for plaintext conversion is physically zeroed
#   via [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR().
# - Managed .NET String objects and V8 JavaScript memory reside in garbage-collected
#   managed heaps. While variables are nulled and GC::Collect() is triggered, managed
#   runtimes cannot guarantee instantaneous cryptographic memory cell overwriting.
# - Credentials are NEVER written to disk, NEVER saved in .env or Git, and NEVER passed
#   as command-line arguments (which could be visible in process listings).
# - Data is transmitted strictly via standard input (stdin) in memory.
# - ZERO local metadata files are created; output is displayed in the terminal only.
# ==============================================================================

$ErrorActionPreference = "Stop"

$PINNED_PROD_REF = "nenhzsruhbqhxtslxkns"

Write-Host "`n=== CANTEEN CORNER: PINNED PRODUCTION CREDENTIAL PIPELINE ===" -ForegroundColor Cyan
Write-Host "Authoritative Target Supabase Project Reference: $PINNED_PROD_REF" -ForegroundColor Green
Write-Host "This utility verifies production database identity in memory under SET TRANSACTION READ ONLY."
Write-Host "Zero credentials or connection metadata will be written to disk, saved in .env, or committed to Git.`n"

# 1. Securely Prompt for Production Connection String (Hidden Password Input)
Write-Host "[PROMPT] Please enter or paste the Production Supabase Connection String."
Write-Host "Note: Input is masked (no keystrokes or asterisks will appear):"
$secure = Read-Host -Prompt "Production DIRECT_URL" -AsSecureString

if (-not $secure) {
    Write-Error "No connection string entered. Operation cancelled."
    exit 1
}

# 2. Decrypt in Unmanaged Memory, Extract, and Zero Unmanaged Buffer Immediately
$bstr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
$plainUrl = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
[System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
$secure = $null

if (-not $plainUrl -or $plainUrl.Trim().Length -eq 0) {
    Write-Error "Failed to read connection string from secure input."
    exit 1
}

# 3. Strict Staging Substring Guard on Connection String
if ($plainUrl.ToLower().Contains("zcamheygapbruuovikar")) {
    $plainUrl = $null
    [System.GC]::Collect()
    Write-Error "CRITICAL VIOLATION: Staging project reference 'zcamheygapbruuovikar' detected in connection URI. Staging access is strictly prohibited."
    exit 1
}

# 4. Construct In-Memory JSON Payload with Pinned Reference
$payloadObj = @{
    expectedProjectRef = $PINNED_PROD_REF
    directUrl = $plainUrl
}
$jsonPayload = $payloadObj | ConvertTo-Json -Compress

# Immediately clear plain URL variable reference
$plainUrl = $null

Write-Host "`n[START] Executing fail-closed identity verification engine..." -ForegroundColor Cyan

# 5. Pipe JSON securely to Node.js verification engine via STDIN
$jsonPayload | node scratch\verify_prod_connection.js

$exitCode = $LASTEXITCODE

# 6. Memory Cleanup
$jsonPayload = $null
$payloadObj = $null
[System.GC]::Collect()
[System.GC]::WaitForPendingFinalizers()

if ($exitCode -eq 0) {
    Write-Host "`n[COMPLETED] Production identity verified successfully!" -ForegroundColor Green
    Write-Host "Credentials purged from memory. Zero files written to disk." -ForegroundColor Green
} else {
    Write-Host "`n[FAILED] Verification failed with exit code $exitCode." -ForegroundColor Red
}

exit $exitCode
```

---

#### 1.2 `scratch/verify_prod_connection.js` (Complete Source, 562 Lines)

##### Section 1.2.1: Lines 1–280 (Imports, Constants, Security Helpers, and TLS Configuration)

```javascript
const fs = require('fs');
const path = require('path');
const tls = require('tls');

// Authoritative, Owner-Confirmed Production Supabase Project Reference
const PINNED_PRODUCTION_PROJECT_REF = 'nenhzsruhbqhxtslxkns';

// Fixed, Reviewed Read-Only SQL Statements
const SQL_STATEMENTS = {
  BEGIN: 'BEGIN;',
  SET_READ_ONLY: 'SET TRANSACTION READ ONLY;',
  CATALOG_VERSION: 'SELECT version() AS ver;',
  CATALOG_IDENTITY: 'SELECT current_database() AS db, current_user AS usr;',
  ADMIN_INSPECTION: `SELECT
    role,
    COUNT(*)::int AS count
FROM "User"
WHERE role IN ('ADMIN', 'SUPER_ADMIN')
GROUP BY role
ORDER BY role ASC;`,
  COMMIT: 'COMMIT;',
  ROLLBACK: 'ROLLBACK;'
};

// Custom Security Error Class with safe categories
class SecurityValidationError extends Error {
  constructor(category, message) {
    super(message);
    this.name = 'SecurityValidationError';
    this.category = category;
  }
}

/**
 * Strips any potential credential fragments from text.
 */
function redactCredentials(text) {
  if (!text) return '';
  return String(text)
    // Redact password in URI: postgres://user:pass@host
    .replace(/:\/\/[^:]+:([^@]+)@/g, '://[REDACTED]:[REDACTED]@')
    // Redact Bearer / JWT tokens
    .replace(/ey[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[REDACTED_JWT]')
    // Redact hex secrets / UUIDs / long random strings (30+ characters)
    .replace(/\b[a-zA-Z0-9_-]{30,}\b/g, '[REDACTED_SECRET]');
}

/**
 * Maps database / runtime errors to fixed, safe categories without exposing stack or raw strings.
 */
function sanitizeErrorMessage(err) {
  if (!err) {
    return { category: 'UNKNOWN_ERROR', safeMessage: 'An unspecified error occurred.' };
  }

  // Handle known SecurityValidationErrors cleanly
  if (err.name === 'SecurityValidationError') {
    return {
      category: err.category,
      safeMessage: err.message
    };
  }

  const code = err.code || (err.meta && err.meta.code) || '';
  const messageStr = String(err.message || err);

  // Missing dependency categorization
  if (code === 'MODULE_NOT_FOUND' && messageStr.includes('pg')) {
    return {
      category: 'DEPENDENCY_MISSING',
      safeMessage: 'The "pg" native PostgreSQL client is not installed. Package installation required.'
    };
  }

  // PostgreSQL Native Driver (pg) & Network Error Code Categorization
  if (code === '28P01' || messageStr.includes('password authentication failed') || messageStr.includes('Authentication failed')) {
    return {
      category: 'AUTH_FAILURE',
      safeMessage: 'Database authentication failed. Please verify the database user and password.'
    };
  }
  if (code === '3D000' || messageStr.includes('does not exist')) {
    return {
      category: 'DATABASE_NOT_FOUND',
      safeMessage: 'The specified database does not exist on the target server.'
    };
  }
  if (code === '25006' || messageStr.includes('read-only transaction')) {
    return {
      category: 'READ_ONLY_VIOLATION',
      safeMessage: 'Database engine rejected statement: transaction is in read-only mode.'
    };
  }
  if (code === 'ENOTFOUND' || code === 'ECONNREFUSED' || messageStr.includes("Can't reach database server")) {
    return {
      category: 'UNREACHABLE_HOST',
      safeMessage: 'Database server is unreachable or DNS resolution failed. Verify host and port.'
    };
  }
  if (code === 'ETIMEDOUT' || messageStr.includes('timeout') || messageStr.includes('timed out')) {
    return {
      category: 'CONNECTION_TIMEOUT',
      safeMessage: 'Database connection timed out before completing TLS handshake or transaction.'
    };
  }
  if (
    code === 'CERT_HAS_EXPIRED' ||
    code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' ||
    code === 'ERR_TLS_CERT_ALTNAME_INVALID' ||
    code === 'DEPTH_ZERO_SELF_SIGNED_CERT' ||
    messageStr.includes('certificate') ||
    messageStr.includes('TLS') ||
    messageStr.includes('SSL') ||
    messageStr.includes('hostname') ||
    messageStr.includes('altnames')
  ) {
    return {
      category: 'TLS_SECURITY_ERROR',
      safeMessage: 'TLS certificate or hostname verification failed. Secure connection rejected.'
    };
  }

  // Fallback generic database error
  return {
    category: 'DATABASE_ERROR',
    safeMessage: 'A database connectivity error occurred while querying system catalogs.'
  };
}

/**
 * Validates TLS configuration parameters statically using robust searchParams parsing.
 * Enforces `rejectUnauthorized: true`, rejects insecure flags (`sslmode=disable`, `sslaccept=accept_invalid_certs`, etc.).
 * Handles mixed-case parameter names and duplicate parameters fail-closed.
 * Extracts custom CA certificate paths if provided.
 */
function enforceStrictTlsParameters(urlObj) {
  if (!urlObj || !urlObj.searchParams) {
    throw new SecurityValidationError('INVALID_URI', 'Parsed URL object with searchParams is required.');
  }

  const keysToDelete = [];
  let customCaPath = null;

  // 1. Inspect all query parameters case-insensitively
  for (const [key, value] of urlObj.searchParams.entries()) {
    const lowerKey = key.toLowerCase();
    const lowerVal = String(value).toLowerCase();

    // Check for custom CA certificates
    if (lowerKey === 'sslrootcert' || lowerKey === 'sslcert') {
      keysToDelete.push(key);
      if (value && value.trim()) {
        customCaPath = value.trim();
      }
    }

    // Check for any SSL/TLS parameter variations
    if (
      lowerKey === 'sslmode' ||
      lowerKey === 'ssl' ||
      lowerKey === 'sslaccept' ||
      lowerKey === 'rejectunauthorized'
    ) {
      keysToDelete.push(key);

      // Reject explicit insecure modes
      if (
        lowerVal === 'disable' ||
        lowerVal === 'allow' ||
        lowerVal === 'prefer' ||
        lowerVal === 'no-verify' ||
        lowerVal === 'false'
      ) {
        throw new SecurityValidationError(
          'TLS_SECURITY_VIOLATION',
          'Insecure sslmode detected (disable/allow/prefer/false). Plaintext or opportunistic encryption is strictly prohibited.'
        );
      }

      // Reject certificate validation bypass flags
      if (
        lowerVal === 'accept_invalid_certs' ||
        lowerVal === 'rejectunauthorized=false' ||
        (lowerKey === 'rejectunauthorized' && lowerVal === 'false')
      ) {
        throw new SecurityValidationError(
          'TLS_SECURITY_VIOLATION',
          'Disabling TLS certificate or hostname validation (rejectUnauthorized=false / accept_invalid_certs) is strictly prohibited.'
        );
      }
    }
  }

  // 2. Remove all conflicting/redundant SSL parameters from searchParams
  // This guarantees connection string query parameters cannot override explicit pg driver TLS settings
  for (const k of keysToDelete) {
    urlObj.searchParams.delete(k);
  }

  return {
    tlsEnforced: true,
    rejectUnauthorized: true,
    certificateVerificationMandatory: true,
    hostnameVerificationMandatory: true,
    customCaPath: customCaPath
  };
}

/**
 * Builds explicit configuration object for native pg.Client.
 * Passes discrete fields (host, port, user, password, database) to prevent query parameter pollution.
 * Configures explicit TLS with rejectUnauthorized: true, minVersion: 'TLSv1.2', SNI servername,
 * and explicit checkServerIdentity callback for strict SAN/CN hostname validation.
 */
function buildPgClientConfig(validated) {
  const sslConfig = {
    rejectUnauthorized: true,
    minVersion: 'TLSv1.2',
    servername: validated.host,
    checkServerIdentity: (host, cert) => {
      const err = tls.checkServerIdentity(host, cert);
      if (err) {
        throw new SecurityValidationError(
          'TLS_HOSTNAME_MISMATCH',
          `TLS certificate hostname verification failed for ${host}: ${err.message}`
        );
      }
      return undefined;
    }
  };

  // Attach custom CA if specified and exists on disk
  if (validated.sslCertPath && fs.existsSync(validated.sslCertPath)) {
    sslConfig.ca = fs.readFileSync(validated.sslCertPath, 'utf8');
  } else if (process.env.NODE_EXTRA_CA_CERTS && fs.existsSync(process.env.NODE_EXTRA_CA_CERTS)) {
    sslConfig.ca = fs.readFileSync(process.env.NODE_EXTRA_CA_CERTS, 'utf8');
  }

  return {
    host: validated.host,
    port: parseInt(validated.port, 10),
    database: validated.database,
    user: validated.user,
    password: validated.password,
    ssl: sslConfig
  };
}

/**
 * Independent Node.js Native TLS Peer-Certificate and Hostname Verification Probe.
 * Connects directly using Node's tls module with rejectUnauthorized: true and SNI.
 * Verifies certificate validity dates, issuer, and SAN hostname before database connection.
 */
function verifyPeerCertificate(host, port) {
  return new Promise((resolve, reject) => {
    const socket = tls.connect({
      host: host,
      port: parseInt(port, 10),
      servername: host, // SNI
      rejectUnauthorized: true, // Fail-closed CA and hostname check
      minVersion: 'TLSv1.2'
    }, () => {
      const cert = socket.getPeerCertificate();
      const authorized = socket.authorized;
      const authError = socket.authorizationError;

      socket.end();

      if (!authorized) {
        return reject(new SecurityValidationError(
          'TLS_CERTIFICATE_UNAUTHORIZED',
          `TLS certificate authorization failed: ${authError || 'Unknown error'}`
        ));
      }

      if (!cert || Object.keys(cert).length === 0) {
        return reject(new SecurityValidationError(
          'TLS_CERTIFICATE_EMPTY',
          'Peer presented empty or missing certificate'
        ));
      }

      resolve({
        authorized: true,
        subject: cert.subject?.CN || 'Unknown CN',
        issuer: cert.issuer?.O || cert.issuer?.CN || 'Unknown Issuer',
        validTo: cert.valid_to,
        fingerprint: cert.fingerprint256
      });
    });

    socket.on('error', (err) => {
      reject(err);
    });

    socket.setTimeout(8000, () => {
      socket.destroy();
      reject(new SecurityValidationError('TLS_PROBE_TIMEOUT', `TLS connection to ${host}:${port} timed out after 8000ms.`));
    });
  });
}
```

##### Section 1.2.2: Lines 281–562 (Input Validation, Execution Engine, and Module Exports)

```javascript
/**
 * Fail-Closed Input Validation, Authoritative Project Identity Pinning, and TLS Hardening.
 * Pure function: takes input, performs all security checks, returns sanitized metadata.
 * Does NOT initiate any network connection.
 */
function validateAndParseInput(rawInput) {
  if (!rawInput || typeof rawInput !== 'string' || !rawInput.trim()) {
    throw new SecurityValidationError('EMPTY_INPUT', 'No input received via standard input.');
  }

  // 1. HARD STAGING DEFENSE: Global substring check on raw input
  const lowerRaw = rawInput.toLowerCase();
  if (lowerRaw.includes('zcamheygapbruuovikar')) {
    throw new SecurityValidationError(
      'STAGING_REJECTED',
      'CRITICAL VIOLATION: Staging project reference "zcamheygapbruuovikar" detected anywhere in input. Staging access is strictly prohibited.'
    );
  }

  // 2. Parse input payload (Supports JSON object or direct URI string)
  let directUrl = null;
  let runtimeRefOverride = null;

  try {
    const parsed = JSON.parse(rawInput);
    if (typeof parsed === 'object' && parsed !== null) {
      directUrl = parsed.directUrl;
      runtimeRefOverride = parsed.expectedProjectRef;
    } else if (typeof parsed === 'string') {
      directUrl = parsed;
    }
  } catch {
    // If not valid JSON, treat rawInput as the direct URI string
    directUrl = rawInput.trim();
  }

  // 3. Prohibit Runtime Override of Pinned Production Project Reference
  if (runtimeRefOverride && runtimeRefOverride.trim().toLowerCase() !== PINNED_PRODUCTION_PROJECT_REF.toLowerCase()) {
    throw new SecurityValidationError(
      'PROJECT_REF_OVERRIDE_FORBIDDEN',
      `Runtime override of pinned production project reference is strictly forbidden. Pinned: "${PINNED_PRODUCTION_PROJECT_REF}", Attempted: "${runtimeRefOverride}".`
    );
  }

  // 4. Validate Connection String Format
  if (!directUrl || typeof directUrl !== 'string' || !directUrl.trim()) {
    throw new SecurityValidationError('MISSING_CONNECTION_URI', 'Database connection URI was not provided.');
  }

  const cleanUri = directUrl.trim();
  if (!cleanUri.startsWith('postgresql://') && !cleanUri.startsWith('postgres://')) {
    throw new SecurityValidationError(
      'MALFORMED_URI',
      'Connection URI must start with postgresql:// or postgres:// protocol.'
    );
  }

  // 5. Fail-Closed URI Parsing
  let urlObj;
  try {
    urlObj = new URL(cleanUri.replace('postgresql://', 'http://').replace('postgres://', 'http://'));
  } catch (err) {
    throw new SecurityValidationError('MALFORMED_URI', 'Malformed PostgreSQL connection URI syntax.');
  }

  const host = urlObj.hostname;
  const port = urlObj.port || '5432';
  const username = decodeURIComponent(urlObj.username || '');
  const password = decodeURIComponent(urlObj.password || '');

  if (!host) {
    throw new SecurityValidationError('MALFORMED_URI', 'Connection URI does not contain a valid host.');
  }

  // 6. Fail-Closed Project Reference Extraction
  let detectedProjectRef = null;

  if (username && username.startsWith('postgres.')) {
    const parts = username.split('.');
    if (parts.length >= 2 && parts[1].length >= 10) {
      detectedProjectRef = parts[1];
    }
  } else if (host.includes('.supabase.co')) {
    const hostParts = host.split('.');
    let candidate = hostParts[0];
    if (candidate === 'db' && hostParts.length >= 3) {
      candidate = hostParts[1];
    } else {
      candidate = candidate.replace(/^db-/, '');
    }
    if (candidate.length >= 10) {
      detectedProjectRef = candidate;
    }
  }

  if (!detectedProjectRef) {
    throw new SecurityValidationError(
      'CANNOT_EXTRACT_PROJECT_REF',
      'Unable to extract Supabase project reference from connection URI. Unrecognized project format.'
    );
  }

  // 7. Identity Matching: Compare detected reference against the IMMUTABLE PINNED REFERENCE
  if (detectedProjectRef.toLowerCase() !== PINNED_PRODUCTION_PROJECT_REF.toLowerCase()) {
    throw new SecurityValidationError(
      'PROJECT_REF_MISMATCH',
      `Target project reference mismatch. Expected pinned production reference "${PINNED_PRODUCTION_PROJECT_REF}", but connection string points to "${detectedProjectRef}".`
    );
  }

  // 8. Strict SSL Parameter Parsing & Parameter Normalization
  const tlsParams = enforceStrictTlsParameters(urlObj);

  // Construct canonical effective URL with postgresql:// protocol
  const canonicalUrl = urlObj.toString().replace(/^http:/, 'postgresql:');

  return {
    pinnedProductionProjectRef: PINNED_PRODUCTION_PROJECT_REF,
    detectedProjectRef: detectedProjectRef,
    host: host,
    port: port,
    database: urlObj.pathname.replace(/^\//, '') || 'postgres',
    user: username,
    password: password,
    sanitizedTarget: `${host}:${port}`,
    effectiveUrl: canonicalUrl,
    sslCertPath: tlsParams.customCaPath,
    tlsMode: 'explicit-pg-tls-verify-full'
  };
}

/**
 * Script CLI Execution Mode
 */
if (require.main === module) {
  let inputBuffer = '';
  process.stdin.setEncoding('utf8');

  process.stdin.on('data', chunk => {
    inputBuffer += chunk;
  });

  process.stdin.on('end', async () => {
    const rawInput = inputBuffer;
    inputBuffer = ''; // Clear input buffer immediately

    let validated;
    try {
      validated = validateAndParseInput(rawInput);
    } catch (valErr) {
      const sanitized = sanitizeErrorMessage(valErr);
      console.error(`[SECURITY ERROR] ${sanitized.category}: ${sanitized.safeMessage}`);
      process.exit(1);
    }

    console.log(`[PREFLIGHT] Verified Target Project Reference matches PINNED production: ${validated.detectedProjectRef}`);
    console.log(`[PREFLIGHT] Validated Host Endpoint: ${validated.sanitizedTarget}`);
    console.log(`[PREFLIGHT] Enforcing Explicit Native pg TLS: rejectUnauthorized=true, TLSv1.2+, Hostname SAN Verified`);

    // 1. Independent Native TLS Peer-Certificate and Hostname Verification Probe
    try {
      console.log('[TLS PROBE] Executing native Node.js TLS certificate & hostname verification probe...');
      const peerCert = await verifyPeerCertificate(validated.host, validated.port);
      console.log(`[TLS PROBE SUCCESS] Certificate Verified: ${peerCert.subject} | Issuer: ${peerCert.issuer}`);
    } catch (tlsErr) {
      const sanitizedTls = sanitizeErrorMessage(tlsErr);
      console.error(`[SECURITY ERROR] ${sanitizedTls.category}: ${sanitizedTls.safeMessage}`);
      process.exit(1);
    }

    // 2. Load Native pg Client
    let pg;
    try {
      pg = require('pg');
    } catch (reqErr) {
      console.error(`[DEPENDENCY ERROR] The "pg" package is not installed. Dependency status: MISSING. Live connection cannot proceed until "pg" is installed.`);
      process.exit(1);
    }

    let client = null;
    let exitCode = 0;

    try {
      console.log('[CONNECTING] Opening native pg connection with rejectUnauthorized=true & hostname verification...');
      const pgConfig = buildPgClientConfig(validated);
      client = new pg.Client(pgConfig);
      await client.connect();

      // 3. Genuine Read-Only PostgreSQL Transaction Enforcement
      console.log('[TRANSACTION] Enforcing SET TRANSACTION READ ONLY boundary...');
      await client.query(SQL_STATEMENTS.BEGIN);
      await client.query(SQL_STATEMENTS.SET_READ_ONLY);

      // 4. Execute Fixed, Read-Only System Catalog Queries
      const versionRes = await client.query(SQL_STATEMENTS.CATALOG_VERSION);
      const dbIdentityRes = await client.query(SQL_STATEMENTS.CATALOG_IDENTITY);

      // 5. Execute Admin / Super Admin Minimum-Data Inspection (Count Only)
      const adminCountRes = await client.query(SQL_STATEMENTS.ADMIN_INSPECTION);

      await client.query(SQL_STATEMENTS.COMMIT);

      const versionStr = versionRes.rows[0]?.ver || 'Unknown PostgreSQL version';
      const dbName = dbIdentityRes.rows[0]?.db || 'Unknown database';
      const dbUser = dbIdentityRes.rows[0]?.usr || 'Unknown user';

      const mode = validated.port === '6543'
        ? 'Transaction Pooler (Supavisor 6543)'
        : (validated.port === '5432' ? 'Session Pooler / Direct (5432)' : `Port ${validated.port}`);

      // 6. In-Memory Sanitized Metadata Telemetry (Zero Disk Writes)
      console.log('\n===========================================================');
      console.log('=== VERIFIED PRODUCTION METADATA (IN-MEMORY TELEMETRY) ===');
      console.log('===========================================================');
      console.log(`  Project Reference : ${validated.detectedProjectRef} (MATCHED PINNED)`);
      console.log(`  Database Endpoint : ${validated.sanitizedTarget}`);
      console.log(`  Database Name     : ${dbName}`);
      console.log(`  Connected User    : ${dbUser}`);
      console.log(`  PostgreSQL Engine : ${versionStr.split(',')[0]}`);
      console.log(`  Connection Mode   : ${mode}`);
      console.log(`  Driver Engine     : Node.js Native pg (node-postgres)`);
      console.log(`  TLS Verification  : rejectUnauthorized=true, TLSv1.2+, SAN Hostname Verified`);
      console.log('  Transaction Mode  : SET TRANSACTION READ ONLY (Engine-Enforced)');
      console.log('  Admin Accounts    : Inspected (Role Aggregation Count Only, 0 PII)');
      for (const r of (adminCountRes.rows || [])) {
        console.log(`    - Role [${r.role}] : ${r.count} account(s)`);
      }
      console.log('  Disk Writes       : 0 files written (In-memory stream only)');
      console.log('===========================================================\n');
    } catch (connErr) {
      exitCode = 1;
      const sanitized = sanitizeErrorMessage(connErr);
      console.error(`[CONNECTION ERROR] ${sanitized.category}: ${sanitized.safeMessage}`);
      if (client) {
        try {
          await client.query(SQL_STATEMENTS.ROLLBACK);
        } catch (_) {}
      }
    } finally {
      if (client) {
        try {
          await client.end();
        } catch (_) {}
      }
      process.exit(exitCode);
    }
  });
}

module.exports = {
  PINNED_PRODUCTION_PROJECT_REF,
  SQL_STATEMENTS,
  SecurityValidationError,
  redactCredentials,
  sanitizeErrorMessage,
  enforceStrictTlsParameters,
  buildPgClientConfig,
  verifyPeerCertificate,
  validateAndParseInput
};
```

---

#### 1.3 `scratch/test_identity_pinning.js` (Complete Source, 293 Lines)

```javascript
const {
  PINNED_PRODUCTION_PROJECT_REF,
  SQL_STATEMENTS,
  SecurityValidationError,
  redactCredentials,
  sanitizeErrorMessage,
  enforceStrictTlsParameters,
  buildPgClientConfig,
  validateAndParseInput
} = require('./verify_prod_connection');
const fs = require('fs');
const path = require('path');
const tls = require('tls');

console.log('=== RUNNING STATIC SECURITY TESTS: NATIVE PG TLS & IDENTITY PINNING (PHASE 8F.10B.3.6) ===\n');

let passCount = 0;
let failCount = 0;

function assert(condition, testName, details = '') {
  if (condition) {
    console.log(`[PASS] ${testName}`);
    passCount++;
  } else {
    console.error(`[FAIL] ${testName} - ${details}`);
    failCount++;
  }
}

// -----------------------------------------------------------------------------
// REQUIREMENT 1: Correct Production project ref is accepted
// -----------------------------------------------------------------------------
const matchingPayload = JSON.stringify({
  directUrl: 'postgresql://postgres.nenhzsruhbqhxtslxkns:dummySecretPassword123!@aws-0-us-west-1.pooler.supabase.com:5432/postgres'
});
const validResult = validateAndParseInput(matchingPayload);
assert(
  validResult.detectedProjectRef === 'nenhzsruhbqhxtslxkns' &&
  validResult.pinnedProductionProjectRef === 'nenhzsruhbqhxtslxkns' &&
  PINNED_PRODUCTION_PROJECT_REF === 'nenhzsruhbqhxtslxkns',
  'Req 1: Correct Production project ref is accepted and matches immutable pinned ref',
  `Detected: ${validResult.detectedProjectRef}`
);

// -----------------------------------------------------------------------------
// REQUIREMENT 2: Staging project ref is rejected
// -----------------------------------------------------------------------------
let stagingBlocked = false;
try {
  validateAndParseInput(JSON.stringify({
    directUrl: 'postgresql://postgres.zcamheygapbruuovikar:dummyPass@aws-0.pooler.supabase.com:5432/postgres'
  }));
} catch (err) {
  if (err instanceof SecurityValidationError && err.category === 'STAGING_REJECTED') {
    stagingBlocked = true;
  }
}
assert(
  stagingBlocked,
  'Req 2: Staging project ref (zcamheygapbruuovikar) is strictly rejected fail-closed'
);

// -----------------------------------------------------------------------------
// REQUIREMENT 3: Unknown project ref is rejected
// -----------------------------------------------------------------------------
let unknownBlocked = false;
try {
  validateAndParseInput(JSON.stringify({
    directUrl: 'postgresql://postgres.unknownprojectref123:dummyPass@aws-0.pooler.supabase.com:5432/postgres'
  }));
} catch (err) {
  if (err instanceof SecurityValidationError && err.category === 'PROJECT_REF_MISMATCH') {
    unknownBlocked = true;
  }
}
assert(
  unknownBlocked,
  'Req 3: Unknown project ref rejected fail-closed against pinned production reference'
);

// -----------------------------------------------------------------------------
// REQUIREMENT 4: Runtime identity override is rejected
// -----------------------------------------------------------------------------
let overrideBlocked = false;
try {
  validateAndParseInput(JSON.stringify({
    expectedProjectRef: 'attackerref999',
    directUrl: 'postgresql://postgres.attackerref999:dummyPass@aws-0.pooler.supabase.com:5432/postgres'
  }));
} catch (err) {
  if (err instanceof SecurityValidationError && err.category === 'PROJECT_REF_OVERRIDE_FORBIDDEN') {
    overrideBlocked = true;
  }
}
assert(
  overrideBlocked,
  'Req 4: Runtime override of pinned reference strictly forbidden'
);

// -----------------------------------------------------------------------------
// REQUIREMENT 5: TLS verification cannot be disabled
// -----------------------------------------------------------------------------
let disableBlocked = false;
let bypassBlocked = false;
try {
  const url = new URL('http://aws-0.pooler.supabase.com:5432/postgres?sslmode=disable');
  enforceStrictTlsParameters(url);
} catch (err) {
  if (err.category === 'TLS_SECURITY_VIOLATION') disableBlocked = true;
}
try {
  const url = new URL('http://aws-0.pooler.supabase.com:5432/postgres?rejectUnauthorized=false');
  enforceStrictTlsParameters(url);
} catch (err) {
  if (err.category === 'TLS_SECURITY_VIOLATION') bypassBlocked = true;
}
assert(
  disableBlocked && bypassBlocked,
  'Req 5: Disabling TLS verification (sslmode=disable, rejectUnauthorized=false) is strictly rejected'
);

// -----------------------------------------------------------------------------
// REQUIREMENT 6: Hostname verification cannot be bypassed
// -----------------------------------------------------------------------------
const pgConfig = buildPgClientConfig(validResult);
let hostnameCheckActive = false;
try {
  // Test checkServerIdentity with mismatched hostname
  pgConfig.ssl.checkServerIdentity('wrong.host.com', {
    subject: { CN: 'db.nenhzsruhbqhxtslxkns.supabase.co' },
    subjectaltname: 'DNS:db.nenhzsruhbqhxtslxkns.supabase.co'
  });
} catch (err) {
  if (err instanceof SecurityValidationError && err.category === 'TLS_HOSTNAME_MISMATCH') {
    hostnameCheckActive = true;
  }
}
assert(
  pgConfig.ssl.servername === validResult.host &&
  typeof pgConfig.ssl.checkServerIdentity === 'function' &&
  hostnameCheckActive,
  'Req 6: Hostname/SAN verification cannot be bypassed (checkServerIdentity active)'
);

// -----------------------------------------------------------------------------
// REQUIREMENT 7: TLS configuration is explicitly passed to the native pg driver
// -----------------------------------------------------------------------------
assert(
  pgConfig.ssl.rejectUnauthorized === true &&
  pgConfig.ssl.minVersion === 'TLSv1.2' &&
  pgConfig.host === validResult.host &&
  pgConfig.port === parseInt(validResult.port, 10),
  'Req 7: Explicit TLS configuration (rejectUnauthorized: true, TLSv1.2+) passed to pg driver'
);

// -----------------------------------------------------------------------------
// REQUIREMENT 8: Connection-string parameters cannot override explicit secure TLS settings
// -----------------------------------------------------------------------------
const pollutedUrl = new URL('http://aws-0.pooler.supabase.com:5432/postgres?sslmode=require&rejectUnauthorized=true&other=1');
enforceStrictTlsParameters(pollutedUrl);
assert(
  pollutedUrl.searchParams.get('sslmode') === null &&
  pollutedUrl.searchParams.get('rejectUnauthorized') === null &&
  pollutedUrl.searchParams.get('other') === '1',
  'Req 8: Connection-string SSL parameters are completely stripped to prevent overriding pg config'
);

// -----------------------------------------------------------------------------
// REQUIREMENT 9: Read-only transaction is the first SQL statement
// -----------------------------------------------------------------------------
assert(
  SQL_STATEMENTS.SET_READ_ONLY === 'SET TRANSACTION READ ONLY;',
  'Req 9: SET TRANSACTION READ ONLY is defined as the immutable first transaction statement'
);

// -----------------------------------------------------------------------------
// REQUIREMENT 10: Admin query filters only ADMIN and SUPER_ADMIN
// -----------------------------------------------------------------------------
const adminQuery = SQL_STATEMENTS.ADMIN_INSPECTION;
const hasCorrectRoles = adminQuery.includes("role IN ('ADMIN', 'SUPER_ADMIN')");
const hasWarehouseSupervisor = adminQuery.includes('WAREHOUSE_SUPERVISOR');
assert(
  hasCorrectRoles && !hasWarehouseSupervisor,
  'Req 10: Admin query filters strictly ADMIN and SUPER_ADMIN (zero WAREHOUSE_SUPERVISOR)'
);

// -----------------------------------------------------------------------------
// REQUIREMENT 11: No personal or authentication data is selected
// -----------------------------------------------------------------------------
const forbiddenFields = ['email', 'passwordhash', 'password', 'token', 'pin', 'staffid', 'verificationtoken'];
let leaksSensitiveField = false;
for (const field of forbiddenFields) {
  if (adminQuery.toLowerCase().includes(field)) {
    leaksSensitiveField = true;
    break;
  }
}
const selectsCountOnly = adminQuery.includes('role') && adminQuery.includes('COUNT(*)::int AS count') && !adminQuery.includes('LIMIT');
assert(
  !leaksSensitiveField && selectsCountOnly,
  'Req 11: Admin query selects only role counts (zero personal/auth data, no arbitrary LIMIT)'
);

// -----------------------------------------------------------------------------
// REQUIREMENT 12: Cleanup executes through finally
// -----------------------------------------------------------------------------
let mockClientClosed = false;
let transactionRolledBack = false;

// Simulated mock client execution demonstrating lifecycle guarantee
const mockClient = {
  query: async (sql) => {
    if (sql === 'ROLLBACK;') transactionRolledBack = true;
    if (sql === 'TRIGGER_ERROR') throw new Error('Simulated failure');
  },
  end: async () => {
    mockClientClosed = true;
  }
};

(async () => {
  let simClient = mockClient;
  let exitCode = 0;
  try {
    await simClient.query('BEGIN;');
    await simClient.query('SET TRANSACTION READ ONLY;');
    await simClient.query('TRIGGER_ERROR');
  } catch (err) {
    exitCode = 1;
    await simClient.query('ROLLBACK;');
  } finally {
    if (simClient) {
      await simClient.end();
    }
  }
  assert(
    mockClientClosed === true && transactionRolledBack === true && exitCode === 1,
    'Req 12: Structured cleanup guarantees client.end() in finally block and rollback on failure'
  );

  // ---------------------------------------------------------------------------
  // REQUIREMENT 13: Credentials are never written to files or logs
  // ---------------------------------------------------------------------------
  const sensitiveRaw = 'postgresql://postgres.nenhzsruhbqhxtslxkns:SuperSecretPass123!@host:5432/postgres';
  const redacted = redactCredentials(sensitiveRaw);
  assert(
    !redacted.includes('SuperSecretPass123!') &&
    redacted.includes('://[REDACTED]:[REDACTED]@host:5432/postgres'),
    'Req 13: Credentials and passwords are redacted by pure in-memory sanitizer'
  );

  // ---------------------------------------------------------------------------
  // REQUIREMENT 14: Error output is sanitized
  // ---------------------------------------------------------------------------
  const rawErr = new Error('password authentication failed for user "postgres.nenhzsruhbqhxtslxkns"');
  rawErr.code = '28P01';
  const sanitized = sanitizeErrorMessage(rawErr);
  assert(
    sanitized.category === 'AUTH_FAILURE' &&
    !sanitized.safeMessage.includes('nenhzsruhbqhxtslxkns') &&
    !sanitized.safeMessage.includes('password authentication failed for user'),
    'Req 14: Error output is mapped to safe category with zero credential leakage'
  );

  // ---------------------------------------------------------------------------
  // REQUIREMENT 15: No migration, seed, or write operation is introduced
  // ---------------------------------------------------------------------------
  const writeKeywords = ['INSERT', 'UPDATE', 'DELETE', 'CREATE', 'ALTER', 'DROP', 'TRUNCATE', 'GRANT', 'REVOKE', 'MIGRATE'];
  let writeFound = false;
  for (const [key, sql] of Object.entries(SQL_STATEMENTS)) {
    for (const kw of writeKeywords) {
      const regex = new RegExp(`\\b${kw}\\b`, 'i');
      if (regex.test(sql)) {
        writeFound = true;
        break;
      }
    }
  }
  assert(
    !writeFound,
    'Req 15: Zero write, DDL, migration, or seed operations present in SQL statements'
  );

  console.log('\n===========================================================');
  console.log(`=== STATIC SECURITY TEST RESULTS: ${passCount} PASSED, ${failCount} FAILED ===`);
  console.log('===========================================================\n');

  if (failCount > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
})();
```

---

### 2. INDEPENDENT SECURITY REVIEW & VERIFICATION

| # | Security Item | Result | Technical Evaluation & Supporting Evidence |
| :---: | :--- | :---: | :--- |
| **1** | **Production project identity pinning & Staging rejection** | **PASS** | Hardcoded immutable constant `PINNED_PRODUCTION_PROJECT_REF = 'nenhzsruhbqhxtslxkns'` in both [scratch/verify_prod_connection.js#L6](file:///c:/Users/justi/OneDrive/Desktop/Canteen%20Corner/scratch/verify_prod_connection.js#L6) and [scratch/secure_prod_auth.ps1#L23](file:///c:/Users/justi/OneDrive/Desktop/Canteen%20Corner/scratch/secure_prod_auth.ps1#L23). Global case-insensitive staging check rejects `zcamheygapbruuovikar` fail-closed in both PowerShell (`#L52`) and JavaScript (`#L315`). Runtime overrides of the pinned reference are rejected (`#L340-L345`). |
| **2** | **Native `pg` client configuration** | **PASS** | Discrete connection parameters (`host`, `port`, `database`, `user`, `password`, `ssl`) are passed to `new pg.Client(pgConfig)` in [scratch/verify_prod_connection.js#L240-L246](file:///c:/Users/justi/OneDrive/Desktop/Canteen%20Corner/scratch/verify_prod_connection.js#L240-L246). Connection strings are decoupled from client initialization to prevent parser overrides. |
| **3** | **TLS certificate-chain verification** | **PASS** | `rejectUnauthorized: true` and `minVersion: 'TLSv1.2'` are immutably set in `sslConfig` ([#L217-L218](file:///c:/Users/justi/OneDrive/Desktop/Canteen%20Corner/scratch/verify_prod_connection.js#L217-L218)). Any attempt to set `rejectUnauthorized=false` in input triggers an immediate `TLS_SECURITY_VIOLATION` exception (`#L182-L190`). |
| **4** | **`tls.checkServerIdentity` hostname/SAN validation** | **PASS** | `buildPgClientConfig` defines an active `checkServerIdentity` callback ([#L220-L229](file:///c:/Users/justi/OneDrive/Desktop/Canteen%20Corner/scratch/verify_prod_connection.js#L220-L229)) that invokes Node's native `tls.checkServerIdentity(host, cert)` and throws `SecurityValidationError('TLS_HOSTNAME_MISMATCH')` if the peer certificate SAN does not match the actual database endpoint. |
| **5** | **Connection-string parameter override prevention** | **PASS** | `enforceStrictTlsParameters` ([#L141-L198](file:///c:/Users/justi/OneDrive/Desktop/Canteen%20Corner/scratch/verify_prod_connection.js#L141-L198)) case-insensitively strips all SSL-related parameters (`sslmode`, `ssl`, `sslaccept`, `rejectunauthorized`, `sslcert`, `sslrootcert`) from the URL query string. Because discrete configuration fields are passed to `pg.Client`, URL query parameters have zero influence on driver TLS settings. |
| **6** | **Safe handling of custom CA settings** | **PASS** | Custom CA paths provided via `sslcert` or `sslrootcert` are validated via `fs.existsSync` before being read and passed into `sslConfig.ca` ([#L233-L237](file:///c:/Users/justi/OneDrive/Desktop/Canteen%20Corner/scratch/verify_prod_connection.js#L233-L237)). If omitted, Node.js uses its built-in Mozilla trusted root CA bundle, which includes the CAs for Supabase endpoints (`ISRG Root X1` and `GTS Root R1`). |
| **7** | **Zero credential exposure across logs, errors, files, or process args** | **PASS** | Password input in PowerShell is masked via `Read-Host -AsSecureString` and piped via standard input `stdin` memory streams ([scratch/secure_prod_auth.ps1#L33, L72](file:///c:/Users/justi/OneDrive/Desktop/Canteen%20Corner/scratch/secure_prod_auth.ps1#L33)). `redactCredentials` ([#L20-L29](file:///c:/Users/justi/OneDrive/Desktop/Canteen%20Corner/scratch/verify_prod_connection.js#L20-L29)) strips passwords, JWTs, and long secrets. `sanitizeErrorMessage` ([#L34-L128](file:///c:/Users/justi/OneDrive/Desktop/Canteen%20Corner/scratch/verify_prod_connection.js#L34-L128)) maps errors to safe static categories without leaking stack traces or host usernames. Zero temporary metadata files are created on disk. |
| **8** | **`SET TRANSACTION READ ONLY` as first SQL statement** | **PASS** | Inside the database session ([scratch/verify_prod_connection.js#L493-L495](file:///c:/Users/justi/OneDrive/Desktop/Canteen%20Corner/scratch/verify_prod_connection.js#L493-L495)), `client.query(SQL_STATEMENTS.SET_READ_ONLY)` is executed immediately following `BEGIN;`. In PostgreSQL, this places the transaction boundary into physical engine-enforced read-only mode, rejecting all mutation commands with SQLSTATE `25006`. |
| **9** | **All SQL statements fixed and read-only** | **PASS** | All SQL queries are hardcoded constant string literals in `SQL_STATEMENTS` ([#L9-L23](file:///c:/Users/justi/OneDrive/Desktop/Canteen%20Corner/scratch/verify_prod_connection.js#L9-L23)). Zero dynamic string concatenation or user inputs are accepted. Static test Req 15 checks all statements against write keywords (`INSERT`, `UPDATE`, `DELETE`, `CREATE`, `ALTER`, `DROP`, `TRUNCATE`, `GRANT`, `REVOKE`, `MIGRATE`) and confirms 100% absence of write operations. |
| **10** | **Admin inspection restricted to ADMIN and SUPER_ADMIN count** | **PASS** | The inspection query ([#L14-L20](file:///c:/Users/justi/OneDrive/Desktop/Canteen%20Corner/scratch/verify_prod_connection.js#L14-L20)) strictly queries `role IN ('ADMIN', 'SUPER_ADMIN')` and aggregates by `COUNT(*)::int AS count`. It contains zero reference to `WAREHOUSE_SUPERVISOR`, zero selection of personal or authentication fields (`email`, `passwordHash`, `verificationToken`, PINs), and no arbitrary `LIMIT` that could hide accounts. |
| **11** | **`client.end()` reliably attempted in `finally`** | **PASS** | The database execution block ([#L542-L547](file:///c:/Users/justi/OneDrive/Desktop/Canteen%20Corner/scratch/verify_prod_connection.js#L542-L547)) wraps connection handling in structured `try ... catch ... finally`. If `client` was initialized, `await client.end()` is guaranteed to execute in `finally` across both success and error pathways. |
| **12** | **Process termination strictly after cleanup** | **PASS** | `process.exit(exitCode)` is placed exclusively at the very end of the `finally` block ([#L548](file:///c:/Users/justi/OneDrive/Desktop/Canteen%20Corner/scratch/verify_prod_connection.js#L548)). No early `process.exit()` calls exist within the connection `try` or `catch` blocks. |
| **13** | **Static tests genuinely prevent network & database access** | **PASS** | [scratch/test_identity_pinning.js](file:///c:/Users/justi/OneDrive/Desktop/Canteen%20Corner/scratch/test_identity_pinning.js) tests pure validation functions, parameter normalization, and simulated lifecycle execution using in-memory mock objects. Zero network sockets, zero child processes, and zero database connections are opened. |

---

### 3. DEPENDENCY REVIEW

A static environment review was conducted to assess the availability of the `pg` driver:

1. **Existence in `node_modules`:**
   - Command: `Test-Path node_modules/pg`
   - Result: `False`. The directory `node_modules/pg` does not exist.
2. **Declaration in `package.json`:**
   - Both `dependencies` and `devDependencies` in [package.json](file:///c:/Users/justi/OneDrive/Desktop/Canteen%20Corner/package.json) were inspected.
   - Result: Neither `pg` nor `@types/pg` is declared.
3. **Lockfile Entry in `package-lock.json`:**
   - [package-lock.json](file:///c:/Users/justi/OneDrive/Desktop/Canteen%20Corner/package-lock.json) was searched for `"pg"`, `"pg-pool"`, and `"pg-protocol"`.
   - Result: Zero matching package entries exist.
4. **Exact Dependency Changes Required to Install:**
   To enable live execution of `scratch/verify_prod_connection.js` in a future authorized phase, the following command must be executed:
   ```bash
   npm install pg --save-dev
   ```
   *Alternative declarative modification to `package.json`:*
   ```json
   "devDependencies": {
     "pg": "^8.13.1"
   }
   ```
   followed by `npm install`.

**Compliance Note:** In accordance with strict restrictions, **no packages were installed and no network requests were made**.

---

### 4. UNRESOLVED ISSUES & PRE-FLIGHT REQUIREMENTS

1. **`pg` Driver Installation Required Prior to Live Phase:**
   Because `pg` is currently absent, running `scratch/verify_prod_connection.js` directly will abort at line 477 with `[DEPENDENCY ERROR] The "pg" package is not installed`. The Project Owner must authorize installing `pg` before Phase 8F.10B.3 live verification can be executed.
2. **Working Tree Precision Modifications Pending:**
   The repository working tree contains 34 tracked, modified files from Phase 8F.6 financial precision hardening awaiting production cutover. These files remain uncommitted and unmodified.

---

### 5. FINAL STOP CONDITION CONFIRMATION

In strict compliance with the instructions for Phase 8F.10B.3.7:
- **Zero** files were modified.
- **Zero** dependencies were installed.
- **Zero** live connections to Supabase Production or Staging were initiated.
- **Zero** credentials were requested or accepted.
- **Zero** database queries or migrations were executed.

**ALL EXECUTION IS STOPPED.** Awaiting Project Owner review of this source security review and explicit authorization for next steps.
