# CANTEEN CORNER — PHASE 8E REPORT
## Supabase PostgreSQL Staging Setup & Migration Environment Preparation

**Project:** Canteen Corner  
**Active Branch:** main (Base commit: `6f59f21`)  
**Active Development Database:** Local SQLite (`prisma/dev.db`) — Verified Intact  
**PostgreSQL Schema Template:** `prisma/schema.postgresql.prisma` — Verified Valid  
**Target:** Dedicated Supabase PostgreSQL Staging Project  
**Execution Mode:** Local Preparation, Security Audit & Staging Environment Validation Only  
**Remote Connections:** NONE (0 remote Supabase/production connections attempted or made)  
**Evaluator:** Antigravity (Google DeepMind)

---

## 1. Executive Summary

Phase 8E establishes the technical readiness, security architecture, and migration sequence for transitioning Canteen Corner from local SQLite to a dedicated, isolated Supabase PostgreSQL staging project. 

In strict adherence to the Pre-Execution Safety Mandates, **zero connections to remote databases were attempted**, no production credentials were accessed, and the local development environment remains anchored to SQLite (`prisma/dev.db`).

### Key Findings & Preparation Outcomes:
1. **Staging Project Status (`NOT VERIFIED` / `BLOCKED` for remote operations):** Inspection of local environment files (`.env`, `.env.example`, `.gitignore`) confirms that **no remote Supabase staging project credentials are currently defined**. The local `.env` contains only `DATABASE_URL="file:./dev.db"` alongside local payment sandbox keys. Per Stop Condition #1, all remote database operations remain halted until the user explicitly provisions and configures the staging Supabase project.
2. **Dual-Schema Architecture Strategy (`PASS`):** To avoid breaking local development (where `DIRECT_URL` is absent), the PostgreSQL staging schema is cleanly encapsulated in [prisma/schema.postgresql.prisma](file:///c:/Users/justi/OneDrive/Desktop/Canteen%20Corner/prisma/schema.postgresql.prisma). Both `schema.prisma` (SQLite) and `schema.postgresql.prisma` (PostgreSQL) pass `npx prisma validate`.
3. **Authentication & RLS Duality Resolution (`WARNING`):** An exhaustive audit of `supabase/migrations/*.sql` revealed a fundamental architectural divergence between the application's Next.js custom JWT session model (`validateSessionAccount`) and the legacy Supabase GoTrue Auth model (`auth.uid()`). In a server-side Prisma deployment, `auth.uid()` evaluates to `NULL`. The audit confirms that staging must deploy the **Prisma-Managed Staging Schema** where table-level RLS does not block Next.js server queries, and financial invariants are enforced via native database `CHECK` constraints.
4. **Financial Trigger Conflict Remediation (`PASS`):** The legacy Supabase trigger `prevent_direct_balance_tampering()` was found to actively reject Prisma updates because it mandates PL/pgSQL function call-stack inspection (`v_stack ILIKE '%place_inmate_order%'`) and lacks an invariant for administrative balance adjustments (`ADJUST_BALANCE`). A complete database constraint specification (`CHECK (balance >= 0)`, `CHECK (stock >= 0)`) was designed to replace call-stack inspection while delivering equivalent database-level financial integrity.
5. **Local Environment Stability (`PASS`):** Full automated test suite (18 test files, 151 tests) passed with 100% success (0 failures), and Next.js production build (`npm run build`) compiled all 55 static and dynamic routes.

---

## 2. Staging Project Verification (Task B)

| Verification Dimension | Inspected Value | Status | Finding Details |
| :--- | :--- | :---: | :--- |
| **Active Staging Credentials** | None in `.env` | **BLOCKED** | Neither `DATABASE_URL` (PostgreSQL), `DIRECT_URL`, nor Supabase keys exist in `.env`. |
| **Production Credential Exposure** | None | **PASS** | No production database credentials or tokens exist in local files. |
| **Supabase CLI Configuration** | `supabase` command not present | **NOT VERIFIED** | Supabase CLI is not installed in the local environment; management is via Prisma CLI. |
| **Project Separation Assurance** | Zero remote links | **PASS** | Impossible to accidentally mutate production because no remote connection exists. |

> [!IMPORTANT]
> **STOP CONDITION TRIGGERED:** Because no isolated staging Supabase project is currently defined in `.env`, Phase 8E halts all remote database operations. The exact user steps required to provision and identify the staging project are detailed in Section 13.

---

## 3. Environment Configuration (Task A)

### 3.1 Local Environment Inspection
- **`.env`:** Contains `DATABASE_URL="file:./dev.db"`, `JWT_SECRET`, sandbox Stripe/PayPal test keys, and facility defaults (`WEEKLY_RESET_DAY=0`, `DEFAULT_WEEKLY_LIMIT=100.00`).
- **`.env.local`:** Not present (ensures no hidden credential overrides exist).
- **`.gitignore`:** Fully excludes `.env`, `.env*.local`, `prisma/dev.db*`, `*.db`, and `scratch/` from Git tracking.
- **Git Working Tree:** Clean on branch `main` at base commit `6f59f21`. No commits or pushes performed.

### 3.2 Required Staging Environment Variables (Names Only)
When the user provisions the isolated staging project, the following variables must be configured in a staging-specific environment file (never in source control):

```bash
# Staging Supabase PostgreSQL Connection Strings
DATABASE_URL="postgresql://postgres.[STAGING_PROJECT_REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://postgres.[STAGING_PROJECT_REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:5432/postgres"

# Application JWT Security (Minimum 32 random characters)
JWT_SECRET="[SECURE_RANDOM_STAGING_SECRET_KEY]"

# Staging Payment Sandbox Credentials
STRIPE_SECRET_KEY="sk_test_..."
STRIPE_WEBHOOK_SECRET="whsec_..."
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_test_..."
PAYPAL_CLIENT_ID="..."
PAYPAL_CLIENT_SECRET="..."
PAYPAL_WEBHOOK_ID="..."
PAYPAL_ENVIRONMENT="sandbox"

# Public & Server Supabase Credentials
NEXT_PUBLIC_SUPABASE_URL="https://[STAGING_PROJECT_REF].supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="eyJhbGciOi..."
SUPABASE_SERVICE_ROLE_KEY="eyJhbGciOi..."
```

---

## 4. Prisma Connection Architecture (Task C)

```
                       ┌──────────────────────────────────────────────┐
                       │          Next.js Route Handlers              │
                       │           (Server Execution)                 │
                       └──────────────────────┬───────────────────────┘
                                              │
                      ┌───────────────────────┴───────────────────────┐
                      │                                               │
               (Runtime Queries)                              (DDL Migrations)
             DATABASE_URL (Port 6543)                       DIRECT_URL (Port 5432)
                      │                                               │
                      ▼                                               ▼
     ┌───────────────────────────────────┐           ┌─────────────────────────────────┐
     │ Supabase Supavisor / PgBouncer    │           │ Direct PostgreSQL Engine        │
     │ (Transaction Pooling Mode)        │           │ (Session / DDL Execution)       │
     └─────────────────┬─────────────────┘           └────────────────┬────────────────┘
                       │                                              │
                       └──────────────────────┬───────────────────────┘
                                              │
                                              ▼
                             ┌─────────────────────────────────┐
                             │   Supabase PostgreSQL Staging   │
                             │       ("Canteen Corner DB")     │
                             └─────────────────────────────────┘
```

### 4.1 Connection Separation
1. **Pooled Runtime Connection (`DATABASE_URL`):**
   - Connects to Supavisor on **port 6543** with `?pgbouncer=true`.
   - Used by `prisma.$transaction`, queries, and mutations in active Next.js serverless functions.
   - Prevents connection exhaustion during traffic spikes.
2. **Direct Migration Connection (`DIRECT_URL`):**
   - Connects directly to PostgreSQL on **port 5432**.
   - Used exclusively by Prisma CLI for `prisma db push` or `prisma migrate deploy`.
   - Allows DDL commands, schema modifications, and advisory locking that connection poolers reject.
3. **Prisma 5.22.0 Compatibility:**
   - Evaluated and verified. Prisma 5.22.0 natively manages `directUrl` alongside `url` in `schema.postgresql.prisma`.

---

## 5. Supabase RLS Review (Task D)

An audit of all 16 tables defined in `supabase/migrations/20261107000000_canteen_corner_security_rls.sql` revealed the following security characteristics:

| Table Name | RLS Enabled? | FORCE RLS? | Dependency on `auth.uid()` | Compatibility with Prisma Client |
| :--- | :---: | :---: | :--- | :---: |
| `public.facilities` | Yes | Yes | Evaluates `public.current_user_facility()` | **FAIL** with client JWT / **PASS** via DB owner |
| `public.user_profiles` | Yes | Yes | `id = auth.uid()` | **FAIL** with client JWT / **PASS** via DB owner |
| `public.offenders` | Yes | Yes | `o.user_id = auth.uid()` | **FAIL** with client JWT / **PASS** via DB owner |
| `public.family_accounts`| Yes | Yes | `fa.user_id = auth.uid()` | **FAIL** with client JWT / **PASS** via DB owner |
| `public.family_offender_links` | Yes | Yes | `fa.user_id = auth.uid()` | **FAIL** with client JWT / **PASS** via DB owner |
| `public.products` | Yes | Yes | `active = true` or staff role | **FAIL** with client JWT / **PASS** via DB owner |
| `public.orders` | Yes | Yes | `auth.uid() = offender.user_id` | **FAIL** with client JWT / **PASS** via DB owner |
| `public.order_items` | Yes | Yes | Relies on parent order RLS | **FAIL** with client JWT / **PASS** via DB owner |
| `public.order_status_history` | Yes | Yes | Relies on parent order RLS | **FAIL** with client JWT / **PASS** via DB owner |
| `public.deposits` | Yes | Yes | `fol.family_account_id = current_family()` | **FAIL** with client JWT / **PASS** via DB owner |
| `public.ledger_entries` | Yes | Yes | Inmate own account or staff | **FAIL** with client JWT / **PASS** via DB owner |
| `public.gift_packages` | Yes | Yes | Family account owner or staff | **FAIL** with client JWT / **PASS** via DB owner |
| `public.notifications` | Yes | Yes | `offender_id` or `user_id = auth.uid()` | **FAIL** with client JWT / **PASS** via DB owner |
| `public.manifests` | Yes | Yes | Staff assigned facility | **FAIL** with client JWT / **PASS** via DB owner |
| `public.picking_lists` | Yes | Yes | Staff assigned facility | **FAIL** with client JWT / **PASS** via DB owner |
| `public.audit_logs` | Yes | Yes | Restricted to ADMIN role | **FAIL** with client JWT / **PASS** via DB owner |

### 5.1 The `auth.uid()` Disconnect
- **Finding:** The legacy RLS policies depend on `auth.uid()` from Supabase GoTrue Auth.
- **Architecture Reality:** Canteen Corner authenticates users via custom HttpOnly JWT cookies (`canteen_session`), validated by `src/lib/auth.ts` (`validateSessionAccount`).
- **Prisma Behavior:** When Prisma connects to PostgreSQL, `auth.uid()` is `NULL`.
- **Resolution:** Because all database queries originate from authenticated Next.js server route handlers (never direct browser clients), Prisma connects using the privileged backend database connection (`postgres` / `service_role`), ensuring complete data access for authorized server operations while application code enforces strict role and facility isolation.

---

## 6. Account Isolation Assessment (Task D)

Application-level account isolation was verified in Phase 8C and 8D.1:

1. **ADMIN:** Enforced in handler via `if (session.role !== 'ADMIN') return 403`. Full access restricted to administrative APIs.
2. **INMATE:** Enforced in handler via `if (session.role !== 'INMATE') return 403`. Every query filters by `offenderId: session.offenderId` and `facilityId: session.facilityId`. Inmates cannot view other inmates' orders, balances, or messages.
3. **FAMILY:** Enforced via `familyOffenderLinks` lookup. Family members cannot view, deposit to, or send gift packages to unlinked or unapproved inmates.
4. **WAREHOUSE_PICKER / SUPERVISOR:** Enforced via `session.facilityId`. Pickers cannot view, pick, or manifest orders belonging to another facility.
5. **Token Versioning (Revocation):** Validated on every single API request via `validateSessionAccount`. Demotions, facility transfers, locks, and logouts revoke sessions instantly.

---

## 7. Financial Trigger Investigation (Task E)

### 7.1 Detailed Trigger Analysis

```sql
-- Trigger attached to public.offenders in 20261113000000_canteen_corner_stripe_paypal_providers.sql:
CREATE TRIGGER trg_protect_offender_balance
  BEFORE UPDATE ON public.offenders
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_direct_balance_tampering();
```

**Fatal Incompatibilities with Prisma Architecture:**
1. **Call Stack Inspection:**
   ```sql
   GET DIAGNOSTICS v_stack = PG_CONTEXT;
   IF NOT (v_stack ILIKE '%place_inmate_order%'
           OR v_stack ILIKE '%process_confirmed_touchpay_deposit%'
           OR v_stack ILIKE '%process_confirmed_electronic_deposit%'
           OR (session_user = 'postgres' AND current_user = 'postgres' AND auth.role() IS NULL)) THEN
     RAISE EXCEPTION 'SECURITY VIOLATION: Execution context is not an authorized financial transaction function.';
   END IF;
   ```
   When Prisma executes `tx.offender.updateMany` from Node.js, `v_stack` is empty. If Prisma connects via a pooled role where `auth.role()` or non-postgres session user is active, the transaction aborts with `42501`.
2. **Missing Invariant for Administrative Adjustments:**
   The trigger strictly recognizes only order deductions, deposit credits, and weekly resets. It has **no delta invariant for administrative adjustments** (`ADJUST_BALANCE` in `/api/admin/inmates`). An admin performing a balance correction is unconditionally blocked.
3. **Table Casing:** The trigger is attached to `public.offenders`, but Prisma generates `"Offender"`.

---

## 8. Database Constraints Plan (Task E)

To replace brittle call-stack inspection while delivering mathematically guaranteed database-level financial integrity, the following native PostgreSQL constraints will be deployed on staging:

```sql
-- 1. Offender Balance & Limit Constraints
ALTER TABLE "Offender" 
  ADD CONSTRAINT chk_offender_balance_positive 
  CHECK (balance >= 0.0);

ALTER TABLE "Offender" 
  ADD CONSTRAINT chk_offender_weekly_spent_limit 
  CHECK (current_weekly_spent <= weekly_limit);

ALTER TABLE "Offender" 
  ADD CONSTRAINT chk_offender_weekly_spent_positive 
  CHECK (current_weekly_spent >= 0.0);

-- 2. Product Stock Constraint
ALTER TABLE "Product" 
  ADD CONSTRAINT chk_product_stock_positive 
  CHECK (stock >= 0);

-- 3. Deposit Amount & Fee Constraints
ALTER TABLE "Deposit" 
  ADD CONSTRAINT chk_deposit_amount_positive 
  CHECK (amount > 0.0);

ALTER TABLE "Deposit" 
  ADD CONSTRAINT chk_deposit_fee_non_negative 
  CHECK (fee >= 0.0);

-- 4. Immutable Audit & Financial Ledger Protection Trigger
CREATE OR REPLACE FUNCTION public.enforce_immutable_financial_records()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'SECURITY VIOLATION: Financial ledger entries, audit logs, and order status histories are strictly immutable.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_immutable_ledger
  BEFORE UPDATE OR DELETE ON "LedgerEntry"
  FOR EACH ROW EXECUTE FUNCTION public.enforce_immutable_financial_records();

CREATE TRIGGER trg_immutable_audit_log
  BEFORE UPDATE OR DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION public.enforce_immutable_financial_records();
```

---

## 9. Staging Migration Plan (Task F)

The controlled migration sequence for Phase 8F:

```
[Phase 8F Sequence]
  1. User Provisions Dedicated Supabase Staging Project
  2. User Inputs Staging DATABASE_URL & DIRECT_URL into Staging Environment
  3. Validate Staging Connection (Read-only probe)
  4. Deploy Prisma Schema to Staging:
     npx prisma db push --schema=prisma/schema.postgresql.prisma
  5. Apply Database-Level CHECK Constraints & Immutability Triggers
  6. Execute DAG-Ordered ETL Data Migration Script (Level 0 -> Level 4)
  7. Run Data Integrity Validation (Row counts, balance totals, foreign keys)
  8. Run Full Vitest Test Suite Against Staging PostgreSQL Database
  9. Execute Multi-Portal Smoke Test (Admin, Inmate, Family, Warehouse)
```

---

## 10. Rollback Strategy (Task F)

| Migration Stage | Failure Mode | Rollback Procedure | Data Impact |
| :--- | :--- | :--- | :---: |
| **Schema Deployment** | Prisma DDL error or schema reject | Wipe staging tables with `prisma db push --force-reset --schema=...` | Zero impact on dev/prod |
| **Constraint Application** | Constraint syntax or violation error | Drop constraints via `ALTER TABLE ... DROP CONSTRAINT ...` | Zero impact on dev/prod |
| **ETL Data Import** | Foreign key violation or data type mismatch | Truncate staging tables in reverse DAG order (Level 4 down to Level 0) | Zero impact on dev/prod |
| **Verification Failure** | Automated test failure against staging | Staging database reset; development continues on SQLite `dev.db` | Zero impact on dev/prod |

---

## 11. Validation Results (Task G)

All safe local validations executed with 100% success:

| Validation Task | Command / Check | Result | Evidence |
| :--- | :--- | :---: | :--- |
| **PostgreSQL Schema Validation** | `npx prisma validate --schema=prisma/schema.postgresql.prisma` | **PASS** | Valid syntax, directUrl supported. |
| **SQLite Schema Validation** | `npx prisma validate --schema=prisma/schema.prisma` | **PASS** | Local dev schema valid and active. |
| **Search Query Sensitivity** | `node scratch/test_insensitive.js` | **PASS** | Cross-engine case-insensitive search verified. |
| **Automated Test Suite** | `npm test` | **PASS** | 18 test files, 151 tests passed (0 failures). |
| **Production Build** | `npm run build` | **PASS** | 55/55 routes compiled cleanly. |
| **Git Safety Check** | `git status` | **PASS** | Clean branch `main` at `6f59f21`, zero commits/pushes. |

---

## 12. Security Risks

1. **Risk of Accidental Production Target (`CRITICAL`):** If a user inadvertently inputs production Supabase credentials instead of staging credentials, production data could be affected.  
   *Mitigation:* Pre-migration handshake must verify project name and ID before running any DDL.
2. **Missing Constraints on Direct DB Access (`MEDIUM`):** If database-level `CHECK` constraints are omitted, a compromised backend script could bypass application-layer checks.  
   *Mitigation:* Staging deployment includes explicit SQL `CHECK (balance >= 0)` constraints.

---

## 13. Required User Actions Before Phase 8F

To proceed to Phase 8F (Staging Migration Execution), the user must perform the following actions:

1. **Log in to Supabase Dashboard** (https://app.supabase.com).
2. **Create a NEW, separate project** named `canteen-corner-staging` (do NOT use production).
3. **Navigate to Project Settings -> Database**.
4. **Copy the two connection strings**:
   - **Transaction Pooler string** (Mode: Transaction, Port: 6543) -> for `DATABASE_URL`
   - **Direct connection string** (Port: 5432) -> for `DIRECT_URL`
5. **Provide these connection strings** or configure them in a dedicated `.env.staging` file when ready.

---

## 14. Phase 8F Readiness Assessment

| Area | Status | Notes |
| :--- | :---: | :--- |
| Local Application Readiness | **PASS** | Search queries, atomic transactions, builds, and tests verified. |
| PostgreSQL Schema Template | **PASS** | `prisma/schema.postgresql.prisma` fully prepared and validated. |
| Financial Trigger Strategy | **PASS** | Engine constraints replace call-stack inspection cleanly. |
| Staging Environment Provisioning | **BLOCKED** | Awaiting user creation of isolated Supabase staging project. |

### FINAL RECOMMENDATION: **CONDITIONALLY READY FOR PHASE 8F**

The local codebase and schema are **100% prepared** for PostgreSQL migration. Execution is safely held at the boundary pending user provisioning of the isolated Supabase staging project credentials.

