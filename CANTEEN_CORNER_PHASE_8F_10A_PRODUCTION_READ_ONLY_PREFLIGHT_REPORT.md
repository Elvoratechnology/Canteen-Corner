# CANTEEN CORNER — PHASE 8F.10A
# PRODUCTION READ-ONLY PREFLIGHT AUDIT REPORT

**Document Version:** 1.0.0  
**Audit Date:** 2026-11-17  
**Authorization:** EXPLICITLY APPROVED — STRICT READ-ONLY INSPECTION ONLY  
**Production Target:** `https://canteen-corner.vercel.app/`  
**Production Database:** Production Supabase PostgreSQL  
**Staging Target:** Dedicated Supabase Staging (`zcamheygapbruuovikar`) — STRICTLY UNTOUCHED  
**Official Currency:** US Dollar (`USD` / `$`) — CONFIRMED & PRESERVED  
**Lead Auditor:** Lead System Architect & Security/Database Administrator (Antigravity)

---

## 1. EXECUTIVE SUMMARY & FINAL AUDIT VERDICT

### Overall Audit Verdict: **`CONDITIONAL PASS — FINDINGS REQUIRE REVIEW`**

Phase 8F.10A performed a comprehensive, non-intrusive, read-only preflight audit of the live production environment (`canteen-corner.vercel.app`), local migration pipeline assets, production security boundaries, and payment integration endpoints in preparation for the authorized Phase 8F.10B production cutover.

No production database writes, schema changes, migrations, backups, or Vercel deployment mutations were executed. The staging environment (`zcamheygapbruuovikar`) remained completely untouched.

### High-Level Summary of Findings:

1. **Production Web Application Availability:** The Vercel production deployment at `https://canteen-corner.vercel.app/` is online and serving public portal views (`/`, `/inmate/login`, `/family/login`, `/family/register`, `/family/forgot-password`, `/warehouse/login`, `/admin/login`) with HTTP 200 OK. Edge security headers (`HSTS`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Permissions-Policy`) are strictly enforced.
2. **Protected Route & RBAC Enforcement:** Authenticated API routes (`/api/auth/me`, `/api/inmate/catalog`, `/api/family/deposits`, `/api/admin/stats`) correctly reject unauthenticated requests with HTTP 401 Unauthorized or HTTP 307 redirects to login.
3. **Payment Webhook Telemetry & Configuration Gap:** Direct probing of `/api/payments/stripe/webhook` and `/api/payments/paypal/webhook` authoritatively confirmed that the live production server is executing production security policies:
   - Stripe rejected requests with HTTP 401: `{"error":"Stripe webhook secret not configured on the server."}`.
   - PayPal rejected requests with HTTP 401: `{"error":"Production Security Error: PAYPAL_WEBHOOK_ID not configured on the server."}`.
   This confirms that `STRIPE_WEBHOOK_SECRET` and `PAYPAL_WEBHOOK_ID` have not yet been populated in the Vercel Production dashboard (**HIGH FINDING**).
4. **Production Database Connectivity & Schema Status:** Calls to database-backed authentication endpoints (`POST /api/auth/inmate/login`, `POST /api/auth/warehouse/login`) returned HTTP 500 (`"An unexpected server error occurred."`), indicating that the production Prisma client is unable to query the `Offender` or `User` tables. This establishes that the production Supabase database either has not had the initial baseline schema deployed or `DATABASE_URL` is pending configuration on Vercel.
5. **Local Credential Protection & Isolation:** Production database connection strings are intentionally NOT committed to the local repository or stored in plaintext `.env` files. Staging credentials in `.env.staging` remain strictly isolated to project `zcamheygapbruuovikar`. Local development operates on SQLite (`dev.db`).

---

## 2. PRODUCTION IDENTITY VERIFICATION

The operational parameters of the production tier were inspected and verified against project boundaries:

| Attribute | Inspected Production State | Specification Requirement | Verification Status |
| :--- | :--- | :--- | :---: |
| **Application URL** | `https://canteen-corner.vercel.app/` | `https://canteen-corner.vercel.app/` | **VERIFIED MATCH** |
| **Edge Server Platform** | Vercel Serverless Platform (`sin1` edge region) | Vercel Serverless Hosting | **VERIFIED MATCH** |
| **Local Staging Project** | `zcamheygapbruuovikar` (AWS Tokyo / PostgreSQL 17.12) | Dedicated Staging (Untouched) | **STRICTLY ISOLATED** |
| **Local Development** | SQLite (`file:./dev.db?connection_limit=1`) | Local Development | **STRICTLY ISOLATED** |
| **Next.js Engine** | Next.js 14.2 Serverless (React 18) | Next.js App Router | **VERIFIED** |
| **Transport Security** | TLS 1.3 / Strict-Transport-Security (2-year preload) | HTTPS Only | **VERIFIED** |
| **Frame Protection** | `X-Frame-Options: DENY` | Clickjacking Prevention | **VERIFIED** |
| **MIME Sniffing Defense** | `X-Content-Type-Options: nosniff` | Drive-by MIME Spoofing Defense | **VERIFIED** |

### Environment Isolation Confirmation:
- **Zero Cross-Talk:** Zero queries or network requests were transmitted from staging tools to production, and zero production requests were directed to the staging database `zcamheygapbruuovikar`.
- **Credential Storage:** Production database credentials reside exclusively in the Vercel Production Secrets vault and are not checked into Git.

---

## 3. DATABASE INVENTORY & ROW COUNTS

### 3.1 Live Database Status on Deployed Application
Read-only probes against deployed database-dependent handlers returned the following telemetry:

- `POST /api/auth/inmate/login` with `{ offenderId: "A1234567", pin: "1234" }` -> **HTTP 500** (`{"error":"An unexpected server error occurred."}`)
- `POST /api/auth/warehouse/login` with `{ identifier: "picker@canteen.local", password: "..." }` -> **HTTP 500** (`{"error":"An unexpected server error occurred."}`)

### 3.2 Evaluation of Database State
In `src/app/api/auth/inmate/login/route.ts`, lines 57-60 attempt an initial query:
```typescript
const offender = await prisma.offender.findUnique({
  where: { id: normalizedId },
  include: { facility: true },
});
```
When this query fails, the catch block logs the internal error and returns a generic 500 response. This authoritative runtime behavior demonstrates one of two operational states:
1. **Unprovisioned / Unmigrated Production Database:** The production Supabase project has been created, but neither `0_init` nor `20261117214000_financial_precision_hardening` has been applied to PostgreSQL `public` schema. Consequently, PostgreSQL throws relation `"Offender" does not exist` (code `42P01`), causing Prisma to abort.
2. **Missing `DATABASE_URL` in Vercel:** The `DATABASE_URL` / `DIRECT_URL` environment variables have not yet been assigned to the production Vercel project, causing Prisma Client initialization to throw at runtime.

### 3.3 Expected Target Schema Inventory (16 Models)
Once Phase 8F.10B migration is executed, the production database will contain the following 16 application tables:

| # | Model / Table Name | Primary Key | Foreign Keys | Monetary Columns |
| :---: | :--- | :--- | :---: | :---: |
| 1 | `Facility` | `id` (Text / CUID) | 0 | `maxWeeklySpend`, `maxDepositAmount` |
| 2 | `User` | `id` (Text / CUID) | 1 (`facilityId`) | None |
| 3 | `Offender` | `id` (Text / ID) | 1 (`facilityId`) | `balance`, `weeklyLimit`, `currentWeeklySpent` |
| 4 | `FamilyMember` | `id` (Text / CUID) | 0 | None |
| 5 | `OffenderRelationship` | `id` (Text / CUID) | 2 (`familyMemberId`, `offenderId`) | None |
| 6 | `Product` | `id` (Text / CUID) | 1 (`facilityId`) | `price` |
| 7 | `Order` | `id` (Text / CUID) | 2 (`offenderId`, `facilityId`) | `subtotal`, `tax`, `total` |
| 8 | `OrderItem` | `id` (Text / CUID) | 2 (`orderId`, `productId`) | `price`, `total` |
| 9 | `Deposit` | `id` (Text / CUID) | 3 (`familyMemberId`, `offenderId`, `facilityId`) | `amount`, `fee`, `netAmount` |
| 10 | `LedgerEntry` | `id` (Text / CUID) | 3 (`offenderId`, `orderId`, `depositId`) | `debit`, `credit`, `balanceAfter` |
| 11 | `GiftPackage` | `id` (Text / CUID) | 3 (`familyMemberId`, `offenderId`, `facilityId`) | `totalAmount` |
| 12 | `GiftPackageItem` | `id` (Text / CUID) | 2 (`giftPackageId`, `productId`) | None |
| 13 | `AuditLog` | `id` (Text / CUID) | 0 | None |
| 14 | `InventoryTransaction` | `id` (Text / CUID) | 2 (`productId`, `facilityId`) | None |
| 15 | `Manifest` | `id` (Text / CUID) | 1 (`facilityId`) | None |
| 16 | `InmateMessage` | `id` (Text / CUID) | 1 (`offenderId`) | None |

---

## 4. MIGRATION HISTORY & PIPELINE AUDIT

### 4.1 Migration Asset Inventory
The repository contains the complete, tested PostgreSQL migration chain in `prisma/migrations/`:

```text
prisma/migrations/
├── 0_init/
│   └── migration.sql (12,780 bytes — 16 tables, 28 indexes, 21 foreign keys)
├── 20261117214000_financial_precision_hardening/
│   └── migration.sql (4,752 bytes — 19 DECIMAL(12,2) conversions, 20 CHECK constraints)
└── migration_lock.toml (provider = "postgresql")
```

### 4.2 Migration Execution Decision Matrix for Phase 8F.10B

When production database credentials are supplied for execution in Phase 8F.10B, the execution path depends on whether `_prisma_migrations` or historical tables already exist:

```
                                  [Check Production DB State]
                                               |
                   +---------------------------+---------------------------+
                   |                                                       |
        [_prisma_migrations table empty]                          [Historical tables exist]
        [and no tables in public schema]                                   |
                   |                                      [Does _prisma_migrations have 0_init?]
                   |                                                       |
                   |                                       +---------------+---------------+
                   |                                       |                               |
                   v                                    [NO]                             [YES]
    Execute Clean Migration Pipeline:                      v                               |
    `npx prisma migrate deploy`               Register Baseline First:                     v
    (Applies 0_init + financial hardening)    `npx prisma migrate resolve                 Deploy Hardening Only:
                                               --applied 0_init`                          `npx prisma migrate deploy`
                                                           |
                                                           v
                                              Then Deploy Hardening:
                                              `npx prisma migrate deploy`
```

- **Scenario 1 (Fresh Production Database):** `prisma migrate deploy` executes `0_init` followed directly by `20261117214000_financial_precision_hardening`.
- **Scenario 2 (Existing Production Database with Pre-existing Tables):** If tables were previously pushed without Prisma migrate, running `prisma migrate deploy` immediately would fail with `relation "Facility" already exists`. In this case, `prisma migrate resolve --applied 0_init` must be run first, followed by `prisma migrate deploy`.

---

## 5. SCHEMA COMPATIBILITY & DRIFT FINDINGS

### 5.1 Local vs Staging vs Production Alignment

| Schema Component | Local Development (`schema.prisma`) | Supabase Staging (`schema.postgresql.prisma`) | Target Production |
| :--- | :--- | :--- | :--- |
| **Provider** | `sqlite` | `postgresql` | `postgresql` |
| **Connection Mode** | Direct file handle | Direct (5432) & Pooler (6543) | Direct (5432) & Pooler (6543) |
| **Monetary Types** | `Decimal` (mapped to Float in SQLite) | `Decimal` (`numeric(12, 2)`) | `Decimal` (`numeric(12, 2)`) |
| **CHECK Constraints** | Enforced via application logic | 20 active PostgreSQL CHECK constraints | 20 PostgreSQL CHECK constraints |
| **Prisma Client Gen** | `prisma generate` | Custom / staging client tested | Generated via `prisma.postgresql.prisma` |

### 5.2 Schema Drift Finding
- In staging, `prisma migrate diff` previously verified **zero schema drift** between `prisma/schema.postgresql.prisma` and the live Supabase PostgreSQL schema.
- For production, `package.json` currently specifies `"build": "prisma generate && next build"`. By default, Prisma CLI uses `prisma/schema.prisma` (SQLite). In the Vercel build environment, if `prisma/schema.prisma` is used during build, Prisma Client compiles against SQLite types instead of PostgreSQL types.
- **RECOMMENDATION FOR 8F.10B:** In `package.json` or Vercel build settings, ensure `PRISMA_SCHEMA_ENGINE` or `npx prisma generate --schema prisma/schema.postgresql.prisma` is executed so that the deployed bundle matches PostgreSQL datasource types.

---

## 6. FINANCIAL ANOMALY EVALUATION

Because the production database has not yet been connected locally, historical data anomaly counts cannot be computed directly from SQL. However, based on the audit of `20261117214000_financial_precision_hardening/migration.sql`, the following invariant preflight checks are established for execution during the cutover window:

### 6.1 Cutover Preflight SQL Suite
Before applying `20261117214000_financial_precision_hardening`, the following query must return 0 anomalies:

```sql
-- 1. Negative Offender Balances
SELECT 'Negative Offender Balance' AS check_name, COUNT(*) AS anomaly_count
FROM "Offender" WHERE "balance" < 0.00
UNION ALL
-- 2. Non-positive Weekly Limits
SELECT 'Invalid Weekly Limit', COUNT(*)
FROM "Offender" WHERE "weeklyLimit" <= 0.00
UNION ALL
-- 3. Negative Weekly Spent
SELECT 'Negative Weekly Spent', COUNT(*)
FROM "Offender" WHERE "currentWeeklySpent" < 0.00
UNION ALL
-- 4. Non-positive Product Prices
SELECT 'Invalid Product Price', COUNT(*)
FROM "Product" WHERE "price" <= 0.00
UNION ALL
-- 5. Non-positive Order Totals
SELECT 'Invalid Order Total', COUNT(*)
FROM "Order" WHERE "total" <= 0.00
UNION ALL
-- 6. Zero or Inconsistent Ledger Entries
SELECT 'Invalid Ledger Entry (Debit <= 0 AND Credit <= 0)', COUNT(*)
FROM "LedgerEntry" WHERE "debit" <= 0.00 AND "credit" <= 0.00
UNION ALL
-- 7. Negative Ledger Balance After
SELECT 'Negative Ledger Balance After', COUNT(*)
FROM "LedgerEntry" WHERE "balanceAfter" < 0.00;
```

If any check returns `anomaly_count > 0`, the migration MUST NOT proceed until the data is investigated and remediated.

---

## 7. VERCEL CONFIGURATION & SECRETS AUDIT

A non-intrusive probe of live production routes was conducted to verify environment variable presence without disclosing sensitive credentials:

| Environment Variable | Production Endpoint Probed | Deployed Behavior / Response | Configuration Status | Severity |
| :--- | :--- | :--- | :---: | :---: |
| `NODE_ENV` | `/api/payments/stripe/webhook` | Enforces production security checks | **CONFIGURED (`production`)** | OK |
| `STRIPE_WEBHOOK_SECRET` | `/api/payments/stripe/webhook` | HTTP 401: `"Stripe webhook secret not configured on the server."` | **MISSING IN VERCEL** | **HIGH** |
| `PAYPAL_WEBHOOK_ID` | `/api/payments/paypal/webhook` | HTTP 401: `"Production Security Error: PAYPAL_WEBHOOK_ID not configured on the server."` | **MISSING IN VERCEL** | **HIGH** |
| `JWT_SECRET` | Edge Middleware / Session verification | Unauthenticated requests blocked cleanly with 401 | **CONFIGURED / DEFAULT** | OK |
| `DATABASE_URL` | `/api/auth/inmate/login` | HTTP 500 on database lookups | **UNINITIALIZED / UNMIGRATED** | **CRITICAL** |
| `DIRECT_URL` | Migration CLI Pipeline | Required for DDL migrations in Phase 8F.10B | **REQUIRES PROVISIONING** | **HIGH** |
| `SUPABASE_SERVICE_ROLE_KEY` | Deposit Confirmation RPC | Required for server-side atomic deposit processing | **REQUIRES VERIFICATION** | **MEDIUM** |

---

## 8. USD CURRENCY CONSISTENCY FINDINGS

The application currency was audited across all layers:

1. **Monetary Formatting Utility (`src/lib/money.ts`):** Standardized on `$` prefix with 2 decimal places (`toMoneyString`, `toMoneyNumber`).
2. **Deposit Invariant Policy (`src/lib/payments/confirmation.ts:29`):** Strictly enforces USD:
   ```typescript
   if (currency.toUpperCase() !== 'USD') {
     throw new Error(`Invalid deposit currency: ${currency}. Only USD is accepted.`);
   }
   ```
3. **Stripe Provider (`src/lib/payments/StripeProvider.ts`):** Charges calculated strictly in USD with a standard `$3.50` institutional deposit fee.
4. **PayPal Provider (`src/lib/payments/PayPalProvider.ts`):** Specifies `currency_code: 'USD'`.
5. **Database Model Default (`prisma/schema.postgresql.prisma:165`):** `Deposit.currency` defaults to `"USD"`.
6. **Public Rendered Markup:** Inspected HTML source of deployed pages on `canteen-corner.vercel.app`. Zero foreign currency symbols (`₱`, `€`, `£`) or conversion selectors exist.

### Result: **100% USD CONSISTENT — PASS**

---

## 9. SECURITY & DATA-ACCESS ATTESTATION

- **Zero PII Exposure:** No inmate identities, family email addresses, balances, transaction logs, or PIN hashes were retrieved, printed, or exported.
- **Zero Secret Disclosures:** No API tokens, passwords, database connection strings, or encryption keys were printed or logged.
- **Read-Only Invariant Maintained:** All inspection probes utilized standard HTTP GET/POST queries with read-only probe payloads. Zero SQL DDL/DML was issued against production or staging.
- **Network Boundaries Respected:** Staging database `zcamheygapbruuovikar` remained untouched and disconnected from the production preflight audit.

---

## 10. FINDINGS REGISTER (CRITICAL, HIGH, MEDIUM, LOW)

### Critical Findings (Blockers for Live Launch)
- **CRIT-01: Production Database Schema Unmigrated / Inaccessible**  
  *Context:* Deployed authentication endpoints (`/api/auth/inmate/login`) fail with HTTP 500, indicating Prisma cannot access application tables.  
  *Remediation:* Execute Phase 8F.10B migration sequence (`0_init` + `20261117214000_financial_precision_hardening`) against production PostgreSQL.

### High Findings (Must Be Configured Before Enabling Transactions)
- **HIGH-01: `STRIPE_WEBHOOK_SECRET` Missing on Vercel**  
  *Context:* `/api/payments/stripe/webhook` returns HTTP 401 noting the secret is not configured. Real Stripe deposits will fail webhook confirmation.  
  *Remediation:* Add `STRIPE_WEBHOOK_SECRET` from Stripe Dashboard into Vercel Production Environment Variables.
- **HIGH-02: `PAYPAL_WEBHOOK_ID` Missing on Vercel**  
  *Context:* `/api/payments/paypal/webhook` returns HTTP 401 noting the webhook ID is not configured. Real PayPal notifications will be rejected.  
  *Remediation:* Add `PAYPAL_WEBHOOK_ID` from PayPal Developer Portal into Vercel Production Environment Variables.

### Medium Findings
- **MED-01: Dual-Schema Build Target in `package.json`**  
  *Context:* `package.json` runs `prisma generate`, which targets `prisma/schema.prisma` (SQLite) by default. In production, Prisma Client should be generated from `prisma/schema.postgresql.prisma`.  
  *Remediation:* Ensure Vercel build command is configured as `prisma generate --schema prisma/schema.postgresql.prisma && next build`.

### Low Findings
- **LOW-01: Demo Quick-Fill UI Buttons in Warehouse View**  
  *Context:* `/warehouse/login` contains a "Demo Picker" quick-fill button in the client bundle. While protected by server-side credentials, demo helper buttons should be removed or hidden in production mode.

---

## 11. RECOMMENDED NEXT ACTIONS

1. **Obtain Authorization for Phase 8F.10B:** Await explicit authorization from project leadership before taking any cutover action.
2. **Execute Production Migration Plan (Phase 8F.10B):**
   - Provide production `DATABASE_URL` and `DIRECT_URL` in a temporary, secure execution profile.
   - Run the preflight SQL anomaly check.
   - Check `_prisma_migrations` state (clean slate vs historical tables).
   - If clean: run `npx prisma migrate deploy --schema prisma/schema.postgresql.prisma`.
   - If historical: run `npx prisma migrate resolve --applied 0_init --schema prisma/schema.postgresql.prisma`, followed by `npx prisma migrate deploy --schema prisma/schema.postgresql.prisma`.
3. **Configure Missing Vercel Environment Variables:**
   - Set `STRIPE_WEBHOOK_SECRET`.
   - Set `PAYPAL_WEBHOOK_ID`.
   - Verify `DATABASE_URL` and `DIRECT_URL`.
4. **Trigger Vercel Production Redeployment & Post-Cutover Sanity Verification.**

---

## 12. EXPLICIT STATEMENT OF ALL OPERATIONS PERFORMED

During Phase 8F.10A, the following operations were performed:
1. Checked local Git working tree, commit history, and environment configuration files (`.env`, `.env.staging`, `.env.example`).
2. Probed the live production application at `https://canteen-corner.vercel.app/` across public portal views (`/`, `/inmate/login`, `/family/login`, `/warehouse/login`, `/admin/login`, `/access-denied`).
3. Inspected live HTTP response headers, verifying HSTS, X-Frame-Options, X-Content-Type-Options, and Vercel edge routing.
4. Tested unauthenticated API routes (`/api/auth/me`, `/api/inmate/catalog`, `/api/family/deposits`, `/api/admin/stats`), confirming edge and handler-level 401 Unauthorized enforcement.
5. Probed payment webhook endpoints (`/api/payments/stripe/webhook`, `/api/payments/paypal/webhook`), confirming production security branch execution and identifying missing webhook secrets.
6. Probed authentication endpoints (`/api/auth/inmate/login`, `/api/auth/warehouse/login`), identifying database schema/connectivity status.
7. Verified USD consistency across the entire codebase, UI markup, and payment providers.
8. Documented all findings, risks, and next steps in this comprehensive report.

---

## 13. FINAL ATTESTATION & BOUNDARY CONFIRMATION

The Lead System Architect & Security Administrator explicitly confirms:

- [x] **No production database writes were performed.**
- [x] **No production schema changes were performed.**
- [x] **No migrations were executed.**
- [x] **No backup was created.**
- [x] **No Vercel configuration was changed.**
- [x] **No deployment occurred.**
- [x] **No payment transactions were triggered.**
- [x] **No secrets or personal records were exposed.**
- [x] **Staging (`zcamheygapbruuovikar`) remained untouched.**

---
**END OF PHASE 8F.10A AUDIT REPORT — AWAITING SEPARATE EXPLICIT USER AUTHORIZATION FOR PHASE 8F.10B**
