# CANTEEN CORNER — PHASE 8F.9
# PRODUCTION CUTOVER PREPARATION & CONFIGURATION REVIEW REPORT

**Document Version:** 1.0.0  
**Audit Date:** 2026-11-17  
**Authorization:** READ-ONLY PREPARATION & REPOSITORY AUDIT  
**Currency Policy:** USD ($) — CONFIRMED & PRESERVED  
**Staging Target:** Dedicated Supabase Staging (`zcamheygapbruuovikar`)  
**Production Target:** `https://canteen-corner.vercel.app/`  
**Lead Auditor:** Lead System Architect & Database Administrator (Antigravity)

---

## 1. EXECUTIVE SUMMARY & PREPARATION STATUS

### Final Preparation Status: **`PREPARATION COMPLETE WITH FINDINGS`**

Phase 8F.9 conducted a comprehensive, strictly read-only preparation review of the local codebase, database migration pipeline, payment provider configurations, and Vercel deployment prerequisites in preparation for the authorized production release.

No production environments were accessed, modified, or contacted during this phase. All findings are derived from local repository inspection, staging migration history, and architectural analysis.

### High-Level Preparation Summary:
1. **USD Currency Confirmation:** US Dollar (`USD` / `$`) was audited across the entire application and confirmed to be 100% consistent. No alternate currencies, exchange rate dependencies, or automatic conversions exist.
2. **Migration Pipeline Parity:** The migration sequence (`0_init` followed by `20261117214000_financial_precision_hardening`) is verified. Specific preflight checks are documented to assess whether production already possesses historical baseline tables that require baseline registration (`prisma migrate resolve`) prior to deployment.
3. **Configuration & Secrets Inventory:** All 14 environment variables utilized by Canteen Corner were inventoried and classified by deployment tier (Required, Production-Only, Optional).
4. **Payment Gateway Readiness:** Stripe and PayPal implementations enforce strict HMAC/API signature verification, replay prevention, and idempotency claims. Dashboard configuration requirements are explicitly detailed.
5. **Rollback & Recovery:** A step-by-step production cutover and rollback protocol has been documented.

---

## 2. USD CURRENCY CONSISTENCY VERIFICATION

In accordance with project leadership's explicit confirmation, the application currency is finalized as **US Dollars (`USD` / `$`)**.

### 2.1 Currency Implementation Audit

| Layer / Component | File Location | Implementation Evidence | Consistency Status |
| :--- | :--- | :--- | :---: |
| **Monetary Utility** | `src/lib/money.ts:43` | `toMoneyString(val, includeSymbol = false)` formats strictly with `$`. | **CONFIRMED** |
| **Payment Engine Policy** | `src/lib/payments/confirmation.ts:29` | `if (currency.toUpperCase() !== 'USD') throw new Error(...)` strictly rejects non-USD deposits. | **CONFIRMED** |
| **Stripe Provider** | `src/lib/payments/StripeProvider.ts:33-40` | Amounts calculated in USD with exact 2-decimal precision; fee set to `$3.50`. | **CONFIRMED** |
| **PayPal Provider** | `src/lib/payments/PayPalProvider.ts:70-75` | Transactions configured with `currency_code: 'USD'`. | **CONFIRMED** |
| **Database Schema** | `prisma/schema.postgresql.prisma:165` | `Deposit.currency` defined as `String @default("USD")`. | **CONFIRMED** |
| **Inmate Kiosk UI** | `src/app/inmate/catalog/page.tsx`<br>`src/app/inmate/cart/page.tsx` | All prices, line totals, and balances rendered as `$XX.XX`. | **CONFIRMED** |
| **Family Portal UI** | `src/app/family/page.tsx`<br>`src/app/family/history/page.tsx` | Deposit history and fee breakdowns rendered in `$`. | **CONFIRMED** |
| **Admin & Warehouse** | `src/app/admin/page.tsx`<br>`src/app/warehouse/inventory/page.tsx` | Inmate trust balances and stock values rendered in `$`. | **CONFIRMED** |

### 2.2 Finding & Guidance
- **Result:** Complete USD consistency across UI, API, DTOs, and database schema.
- **Guidance:** No currency modifications or conversions are needed. The codebase remains purely standardized on USD.

---

## 3. PRODUCTION DATABASE MIGRATION PREPARATION

### 3.1 Migration File Analysis

The local migration history in `prisma/migrations/` consists of:

```text
prisma/migrations/
├── 0_init/
│   └── migration.sql (12,780 bytes — 16 tables, 28 indexes, 21 foreign keys)
├── 20261117214000_financial_precision_hardening/
│   └── migration.sql (4,752 bytes — 19 column type changes, 20 CHECK constraints)
└── migration_lock.toml (provider = "postgresql")
```

### 3.2 Production Schema Risks & Preflight Requirements

Because the production database has not yet been inspected in this phase, two potential database states exist for production:

#### Scenario A: Production Database is a Clean Slate (Empty)
- If the production database contains 0 tables and no `_prisma_migrations` table:
  - Running `npx prisma migrate deploy` will cleanly apply `0_init` (creating the 16 tables) and immediately follow with `20261117214000_financial_precision_hardening` (applying Decimal types and CHECK constraints).
  - Risk: **None**.

#### Scenario B: Production Database Already Contains Historical Tables
- If the production database already contains application tables (e.g. from an earlier sync or push):
  - Running `prisma migrate deploy` directly would attempt to execute `0_init`, triggering a `relation "Facility" already exists` fatal error.
  - **Remediation Procedure:** In Scenario B, the baseline must first be marked as applied:
    ```bash
    npx prisma migrate resolve --applied 0_init --schema prisma/schema.postgresql.prisma
    ```
    Once `0_init` is resolved, `prisma migrate deploy` will apply only the pending `20261117214000_financial_precision_hardening` migration.

#### Scenario C: Production Database Contains Existing Rows Violating New Constraints
- If production has existing records:
  - Negative balances (`balance < 0.00`) or non-positive weekly limits (`weeklyLimit <= 0.00`) would cause `ADD CONSTRAINT check_offender_balance_nonnegative` to fail.
  - Zero-dollar debit and credit ledger entries would fail `check_ledger_non_zero_entry`.
- **Preflight Requirement:** Before executing migration deployment, an automated read-only preflight query must check for data anomalies:
  ```sql
  SELECT 'Offender Negative Balance' AS check_name, COUNT(*) FROM "Offender" WHERE "balance" < 0.00
  UNION ALL
  SELECT 'Zero Ledger Entry', COUNT(*) FROM "LedgerEntry" WHERE "debit" <= 0.00 AND "credit" <= 0.00;
  ```

---

## 4. BACKUP & RECOVERY PLAN

Prior to applying any DDL migrations or cutover actions to production, a rigorous recovery plan must be executed.

### 4.1 Required Production Backup Mechanisms

1. **Supabase Point-in-Time Recovery (PITR):**
   - *Requirement:* Verify in the Supabase Production Dashboard (`Database -> Backups`) whether automated daily backups or PITR is active.
2. **Explicit Pre-Cutover Logical Snapshot (`pg_dump`):**
   - *Requirement:* Regardless of automated dashboard backups, a direct logical database dump must be generated immediately before migration:
     ```bash
     pg_dump --clean --if-exists --no-owner --no-privileges \
       -d "$PRODUCTION_DIRECT_URL" \
       -F c -f "production_pre_cutover_backup_$(date +%Y%m%d_%H%M%S).dump"
     ```
   - *Validation:* Confirm dump file is non-empty and contains valid PostgreSQL catalog tables.

### 4.2 Rollback Limitations & Recovery Strategy

- **Automated DDL Rollback:** In PostgreSQL, DDL executed within a single migration script runs inside a transaction block (`BEGIN ... COMMIT`). If any statement or constraint fails, PostgreSQL aborts and rolls back the entire migration cleanly.
- **Manual Reverse Migration Script:** If an issue is discovered after successful deployment, a tested reversal script is preserved:
  - Converts all 19 columns back to `DOUBLE PRECISION`.
  - Drops the 20 financial `CHECK` constraints.
- **Disaster Recovery:** If catastrophic schema corruption occurs, restore from the pre-cutover `.dump` file via `pg_restore`.

---

## 5. VERCEL CONFIGURATION REVIEW & ENVIRONMENT INVENTORY

Inspection of the source code identified all environment variables required by the application, categorized by deployment tier:

| Variable Name | Classification | Purpose | Expected Production Value / Format |
| :--- | :---: | :--- | :--- |
| `DATABASE_URL` | **Required (Production)** | PostgreSQL connection string for Prisma queries (pooled) | `postgres://postgres.[ref]:[pass]@aws-0-[region].pooler.supabase.com:6543/postgres?pgbouncer=true` |
| `DIRECT_URL` | **Required (Production)** | Direct PostgreSQL connection for DDL migrations & session client | `postgres://postgres.[ref]:[pass]@aws-0-[region].pooler.supabase.com:5432/postgres` |
| `JWT_SECRET` | **Required (Production)** | Secret key for signing/verifying session cookies (`canteen_session`) | 64-character high-entropy cryptographic hex string |
| `NEXT_PUBLIC_SUPABASE_URL` | **Required (Production)** | Public Supabase project API gateway | `https://[prod-ref].supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **Required (Production)** | Public anon key for browser client | Standard Supabase JWT anon token |
| `SUPABASE_SERVICE_ROLE_KEY` | **Required (Production)** | Privileged key for server-side deposit confirmation RPCs | Standard Supabase service role secret |
| `SUPABASE_URL` | **Optional (Production)** | Backend URL for Supabase admin client | Defaults to `NEXT_PUBLIC_SUPABASE_URL` if omitted |
| `STRIPE_SECRET_KEY` | **Required (Production)** | Live Stripe API secret key for payment intent creation | `sk_live_...` (Live key; test keys prohibited) |
| `STRIPE_WEBHOOK_SECRET` | **Required (Production)** | Live Stripe webhook signing secret for HMAC verification | `whsec_...` from Stripe dashboard endpoint |
| `PAYPAL_CLIENT_ID` | **Required (Production)** | Live PayPal REST API Client ID | Live PayPal Developer app client ID |
| `PAYPAL_CLIENT_SECRET` | **Required (Production)** | Live PayPal REST API Secret | Live PayPal Developer app secret |
| `PAYPAL_WEBHOOK_ID` | **Required (Production)** | Live PayPal Webhook ID for signature verification | Webhook ID from PayPal dashboard |
| `PAYPAL_ENVIRONMENT` | **Required (Production)** | Specifies PayPal environment mode | `'production'` |
| `NODE_ENV` | **Framework Managed** | Next.js environment optimization | Automatically injected as `'production'` by Vercel |

---

## 6. PAYMENT PROVIDER READINESS

### 6.1 Stripe Integration Readiness
- **Currency:** Explicitly set to `USD`.
- **Fee Calculation:** `$3.50` flat processing fee applied cleanly.
- **Webhook Endpoint:** `/api/payments/stripe/webhook` (Dynamic route segment).
- **Signature Security:** Validates `stripe-signature` header using HMAC-SHA256 with 5-minute replay tolerance window.
- **Idempotency:** Atomic claim `UPDATE "Deposit" SET status = 'SUCCEEDED' WHERE status = 'PENDING'` ensures single-credit execution.
- **Dashboard Configuration Checklist:**
  - [ ] Add endpoint: `https://canteen-corner.vercel.app/api/payments/stripe/webhook`.
  - [ ] Select events: `payment_intent.succeeded` and `checkout.session.completed`.
  - [ ] Copy signing secret to Vercel as `STRIPE_WEBHOOK_SECRET`.

### 6.2 PayPal Integration Readiness
- **Currency:** Configured for `USD`.
- **Signature Security:** Live production strictly calls PayPal's official API `POST /v1/notifications/verify-webhook-signature`; mock/test signatures are strictly blocked in production.
- **Replay Protection:** Unique `transmission-id` and provider reference status tracking.
- **Dashboard Configuration Checklist:**
  - [ ] Create Webhook in PayPal Developer Dashboard: `https://canteen-corner.vercel.app/api/payments/paypal/webhook`.
  - [ ] Select event: `Payment capture completed` (`PAYMENT.CAPTURE.COMPLETED`).
  - [ ] Set `PAYPAL_ENVIRONMENT=production` in Vercel.
  - [ ] Copy Webhook ID to Vercel as `PAYPAL_WEBHOOK_ID`.

---

## 7. DOCUMENTED DEPLOYMENT & ROLLBACK PROCEDURE

When production deployment is formally authorized, execution must strictly follow this 10-step sequence:

```mermaid
sequenceDiagram
    autonumber
    actor Admin as Authorized Operator
    participant Stage as Staging Check
    participant ProdDB as Production Supabase
    participant Vercel as Vercel Deployment
    
    Admin->>ProdDB: 1. Read-Only Production Preflight (Inspect _prisma_migrations & table counts)
    Admin->>ProdDB: 2. Generate Pre-Cutover Backup (pg_dump / PITR verification)
    Admin->>ProdDB: 3. Migration Compatibility Assessment (Check baseline 0_init status)
    Admin->>ProdDB: 4. Execute Migration (prisma migrate deploy)
    Admin->>ProdDB: 5. Post-Migration Verification (Check columns & 20 CHECK constraints)
    Admin->>Vercel: 6. Verify Production Environment Variables (Secrets & Webhooks)
    Admin->>Vercel: 7. Deploy Application Build (Git push to main / Vercel trigger)
    Admin->>Vercel: 8. Execute Production Smoke Tests (Auth, Kiosk, Family, Warehouse)
    Admin->>Admin: 9. Post-Deployment Monitoring Window (Error rates & logs)
    Admin->>Admin: 10. Official Release Sign-Off
```

### 7.1 Detailed Step-by-Step Procedure

1. **Step 1: Production Access Authorization**
   - Obtain explicit authorization from project leadership to connect to production.
2. **Step 2: Production Database Read-Only Preflight**
   - Connect safely via read-only engine. Query PostgreSQL version, database identity, and existing tables.
3. **Step 3: Backup & Recovery Confirmation**
   - Capture pre-cutover logical dump `pg_dump` and store securely.
4. **Step 4: Migration Compatibility Review**
   - If tables already exist without `_prisma_migrations`, run `prisma migrate resolve --applied 0_init`.
   - Run anomaly pre-check to confirm zero existing records violate proposed CHECK constraints.
5. **Step 5: Execute Migration Deployment**
   - Execute:
     ```bash
     npx prisma migrate deploy --schema prisma/schema.postgresql.prisma
     ```
6. **Step 6: Post-Migration Schema Verification**
   - Verify all 19 columns are `numeric(12, 2)`.
   - Verify all 20 CHECK constraints report `convalidated = true`.
   - Verify `prisma migrate status` reports up to date.
7. **Step 7: Vercel Production Environment Verification**
   - Confirm all 14 environment variables are populated with live production secrets.
8. **Step 8: Deploy Production Build**
   - Deploy build to `canteen-corner.vercel.app`.
9. **Step 9: Production Smoke Testing**
   - Verify root landing page loads.
   - Verify admin, inmate kiosk, family, and warehouse login views render.
   - Test non-destructive read queries (catalog, balances).
10. **Step 10: Monitoring & Rollback Decision**
    - Monitor Vercel function invocation logs and Supabase connection pooler metrics for 30 minutes.

---

## 8. REMAINING PRODUCTION RISKS & PRE-FLIGHT BLOCKERS

### Unresolved Blockers Prior to Production Cutover:
1. **Production Database Identity Uninspected:** Production database credentials have not yet been inspected (strictly prohibited in this phase). Preflight inspection must occur immediately upon authorization.
2. **Production Baseline State Unconfirmed:** Whether production requires `prisma migrate resolve --applied 0_init` (Scenario B) or fresh deployment (Scenario A) will be determined during production preflight.
3. **Live Gateway Webhooks Pending Configuration:** Webhook endpoints must be registered in the live Stripe and PayPal dashboards before live payment processing can occur.

---

## 9. EXACT PERMISSIONS NEEDED FOR NEXT PHASE (PHASE 8F.10)

To execute the production cutover in Phase 8F.10, the user must provide explicit authorization for:

1. **Production Database Read-Only Inspection:** Authorization to load production database credentials and inspect catalog tables.
2. **Production Backup Capture:** Authorization to generate a `pg_dump` backup file.
3. **Production Migration Execution:** Authorization to execute `prisma migrate deploy` on production Supabase.
4. **Production Smoke Testing:** Authorization to access `https://canteen-corner.vercel.app/` for post-deploy verification.
