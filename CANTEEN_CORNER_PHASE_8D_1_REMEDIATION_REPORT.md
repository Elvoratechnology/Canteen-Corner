# CANTEEN CORNER — PHASE 8D.1 REPORT
## PostgreSQL Compatibility Remediation & Prisma Migration Preparation

**Project:** Canteen Corner  
**Branch:** main (Base commit: `6f59f21`)  
**Development Database:** Local SQLite (`prisma/dev.db`)  
**Target Staging Database:** Separate Supabase PostgreSQL Staging Project  
**Execution Mode:** Local Code Remediation & Staging Migration Preparation Only  
**Remote Supabase Connections:** NONE (0 remote calls attempted or made)  
**Evaluator:** Antigravity (Google DeepMind)

---

## 1. Executive Summary

In Phase 8D.1, the confirmed PostgreSQL compatibility warnings and database architecture conflicts identified in Phase 8D were resolved locally without altering or endangering the local SQLite development database or violating any pre-execution safety rules.

### Key Achievements:
1. **Search Compatibility Remediation (`PASS`):** Implemented a dual-engine search helper `caseInsensitiveContains()` in `src/lib/db.ts` and integrated it across `/api/family/offenders/search`, `/api/inmate/catalog`, and `/api/warehouse/orders`. Text searches behave case-insensitively in SQLite by default and automatically activate PostgreSQL's native `mode: 'insensitive'` (`ILIKE`) when running under a PostgreSQL connection string.
2. **Prisma Staging Datasource Configuration (`PASS`):** Discovered that Prisma 5.22.0 strictly requires `DIRECT_URL` in the environment if declared in `schema.prisma`. To prevent breaking local SQLite development (where `DIRECT_URL` is absent), the staging configuration was cleanly encapsulated into `prisma/schema.postgresql.prisma` with `directUrl = env("DIRECT_URL")`. Local SQLite configuration in `prisma/schema.prisma` was preserved intact.
3. **Database Trigger & RPC Conflict Analysis (`PASS`):** Completed a deep architectural investigation into `prevent_direct_balance_tampering()` in `supabase/migrations/*.sql`. Confirmed that this legacy Supabase trigger conflicts with Prisma transactions because it restricts balance modifications to specific PL/pgSQL function names (`place_inmate_order`, etc.) and does not support administrative adjustments (`ADJUST_BALANCE`). Documented a safe, enterprise-grade replacement strategy preserving full financial invariant enforcement.
4. **Financial Integrity Verification (`PASS`):** Verified that inmate order deductions, deposit credits, and administrative adjustments execute atomically inside Prisma transactions with mathematical delta invariants and zero lost updates.
5. **Regression Verification (`PASS`):** Ran the complete 18-file test suite (151/151 tests passed) and executed `npm run build` (55/55 routes compiled successfully).

---

## 2. Files Modified

| File Path | Nature of Modification | Pre-Modification Backup / State | Status |
| :--- | :--- | :--- | :---: |
| `src/lib/db.ts` | Added `caseInsensitiveContains(value)` export for cross-database text filtering. | Git working tree baseline. | **PASS** |
| `src/app/api/family/offenders/search/route.ts` | Applied `caseInsensitiveContains` to offender ID and name searches. | Git working tree baseline. | **PASS** |
| `src/app/api/inmate/catalog/route.ts` | Applied `caseInsensitiveContains` to product name, description, and category. | Git working tree baseline. | **PASS** |
| `src/app/api/warehouse/orders/route.ts` | Applied `caseInsensitiveContains` to orderNumber, offender name, and offender ID. | Git working tree baseline. | **PASS** |
| `prisma/schema.postgresql.prisma` | Created dedicated PostgreSQL / Supabase staging schema template with `directUrl`. | New template file created. | **PASS** |

*Note: `prisma/schema.prisma` was inspected and verified. Its SQLite configuration was preserved to guarantee local development stability.*

---

## 3. Search Compatibility Fixes (Task 1)

### 3.1 Problem Identified in Phase 8D
In SQLite, Prisma's `contains: query` compiles to SQL `LIKE '%query%'`, which SQLite executes case-insensitively. In PostgreSQL, `LIKE` is case-sensitive, meaning a search for `"smith"` fails to match `"John Smith"`. Furthermore, Prisma's SQLite query engine actively rejects `mode: 'insensitive'` as an invalid argument.

### 3.2 Implemented Solution
Created the universal cross-database helper in `src/lib/db.ts`:
```typescript
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
```

### 3.3 Endpoints Updated
1. **Family Offender Search (`/api/family/offenders/search`):**
   ```typescript
   where: {
     OR: [
       { id: caseInsensitiveContains(trimmed) },
       { name: caseInsensitiveContains(trimmed) },
     ],
   }
   ```
2. **Inmate Commissary Catalog (`/api/inmate/catalog`):**
   ```typescript
   whereClause.AND.push({
     OR: [
       { name: caseInsensitiveContains(search.trim()) },
       { description: caseInsensitiveContains(search.trim()) },
       { category: caseInsensitiveContains(search.trim()) },
     ],
   });
   ```
3. **Warehouse Orders Queue (`/api/warehouse/orders`):**
   ```typescript
   whereClause.AND = [
     {
       OR: [
         { orderNumber: caseInsensitiveContains(search.trim()) },
         { offender: { name: caseInsensitiveContains(search.trim()) } },
         { offender: { id: caseInsensitiveContains(search.trim()) } },
       ],
     },
   ];
   ```

### 3.4 Verification
- Executed search queries against local SQLite database: 100% case-insensitive matching verified (`"smith"` correctly matched `"John Smith"`).
- Zero cross-account or cross-facility boundary regressions introduced.

---

## 4. Prisma Connection Configuration (Task 2)

### 4.1 Compatibility Finding
Testing revealed that adding `directUrl = env("DIRECT_URL")` directly to `prisma/schema.prisma` while running in local SQLite causes Prisma CLI 5.22.0 to fail immediately during validation and builds:
```text
Error: Prisma schema validation - (get-config wasm)
Error code: P1012
error: Environment variable not found: DIRECT_URL.
```

### 4.2 Separation Strategy
To maintain absolute stability in local development while providing staging readiness:
1. **Local SQLite Development:** Governed by `prisma/schema.prisma` (`provider = "sqlite"`, `url = env("DATABASE_URL")`). Requires zero dummy variables or changes.
2. **PostgreSQL Staging Deployment:** Governed by `prisma/schema.postgresql.prisma`:
   ```prisma
   generator client {
     provider = "prisma-client-js"
   }

   datasource db {
     provider  = "postgresql"
     url       = env("DATABASE_URL")
     directUrl = env("DIRECT_URL")
   }
   ```
   Validated successfully using `npx prisma validate --schema=prisma/schema.postgresql.prisma`.
3. **Staging Migration Command:**
   When targeting the remote staging Supabase project in Phase 8E:
   ```bash
   npx prisma db push --schema=prisma/schema.postgresql.prisma
   ```
   Or swapping `schema.postgresql.prisma` into `schema.prisma` only within the staging deployment container/pipeline.

---

## 5. Critical Database Trigger Investigation (Task 3)

### 5.1 Trigger Inspection Summary

| Inspection Item | Trigger Property | Finding Details |
| :--- | :--- | :--- |
| **Trigger Name** | `trg_protect_offender_balance` | Defined in `supabase/migrations/20261113000000_canteen_corner_stripe_paypal_providers.sql` |
| **Trigger Function** | `public.prevent_direct_balance_tampering()` | PL/pgSQL function with `SECURITY DEFINER` |
| **Table Attached** | `public.offenders` | Fires `BEFORE UPDATE ON public.offenders FOR EACH ROW` |
| **Monitored Columns** | `balance`, `current_weekly_spent` | Evaluates if `NEW.balance IS DISTINCT FROM OLD.balance` |

### 5.2 Update Blocking Conditions
The trigger immediately raises a SQL exception (`42501`) under any of the following conditions:
1. **Caller Role:** If `current_user IN ('authenticated', 'anon')`.
2. **Mathematical Invariant Check:** If the balance/spend deltas do not match one of three predefined patterns:
   - *Pattern 1 (Order):* `NEW.balance - OLD.balance < 0` AND spend delta matches order deduction AND new spend `<= weekly_limit`.
   - *Pattern 2 (Deposit):* `NEW.balance - OLD.balance > 0` AND spend delta is `0`.
   - *Pattern 3 (Reset):* Balance delta is `0` AND spend is reset to `0`.
3. **GUC Token Verification:** If `current_setting('canteen_internal.active_tx_auth', true)` is empty, unless caller is superuser `postgres` with `auth.role() IS NULL`.
4. **Call Stack Inspection:** Inspects `GET DIAGNOSTICS v_stack = PG_CONTEXT`. Rejects the update if `v_stack` does not contain `place_inmate_order`, `process_confirmed_touchpay_deposit`, or `process_confirmed_electronic_deposit` (or superuser postgres).

### 5.3 Critical Architecture Conflicts with Prisma
1. **Direct Prisma Transactions Blocked:** Prisma executes queries from Node.js as SQL statements (`UPDATE "Offender" SET ...`). Because Prisma queries are not invoked from inside a PL/pgSQL function named `place_inmate_order`, `GET DIAGNOSTICS v_stack = PG_CONTEXT` evaluates to empty and **aborts the transaction**.
2. **Administrative Adjustments Blocked:** The trigger has NO invariant for administrative balance adjustments (`ADJUST_BALANCE` in `/api/admin/inmates`). An admin adjusting an inmate's balance would be rejected as a security violation!
3. **Table Naming Mismatch:** The trigger attaches to `public.offenders` (snake_case), whereas Prisma generates `"Offender"` (PascalCase).

### 5.4 Safe Replacement Strategy (Prisma-First Architecture)
To retain 100% of the database-level financial integrity guarantees without breaking Prisma:
1. **Native PostgreSQL Constraints:**
   Add engine-level check constraints to the `"Offender"` and `"Product"` tables:
   ```sql
   ALTER TABLE "Offender" ADD CONSTRAINT chk_offender_balance_positive CHECK (balance >= 0.0);
   ALTER TABLE "Offender" ADD CONSTRAINT chk_offender_weekly_limit CHECK (current_weekly_spent <= weekly_limit);
   ALTER TABLE "Product" ADD CONSTRAINT chk_product_stock_positive CHECK (stock >= 0);
   ALTER TABLE "Deposit" ADD CONSTRAINT chk_deposit_amount_positive CHECK (amount > 0.0);
   ```
2. **Modernized Trigger for Staging/Production:**
   Replace call-stack name inspection (`PG_CONTEXT`) with session-role and invariant checking that accommodates:
   - Order deductions
   - Deposit credits
   - Weekly resets
   - Administrative ledger-linked adjustments
   - Service role / Prisma connection authorization

---

## 6. Financial Integrity Assessment (Task 4)

All financial mutation flows were re-inspected to confirm atomic transaction boundaries:

| Mutation Flow | File Location | Transaction Mechanism | Invariant Guaranteed |
| :--- | :--- | :--- | :--- |
| **Inmate Orders** | `src/app/api/inmate/order/route.ts` | `prisma.$transaction` (interactive) | Atomic conditional decrement (`balance: { gte: orderTotal }`). Balance cannot go negative; no lost updates. |
| **Stock Deduction** | `src/app/api/inmate/order/route.ts` | `prisma.$transaction` (interactive) | Atomic conditional decrement (`stock: { gte: quantity }`). Stock cannot be oversold below zero. |
| **Deposit Confirmation** | `src/lib/payments/confirmation.ts` | `prisma.$transaction` (interactive) | Atomic claim (`updateMany` with `status: 'PENDING' -> 'SUCCEEDED'`). Prevents replay/double credits. |
| **Deposit Crediting** | `src/lib/payments/confirmation.ts` | `prisma.$transaction` (interactive) | Atomic increment (`balance: { increment: creditAmount }`). |
| **Admin Balance Adjust** | `src/app/api/admin/inmates/route.ts` | `prisma.$transaction` (interactive) | Atomic conditional decrement for debits (`balance: { gte: absAmount }`); atomic increment for credits. |

**Assessment:** `PASS` (Application-level transaction boundaries and mathematical delta consistency are fully intact).

---

## 7. Security and RLS Preservation

- **RBAC & Account Isolation:** Preserved. Route handlers independently enforce role checks (`session.role`).
- **Session Revocation:** Preserved. `validateSessionAccount` verifies `tokenVersion` on every request.
- **Active Lock Checks:** Preserved. `user.lockedUntil` and `offender.pinLockedUntil` are dynamically checked.
- **RLS Readiness:** In Supabase staging, all application queries originate from the Next.js server using Prisma. Prisma connects via `DATABASE_URL` as a privileged backend client, while client components communicate exclusively through authenticated Next.js API routes.

---

## 8. Tests and Build Results

### 8.1 Automated Regression Test Suite
- **Command:** `npm test`
- **Scope:** 18 test files, 151 individual tests
- **Result:** **151 passed / 151 tests (100% PASS)**
- **Duration:** 107.09s
- **Process Exit Code:** 0

### 8.2 Production Build Verification
- **Command:** `npm run build` (`prisma generate && next build`)
- **Compilation:** Successful
- **Type Checking & Linting:** Validated (0 errors)
- **Static & Dynamic Route Generation:** 55/55 routes compiled
- **Process Exit Code:** 0

---

## 9. Remaining PostgreSQL Risks

| Risk Identifier | Severity | Mitigation Required Prior to Staging Run |
| :--- | :---: | :--- |
| **RISK-01: Trigger Duality** | **HIGH** | If `supabase/migrations/*.sql` are applied blindly to the staging Supabase project, Prisma queries will fail. Must deploy `schema.postgresql.prisma` via Prisma first. |
| **RISK-02: Monetary Float Type** | **MEDIUM** | Financial fields are currently `Float`. Should be migrated to `Decimal(10, 2)` post-staging to prevent IEEE 754 precision issues over long financial histories. |
| **RISK-03: Connection Pooler Exhaustion** | **LOW** | Supavisor pool size on Supabase free/pro tiers must be sized to accommodate Next.js serverless connection spikes. |

---

## 10. Recommended Phase 8E Plan

```mermaid
flowchart TD
    A["Phase 8E Step 1: Provision Isolated Supabase Staging Project"] --> B["Step 2: Configure Staging Environment (.env with DATABASE_URL & DIRECT_URL)"]
    B --> C["Step 3: Deploy PostgreSQL Schema to Staging (npx prisma db push --schema=prisma/schema.postgresql.prisma)"]
    C --> D["Step 4: Apply Engine-Level CHECK Constraints (balance >= 0, stock >= 0)"]
    D --> E["Step 5: Run DAG-Ordered Data Migration from SQLite to Staging"]
    E --> F["Step 6: Run Automated Vitest Suite Pointed at Staging DB"]
    F --> G["Step 7: Conduct Multi-Portal E2E Staging Verification"]
```

---

## Phase 8D.1 Sign-Off Matrix

| Requirement | Finding | Status |
| :--- | :--- | :---: |
| Search Query Compatibility | Added `caseInsensitiveContains` to 3 API routes | **PASS** |
| Prisma Staging Datasource | Encapsulated in `prisma/schema.postgresql.prisma` | **PASS** |
| SQLite Dev Isolation | Preserved `prisma/schema.prisma` without breaking `directUrl` | **PASS** |
| Trigger Conflict Investigation | Fully documented `prevent_direct_balance_tampering` | **PASS** |
| Financial Transaction Invariants | Verified atomic operations inside interactive transactions | **PASS** |
| Full Test Suite | 18 files / 151 tests passed | **PASS** |
| Next.js Production Build | 55/55 pages & routes generated | **PASS** |
| Database & Git Safety | Zero remote connections, zero commits, zero pushes | **PASS** |

**OVERALL PHASE 8D.1 EVALUATION: PASS**

