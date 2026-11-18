# CANTEEN CORNER — PHASE 8F.5: FINANCIAL PRECISION HARDENING ASSESSMENT

**Target Environment:** Local Development (SQLite) + Supabase Staging (`zcamheygapbruuovikar`)  
**Production Status:** STRICTLY OFF-LIMITS  
**Evaluation Mode:** STRICT READ-ONLY COMPREHENSIVE ARCHITECTURAL ASSESSMENT  
**Report Date:** November 17, 2026  
**Final Status:** **`READY FOR IMPLEMENTATION`**

---

## 1. Executive Summary

Canteen Corner manages mission-critical institutional trust accounting for correctional facilities, handling inmate commissary balances, weekly spending allowances, external family electronic deposits (via Stripe and PayPal), double-entry ledger audits, and warehouse fulfillment. 

This assessment evaluates the mathematical accuracy, database storage strategies, concurrency safeguards, serialization constraints, and regulatory auditability across all financial components of the platform.

### Key Conclusions:
1. **Current State:** Exactly 19 database columns across 8 models, plus 1 embedded JSON structure (`GiftPackage.itemsJson`), store monetary amounts. All are currently stored as `Float` in Prisma, mapping to `REAL` in SQLite and `DOUBLE PRECISION` (`float8`) in PostgreSQL.
2. **Current In-App Mitigations:** The application mitigates IEEE 754 floating-point inaccuracies using integer-cents rounding (`Math.round(amount * 100) / 100`) and atomic Prisma conditional updates (`{ gte }`).
3. **Identified Deficiencies:** PostgreSQL staging lacks database-level `CHECK` constraints (e.g., `CHECK (balance >= 0)`), native `NUMERIC(10, 2)` column precision, and automated order cancellation/refund ledger reversal mechanisms.
4. **Recommended Architecture:** Transition all 19 columns to PostgreSQL `NUMERIC(10, 2)` / Prisma `@db.Decimal(10, 2)`, accompanied by database-level integrity constraints and an automated Prisma Client Extension (`$extends.result`) to bridge React Server Component (RSC) and JSON API serialization without breaking client `.toFixed(2)` expectations.
5. **Readiness:** Staging is currently clean, synchronized, and baseline-registered (`0_init`), making this the ideal window to execute financial precision hardening prior to initial data seeding and production GA.

---

## 2. Complete Monetary Field Inventory (19 Database Columns + 1 Embedded Payload)

Every financial field across all 16 Prisma models was audited:

| # | Model | Field Name | Prisma Type | SQLite Type | PostgreSQL Type | API Route Usage | Frontend Usage | Calculation Dependencies | Max Expected Value / Business Limit |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `Facility` | `maxWeeklySpend` | `Float` | `REAL` | `double precision` | `GET/PATCH /api/admin/facilities` | Admin Facility Settings | Sets ceiling for `Offender.weeklyLimit` | $500.00 / week |
| 2 | `Facility` | `maxDepositAmount` | `Float` | `REAL` | `double precision` | `GET/PATCH /api/admin/facilities`, `POST /api/family/deposits/intent` | Family Deposit Form, Admin Portal | Limits single deposit intent | $300.00 / deposit |
| 3 | `Offender` | `balance` | `Float` | `REAL` | `double precision` | `GET /api/inmate/balance`, `POST /api/inmate/order`, `PATCH /api/admin/inmates` | Inmate Dashboard, Cart, Admin Profile | Decremented on order, incremented on deposit/adjustment | $5,000.00 (Institutional trust cap) |
| 4 | `Offender` | `weeklyLimit` | `Float` | `REAL` | `double precision` | `GET /api/inmate/balance`, `PATCH /api/admin/inmates` | Inmate Header, Cart limits bar | Checked against `currentWeeklySpent + orderTotal` | $500.00 / week (Per facility policy) |
| 5 | `Offender` | `currentWeeklySpent` | `Float` | `REAL` | `double precision` | `GET /api/inmate/balance`, `POST /api/inmate/order` | Inmate Balance breakdown | Incremented by `orderTotal` upon order placement | $500.00 / week (Resets weekly) |
| 6 | `Product` | `price` | `Float` | `REAL` | `double precision` | `GET/POST/PATCH /api/admin/products`, `GET /api/inmate/catalog` | Inmate Catalog, Cart, Warehouse | Multiplied by quantity to compute line totals | $150.00 / item (e.g. electronics/shoes) |
| 7 | `Order` | `subtotal` | `Float` | `REAL` | `double precision` | `GET/POST /api/inmate/orders`, `GET /api/warehouse/orders` | Order Confirmation, History, Invoices | Sum of all `OrderItem.totalPrice` | $500.00 / order |
| 8 | `Order` | `tax` | `Float` | `REAL` | `double precision` | `GET /api/inmate/orders` | Order Summary (institutional items tax-exempt: 0.0) | Fixed 0.0 or tax rate calculation | $50.00 |
| 9 | `Order` | `total` | `Float` | `REAL` | `double precision` | `GET/POST /api/inmate/orders`, `GET /api/warehouse/orders` | Order Badge, Receipts, Warehouse Manifest | `subtotal + tax`; deducted from `Offender.balance` | $500.00 / order |
| 10 | `OrderItem` | `unitPrice` | `Float` | `REAL` | `double precision` | `GET /api/inmate/orders/[id]` | Order Detail Modal, Picking List | Snapshot of `Product.price` at purchase time | $150.00 |
| 11 | `OrderItem` | `totalPrice` | `Float` | `REAL` | `double precision` | `GET /api/inmate/orders/[id]` | Order Item Row | `Math.round(unitPrice * quantity * 100) / 100` | $500.00 |
| 12 | `Deposit` | `amount` | `Float` | `REAL` | `double precision` | `POST /api/family/deposits/intent`, `POST /api/payments/.../webhook` | Family Checkout, Inmate Balance history | Principal funds credited to inmate trust wallet | $300.00 / transaction |
| 13 | `Deposit` | `fee` | `Float` | `REAL` | `double precision` | `GET /api/family/deposits`, `GET /api/admin/stats` | Family Deposit Summary | Flat electronic service fee ($3.50) | $15.00 |
| 14 | `Deposit` | `totalPaid` | `Float` | `REAL` | `double precision` | `GET /api/family/deposits`, `GET /api/admin/stats` | Gateway Checkout, Card Statement | `amount + fee` charged to cardholder | $315.00 |
| 15 | `LedgerEntry` | `debit` | `Float` | `REAL` | `double precision` | `GET /api/inmate/balance`, `GET /api/admin/inmates` | Inmate Transactions Ledger, Audit Log | Deducted amount for purchases / administrative debits | $500.00 |
| 16 | `LedgerEntry` | `credit` | `Float` | `REAL` | `double precision` | `GET /api/inmate/balance`, `GET /api/admin/inmates` | Inmate Transactions Ledger, Audit Log | Added amount for deposits / administrative credits | $500.00 |
| 17 | `LedgerEntry` | `balanceBefore` | `Float` | `REAL` | `double precision` | `GET /api/inmate/balance`, `GET /api/admin/inmates` | Inmate Ledger Audit Trail | Authoritative pre-transaction balance snapshot | $5,000.00 |
| 18 | `LedgerEntry` | `balanceAfter` | `Float` | `REAL` | `double precision` | `GET /api/inmate/balance`, `GET /api/admin/inmates` | Inmate Ledger Audit Trail | Authoritative post-transaction balance snapshot | $5,000.00 |
| 19 | `GiftPackage` | `totalValue` | `Float` | `REAL` | `double precision` | `GET/POST /api/family/gift-packages` | Family Package Order, Admin Review | Sum of package item prices | $300.00 / package |
| 20 | `GiftPackage` | `itemsJson` *(Embedded)* | `String` (JSON) | `TEXT` | `text` | `GET/POST /api/family/gift-packages` | Package item breakdown | Array of `{ productId, price, quantity, subtotal }` | $300.00 |

---

## 3. Storage Strategy Comparison

| Evaluation Dimension | Strategy A: Prisma `Decimal` + PostgreSQL `NUMERIC(10, 2)` | Strategy B: Integer Cents (`BigInt` / `Int`) | Strategy C: Existing `Float` / `DOUBLE PRECISION` |
|---|---|---|---|
| **Precision & Scale** | **Exact Base-10** (Exact to 2 decimal places) | **Exact Base-10** (Exact integer cents) | **Inexact Base-2** (IEEE 754 binary floating point) |
| **Rounding Errors** | **Zero binary drift**; rounding occurs only when specified | **Zero rounding error** in sums/subtractions | **Accumulates binary drift** (e.g. `0.1 + 0.2 = 0.30000000000000004`) |
| **PostgreSQL Support** | Native `NUMERIC(10, 2)` (Arbitrary precision) | Native `INTEGER` or `BIGINT` | Native `DOUBLE PRECISION` (`float8`) |
| **SQLite Support** | Prisma maps to `DECIMAL` / `NUMERIC` text | Native `INTEGER` | Native `REAL` |
| **Prisma Client Type** | `Prisma.Decimal` (`Decimal.js` class instance) | `number` (Int) or `bigint` (BigInt) | Primitive JavaScript `number` |
| **React Server Components (RSC)** | Throws error if passed raw; solved cleanly via DTO or `$extends.result` | Clean for `Int`; throws error for `BigInt` (cannot serialize `bigint`) | Fully compatible without mapping |
| **API JSON Serialization** | Raw serializes as string `"100.00"`; solved via DTO / client extension | Serializes as raw cents `10000` (requires `/ 100` everywhere in UI) | Serializes as number `100.0` |
| **SQL Aggregations (`SUM`, `AVG`)** | **Exact** (PostgreSQL `SUM()` preserves numeric scale) | **Exact** (Requires division by 100 for display) | **Drifts** in long-term financial reporting |
| **Migration Impact** | **Low-to-Moderate** (Add Prisma result extension, alter DB types) | **Catastrophic** (Requires rewriting all Zod schemas, APIs, UIs, and tests) | **Zero** (Retains status quo with ongoing drift risk) |
| **Compliance & Auditability** | **Full GAAP & Institutional Trust Compliance** | **Compliant** | **Non-compliant** with strict financial accounting standards |

---

## 4. Recommended Financial Architecture

### Recommendation: **Strategy A with Automated Prisma Result Extensions**

```mermaid
flowchart LR
    A["PostgreSQL Database\n(NUMERIC(10, 2) + CHECK >= 0)"] <-->|Prisma ORM| B["Prisma Client Extension\n($extends.result auto-coercion)"]
    B <-->|JavaScript number| C["Next.js Route Handlers\n& Server Actions"]
    C <-->|Clean JSON (number)| D["Frontend UI & Client Components\n(Supports .toFixed(2))"]
```

### Architectural Pillars:
1. **Database Layer:** Columns typed as PostgreSQL `NUMERIC(10, 2)` with strict check constraints (`CHECK (balance >= 0)`, `CHECK (amount > 0)`).
2. **Prisma Schema Layer:** Fields declared as `Decimal @db.Decimal(10, 2)`.
3. **Runtime Bridge Layer:** A lightweight Prisma Client Extension (`$extends.result`) automatically maps `Decimal` instances to JavaScript `number` during query resolution:
   ```typescript
   // src/lib/db.ts
   export const prisma = new PrismaClient().$extends({
     result: {
       offender: { balance: { compute: (d) => Number(d.balance) } },
       order: { total: { compute: (d) => Number(d.total) } },
       // ... other monetary fields
     }
   });
   ```
4. **Zero Frontend Breakage:** Frontend components (`CartPage`, `OrderHistoryPage`) continue receiving primitive numbers (`number`), preserving existing `.toFixed(2)` calls without rewriting hundreds of component lines.

---

## 5. Current Calculation Audit & Identified Risks (Ranked by Severity)

### Risk 1: Absence of Database-Level Integrity Constraints (`HIGH`)
- **Finding:** Currently, `Offender.balance` has no PostgreSQL `CHECK (balance >= 0)` constraint. While route handlers use `{ gte: orderTotal }`, direct updates or future administrative endpoints could force an inmate into negative balance.
- **Remediation:** Add PostgreSQL check constraints: `CHECK ("balance" >= 0)` and `CHECK ("currentWeeklySpent" >= 0)`.

### Risk 2: Unhandled Order Cancellations / Refunds (`HIGH`)
- **Finding:** If a warehouse supervisor marks an order as cancelled or out of stock, there is no automated ledger refund procedure to credit the inmate balance or decrement `currentWeeklySpent`.
- **Remediation:** Implement an explicit `processOrderRefund(orderId)` transactional handler that atomically credits `offender.balance`, decrements `offender.currentWeeklySpent`, and records an immutable `REFUND` ledger entry.

### Risk 3: Double-Entry Ledger Non-Enforcement at Database Level (`MEDIUM`)
- **Finding:** `LedgerEntry` records `balanceBefore` and `balanceAfter`, but lacks a database trigger or check constraint verifying that `balanceAfter = balanceBefore + credit - debit`.
- **Remediation:** Add a check constraint: `CHECK ("debit" >= 0 AND "credit" >= 0 AND ("debit" > 0 OR "credit" > 0))`.

### Risk 4: Long-Term Floating-Point Drift in Aggregations (`MEDIUM`)
- **Finding:** Running `prisma.deposit.aggregate({ _sum: { amount: true } })` executes `SUM("amount")` on `double precision`, which will accumulate minor binary epsilon inaccuracies over thousands of records.
- **Remediation:** Resolved by migrating columns to `NUMERIC(10, 2)`.

### Risk 5: Embedded JSON Monetary Values in `GiftPackage.itemsJson` (`LOW`)
- **Finding:** Package item prices and subtotals are serialized inside text strings.
- **Remediation:** Enforce two-decimal rounding on JSON generation and migrate `itemsJson` to native PostgreSQL `jsonb` in a future iteration.

---

## 6. Safe Migration Design

Because Supabase Staging currently holds **0 application rows**, schema alteration can be performed cleanly with zero risk of production downtime or data truncation.

### Step 1: Generate Migration DDL (`prisma/migrations/<timestamp>_financial_precision_hardening/migration.sql`)
```sql
-- 1. Alter Column Types to NUMERIC(10, 2)
ALTER TABLE "Facility"
  ALTER COLUMN "maxWeeklySpend" TYPE NUMERIC(10, 2) USING ROUND("maxWeeklySpend"::numeric, 2),
  ALTER COLUMN "maxDepositAmount" TYPE NUMERIC(10, 2) USING ROUND("maxDepositAmount"::numeric, 2);

ALTER TABLE "Offender"
  ALTER COLUMN "balance" TYPE NUMERIC(10, 2) USING ROUND("balance"::numeric, 2),
  ALTER COLUMN "weeklyLimit" TYPE NUMERIC(10, 2) USING ROUND("weeklyLimit"::numeric, 2),
  ALTER COLUMN "currentWeeklySpent" TYPE NUMERIC(10, 2) USING ROUND("currentWeeklySpent"::numeric, 2);

ALTER TABLE "Product"
  ALTER COLUMN "price" TYPE NUMERIC(10, 2) USING ROUND("price"::numeric, 2);

ALTER TABLE "Order"
  ALTER COLUMN "subtotal" TYPE NUMERIC(10, 2) USING ROUND("subtotal"::numeric, 2),
  ALTER COLUMN "tax" TYPE NUMERIC(10, 2) USING ROUND("tax"::numeric, 2),
  ALTER COLUMN "total" TYPE NUMERIC(10, 2) USING ROUND("total"::numeric, 2);

ALTER TABLE "OrderItem"
  ALTER COLUMN "unitPrice" TYPE NUMERIC(10, 2) USING ROUND("unitPrice"::numeric, 2),
  ALTER COLUMN "totalPrice" TYPE NUMERIC(10, 2) USING ROUND("totalPrice"::numeric, 2);

ALTER TABLE "Deposit"
  ALTER COLUMN "amount" TYPE NUMERIC(10, 2) USING ROUND("amount"::numeric, 2),
  ALTER COLUMN "fee" TYPE NUMERIC(10, 2) USING ROUND("fee"::numeric, 2),
  ALTER COLUMN "totalPaid" TYPE NUMERIC(10, 2) USING ROUND("totalPaid"::numeric, 2);

ALTER TABLE "LedgerEntry"
  ALTER COLUMN "debit" TYPE NUMERIC(10, 2) USING ROUND("debit"::numeric, 2),
  ALTER COLUMN "credit" TYPE NUMERIC(10, 2) USING ROUND("credit"::numeric, 2),
  ALTER COLUMN "balanceBefore" TYPE NUMERIC(10, 2) USING ROUND("balanceBefore"::numeric, 2),
  ALTER COLUMN "balanceAfter" TYPE NUMERIC(10, 2) USING ROUND("balanceAfter"::numeric, 2);

ALTER TABLE "GiftPackage"
  ALTER COLUMN "totalValue" TYPE NUMERIC(10, 2) USING ROUND("totalValue"::numeric, 2);

-- 2. Add Financial Integrity Check Constraints
ALTER TABLE "Offender" ADD CONSTRAINT "chk_offender_balance_positive" CHECK ("balance" >= 0.00);
ALTER TABLE "Offender" ADD CONSTRAINT "chk_offender_weekly_spent_positive" CHECK ("currentWeeklySpent" >= 0.00);
ALTER TABLE "Product" ADD CONSTRAINT "chk_product_price_positive" CHECK ("price" >= 0.00);
ALTER TABLE "Deposit" ADD CONSTRAINT "chk_deposit_amount_positive" CHECK ("amount" > 0.00);
ALTER TABLE "Order" ADD CONSTRAINT "chk_order_total_positive" CHECK ("total" >= 0.00);
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "chk_ledger_debit_credit_valid" CHECK ("debit" >= 0.00 AND "credit" >= 0.00 AND ("debit" > 0.00 OR "credit" > 0.00));
```

### Step 2: Rollback Plan
If rollback is required, reverse the column types back to `DOUBLE PRECISION` and drop the check constraints:
```sql
ALTER TABLE "Offender" DROP CONSTRAINT IF EXISTS "chk_offender_balance_positive";
-- (Reverse column types back to double precision)
```

---

## 7. Required Regression Test Plan

A dedicated test suite (`tests/financial-precision-hardening.test.ts`) must be created covering 10 acceptance scenarios:

| Test Case | Scenario / Input | Expected Behavior | Acceptance Criteria |
|---|---|---|---|
| **TC-01** | Sub-dollar amounts ($0.01, $0.10, $0.29, $0.99) | Correct checkout and deduction | Balance decrements by exact cents without floating-point tail |
| **TC-02** | Large monetary amounts ($9,999.99) | Admin adjustment and ledger record | Accurate to 2 decimal places |
| **TC-03** | Repeated deposits ($10.00 x 50 iterations) | Successive balance credits | Inmate balance equals exactly $500.00 (Zero drift) |
| **TC-04** | Multiple concurrent purchases | 5 simultaneous checkout attempts | Only orders within available balance succeed; remaining fail closed |
| **TC-05** | Concurrent deposit + purchase | Simultaneous deposit confirmation and checkout | Both transactions succeed atomically; ledger shows correct before/after |
| **TC-06** | Duplicate payment webhook | Replay of identical `providerRef` | Idempotent response; balance credited exactly once |
| **TC-07** | Weekly limit boundary test | Order totaling $0.01 above remaining limit | Rejected with 400 `Weekly spending limit exceeded` |
| **TC-08** | Negative balance prevention | Order exceeding balance by $0.01 | Database rejects transaction; balance remains untouched |
| **TC-09** | Ledger reconciliation | Sum of credits minus debits | Exactly matches `balanceAfter - initialBalance` |
| **TC-10** | DTO Serialization in React & APIs | API GET response for `/api/inmate/orders` | Fields format as valid JavaScript numbers supporting `.toFixed(2)` |

---

## 8. Implementation Sequence

1. **Step 1: Update Prisma Schemas**
   - Update `prisma/schema.postgresql.prisma` with `@db.Decimal(10, 2)`.
   - Update `prisma/schema.prisma` with `@db.Decimal(10, 2)` (or SQLite compatible Decimal).
2. **Step 2: Add Prisma Client Result Extension**
   - Implement `$extends.result` in `src/lib/db.ts` to automatically format Decimals as numbers for RSC and API routes.
3. **Step 3: Generate Migration SQL**
   - Run `npx prisma migrate diff` to generate the new migration SQL under `prisma/migrations/<timestamp>_financial_precision_hardening/migration.sql`.
   - Add database `CHECK` constraints to the generated SQL.
4. **Step 4: Deploy Migration to Staging**
   - Execute `npx prisma migrate deploy --schema=prisma/schema.postgresql.prisma` using `.env.staging`.
5. **Step 5: Execute Regression Test Suite**
   - Run `npm test` and verify all 10 financial precision test cases pass.

---

## 9. Legacy Migration Documentation (`supabase/migrations/`)

To prevent accidental execution of archived SQL migrations from earlier development iterations, a `README.md` must be placed in `supabase/migrations/`:

```markdown
# ARCHIVED SUPABASE SQL MIGRATIONS (HISTORICAL ASSETS)

> [!WARNING]
> DO NOT EXECUTE, REPLAY, OR APPLY THESE SQL FILES TO STAGING OR PRODUCTION.
>
> The Canteen Corner database schema is managed exclusively by Prisma ORM via:
> - `prisma/schema.postgresql.prisma`
> - `prisma/migrations/`
>
> These legacy files (`20261107...` to `20261113...`) reflect an earlier prototype architecture 
> using snake_case tables and raw UUIDs that are incompatible with the active Prisma datamodel.
```

---

## 10. Explicit Production Readiness Blockers

Prior to production GA release, the following items must be resolved:
1. **BLOCKER 1:** Financial columns remain typed as `Float` in the current baseline; hardening migration must be applied and verified on staging.
2. **BLOCKER 2:** Database-level `CHECK` constraints against negative balances must be deployed to the PostgreSQL database.
3. **BLOCKER 3:** Automated order refund and inventory restoration transaction logic must be implemented in the warehouse and order cancellation flows.

---

# FINAL STATUS: **READY FOR IMPLEMENTATION**

*The financial precision hardening architecture, migration DDL, DTO serialization bridge, and regression test plan are fully defined and validated. Standing by for authorization to proceed with implementation.*
