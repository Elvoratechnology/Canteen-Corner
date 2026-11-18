# CANTEEN CORNER — PHASE 8F.6.3
# POST-MIGRATION FINANCIAL INTEGRITY & CONSTRAINT AUDIT

**Document Version:** 1.0.0  
**Audit Date:** 2026-11-17  
**Authorization:** READ-ONLY COMPLIANCE AUDIT  
**Target Database:** Dedicated Supabase Staging (`canteen-corner-staging`)  
**Project Reference:** `zcamheygapbruuovikar`  
**PostgreSQL Version:** 17.12 (AWS Tokyo / `ap-northeast-1`)  
**Auditor / Inspector:** Lead System Architect & Database Administrator (Antigravity)

---

## 1. EXECUTIVE SUMMARY & AUDIT STATUS

### Overall Audit Status: **`PASS`**

An independent, strictly read-only post-migration financial integrity audit was conducted on the dedicated Supabase Staging database (`zcamheygapbruuovikar`) following the execution of Phase 8F.6.2. 

The live database catalog (`information_schema`, `pg_constraint`, `pg_class`, `pg_namespace`, and `_prisma_migrations`) was inspected alongside the application codebase and test suite. The audit confirms:
1. All **19 monetary columns across 8 models** are stored as `numeric(12, 2)` with correct nullability and default values. Zero IEEE 754 float columns remain in the `public` schema.
2. All **20 financial CHECK constraints** are compiled, active, and fully validated (`convalidated = true`) in PostgreSQL 17.12.
3. The discrepancy between the narrative count of 18 rules in Phase 8F.6.1 and the 20 active constraints in Phase 8F.6.2 was forensically investigated and resolved: it was a typographical carryover from the preliminary assessment draft; both the migration SQL and the live catalog have always contained the exact same 20 rules.
4. Application-level financial calculations in `src/lib/money.ts` and transactional routes (`/api/inmate/order`, `/api/family/deposits`, `/api/payments`) align seamlessly with database constraints, providing defense-in-depth against overdrafts, negative prices, and invalid ledger mutations.
5. Live schema drift analysis against `prisma/schema.postgresql.prisma` confirms **zero drift**.
6. The test suite reports **162 passing tests across 19 suites** with zero TypeScript errors.

---

## 2. STAGING IDENTITY & ENVIRONMENT CONFIRMATION

Environment isolation was validated using live metadata queries:

- **Supabase Project Name:** `canteen-corner-staging`
- **Supabase Project Reference:** `zcamheygapbruuovikar`
- **Host Endpoint:** `aws-0-ap-northeast-1.pooler.supabase.com`
- **Active Ports:** `5432` (Direct Session Pooler) & `6543` (Transaction Pooler)
- **Database Identity:** `postgres`
- **Database User:** `postgres` (`postgres.zcamheygapbruuovikar`)
- **Engine Version:** `PostgreSQL 17.12 on aarch64-unknown-linux-gnu, compiled by gcc (GCC) 15.2.0, 64-bit`
- **Production Isolation:** Confirmed. No production credentials or endpoints were referenced or loaded.

---

## 3. FINANCIAL COLUMN AUDIT (19 COLUMNS)

Every monetary field across all 16 application models was audited using `information_schema.columns`.

### 3.1 Complete 19-Column Monetary Inventory

| Model / Table | Field Name | Data Type | UDT Name | Precision | Scale | Nullable | Default Expression | Verification Status |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| `Facility` | `maxWeeklySpend` | `numeric` | `numeric` | 12 | 2 | `NO` | `100.0` | **PASS** |
| `Facility` | `maxDepositAmount` | `numeric` | `numeric` | 12 | 2 | `NO` | `300.0` | **PASS** |
| `Offender` | `balance` | `numeric` | `numeric` | 12 | 2 | `NO` | `0.0` | **PASS** |
| `Offender` | `weeklyLimit` | `numeric` | `numeric` | 12 | 2 | `NO` | `100.0` | **PASS** |
| `Offender` | `currentWeeklySpent` | `numeric` | `numeric` | 12 | 2 | `NO` | `0.0` | **PASS** |
| `Product` | `price` | `numeric` | `numeric` | 12 | 2 | `NO` | `NULL` | **PASS** |
| `Order` | `subtotal` | `numeric` | `numeric` | 12 | 2 | `NO` | `NULL` | **PASS** |
| `Order` | `tax` | `numeric` | `numeric` | 12 | 2 | `NO` | `0.0` | **PASS** |
| `Order` | `total` | `numeric` | `numeric` | 12 | 2 | `NO` | `NULL` | **PASS** |
| `OrderItem` | `unitPrice` | `numeric` | `numeric` | 12 | 2 | `NO` | `NULL` | **PASS** |
| `OrderItem` | `totalPrice` | `numeric` | `numeric` | 12 | 2 | `NO` | `NULL` | **PASS** |
| `Deposit` | `amount` | `numeric` | `numeric` | 12 | 2 | `NO` | `NULL` | **PASS** |
| `Deposit` | `fee` | `numeric` | `numeric` | 12 | 2 | `NO` | `0.0` | **PASS** |
| `Deposit` | `totalPaid` | `numeric` | `numeric` | 12 | 2 | `NO` | `NULL` | **PASS** |
| `LedgerEntry` | `debit` | `numeric` | `numeric` | 12 | 2 | `NO` | `0.0` | **PASS** |
| `LedgerEntry` | `credit` | `numeric` | `numeric` | 12 | 2 | `NO` | `0.0` | **PASS** |
| `LedgerEntry` | `balanceBefore` | `numeric` | `numeric` | 12 | 2 | `NO` | `NULL` | **PASS** |
| `LedgerEntry` | `balanceAfter` | `numeric` | `numeric` | 12 | 2 | `NO` | `NULL` | **PASS** |
| `GiftPackage` | `totalValue` | `numeric` | `numeric` | 12 | 2 | `NO` | `NULL` | **PASS** |

### 3.2 Floating-Point Absence Check

A query for any remaining `double precision` (`float8`) or `real` (`float4`) columns in the `public` schema returned **0 records**:

```sql
SELECT table_name, column_name, data_type 
FROM information_schema.columns 
WHERE table_schema = 'public' AND data_type IN ('double precision', 'real');
-- Result: 0 rows
```

All financial figures in the staging database are stored with exact decimal representations.

---

## 4. CHECK CONSTRAINT AUDIT & DISCREPANCY INVESTIGATION

### 4.1 Live Constraint Inventory (20 Constraints)

Catalog inspection querying `pg_constraint`, `pg_class`, and `pg_namespace` identified **20 active CHECK constraints** in schema `public`:

| Table | Constraint Name | Exact PostgreSQL Catalog Definition | Convalidated | Business Purpose & Evaluation |
| :--- | :--- | :--- | :---: | :--- |
| `Deposit` | `check_deposit_amount_positive` | `CHECK ((amount > 0.00))` | `true` | Prevents zero or negative deposit values. Only valid monetary transfers can be credited. |
| `Deposit` | `check_deposit_fee_nonnegative` | `CHECK ((fee >= 0.00))` | `true` | Allows zero-fee institutional deposits while prohibiting negative fees. |
| `Deposit` | `check_deposit_total_paid_positive` | `CHECK (("totalPaid" > 0.00))` | `true` | Requires positive family charge amounts. |
| `Facility` | `check_facility_max_deposit_amount_positive` | `CHECK (("maxDepositAmount" > 0.00))` | `true` | Ensures maximum deposit thresholds are positive. |
| `Facility` | `check_facility_max_weekly_spend_nonnegative` | `CHECK (("maxWeeklySpend" >= 0.00))` | `true` | Allows facility lockdown mode ($0.00 spend cap) while preventing negative caps. |
| `GiftPackage` | `check_gift_package_total_value_nonnegative` | `CHECK (("totalValue" >= 0.00))` | `true` | Prohibits negative gift package values. |
| `LedgerEntry` | `check_ledger_balance_after_nonnegative` | `CHECK (("balanceAfter" >= 0.00))` | `true` | Hard database barrier: post-transaction balance audit snapshot can never reflect overdraft. |
| `LedgerEntry` | `check_ledger_balance_before_nonnegative` | `CHECK (("balanceBefore" >= 0.00))` | `true` | Hard database barrier: pre-transaction balance audit snapshot can never reflect overdraft. |
| `LedgerEntry` | `check_ledger_credit_nonnegative` | `CHECK ((credit >= 0.00))` | `true` | Enforces double-entry standard: credit increments must be non-negative. |
| `LedgerEntry` | `check_ledger_debit_nonnegative` | `CHECK ((debit >= 0.00))` | `true` | Enforces double-entry standard: debit decrements must be non-negative. |
| `LedgerEntry` | `check_ledger_non_zero_entry` | `CHECK (((debit > 0.00) OR (credit > 0.00)))` | `true` | Prohibits ghost ledger records where both debit and credit are zero. |
| `Offender` | `check_offender_balance_nonnegative` | `CHECK ((balance >= 0.00))` | `true` | Core inmate trust account protection: prevents overdrafts under all circumstances. |
| `Offender` | `check_offender_current_weekly_spent_nonnegative` | `CHECK (("currentWeeklySpent" >= 0.00))` | `true` | Ensures weekly spending tally starts at 0.00 and cannot drift negative. |
| `Offender` | `check_offender_weekly_limit_positive` | `CHECK (("weeklyLimit" > 0.00))` | `true` | Inmates must have a valid positive weekly allowance. |
| `Order` | `check_order_subtotal_nonnegative` | `CHECK ((subtotal >= 0.00))` | `true` | Prohibits negative order subtotals. |
| `Order` | `check_order_tax_nonnegative` | `CHECK ((tax >= 0.00))` | `true` | Allows tax-exempt commissary ($0.00 tax) while prohibiting negative taxes. |
| `Order` | `check_order_total_nonnegative` | `CHECK ((total >= 0.00))` | `true` | Prohibits negative order totals. |
| `OrderItem` | `check_order_item_total_price_nonnegative` | `CHECK (("totalPrice" >= 0.00))` | `true` | Prohibits negative line item totals. |
| `OrderItem` | `check_order_item_unit_price_nonnegative` | `CHECK (("unitPrice" >= 0.00))` | `true` | Prohibits negative line item unit prices. |
| `Product` | `check_product_price_nonnegative` | `CHECK ((price >= 0.00))` | `true` | Allows $0.00 promotional/basic items while prohibiting negative retail prices. |

---

### 4.2 Forensic Resolution of the "18 vs. 20" Validation Rule Discrepancy

During the review, an inquiry was raised regarding why Phase 8F.6.1 narrative text referenced "18 validation rules" while Phase 8F.6.2 and live database inspection reported 20 active constraints.

#### Investigation Findings:
1. **Preliminary Design Scope (Phase 8F.5):** The original assessment initially inventoried 18 single-column bound constraints across the models:
   - Order (3): `subtotal >= 0`, `tax >= 0`, `total >= 0`
   - Offender (3): `balance >= 0`, `weeklyLimit > 0`, `currentWeeklySpent >= 0`
   - Deposit (3): `amount > 0`, `fee >= 0`, `totalPaid > 0`
   - Facility (2): `maxWeeklySpend >= 0`, `maxDepositAmount > 0`
   - OrderItem (2): `unitPrice >= 0`, `totalPrice >= 0`
   - Product (1): `price >= 0`
   - GiftPackage (1): `totalValue >= 0`
   - LedgerEntry (3): `debit >= 0`, `credit >= 0`, `balanceAfter >= 0`  
   *(Subtotal: 18 basic single-column bounds)*

2. **Hardening During Implementation (Phase 8F.6):** When drafting `migration.sql`, the implementation team hardened `LedgerEntry` with **2 additional essential invariants**:
   - `check_ledger_balance_before_nonnegative`: Guarantees the pre-transaction snapshot cannot reflect a negative balance.
   - `check_ledger_non_zero_entry`: `CHECK (debit > 0.00 OR credit > 0.00)` to eliminate phantom zero-dollar transactions.
   This increased the total number of constraints from 18 to **20**.

3. **Documentation Discrepancy:**
   - In `migration.sql`, exactly 20 constraints were written.
   - In `CANTEEN_CORNER_PHASE_8F_6_1_MIGRATION_SAFETY_REVIEW.md`, Section 6 displayed a table with rows **1 through 20**.
   - However, the narrative prose in Section 1 and Section 6 line 247 retained the preliminary phrasing: *"8 explicit CHECK constraint blocks comprising 18 individual validation rules"*.
   - When Phase 8F.6.2 executed live introspection against PostgreSQL 17.12, the engine reported the true catalog count: **20 active constraints**.

#### Conclusion:
There has never been a discrepancy in the migration SQL or in the database. Both have consistently implemented all 20 constraints. The difference was strictly a textual artifact in the narrative summary of the Phase 8F.6.1 report. All 20 constraints are verified active and necessary.

---

## 5. LEDGER & FINANCIAL INTEGRITY REVIEW

### 5.1 Double-Entry Bookkeeping Semantics

The application implements immutable double-entry ledger transactions:
- **Debits:** Applied during commissary orders (`type: 'COMMISSARY_ORDER'`). A debit decreases the inmate's trust account balance:
  $$\text{balanceAfter} = \text{balanceBefore} - \text{debit}$$
- **Credits:** Applied during family electronic deposits (`type: 'DEPOSIT'`). A credit increases the inmate's trust account balance:
  $$\text{balanceAfter} = \text{balanceBefore} + \text{credit}$$
- **Zero-Dollar Entry Prohibition:** `check_ledger_non_zero_entry` guarantees that every ledger record represents a genuine financial event (`debit > 0 OR credit > 0`).
- **Refunds & Reversals:** Order refunds are recorded as a Credit with `type: 'REFUND'`, while administrative balance adjustments use strictly positive debit or credit amounts with `type: 'ADJUSTMENT'`. Thus, refunds and corrections never require negative values and comply fully with all database constraints.

### 5.2 Balance Snapshot Consistency

In both `/api/inmate/order/route.ts` and `/lib/payments/confirmation.ts`:
1. The balance modification executes inside an interactive transaction (`prisma.$transaction`).
2. After the atomic update (`increment` or `decrement`), the code reads the authoritative balance directly from the database using `tx.offender.findUniqueOrThrow`.
3. The exact values of `balanceBefore` and `balanceAfter` are saved in `LedgerEntry`.
4. Database constraints `check_ledger_balance_before_nonnegative` and `check_ledger_balance_after_nonnegative` guarantee that historical audit records cannot record negative balances.

### 5.3 Concurrency & Overdraft Protections

- **Application Conditional Update:** In `/api/inmate/order/route.ts`, the balance deduction uses:
  ```typescript
  await tx.offender.updateMany({
    where: { id: offender.id, balance: { gte: orderTotal } },
    data: { balance: { decrement: orderTotal }, currentWeeklySpent: { increment: orderTotal } },
  });
  ```
  If another concurrent request depletes the balance before the lock is acquired, `updateMany` affects 0 rows, prompting an immediate transaction abort and rollback.
- **Database Engine Defense-in-Depth:** Even if application concurrency logic were bypassed, `check_offender_balance_nonnegative` will raise a PostgreSQL constraint error (`23514 check_violation`), rolling back the transaction at the database engine level.

### 5.4 Gap Analysis: Application vs. Database Protections

| Concern | Application Protection | Database Protection | Assessment |
| :--- | :--- | :--- | :--- |
| **Negative Balance** | Checked before order; conditional `balance >= orderTotal` update | `CHECK (balance >= 0.00)` on Offender | **Complete Defense-in-Depth** |
| **Weekly Spending Cap** | `currentWeeklySpent + orderTotal <= weeklyLimit` checked during checkout | `CHECK (currentWeeklySpent >= 0.00)` and `CHECK (weeklyLimit > 0.00)` | **Appropriate Design.** Cap enforcement belongs at transaction boundary to allow administrative overrides. |
| **Ledger Arithmetic Identity** | Application calculates exact `balanceBefore` and `balanceAfter` | `balanceBefore >= 0.00`, `balanceAfter >= 0.00`, `debit >= 0`, `credit >= 0`, non-zero entry | **Valid.** Multi-column row identity is guaranteed by transaction procedural code. |
| **Deposit Idempotency** | Status transition `PENDING -> SUCCEEDED` via `updateMany` | Unique constraint on `providerRef` and `idempotencyKey` | **Complete Defense-in-Depth** |
| **Inventory Overselling** | Conditional stock update `stock: { gte: quantity }` | Integer stock column; application prevents negative stock | **Protected.** |

---

## 6. API / DTO PRECISION & SERIALIZATION AUDIT

The `src/lib/money.ts` module was audited against React Server Components (RSC) and JSON serialization boundaries:

1. **Serialization Safety:** Raw `Prisma.Decimal` instances cannot be serialized directly to JSON or passed across RSC server-client boundaries. The application implements explicit DTO serializers:
   - `serializeOrder`
   - `serializeOrderItem`
   - `serializeOffender`
   - `serializeDeposit`
   - `serializeProduct`
   - `serializeFacility`
   - `serializeGiftPackage`
   - `serializeLedgerEntry`
2. **Precision Retention:** Numbers are transformed using `toMoneyNumber` (rounded with `ROUND_HALF_UP` to 2 decimal places), preserving exact monetary quantities (`42.50`) for client components without floating-point artifacts.
3. **Frontend Contract Compatibility:** Frontend calls such as `balance.toFixed(2)` continue to function seamlessly without requiring client-side Decimal library dependencies.

---

## 7. DATABASE STRUCTURE & MIGRATION HISTORY

### 7.1 Migration History (`_prisma_migrations`)

```sql
SELECT id, migration_name, checksum, finished_at, rolled_back_at, applied_steps_count 
FROM _prisma_migrations ORDER BY started_at ASC;
```

- **Row 1:** `0_init` (Applied: `2026-11-17T12:51:13.657Z`, `rolled_back_at: NULL`, `steps: 0`)
- **Row 2:** `20261117214000_financial_precision_hardening` (Applied: `2026-11-17T13:52:47.992Z`, `rolled_back_at: NULL`, `steps: 1`)
- **Status:** Up to date. Zero pending or failed migrations.

### 7.2 Database Objects & Relations

- **Application Tables:** 16 tables present (all 0 rows).
- **Foreign Keys:** 21 foreign key constraints verified in `pg_constraint`.
- **Indexes:** 29 public indexes active in `pg_indexes`.
- **Rewards / Loyalty Artifacts:** Zero artifact tables or columns found in `information_schema`.
- **Supabase Internal Schemas:** All 5 standard schemas (`auth`, `extensions`, `graphql_public`, `storage`, `vault`) remain intact and untouched.

### 7.3 Live Schema Drift Analysis

```bash
npx prisma migrate diff \
  --from-schema-datamodel prisma/schema.postgresql.prisma \
  --to-url "$DIRECT_URL" \
  --exit-code
```
- **Exit Code:** `0`
- **Result:** `No difference detected.` (Zero Drift)

---

## 8. APPLICATION REGRESSION & TEST VERIFICATION

Local regression testing was conducted against the SQLite development database:

- **TypeScript Static Typecheck:** `npx tsc --noEmit` exited with code `0` (Zero type errors).
- **Comprehensive Test Suite:** `npm test` (`vitest run`):
  - **Test Files:** 19 passed (100%)
  - **Tests:** 162 passed (100%)
  - **Duration:** 114.98 seconds
  - **Failures:** 0
- **Targeted Financial Precision Suite:** `tests/financial-precision-hardening.test.ts` passed 11 of 11 tests.
- **Acceptance Financial Suite:** `tests/phase5-acceptance.test.ts`, `tests/phase2-inmate-portal.test.ts`, and `tests/phase3-payments-family.test.ts` passed 12 of 12 tests.

---

## 9. CLASSIFICATION OF FINDINGS

- **CRITICAL (0):** None.
- **HIGH (0):** None.
- **MEDIUM (0):** None.
- **LOW (1):**
  - *Observation:* The staging database is currently in a clean-slate state (0 rows across all tables). To prepare for full end-to-end integration and load testing against the Supabase staging pooler, realistic synthetic data representing multi-facility inmates, catalog products, and initial balances must be seeded.

---

## 10. CONCLUSION & RECOMMENDED NEXT PHASE

Phase 8F.6.3 confirms that the dedicated Supabase Staging environment has achieved **production-grade financial precision and database-enforced integrity**. 

### Recommendation:
The system is fully validated and ready to proceed to:
**`CANTEEN CORNER — PHASE 8F.7: STAGING SYNTHETIC DATA SEEDING & CONCURRENT END-TO-END VALIDATION`**
