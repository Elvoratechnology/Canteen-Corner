# Canteen Corner — Financial Data Audit & Representation Strategy
**Phase:** 8A — PostgreSQL Compatibility Preparation  
**Generated:** 2026-11-17  
**Scope:** Complete inventory of all monetary, balance, fee, pricing, and ledger fields across Canteen Corner.  

---

## 1. Executive Summary

In a correctional facility commissary, financial precision is critical. Minor rounding errors can create ledger imbalances, violate statutory inmate trust fund protections, or trigger legal and regulatory liabilities.

The current SQLite development implementation stores currency amounts as 64-bit IEEE 754 floating-point numbers (`Float` in Prisma, `number` in TypeScript). To prevent precision loss and IEEE 754 decimal representation artifacts (e.g., `0.1 + 0.2 = 0.30000000000000004`), all current mutations perform round-half-up operations using `Math.round(val * 100) / 100`.

This audit details every financial field and compares two enterprise PostgreSQL target architectures:
1. **Strategy A:** PostgreSQL `@db.Decimal(10, 2)` (Fixed-point numeric)
2. **Strategy B:** Integer minor units (Storing all values in whole cents)

---

## 2. Complete Financial Field Inventory

Fourteen discrete financial fields across eight models were audited:

| Model | Field Name | Prisma Type | Runtime Type | Unit / Currency | Min / Max Range | Arithmetic Locations | PostgreSQL Target |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Facility** | `maxWeeklySpend` | `Float` | `number` | USD Dollars | $0.01 – $1,000.00 | Policy enforcement | `Decimal(10, 2)` |
| **Facility** | `maxDepositAmount` | `Float` | `number` | USD Dollars | $1.00 – $5,000.00 | Deposit validation | `Decimal(10, 2)` |
| **Offender** | `balance` | `Float` | `number` | USD Dollars | $0.00 – $10,000.00 | Orders, deposits, adjustments | `Decimal(10, 2)` |
| **Offender** | `weeklyLimit` | `Float` | `number` | USD Dollars | $0.00 – $1,000.00 | Weekly spending checks | `Decimal(10, 2)` |
| **Offender** | `currentWeeklySpent`| `Float` | `number` | USD Dollars | $0.00 – $1,000.00 | Order placements | `Decimal(10, 2)` |
| **Product** | `price` | `Float` | `number` | USD Dollars | $0.01 – $500.00 | Order subtotal calculation | `Decimal(10, 2)` |
| **Order** | `subtotal` | `Float` | `number` | USD Dollars | $0.01 – $1,000.00 | Sum of order items | `Decimal(10, 2)` |
| **Order** | `tax` | `Float` | `number` | USD Dollars | $0.00 – $200.00 | Tax computation (default $0) | `Decimal(10, 2)` |
| **Order** | `total` | `Float` | `number` | USD Dollars | $0.01 – $1,000.00 | Order charging (`subtotal+tax`)| `Decimal(10, 2)` |
| **OrderItem** | `unitPrice` | `Float` | `number` | USD Dollars | $0.01 – $500.00 | Line-item pricing | `Decimal(10, 2)` |
| **OrderItem** | `totalPrice` | `Float` | `number` | USD Dollars | $0.01 – $1,000.00 | `unitPrice * quantity` | `Decimal(10, 2)` |
| **Deposit** | `amount` | `Float` | `number` | USD Dollars | $5.00 – $300.00 | Inmate wallet credit | `Decimal(10, 2)` |
| **Deposit** | `fee` | `Float` | `number` | USD Dollars | $0.00 – $25.00 | Payment gateway surcharge | `Decimal(10, 2)` |
| **Deposit** | `totalPaid` | `Float` | `number` | USD Dollars | $5.00 – $325.00 | Charged to card/PayPal | `Decimal(10, 2)` |
| **LedgerEntry** | `debit` | `Float` | `number` | USD Dollars | $0.00 – $10,000.00 | Wallet deduction audit | `Decimal(10, 2)` |
| **LedgerEntry** | `credit` | `Float` | `number` | USD Dollars | $0.00 – $10,000.00 | Wallet increase audit | `Decimal(10, 2)` |
| **LedgerEntry** | `balanceBefore` | `Float` | `number` | USD Dollars | $0.00 – $10,000.00 | Historical ledger balance | `Decimal(10, 2)` |
| **LedgerEntry** | `balanceAfter` | `Float` | `number` | USD Dollars | $0.00 – $10,000.00 | Historical ledger balance | `Decimal(10, 2)` |
| **GiftPackage** | `totalValue` | `Float` | `number` | USD Dollars | $1.00 – $500.00 | Care package contents | `Decimal(10, 2)` |

---

## 3. Comparison of Financial Strategies

### Strategy A: PostgreSQL `@db.Decimal(10, 2)`
- **Mechanism:** PostgreSQL stores values in exact base-10 fixed-point format (`NUMERIC(10, 2)`).
- **Prisma Representation:** Prisma Client returns a `Prisma.Decimal` object (backed by `decimal.js`).
- **Advantages:**
  1. Complete elimination of floating-point drift at the database level.
  2. Native alignment with existing PostgreSQL check constraints (`balance >= 0.00`).
  3. Seamless database-level math in SQL triggers (`NEW.balance - OLD.balance`).
  4. Familiar dollar representation in database GUI tools and direct SQL audits ($82.50 is stored as `82.50`).
- **Considerations / Implementation Requirements:**
  - `Prisma.Decimal` objects cannot be directly serialized into JSON via `NextResponse.json()` without converting to string or number (`val.toFixed(2)` or `val.toNumber()`).
  - Arithmetic in TypeScript must use `.plus()`, `.minus()`, `.times()` methods or explicit converter utilities.

### Strategy B: Integer Minor Units (Whole Cents)
- **Mechanism:** Storing all values as integer cents ($82.50 = `8250` cents, $1.50 = `150` cents).
- **Advantages:**
  1. Avoids decimal conversion issues in both SQLite and PostgreSQL.
  2. Aligns with Stripe's API which natively expects integer cents (`amount: 5000` for $50.00).
- **Disadvantages:**
  1. *Breaking schema change:* Requires altering every database column, API contract, and frontend UI display.
  2. Breaks backward compatibility with existing demo database records in `prisma/dev.db`.
  3. PayPal API and client reporting require decimal strings (`"50.00"`), introducing constant conversions (`cents / 100`).
  4. Substantial risk of human error in display formatting (e.g. displaying $8250 instead of $82.50).

---

## 4. Formal Financial Recommendation

**Recommendation: Adopt Strategy A (`@db.Decimal(10, 2)`) for the PostgreSQL Schema.**

### Rationale:
1. `supabase/migrations/20261107000000_canteen_corner_security_rls.sql` already authored and deployed the tables using `NUMERIC(10, 2)`.
2. Supabase SQL trigger `prevent_direct_balance_tampering` expects `NUMERIC(10, 2)` inputs and computes delta invariants using PostgreSQL decimal arithmetic.
3. Fixed-point `Decimal(10, 2)` provides institutional audit compliance without altering the user-facing decimal API contracts.

### Serialization Helper Pattern for Phase 8B:
To prevent JSON serialization errors while ensuring type safety, introduce a standardized financial serialization helper in `src/lib/money.ts`:
```typescript
import { Prisma } from '@prisma/client';

export function toDecimal(val: number | string | Prisma.Decimal): Prisma.Decimal {
  return new Prisma.Decimal(val);
}

export function toNumber(val: Prisma.Decimal | number): number {
  return typeof val === 'number' ? val : val.toNumber();
}

export function formatCurrency(val: Prisma.Decimal | number): string {
  const num = typeof val === 'number' ? val : val.toNumber();
  return num.toFixed(2);
}
```

