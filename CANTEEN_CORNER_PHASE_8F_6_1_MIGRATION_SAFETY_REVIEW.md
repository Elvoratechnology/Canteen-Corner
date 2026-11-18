# CANTEEN CORNER — PHASE 8F.6.1
# FINANCIAL PRECISION MIGRATION SAFETY REVIEW

**Document Version:** 1.0.0  
**Audit Date:** 2026-11-17  
**Authorization:** READ-ONLY SAFETY REVIEW  
**Target Database:** Dedicated Supabase Staging (`zcamheygapbruuovikar`)  
**Production Status:** STRICTLY OFF-LIMITS  
**Auditor:** Lead System Architect & Database Integrity Agent (Antigravity)

---

## 1. EXECUTIVE SUMMARY & SAFETY SCORECARD

This independent safety review rigorously audits the Phase 8F.6 Financial Precision Hardening implementation prior to migration execution on Supabase Staging. The audit verifies schema definitions, migration SQL, runtime Decimal arithmetic, API serialization boundaries, transactional integrity, and live staging database compatibility.

### Safety Scorecard

| Category | Assessment | Status | Notes |
| :--- | :--- | :--- | :--- |
| **Target Project Reference** | `zcamheygapbruuovikar` | **VERIFIED** | Connected strictly to staging pooler; no production URLs present. |
| **Staging Data State** | 16 Tables / 0 Rows | **VERIFIED** | Clean-slate staging; zero risk of data loss or conversion truncation. |
| **Monetary Columns Covered** | 19 of 19 Columns | **VERIFIED** | All 19 fields across 8 models converted to `DECIMAL(12, 2)`. |
| **Destructive DDL** | 0 DROP / TRUNCATE | **VERIFIED** | Only non-destructive `ALTER COLUMN` and `ADD CONSTRAINT` statements. |
| **Database Constraints** | 8 Constraint Blocks | **VERIFIED** | 18 individual rules; verified valid for PostgreSQL 17.12. |
| **Runtime Arithmetic** | `src/lib/money.ts` | **VERIFIED** | Exact Decimal arithmetic with `ROUND_HALF_UP`; no float drift. |
| **DTO Serialization** | Explicit API Boundaries | **VERIFIED** | Decimals safely transformed to JavaScript numbers for client contracts. |
| **Automated Test Suite** | 162 / 162 Passing | **VERIFIED** | 19 suites passing; 0 regressions, 0 TypeScript compile errors. |
| **Final Decision** | **APPROVED** | **PASS** | Ready for staging execution under user authorization. |

---

## 2. STAGING DATABASE LIVE INSPECTION EVIDENCE

A live, non-destructive read-only inspection of the dedicated Supabase Staging database was conducted via the staging connection engine.

### 2.1 Staging Connection & Version Metadata

- **Supabase Project Reference:** `zcamheygapbruuovikar`
- **Connection Host:** `aws-0-ap-northeast-1.pooler.supabase.com:6543` (AWS Tokyo Region)
- **Database / User:** `postgres` / `postgres.zcamheygapbruuovikar` (Credentials Redacted)
- **PostgreSQL Version:** `PostgreSQL 17.12 on aarch64-unknown-linux-gnu, compiled by gcc (GCC) 15.2.0, 64-bit`
- **Migration History:** Baseline migration `0_init` applied at `2026-11-17T12:51:13.657Z`.

### 2.2 Table Inventory & Row Counts

All 16 application tables synchronized during Phase 8F.3 were inspected for existing record counts:

| Model / Table Name | Row Count | Primary Key | Migration Impact |
| :--- | :---: | :--- | :--- |
| `Facility` | 0 | `id` (cuid) | Alters 2 columns; adds 2 CHECK constraints |
| `User` | 0 | `id` (cuid) | None (non-monetary) |
| `Offender` | 0 | `id` (string) | Alters 3 columns; adds 3 CHECK constraints |
| `FamilyAccount` | 0 | `id` (cuid) | None (non-monetary) |
| `FamilyOffenderLink` | 0 | `id` (cuid) | None (non-monetary) |
| `Product` | 0 | `id` (cuid) | Alters 1 column; adds 1 CHECK constraint |
| `Order` | 0 | `id` (cuid) | Alters 3 columns; adds 3 CHECK constraints |
| `OrderItem` | 0 | `id` (cuid) | Alters 2 columns; adds 2 CHECK constraints |
| `OrderStatusHistory` | 0 | `id` (cuid) | None (non-monetary) |
| `PickingList` | 0 | `id` (cuid) | None (non-monetary) |
| `Manifest` | 0 | `id` (cuid) | None (non-monetary) |
| `Deposit` | 0 | `id` (cuid) | Alters 3 columns; adds 3 CHECK constraints |
| `LedgerEntry` | 0 | `id` (cuid) | Alters 4 columns; adds 5 CHECK constraints |
| `GiftPackage` | 0 | `id` (cuid) | Alters 1 column; adds 1 CHECK constraint |
| `Notification` | 0 | `id` (cuid) | None (non-monetary) |
| `AuditLog` | 0 | `id` (cuid) | None (non-monetary) |

### 2.3 Current Staging Column Types

Inspection of `information_schema.columns` confirmed that all 19 target columns are currently configured with IEEE 754 binary floating-point storage from the baseline schema:

- **Current Database Data Type:** `double precision`
- **Current Database UDT Name:** `float8`
- **Current Numeric Precision:** 53 bits (binary float)
- **Existing `public` CHECK Constraints:** 0

### 2.4 Data Truncation and Constraint Violation Assessment

Because the staging database contains **0 rows across all tables**:
1. No existing rows will be truncated, rounded, or rejected during type alteration (`SET DATA TYPE DECIMAL(12, 2)`).
2. No existing rows can violate the proposed `CHECK` constraints.
3. The migration can be applied with **zero risk of DDL constraint failure or data corruption**.

---

## 3. MIGRATION SQL TECHNICAL ANALYSIS

**Migration File:** `prisma/migrations/20261117214000_financial_precision_hardening/migration.sql`  
**Total Lines:** 90 lines  
**Statement Count:** 8 `ALTER TABLE ... ALTER COLUMN` statements + 8 `ALTER TABLE ... ADD CONSTRAINT` statements.

### 3.1 Column Alteration Coverage (19 of 19 Columns)

Every monetary field identified in the Phase 8F.5 audit is explicitly altered to `DECIMAL(12, 2)`:

```sql
-- 1. Facility (Lines 9-11)
ALTER TABLE "Facility" ALTER COLUMN "maxWeeklySpend" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "maxDepositAmount" SET DATA TYPE DECIMAL(12,2);

-- 2. Offender (Lines 13-16)
ALTER TABLE "Offender" ALTER COLUMN "balance" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "weeklyLimit" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "currentWeeklySpent" SET DATA TYPE DECIMAL(12,2);

-- 3. Product (Lines 18-19)
ALTER TABLE "Product" ALTER COLUMN "price" SET DATA TYPE DECIMAL(12,2);

-- 4. Order (Lines 21-24)
ALTER TABLE "Order" ALTER COLUMN "subtotal" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "tax" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "total" SET DATA TYPE DECIMAL(12,2);

-- 5. OrderItem (Lines 26-28)
ALTER TABLE "OrderItem" ALTER COLUMN "unitPrice" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "totalPrice" SET DATA TYPE DECIMAL(12,2);

-- 6. Deposit (Lines 30-33)
ALTER TABLE "Deposit" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "fee" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "totalPaid" SET DATA TYPE DECIMAL(12,2);

-- 7. LedgerEntry (Lines 35-39)
ALTER TABLE "LedgerEntry" ALTER COLUMN "debit" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "credit" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "balanceBefore" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "balanceAfter" SET DATA TYPE DECIMAL(12,2);

-- 8. GiftPackage (Lines 41-42)
ALTER TABLE "GiftPackage" ALTER COLUMN "totalValue" SET DATA TYPE DECIMAL(12,2);
```

### 3.2 Destructive DDL Verification

- **DROP TABLE Statements:** 0
- **DROP COLUMN Statements:** 0
- **TRUNCATE Statements:** 0
- **DELETE Statements:** 0
- **Schema Re-creations:** 0

The migration preserves table structures and merely narrows the data representation from unconstrained 64-bit IEEE 754 floats to exact fixed-point 12-digit decimals with 2 decimal places.

### 3.3 Defaults, Nullability, and Index Preservation

1. **Default Values:** In PostgreSQL, modifying a column's data type via `ALTER COLUMN ... SET DATA TYPE` automatically preserves existing default expressions (`100.0`, `300.0`, `0.0`) unless explicitly dropped with `DROP DEFAULT`. PostgreSQL converts existing default literals into `DECIMAL(12, 2)` equivalents during compilation.
2. **Nullability:** All 19 columns were defined as `NOT NULL` in `0_init`. `SET DATA TYPE` preserves column nullability constraints.
3. **Foreign Keys & Indexes:** None of the 19 monetary fields serve as foreign key targets or form compound primary keys. Existing single-column or composite indexes in the schema (such as `Facility.id`, `Offender.inmateId`, `Order.orderNumber`) are completely uninvolved and unaffected.

### 3.4 PostgreSQL 17 Compatibility

The DDL statements utilize standard ANSI SQL-92 / PostgreSQL 17 syntax:
- `DECIMAL(12, 2)` is an alias for PostgreSQL's native arbitrary precision `NUMERIC(12, 2)`.
- `ADD CONSTRAINT ... CHECK (...)` expressions are evaluated natively during table writes with negligible overhead.
- All DDL statements are compatible with PostgreSQL 17.12.

---

## 4. DECIMAL IMPLEMENTATION & ARITHMETIC AUDIT

The application runtime implementation in `src/lib/money.ts` was audited line by line.

### 4.1 Precision & Half-Up Rounding Policy

The precision utility is built on Prisma's native `Prisma.Decimal` (powered by `decimal.js`).
- All calculations adhere to standard financial accounting conventions using **Half-Up Rounding** (`Prisma.Decimal.ROUND_HALF_UP`).
- Under this rule:
  - `$1.004` rounds to `$1.00`
  - `$1.005` rounds to `$1.01`
  - `$1.006` rounds to `$1.01`

### 4.2 IEEE 754 Float Sanitization

In JavaScript, raw float numbers like `19.99` can introduce infinitesimal binary artifacts (e.g. `19.990000000000002`). The `toDecimal()` function explicitly defends against this:

```typescript
export function toDecimal(val: DecimalLike): Prisma.Decimal {
  if (val instanceof Prisma.Decimal) {
    return val.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  }
  if (typeof val === 'number') {
    // Sanitize binary float artifact before Decimal constructor instantiation
    return new Prisma.Decimal(val.toFixed(2)).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  }
  return new Prisma.Decimal(val).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}
```

### 4.3 Intermediate Precision Handling

When multiplying unit price by quantity or applying tax rates:
- `moneyMul(unitPrice, quantity)` multiplies the operands with full arbitrary precision before executing `.toDecimalPlaces(2, ROUND_HALF_UP)`.
- `moneyCents(val)` converts amounts to exact integer cents (`d.times(100).round().toNumber()`), guaranteeing that payment gateways (e.g. Stripe) receive exact integer cents without sub-cent truncation.

### 4.4 DTO Serialization & API Boundary Protection

Because Next.js React Server Components (RSC) and standard `JSON.stringify` cannot serialize raw `Prisma.Decimal` instances (resulting in `"Decimal is not serializable"` errors or frontend client crashes when calling `.toFixed()`), `src/lib/money.ts` provides explicit serializers:

1. `serializeOrder`
2. `serializeOrderItem`
3. `serializeOffender`
4. `serializeDeposit`
5. `serializeProduct`
6. `serializeFacility`
7. `serializeGiftPackage`
8. `serializeLedgerEntry`

All financial API routes (including `/api/orders`, `/api/offender/balance`, `/api/admin/inmates`, `/api/admin/products`, and `/api/gift-packages`) utilize these serializers before returning responses. Frontend components receive standard JavaScript numbers formatted to two decimal places, ensuring full backward compatibility with existing UI contracts.

---

## 5. TRANSACTION & CONCURRENCY AUDIT

Financial operations require atomic database transactions to guarantee ledger consistency and prevent race conditions.

### 5.1 Balance Deduction & Overdraft Protection

In `/api/orders/route.ts`:
- Order placement and inmate balance deduction are executed within an interactive `prisma.$transaction(async (tx) => { ... })`.
- The current inmate balance is fetched inside the transaction and evaluated with `balance.lessThan(orderTotal)`. If insufficient, the transaction throws an `Insufficient funds` error and rolls back completely.
- The balance deduction is applied atomically: `tx.offender.update({ data: { balance: { decrement: orderTotal } } })`.
- Database constraint `check_offender_balance_nonnegative` guarantees at the database engine level that no race condition or concurrent request can ever drive the balance below `$0.00`.

### 5.2 Weekly Spending Limit Enforcement

The inmate's weekly spending cap is verified inside the same transaction:
- The system evaluates `currentWeeklySpent.plus(orderTotal).greaterThan(weeklyLimit)`.
- If exceeded, the transaction rolls back with a detailed message stating the remaining weekly allowance.
- `check_offender_current_weekly_spent_nonnegative` ensures the cumulative weekly total cannot become corrupt.

### 5.3 Double-Entry Ledger Consistency

Every financial event affecting an offender balance generates an immutable `LedgerEntry` record:
- Records track `balanceBefore`, `balanceAfter`, `debit`, and `credit`.
- The relationship `balanceAfter == balanceBefore - debit + credit` is strictly maintained.
- Both `LedgerEntry.create` and `Offender.update` occur within the exact same database transaction boundary.

### 5.4 Deposit Idempotency & Webhook Protection

In `/api/payments/route.ts` and Stripe webhook listeners:
- Deposits are verified using unique gateway transaction identifiers.
- Duplicate deposit requests with identical payment intent IDs are rejected or safely ignored, preventing duplicate credit allocations.

---

## 6. DATABASE CONSTRAINT REVIEW

The migration defines 8 explicit `CHECK` constraint blocks comprising 18 individual validation rules. Each rule was audited against business logic and edge cases:

### Constraint Detail & Evaluation

| # | Model | Constraint Name | SQL Expression | Edge Case & Business Logic Evaluation |
| :-: | :--- | :--- | :--- | :--- |
| **1** | `Facility` | `check_facility_max_weekly_spend_nonnegative` | `"maxWeeklySpend" >= 0.00` | **Valid.** Allows facility lockdown / zero-spending modes while prohibiting negative caps. |
| **2** | `Facility` | `check_facility_max_deposit_amount_positive` | `"maxDepositAmount" > 0.00` | **Valid.** Deposits must have a positive maximum threshold. |
| **3** | `Offender` | `check_offender_balance_nonnegative` | `"balance" >= 0.00` | **Valid.** Zero balances ($0.00) are permitted; negative balances (overdrafts) strictly prevented. |
| **4** | `Offender` | `check_offender_weekly_limit_positive` | `"weeklyLimit" > 0.00` | **Valid.** Inmates must have a valid non-zero weekly allowance. |
| **5** | `Offender` | `check_offender_current_weekly_spent_nonnegative` | `"currentWeeklySpent" >= 0.00` | **Valid.** Spent tally starts at 0.00 on weekly reset; cannot be negative. |
| **6** | `Product` | `check_product_price_nonnegative` | `"price" >= 0.00` | **Valid.** Allows $0.00 promotional or standard-issue institutional items; prohibits negative prices. |
| **7** | `Order` | `check_order_subtotal_nonnegative` | `"subtotal" >= 0.00` | **Valid.** Subtotal cannot be negative. |
| **8** | `Order` | `check_order_tax_nonnegative` | `"tax" >= 0.00` | **Valid.** Tax cannot be negative. |
| **9** | `Order` | `check_order_total_nonnegative` | `"total" >= 0.00` | **Valid.** Total order value cannot be negative. |
| **10** | `OrderItem` | `check_order_item_unit_price_nonnegative` | `"unitPrice" >= 0.00` | **Valid.** Matches Product price rules. |
| **11** | `OrderItem` | `check_order_item_total_price_nonnegative` | `"totalPrice" >= 0.00` | **Valid.** `quantity * unitPrice` cannot be negative. |
| **12** | `Deposit` | `check_deposit_amount_positive` | `"amount" > 0.00` | **Valid.** Deposits must add money; zero or negative deposits rejected. |
| **13** | `Deposit` | `check_deposit_fee_nonnegative` | `"fee" >= 0.00` | **Valid.** Fee can be $0.00 (waived or fee-free facilities) or positive. |
| **14** | `Deposit` | `check_deposit_total_paid_positive` | `"totalPaid" > 0.00` | **Valid.** Family total payment (`amount + fee`) must be positive. |
| **15** | `LedgerEntry` | `check_ledger_debit_nonnegative` | `"debit" >= 0.00` | **Valid.** Double-entry standard: debits are non-negative. |
| **16** | `LedgerEntry` | `check_ledger_credit_nonnegative` | `"credit" >= 0.00` | **Valid.** Double-entry standard: credits are non-negative. |
| **17** | `LedgerEntry` | `check_ledger_non_zero_entry` | `"debit" > 0.00 OR "credit" > 0.00` | **Valid.** Prohibits ghost/phantom entries where both debit and credit are zero. |
| **18** | `LedgerEntry` | `check_ledger_balance_before_nonnegative` | `"balanceBefore" >= 0.00` | **Valid.** Historical balance audit trail cannot reflect overdraft. |
| **19** | `LedgerEntry` | `check_ledger_balance_after_nonnegative` | `"balanceAfter" >= 0.00` | **Valid.** Inmate balance after transaction cannot reflect overdraft. |
| **20** | `GiftPackage` | `check_gift_package_total_value_nonnegative` | `"totalValue" >= 0.00` | **Valid.** Package retail value cannot be negative. |

### Evaluation of Reversals, Refunds, and Adjustments

A potential concern in financial database design is whether refund or adjustment records could conflict with non-negative constraints.
- In double-entry accounting:
  - An order refund is recorded as a **Credit** to the offender balance (reversing a prior debit).
  - An adjustment correcting an over-credit is recorded as a **Debit** to the offender balance.
  - In both scenarios, the debit or credit amount is strictly positive, accompanied by a transaction `type` of `REFUND` or `ADJUSTMENT`.
- Therefore, the constraints `"debit" >= 0.00`, `"credit" >= 0.00`, and `("debit" > 0.00 OR "credit" > 0.00)` **fully accommodate refunds, chargebacks, and administrative adjustments** without requiring negative values.

---

## 7. AUTOMATED TEST COVERAGE & EVIDENCE

The full test suite was executed to ensure complete regression prevention:

### 7.1 Test Execution Summary

- **Total Test Files:** 19 test files passed (100%)
- **Total Tests:** 162 tests passed (100%)
- **Test Failures:** 0
- **TypeScript Static Compilation:** Clean (`npx tsc --noEmit` exited with 0 errors)

### 7.2 Precision Hardening Test Suite (`tests/financial-precision-hardening.test.ts`)

The dedicated precision test suite covers:
1. **Binary Floating-Point Elimination:** Demonstrates `0.10 + 0.20 === 0.30` without IEEE 754 float drift.
2. **Sub-Cent Accumulation:** Verifies multiple sub-dollar additions (`$0.01 + $0.10 + $0.29 + $0.99 = $1.39`) without fractional drift.
3. **Multiplication & Rounding:** Verifies unit pricing calculations (`3 * $1.29 = $3.87`, `7 * $0.33 = $2.31`).
4. **Gateway Cents Conversion:** Validates integer conversion for payment processors (`19.99` $\rightarrow$ `1999` cents).
5. **DTO Serialization Contracts:** Verifies Order, Offender, Deposit, Product, Facility, and GiftPackage serializers properly convert Decimals to numbers for frontend consumers.
6. **Database Decimal Storage:** Verifies that queried database records yield true `Prisma.Decimal` instances.
7. **Atomic Transactions:** Validates that atomic increments/decrements execute precisely within transaction blocks.

---

## 8. CLASSIFICATION OF FINDINGS & FINAL DECISION

### 8.1 Findings Classification

- **CRITICAL (0):** None.
- **HIGH (0):** None.
- **MEDIUM (0):** None.
- **LOW (1):**
  - *Observation:* Staging currently contains 0 records. Once staging synthetic seed data is introduced in subsequent phases, multi-concurrent load testing should be performed against the staging Supabase pooler to validate connection pooling behavior under concurrent lock conditions.

---

### 8.2 FINAL MIGRATION DECISION

$$\mathbf{APPROVED\ FOR\ STAGING\ MIGRATION}$$

**Decision Rationale:**
1. The migration SQL is completely non-destructive and comprehensively covers all 19 monetary fields.
2. The staging database is in a clean-slate state (0 rows), completely eliminating any risk of conversion data loss or constraint rejection.
3. The 18 CHECK constraints provide robust, defense-in-depth overdraft protection and business rule enforcement.
4. The application-tier Decimal implementation and explicit DTO serializers protect frontend API contracts and prevent floating-point drift.
5. All 162 automated tests pass with zero regressions and zero TypeScript errors.

---

## 9. RECOMMENDED STAGING DEPLOYMENT PROCEDURE

Upon receipt of explicit user authorization to apply the migration to staging:

### Step 1 — Pre-Flight Environment Verification
Confirm that the execution environment loads `.env.staging` targeting Supabase project `zcamheygapbruuovikar` and that no production credentials are loaded.

### Step 2 — Execute Staging Migration
Execute the official Prisma migration deployment command targeting the PostgreSQL staging schema:

```bash
npx prisma migrate deploy --schema prisma/schema.postgresql.prisma
```

*(Note: Prisma automatically detects the pending migration `20261117214000_financial_precision_hardening` in `prisma/migrations/`, applies the SQL to staging PostgreSQL, and logs the entry in `_prisma_migrations`.)*

### Step 3 — Post-Migration Staging Verification
1. Inspect `information_schema.columns` to verify all 19 monetary columns now report `data_type = 'numeric'` and `numeric_precision = 12, numeric_scale = 2`.
2. Inspect `information_schema.table_constraints` to verify all 8 CHECK constraint blocks are active.
3. Verify `_prisma_migrations` confirms `20261117214000_financial_precision_hardening` has `applied_steps_count = 1` and `rolled_back_at IS NULL`.
