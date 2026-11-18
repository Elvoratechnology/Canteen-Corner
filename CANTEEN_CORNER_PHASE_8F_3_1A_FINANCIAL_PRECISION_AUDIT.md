# CANTEEN CORNER — PHASE 8F.3.1A: FINANCIAL PRECISION AUDIT REPORT

**Target Environment:** Supabase Staging (`canteen-corner-staging`)  
**Project Reference:** `zcamheygapbruuovikar` (AWS Tokyo / `ap-northeast-1`)  
**PostgreSQL Version:** 17.12 on `aarch64-unknown-linux-gnu`  
**Evaluation Mode:** STRICT READ-ONLY AUDIT (Zero database modifications, zero schema edits)  
**Report Date:** November 17, 2026  
**Final Status:** **`READY FOR MIGRATION BASELINING`**

---

## 1. Executive Summary

A comprehensive post-synchronization financial precision audit was performed across the live staging PostgreSQL database (`zcamheygapbruuovikar`), the local SQLite development database (`prisma/dev.db`), and both Prisma schema files (`prisma/schema.postgresql.prisma` and `prisma/schema.prisma`).

### Key Findings:
1. **19 Monetary Fields Identified:** Exactly 19 financial fields exist across 8 operational models (`Facility`, `Offender`, `Product`, `Order`, `OrderItem`, `Deposit`, `LedgerEntry`, `GiftPackage`).
2. **Current Type Configuration:** All 19 fields are currently declared as `Float` in both Prisma schemas, mapping to SQLite `REAL` and PostgreSQL `DOUBLE PRECISION` (`float8`, 53-bit binary precision).
3. **Floating-Point Arithmetic in Use:** IEEE 754 binary floating-point representation is currently active in both databases and the JavaScript runtime.
4. **Application Mitigation Present:** The codebase actively mitigates binary floating-point rounding inaccuracies via integer-cents calculations: `Math.round(amount * 100) / 100` and `Math.round(amount * 100)`.
5. **Baselining Compatibility:** The current staging database schema matches the application codebase and test suite 1:1. Migration baselining (`Phase 8F.3.2`) is safe to proceed without risk of application or test breakage.

---

## 2. Comprehensive Financial Column Inventory & Type Verification

Across all 16 models, exactly 8 models contain financial attributes. The remaining 8 models (`User`, `FamilyAccount`, `FamilyOffenderLink`, `OrderStatusHistory`, `Notification`, `PickingList`, `Manifest`, `AuditLog`) contain zero monetary fields.

### Detailed 19-Field Inventory:

| # | Model | Column Name | Prisma Type | SQLite Storage | PostgreSQL Type | PG UDT | Binary Prec. | Scale | Default Value | Floating-Point Arithmetic? |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `Facility` | `maxWeeklySpend` | `Float` | `REAL` | `double precision` | `float8` | 53 | `null` | `100.0` | **YES** |
| 2 | `Facility` | `maxDepositAmount` | `Float` | `REAL` | `double precision` | `float8` | 53 | `null` | `300.0` | **YES** |
| 3 | `Offender` | `balance` | `Float` | `REAL` | `double precision` | `float8` | 53 | `null` | `0.0` | **YES** |
| 4 | `Offender` | `weeklyLimit` | `Float` | `REAL` | `double precision` | `float8` | 53 | `null` | `100.0` | **YES** |
| 5 | `Offender` | `currentWeeklySpent` | `Float` | `REAL` | `double precision` | `float8` | 53 | `null` | `0.0` | **YES** |
| 6 | `Product` | `price` | `Float` | `REAL` | `double precision` | `float8` | 53 | `null` | None | **YES** |
| 7 | `Order` | `subtotal` | `Float` | `REAL` | `double precision` | `float8` | 53 | `null` | None | **YES** |
| 8 | `Order` | `tax` | `Float` | `REAL` | `double precision` | `float8` | 53 | `null` | `0.0` | **YES** |
| 9 | `Order` | `total` | `Float` | `REAL` | `double precision` | `float8` | 53 | `null` | None | **YES** |
| 10 | `OrderItem` | `unitPrice` | `Float` | `REAL` | `double precision` | `float8` | 53 | `null` | None | **YES** |
| 11 | `OrderItem` | `totalPrice` | `Float` | `REAL` | `double precision` | `float8` | 53 | `null` | None | **YES** |
| 12 | `Deposit` | `amount` | `Float` | `REAL` | `double precision` | `float8` | 53 | `null` | None | **YES** |
| 13 | `Deposit` | `fee` | `Float` | `REAL` | `double precision` | `float8` | 53 | `null` | `0.0` | **YES** |
| 14 | `Deposit` | `totalPaid` | `Float` | `REAL` | `double precision` | `float8` | 53 | `null` | None | **YES** |
| 15 | `LedgerEntry` | `debit` | `Float` | `REAL` | `double precision` | `float8` | 53 | `null` | `0.0` | **YES** |
| 16 | `LedgerEntry` | `credit` | `Float` | `REAL` | `double precision` | `float8` | 53 | `null` | `0.0` | **YES** |
| 17 | `LedgerEntry` | `balanceBefore` | `Float` | `REAL` | `double precision` | `float8` | 53 | `null` | None | **YES** |
| 18 | `LedgerEntry` | `balanceAfter` | `Float` | `REAL` | `double precision` | `float8` | 53 | `null` | None | **YES** |
| 19 | `GiftPackage` | `totalValue` | `Float` | `REAL` | `double precision` | `float8` | 53 | `null` | None | **YES** |

---

## 3. Current Arithmetic & Application Behavior Audit

### 3.1 In-App Rounding Mitigations
Inspection of key transactional routes reveals how floating-point numbers are handled:
1. **Inmate Order Checkout (`src/app/api/inmate/order/route.ts`):**
   - Item line calculation: `const itemTotal = Math.round(prod.price * quantity * 100) / 100;`
   - Subtotal aggregation: `calculatedSubtotal = Math.round(calculatedSubtotal * 100) / 100;`
   - Snapshot ledger balance before: `const balanceBefore = Math.round((balanceAfter + orderTotal) * 100) / 100;`
2. **Deposit Confirmation Engine (`src/lib/payments/confirmation.ts`):**
   - Integer-cent fraud detection:
     ```typescript
     const depositCents = Math.round(deposit.amount * 100);
     const verifiedCents = Math.round(verifiedAmount * 100);
     if (depositCents !== verifiedCents) { /* Flag PAYMENT_AMOUNT_MISMATCH_FRAUD */ }
     ```
   - Snapshot ledger balance before: `const balanceBefore = Math.round((balanceAfter - creditAmount) * 100) / 100;`

### 3.2 Risks of Current `Float` / `double precision` Storage:
- **Binary Fraction Representation:** Base-2 floating-point cannot represent fractions like `0.10` or `0.05` exactly.
- **SQL Aggregations Drift:** Running native PostgreSQL aggregations (`SELECT SUM(amount) FROM "Deposit"`) over thousands of rows can accumulate epsilon drift (e.g., `$1,250.0000000000002`).
- **Regulatory Compliance:** Strict financial ledger standards (GAAP, institutional correctional trust compliance) generally mandate fixed-point numeric types (`NUMERIC(10, 2)` / `DECIMAL(10, 2)`).

---

## 4. Evaluation of Prisma `Decimal` / PostgreSQL `NUMERIC(10, 2)`

Switching from `Float` to Prisma `Decimal` (`@db.Decimal(10, 2)`) in the schema was evaluated across four critical dimensions:

### 4.1 Application Calculations Compatibility: `BREAKING`
- **Issue:** In Prisma Client, fields typed as `Decimal` are returned as `Decimal.js` class instances, **not** JavaScript primitive numbers (`number`).
- **Impact:** Expressions such as `offender.balance - orderTotal`, `deposit.amount * 100`, or `amount > maxDeposit` will throw runtime `TypeError` or evaluate incorrectly unless refactored to `.toNumber()`, `new Prisma.Decimal()`, or `Decimal.js` method chains (`.minus()`, `.times()`, `.greaterThan()`).

### 4.2 Next.js & React Server Component (RSC) Serialization: `BREAKING`
- **Issue:** Next.js Server Components enforce strict serialization rules. Complex class instances like `Decimal.js` cannot cross the server-to-client component boundary.
- **Error:** `Error: Only plain objects, and a few built-ins, can be passed to Client Components from Server Components. Classes or other complex objects cannot be passed.`
- **API Response Impact:** Standard `JSON.stringify(decimal)` serializes decimals as JSON strings (`"100.00"`) rather than numbers (`100.00`), breaking frontend components and TypeScript interfaces expecting `number`.

### 4.3 SQLite Development Compatibility: `COMPATIBLE WITH REFACTOR`
- Prisma supports `Decimal` in SQLite (stored internally as text/real), but client models still return `Decimal.js` instances, requiring identical code refactoring across development and production.

### 4.4 Automated Test Suite Impact: `HIGH BREAKAGE RISK`
- All 18 existing test files (151 unit/integration tests) pass primitive JavaScript numbers (`{ balance: 82.50, amount: 25.00 }`). An immediate schema change to `Decimal` without code refactoring would cause widespread test failures.

---

## 5. Architectural Recommendations & Roadmap

| Stage | Strategy | Action Items | Risk Level |
|---|---|---|---|
| **Immediate (Phase 8F.3.2)** | **Baseline with `Float`** | Baseline staging schema as-is (`0_init`) to establish the official Git migration baseline matching existing code and SQLite. | **ZERO RISK** |
| **Intermediate (Post-Staging Hardening)** | **Prisma Client `$extends.result` Bridge** | Introduce a Prisma Client extension that automatically coerces `Decimal` to JavaScript `number` on read, avoiding breaking RSC serialization. | **LOW RISK** |
| **Final (Pre-Production Enterprise)** | **Migrate to `NUMERIC(10, 2)`** | Execute an explicit migration (`ALTER TABLE "..." ALTER COLUMN "..." TYPE NUMERIC(10, 2)`) with full regression testing of financial routes. | **CONTROLLED RISK** |

---

## 6. Final Status & Conclusion

# **FINAL STATUS: READY FOR MIGRATION BASELINING**

- The synchronized staging PostgreSQL database is fully consistent with the local SQLite database and the Next.js application codebase.
- Integer-cents rounding in application routes (`Math.round(... * 100) / 100`) adequately protects current transaction flows from binary drift.
- Migration baselining (`Phase 8F.3.2`) captures this initial verified state (`0_init`) into version control without breaking changes.
- Transitioning to `NUMERIC(10, 2)` is documented as a future dedicated hardening phase.

*Standing by for explicit authorization to proceed with Phase 8F.3.2 (Baseline Migration Generation and Registration).*
