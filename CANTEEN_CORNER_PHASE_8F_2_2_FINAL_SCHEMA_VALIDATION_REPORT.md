# CANTEEN CORNER — PHASE 8F.2.2: POST-REWARDS REMOVAL FINAL SCHEMA VALIDATION REPORT

**Target Environment:** Supabase Staging (`canteen-corner-staging`)  
**Project Reference:** `zcamheygapbruuovikar` (AWS Tokyo / `ap-northeast-1`)  
**Audit Date:** November 17, 2026  
**Status:** **READY FOR PHASE 8F.3 (INITIAL STAGING SYNCHRONIZATION)**

---

## 1. Executive Summary

Following the complete removal of the Rewards / Loyalty feature from Canteen Corner, a comprehensive read-only validation was performed on the updated PostgreSQL Prisma schema (`prisma/schema.postgresql.prisma`) and development SQLite schema (`prisma/schema.prisma`).

This audit confirms that:
1. **0 Rewards Artifacts Exist in Schema:** The database schemas never contained rewards or loyalty tables, columns, relations, or enums; the model count remains exactly 16.
2. **Dual Validation PASS:** Both `prisma/schema.prisma` and `prisma/schema.postgresql.prisma` pass strict Prisma CLI syntax and relational integrity validation (`The schema is valid 🚀`).
3. **Additive DDL Preview:** A fresh `prisma migrate diff` preview confirms that synchronization will perform 16 `CREATE TABLE`, 12 `CREATE UNIQUE INDEX`, and 21 `FOREIGN KEY` constraints.
4. **0 Destructive Operations:** Zero `DROP TABLE`, zero `DROP COLUMN`, and zero `TRUNCATE` operations are present in the synchronization plan.
5. **Core Financial & Commissary Integrity:** Offender balances, weekly spending limits, double-entry ledgers, deposits, family relations, product inventory, and warehouse fulfillment remain 100% modeled and intact.
6. **Environment Isolation Verified:** `.env.staging` connects exclusively to staging project `zcamheygapbruuovikar` and remains strictly Git-ignored.

---

## 2. Model Count & Schema Consistency Audit

### Model Inventory (16 Core Models)

Both schemas were analyzed and cross-referenced. Exactly 16 core operational models exist across both files with 100% relational parity:

| # | Model Name | Primary Responsibility | Primary Key | Key Relations |
|---|---|---|---|---|
| 1 | `Facility` | Correctional institution & rules | `id String @id @default(cuid())` | `users`, `offenders`, `products`, `manifests` |
| 2 | `User` | Administrative & portal authentication | `id String @id @default(cuid())` | `facility`, `offenderProfile`, `familyAccount`, `pickingLists` |
| 3 | `Offender` | Incarcerated individual profile & wallet | `id String @id` (Inmate ID / CUID) | `facility`, `user`, `orders`, `deposits`, `ledgerEntries`, `links` |
| 4 | `FamilyAccount` | Approved external family contact | `id String @id @default(cuid())` | `user`, `deposits`, `giftPackages`, `links` |
| 5 | `Product` | Commissary catalog & inventory | `id String @id @default(cuid())` | `facility`, `orderItems` |
| 6 | `Order` | Inmate commissary purchase order | `id String @id @default(cuid())` | `offender`, `items`, `statusHistory`, `manifest`, `pickingList` |
| 7 | `OrderItem` | Line item within an order | `id String @id @default(cuid())` | `order` (CASCADE), `product` |
| 8 | `OrderStatusHistory` | Audit trail of order status transitions | `id String @id @default(cuid())` | `order` (CASCADE) |
| 9 | `Deposit` | External funds transfer to inmate | `id String @id @default(cuid())` | `offender`, `familyAccount` |
| 10 | `LedgerEntry` | Immutable double-entry financial log | `id String @id @default(cuid())` | `offender` |
| 11 | `GiftPackage` | Family care package order | `id String @id @default(cuid())` | `offender`, `familyAccount` |
| 12 | `Notification` | System alerts & order updates | `id String @id @default(cuid())` | `offender` |
| 13 | `PickingList` | Warehouse order fulfillment sheet | `id String @id @default(cuid())` | `order`, `picker` (`User`) |
| 14 | `Manifest` | Facility batch delivery manifest | `id String @id @default(cuid())` | `facility`, `orders` |
| 15 | `AuditLog` | Security & compliance audit log | `id String @id @default(cuid())` | None (standalone audit log) |
| 16 | `FamilyOffenderLink` | Vetted family-offender relationship | `id String @id @default(cuid())` | `familyAccount` (CASCADE), `offender` (CASCADE) |

- **SQLite Model Count:** 16
- **PostgreSQL Model Count:** 16
- **Model Discrepancies:** 0

---

## 3. Prisma Schema CLI Validation Results

### SQLite Schema (`prisma/schema.prisma`)
```bash
$ npx prisma validate --schema=prisma/schema.prisma
Environment variables loaded from .env
Prisma schema loaded from prisma\schema.prisma
The schema at prisma\schema.prisma is valid 🚀
```

### PostgreSQL Staging Schema (`prisma/schema.postgresql.prisma`)
```bash
$ node scratch/validate_postgres_schema.js
Environment variables loaded from .env
Prisma schema loaded from prisma\schema.postgresql.prisma
The schema at prisma\schema.postgresql.prisma is valid 🚀
```

Both schemas compiled without syntax warnings, missing relation attributes, or broken foreign key definitions.

---

## 4. Rewards / Loyalty Removal Verification

A dedicated search was executed across both schemas for any references to `reward`, `loyalty`, or point redemption:

| Search Parameter | Target Schema | Matches Found | Status |
|---|---|---|---|
| `reward\|loyalty` | `prisma/schema.prisma` | **0** | **CONFIRMED CLEAN** |
| `reward\|loyalty` | `prisma/schema.postgresql.prisma` | **0** | **CONFIRMED CLEAN** |
| `point\|points` | `prisma/schema.prisma` | **0** | **CONFIRMED CLEAN** |
| `point\|points` | `prisma/schema.postgresql.prisma` | **0** | **CONFIRMED CLEAN** |

**Conclusion:** The database schema is completely free of any rewards or loyalty footprint. The previous removal of `src/app/inmate/reentry-rewards/page.tsx` and related UI elements eliminated all frontend artifacts while leaving the database layer unaffected and clean.

---

## 5. Relationships, Constraints & Indexes Review

The PostgreSQL schema enforces strict relational integrity and data indexing:

### Unique Constraints (12 Indexes)
1. `User_email_key` on `User("email")`
2. `User_staffId_key` on `User("staffId")`
3. `Offender_userId_key` on `Offender("userId")`
4. `FamilyAccount_userId_key` on `FamilyAccount("userId")`
5. `Product_sku_key` on `Product("sku")`
6. `Order_orderNumber_key` on `Order("orderNumber")`
7. `Order_barcode_key` on `Order("barcode")`
8. `Deposit_providerRef_key` on `Deposit("providerRef")`
9. `Deposit_idempotencyKey_key` on `Deposit("idempotencyKey")`
10. `PickingList_orderId_key` on `PickingList"("orderId")`
11. `Manifest_manifestNumber_key` on `Manifest"("manifestNumber")`
12. `FamilyOffenderLink_familyAccountId_offenderId_key` on `FamilyOffenderLink("familyAccountId", "offenderId")`

### Foreign Key Constraints (21 Relations)
- **Cascade Deletions (`ON DELETE CASCADE`):**
  - `OrderItem` -> `Order` (cleans line items if order is deleted)
  - `OrderStatusHistory` -> `Order` (cleans history log if order is deleted)
  - `FamilyOffenderLink` -> `FamilyAccount` (cleans links on account removal)
  - `FamilyOffenderLink` -> `Offender` (cleans links on offender profile removal)
- **Restricted Deletions (`ON DELETE RESTRICT`):**
  - Prevents orphaned records in `Order`, `OrderItem`, `Deposit`, `LedgerEntry`, `GiftPackage`, `PickingList`, and `Manifest`.
- **Nullable Relations (`ON DELETE SET NULL`):**
  - Optional assignments in `User.facilityId`, `Product.facilityId`, `Order.manifestId`, `Deposit.familyAccountId`, `Notification.offenderId`, and `PickingList.pickerUserId`.

---

## 6. Financial & Monetary Data Types Review

All financial and ledger-relevant fields are consistently typed across the application:

| Model | Field | Type | Default | Description |
|---|---|---|---|---|
| `Facility` | `maxWeeklySpend` | `Float` (`DOUBLE PRECISION`) | `100.0` | Maximum commissary spend cap per inmate |
| `Facility` | `maxDepositAmount` | `Float` (`DOUBLE PRECISION`) | `300.0` | Maximum single deposit threshold |
| `Offender` | `balance` | `Float` (`DOUBLE PRECISION`) | `0.0` | Inmate commissary wallet balance |
| `Offender` | `weeklyLimit` | `Float` (`DOUBLE PRECISION`) | `100.0` | Individual inmate weekly spending limit |
| `Offender` | `currentWeeklySpent` | `Float` (`DOUBLE PRECISION`) | `0.0` | Weekly spend tracker resetting per schedule |
| `Product` | `price` | `Float` (`DOUBLE PRECISION`) | None | Unit purchase price |
| `Order` | `subtotal` | `Float` (`DOUBLE PRECISION`) | None | Pre-tax sum of items |
| `Order` | `tax` | `Float` (`DOUBLE PRECISION`) | `0.0` | Computed sales tax |
| `Order` | `total` | `Float` (`DOUBLE PRECISION`) | None | Total deducted from balance |
| `OrderItem` | `unitPrice` | `Float` (`DOUBLE PRECISION`) | None | Price per unit at purchase |
| `OrderItem` | `totalPrice` | `Float` (`DOUBLE PRECISION`) | None | Total line item charge |
| `Deposit` | `amount` | `Float` (`DOUBLE PRECISION`) | None | Principal deposit credited to inmate |
| `Deposit` | `fee` | `Float` (`DOUBLE PRECISION`) | `0.0` | Processing fee |
| `Deposit` | `totalPaid` | `Float` (`DOUBLE PRECISION`) | None | Total charged to payment provider |
| `LedgerEntry` | `debit` | `Float` (`DOUBLE PRECISION`) | `0.0` | Amount deducted from balance |
| `LedgerEntry` | `credit` | `Float` (`DOUBLE PRECISION`) | `0.0` | Amount added to balance |
| `LedgerEntry` | `balanceBefore` | `Float` (`DOUBLE PRECISION`) | None | Inmate balance before transaction |
| `LedgerEntry` | `balanceAfter` | `Float` (`DOUBLE PRECISION`) | None | Inmate balance after transaction |
| `GiftPackage` | `totalValue` | `Float` (`DOUBLE PRECISION`) | None | Total value of care package items |

> [!NOTE]
> Floating-point representation in both SQLite and PostgreSQL uses IEEE 754 64-bit double precision, ensuring identical numeric precision during testing and staging. Financial operations in application code (`src/lib/payments/confirmation.ts` and route handlers) utilize explicit two-decimal rounding (`Math.round((amount + Number.EPSILON) * 100) / 100`) to guarantee transaction consistency.

---

## 7. Migration Diff & DDL Preview Summary

Using `prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.postgresql.prisma --script`, a complete non-destructive DDL script was generated and inspected:

```sql
-- SUMMARY OF GENERATED STATEMENTS:
-- 16 CREATE TABLE statements
-- 12 CREATE UNIQUE INDEX statements
-- 21 ALTER TABLE ... ADD CONSTRAINT ... FOREIGN KEY statements
```

### Table Creation Sequence:
1. `CREATE TABLE "Facility"`
2. `CREATE TABLE "User"`
3. `CREATE TABLE "Offender"`
4. `CREATE TABLE "FamilyAccount"`
5. `CREATE TABLE "Product"`
6. `CREATE TABLE "Order"`
7. `CREATE TABLE "OrderItem"`
8. `CREATE TABLE "OrderStatusHistory"`
9. `CREATE TABLE "Deposit"`
10. `CREATE TABLE "LedgerEntry"`
11. `CREATE TABLE "GiftPackage"`
12. `CREATE TABLE "Notification"`
13. `CREATE TABLE "PickingList"`
14. `CREATE TABLE "Manifest"`
15. `CREATE TABLE "AuditLog"`
16. `CREATE TABLE "FamilyOffenderLink"`

---

## 8. Destructive Operation Assessment

| Check | Result | Verification |
|---|---|---|
| `DROP TABLE` statements | **0** | `PASS` |
| `DROP COLUMN` statements | **0** | `PASS` |
| `TRUNCATE` statements | **0** | `PASS` |
| `ALTER ... DROP CONSTRAINT` statements | **0** | `PASS` |
| Target database state | Clean slate (0 tables in `public`) | `PASS` |
| Migration risk level | **Zero Risk** (purely additive creation) | `PASS` |

---

## 9. Staging Environment Isolation Verification

| Parameter | Configuration Value | Status |
|---|---|---|
| **File** | `.env.staging` | Verified present |
| **Git Ignore Status** | `.gitignore:26:.env.staging*` | **CONFIRMED GIT-IGNORED** |
| **DATABASE_URL Host** | `aws-0-ap-northeast-1.pooler.supabase.com:6543` | Transaction Mode Pooler |
| **DIRECT_URL Host** | `aws-0-ap-northeast-1.pooler.supabase.com:5432` | Session Mode Pooler |
| **Target Project Reference** | `zcamheygapbruuovikar` | **STAGING ONLY** |
| **Production Target Configured** | None in local workspace | **PROTECTED** |

---

## 10. Final Recommendation

# **READY FOR PHASE 8F.3**

The PostgreSQL Prisma schema has been validated, the absence of Rewards artifacts is confirmed, the DDL preview is purely additive and error-free, and staging isolation is verified.

**Standing by for explicit authorization to proceed with Phase 8F.3 (Initial Staging Synchronization).**

