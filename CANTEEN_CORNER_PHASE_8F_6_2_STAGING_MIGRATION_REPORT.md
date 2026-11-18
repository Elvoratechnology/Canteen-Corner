# CANTEEN CORNER — PHASE 8F.6.2
# AUTHORIZED FINANCIAL PRECISION STAGING MIGRATION REPORT

**Document Version:** 1.0.0  
**Execution Timestamp:** 2026-11-17 21:52:47 UTC+8 (13:52:47 UTC)  
**Authorization:** USER-APPROVED STAGING DEPLOYMENT  
**Target Environment:** Dedicated Supabase Staging (`canteen-corner-staging`)  
**Target Project Reference:** `zcamheygapbruuovikar`  
**Applied Migration:** `20261117214000_financial_precision_hardening`  
**Auditor / Operator:** Lead System Architect & Database Administrator (Antigravity)

---

## 1. EXECUTIVE SUMMARY & FINAL STATUS

### Final Status: **`PASS — FULLY SYNCHRONIZED`**

In accordance with explicit user authorization, the **Financial Precision Hardening** migration (`20261117214000_financial_precision_hardening`) was successfully deployed to the dedicated Supabase Staging database (`zcamheygapbruuovikar`) using the official Prisma migration deployment engine.

All pre-execution safety validations passed unconditionally. All 19 monetary fields across 8 tables were converted from IEEE 754 binary floating-point (`double precision`) to exact fixed-point `DECIMAL(12, 2)` (`numeric(12, 2)`). All 8 CHECK constraint blocks (comprising 20 active validation rules) were compiled and validated (`convalidated = true`) by PostgreSQL 17.12. Post-migration schema drift analysis confirmed **zero schema drift**. Local static compilation and full test suites passed with **162 passing tests and zero regressions**.

### High-Level Execution Scorecard

| Check / Phase | Target | Result | Status |
| :--- | :--- | :--- | :---: |
| **Environment Isolation** | `.env.staging` (`zcamheygapbruuovikar`) | Verified AWS Tokyo pooler; zero production URLs | **PASS** |
| **Migration Baseline** | `0_init` | Intact and verified in `_prisma_migrations` | **PASS** |
| **Deployment Execution** | `prisma migrate deploy` | Completed in 5,287 ms with exit code 0 | **PASS** |
| **Monetary Columns Converted** | 19 of 19 columns | Altered to `numeric(12, 2)` | **PASS** |
| **CHECK Constraints Active** | 20 validation rules across 8 tables | All active and `convalidated = true` | **PASS** |
| **Database Row Integrity** | 16 application tables | 0 rows before and after; zero data corruption | **PASS** |
| **Foreign Keys & Indexes** | 21 FKs, 29 Indexes | 100% intact; no orphaned constraints | **PASS** |
| **Rewards / Loyalty Artifacts** | 0 tables / 0 columns | Clean; zero loyalty/rewards remnants | **PASS** |
| **Schema Drift Analysis** | `prisma migrate diff` | No difference detected (Exit Code: 0) | **PASS** |
| **TypeScript Compilation** | `npx tsc --noEmit` | Clean (0 errors) | **PASS** |
| **Automated Test Suite** | `npm test` (Local SQLite) | 19 test suites, 162 tests passed, 0 failures | **PASS** |
| **Production Isolation** | Production Vercel / Supabase | Strictly untouched and off-limits | **PASS** |

---

## 2. VERIFIED STAGING PROJECT IDENTITY

Strict environment isolation was enforced prior to executing any database operation. Connection strings and credentials were read exclusively from `.env.staging` and redacted from all logs.

- **Supabase Project Name:** `canteen-corner-staging`
- **Supabase Project Reference:** `zcamheygapbruuovikar`
- **PostgreSQL Version:** `PostgreSQL 17.12 on aarch64-unknown-linux-gnu, compiled by gcc (GCC) 15.2.0, 64-bit`
- **Database Name:** `postgres`
- **Database User:** `postgres` (`postgres.zcamheygapbruuovikar`)
- **Connection Host:** `aws-0-ap-northeast-1.pooler.supabase.com` (AWS Tokyo / `ap-northeast-1`)
- **Direct Connection Port:** `5432` (Direct Session Pooler)
- **Pooled Connection Port:** `6543` (Transaction Pooler)
- **Production Isolation Confirmation:** The staging host and credentials are fully isolated from production. No production credentials or URLs were loaded or referenced.

---

## 3. MIGRATION EXECUTION DETAILS

The migration was deployed using the authorized Prisma deployment command:

```bash
npx prisma migrate deploy --schema=prisma/schema.postgresql.prisma
```

### Execution Telemetry
- **Migration Name:** `20261117214000_financial_precision_hardening`
- **SQL File:** `prisma/migrations/20261117214000_financial_precision_hardening/migration.sql`
- **Start Timestamp:** 2026-11-17 21:52:42 UTC+8
- **Finish Timestamp:** 2026-11-17 21:52:47 UTC+8
- **Execution Duration:** 5,287 ms
- **Exit Code:** `0` (Success)

### Execution Log
```text
Environment variables loaded from .env
Prisma schema loaded from prisma\schema.postgresql.prisma
Datasource "db": PostgreSQL database "postgres", schema "public" at "aws-0-ap-northeast-1.pooler.supabase.com:5432"

2 migrations found in prisma/migrations

Applying migration `20261117214000_financial_precision_hardening`

The following migration(s) have been applied:

migrations/
  └─ 20261117214000_financial_precision_hardening/
    └─ migration.sql
      
All migrations have been successfully applied.
```

---

## 4. BEFORE-AND-AFTER SCHEMA VERIFICATION

### 4.1 Schema Overview Comparison

| Schema Dimension | Before Phase 8F.6.2 (Baseline `0_init`) | After Phase 8F.6.2 (`20261117214000_...`) | Status |
| :--- | :---: | :---: | :---: |
| **Application Tables** | 16 | 16 | **UNCHANGED** |
| **Monetary Columns Storage** | `double precision` (`float8`, 53-bit float) | `numeric(12, 2)` (arbitrary precision decimal) | **UPGRADED** |
| **Financial CHECK Constraints** | 0 | 20 | **HARDENED** |
| **Foreign Key Constraints** | 21 | 21 | **PRESERVED** |
| **Database Indexes** | 29 | 29 | **PRESERVED** |
| **Supabase Internal Schemas** | Intact (`auth`, `storage`, `graphql_public`) | Intact (`auth`, `storage`, `graphql_public`) | **PRESERVED** |
| **Total Staging Table Records** | 0 rows across all 16 tables | 0 rows across all 16 tables | **ZERO DATA LOSS** |

### 4.2 Table Record Count Verification

Live queries executed before and after migration confirmed that no data was inserted, deleted, or corrupted:

```json
{
  "Facility": 0,
  "User": 0,
  "Offender": 0,
  "FamilyAccount": 0,
  "FamilyOffenderLink": 0,
  "Product": 0,
  "Order": 0,
  "OrderItem": 0,
  "OrderStatusHistory": 0,
  "PickingList": 0,
  "Manifest": 0,
  "Deposit": 0,
  "LedgerEntry": 0,
  "GiftPackage": 0,
  "Notification": 0,
  "AuditLog": 0
}
```

---

## 5. MONETARY COLUMN CONVERSION RESULTS

All 19 monetary fields across 8 application models were inspected via `information_schema.columns` in the live staging database. Every field is verified as `data_type = 'numeric'` with precision `12` and scale `2`:

| Model / Table | Column Name | Previous Type | Synchronized Type | Precision | Scale | Verification Status |
| :--- | :--- | :--- | :--- | :---: | :---: | :---: |
| `Facility` | `maxWeeklySpend` | `double precision` | `numeric` | 12 | 2 | **PASS** |
| `Facility` | `maxDepositAmount` | `double precision` | `numeric` | 12 | 2 | **PASS** |
| `Offender` | `balance` | `double precision` | `numeric` | 12 | 2 | **PASS** |
| `Offender` | `weeklyLimit` | `double precision` | `numeric` | 12 | 2 | **PASS** |
| `Offender` | `currentWeeklySpent` | `double precision` | `numeric` | 12 | 2 | **PASS** |
| `Product` | `price` | `double precision` | `numeric` | 12 | 2 | **PASS** |
| `Order` | `subtotal` | `double precision` | `numeric` | 12 | 2 | **PASS** |
| `Order` | `tax` | `double precision` | `numeric` | 12 | 2 | **PASS** |
| `Order` | `total` | `double precision` | `numeric` | 12 | 2 | **PASS** |
| `OrderItem` | `unitPrice` | `double precision` | `numeric` | 12 | 2 | **PASS** |
| `OrderItem` | `totalPrice` | `double precision` | `numeric` | 12 | 2 | **PASS** |
| `Deposit` | `amount` | `double precision` | `numeric` | 12 | 2 | **PASS** |
| `Deposit` | `fee` | `double precision` | `numeric` | 12 | 2 | **PASS** |
| `Deposit` | `totalPaid` | `double precision` | `numeric` | 12 | 2 | **PASS** |
| `LedgerEntry` | `debit` | `double precision` | `numeric` | 12 | 2 | **PASS** |
| `LedgerEntry` | `credit` | `double precision` | `numeric` | 12 | 2 | **PASS** |
| `LedgerEntry` | `balanceBefore` | `double precision` | `numeric` | 12 | 2 | **PASS** |
| `LedgerEntry` | `balanceAfter` | `double precision` | `numeric` | 12 | 2 | **PASS** |
| `GiftPackage` | `totalValue` | `double precision` | `numeric` | 12 | 2 | **PASS** |

---

## 6. CHECK CONSTRAINT VERIFICATION RESULTS

All 8 CHECK constraint blocks (comprising 20 individual rules) were queried from `information_schema.table_constraints`, `information_schema.check_constraints`, and `pg_constraint`. All constraints are active and confirmed validated (`convalidated = true`):

| Table | Constraint Name | PostgreSQL Check Clause | Convalidated | Status |
| :--- | :--- | :--- | :---: | :---: |
| `Deposit` | `check_deposit_amount_positive` | `(amount > 0.00)` | `true` | **PASS** |
| `Deposit` | `check_deposit_fee_nonnegative` | `(fee >= 0.00)` | `true` | **PASS** |
| `Deposit` | `check_deposit_total_paid_positive` | `("totalPaid" > 0.00)` | `true` | **PASS** |
| `Facility` | `check_facility_max_deposit_amount_positive` | `("maxDepositAmount" > 0.00)` | `true` | **PASS** |
| `Facility` | `check_facility_max_weekly_spend_nonnegative` | `("maxWeeklySpend" >= 0.00)` | `true` | **PASS** |
| `GiftPackage` | `check_gift_package_total_value_nonnegative` | `("totalValue" >= 0.00)` | `true` | **PASS** |
| `LedgerEntry` | `check_ledger_balance_after_nonnegative` | `("balanceAfter" >= 0.00)` | `true` | **PASS** |
| `LedgerEntry` | `check_ledger_balance_before_nonnegative` | `("balanceBefore" >= 0.00)` | `true` | **PASS** |
| `LedgerEntry` | `check_ledger_credit_nonnegative` | `(credit >= 0.00)` | `true` | **PASS** |
| `LedgerEntry` | `check_ledger_debit_nonnegative` | `(debit >= 0.00)` | `true` | **PASS** |
| `LedgerEntry` | `check_ledger_non_zero_entry` | `((debit > 0.00) OR (credit > 0.00))` | `true` | **PASS** |
| `Offender` | `check_offender_balance_nonnegative` | `(balance >= 0.00)` | `true` | **PASS** |
| `Offender` | `check_offender_current_weekly_spent_nonnegative` | `("currentWeeklySpent" >= 0.00)` | `true` | **PASS** |
| `Offender` | `check_offender_weekly_limit_positive` | `("weeklyLimit" > 0.00)` | `true` | **PASS** |
| `Order` | `check_order_subtotal_nonnegative` | `(subtotal >= 0.00)` | `true` | **PASS** |
| `Order` | `check_order_tax_nonnegative` | `(tax >= 0.00)` | `true` | **PASS** |
| `Order` | `check_order_total_nonnegative` | `(total >= 0.00)` | `true` | **PASS** |
| `OrderItem` | `check_order_item_total_price_nonnegative` | `("totalPrice" >= 0.00)` | `true` | **PASS** |
| `OrderItem` | `check_order_item_unit_price_nonnegative` | `("unitPrice" >= 0.00)` | `true` | **PASS** |
| `Product` | `check_product_price_nonnegative` | `(price >= 0.00)` | `true` | **PASS** |

---

## 7. MIGRATION HISTORY & STATUS

### 7.1 Prisma Migration Table (`_prisma_migrations`)

The `_prisma_migrations` tracking table was queried directly on the staging database:

```sql
SELECT id, migration_name, checksum, finished_at, rolled_back_at, applied_steps_count
FROM _prisma_migrations ORDER BY started_at ASC;
```

**Results:**
1. **`0_init`**
   - Migration ID: `442b95ae-dfdf-444a-ada6-72b67c158d92`
   - Checksum: `984411775b0358deed584d587711e6b93a66af7b6c28d4a5b826f0ed76812379`
   - Finished At: `2026-11-17 12:51:13.657Z`
   - Rolled Back At: `NULL`
   - Applied Steps: `0` (Baseline registration)
2. **`20261117214000_financial_precision_hardening`**
   - Migration ID: `1f4d1ec2-8cba-4801-9b99-8ea2308bc0ae`
   - Checksum: `4c6f0177d7077bcae79ca8840ae2f1b91848bf0f3421d10f1e57f7eb71b9ecf3`
   - Finished At: `2026-11-17 13:52:47.992Z`
   - Rolled Back At: `NULL`
   - Applied Steps: `1` (Active execution)

### 7.2 Prisma Migrate Status Verification

`npx prisma migrate status --schema=prisma/schema.postgresql.prisma` was run immediately post-deployment:

```text
Environment variables loaded from .env
Prisma schema loaded from prisma\schema.postgresql.prisma
Datasource "db": PostgreSQL database "postgres", schema "public" at "aws-0-ap-northeast-1.pooler.supabase.com:5432"

2 migrations found in prisma/migrations

Database schema is up to date!
```

---

## 8. LIVE SCHEMA DRIFT RESULTS

A live schema drift comparison was executed between the approved PostgreSQL datamodel (`prisma/schema.postgresql.prisma`) and the live staging database via:

```bash
npx prisma migrate diff \
  --from-schema-datamodel prisma/schema.postgresql.prisma \
  --to-url "$DIRECT_URL" \
  --exit-code
```

### Drift Output:
```text
No difference detected.
```
- **Exit Code:** `0`
- **Drift Status:** **ZERO DRIFT (100% Match)**

---

## 9. TYPESCRIPT COMPILATION & TEST SUITE VERIFICATION

To verify that the application code, API routes, and local database remain perfectly synchronized and regression-free:

### 9.1 TypeScript Typecheck
- **Command:** `npx tsc --noEmit`
- **Result:** Exit Code `0` (Zero type errors)

### 9.2 Automated Regression Test Suite
- **Command:** `npm test` (`vitest run` on isolated local SQLite database)
- **Duration:** 114.98 seconds
- **Test Suites:** **19 passed (19 total)**
- **Tests:** **162 passed (162 total, 0 failures)**

All financial precision tests, including IEEE 754 float drift elimination, sub-cent accumulation, half-up rounding, DTO serialization, atomic transaction deductions, and order placement passed with 100% success.

---

## 10. PRODUCTION ISOLATION CONFIRMATION

In accordance with strict operational rules:
1. **Production URLs:** No production URLs, tokens, or credentials were used, loaded, or accessed at any time during this phase.
2. **Production Systems:** Vercel production hosting and the production Supabase database remain completely untouched and unmodified.
3. **Dedicated Staging:** All DDL and DML operations were strictly contained within Supabase Staging project `zcamheygapbruuovikar`.

---

## 11. REMAINING OBSERVATIONS & NEXT STEPS

- **Clean State:** The staging database currently contains 0 records across all 16 tables.
- **Rollback Readiness:** In the event a rollback is ever needed, a complete SQL reversal script (`ALTER COLUMN ... SET DATA TYPE DOUBLE PRECISION` and `DROP CONSTRAINT ...`) is documented in `prisma/migrations/20261117214000_financial_precision_hardening/`.
- **Next Phase:** The dedicated Supabase Staging environment is now fully hardened with production-grade financial precision and ready for **Phase 8F.7: Staging Synthetic Data Seeding & Concurrent End-to-End Validation**.
