# CANTEEN CORNER — PHASE 8F.3: INITIAL STAGING SCHEMA SYNCHRONIZATION REPORT

**Target Environment:** Supabase Staging (`canteen-corner-staging`)  
**Project Reference:** `zcamheygapbruuovikar` (AWS Tokyo / `ap-northeast-1`)  
**PostgreSQL Version:** 17.12 on `aarch64-unknown-linux-gnu`  
**Execution Timestamp:** November 17, 2026 — 20:37:58 UTC+8  
**Synchronization Tool:** Prisma CLI 5.22.0 (`prisma db push`)  
**Execution Result:** **`SUCCESS (100% SYNCHRONIZED)`**  
**Production Impact:** **`NONE (ZERO ACCESS / ZERO MODIFICATION)`**

---

## 1. Executive Summary

In accordance with explicit user authorization, the initial schema synchronization of Canteen Corner's approved 16-model PostgreSQL schema ([prisma/schema.postgresql.prisma](file:///c:/Users/justi/OneDrive/Desktop/Canteen%20Corner/prisma/schema.postgresql.prisma)) was successfully executed against the dedicated Supabase staging project `zcamheygapbruuovikar`.

The operation completed cleanly in 6.79 seconds without data loss, database resets, or syntax errors. Post-synchronization inspection confirms that all 16 tables, 28 indexes (including 12 unique constraints), and 21 foreign key relationships are established with full referential integrity. Supabase internal service schemas (`auth`, `storage`, `vault`, etc.) and system permissions remain intact.

---

## 2. Pre-Execution Identity Reconfirmation

Immediately before running synchronization, `.env.staging` was re-parsed and validated in an isolated execution harness:

| Identity Parameter | Required Target | Inspected Value | Status |
|---|---|---|---|
| **Staging Project Reference** | `zcamheygapbruuovikar` | `zcamheygapbruuovikar` | **VERIFIED** |
| **DATABASE_URL Host** | `aws-0-ap-northeast-1.pooler.supabase.com:6543` | `aws-0-ap-northeast-1.pooler.supabase.com:6543` | **VERIFIED** |
| **DATABASE_URL User** | `postgres.zcamheygapbruuovikar` | `postgres.zcamheygapbruuovikar` | **VERIFIED** |
| **DIRECT_URL Host** | `aws-0-ap-northeast-1.pooler.supabase.com:5432` | `aws-0-ap-northeast-1.pooler.supabase.com:5432` | **VERIFIED** |
| **DIRECT_URL User** | `postgres.zcamheygapbruuovikar` | `postgres.zcamheygapbruuovikar` | **VERIFIED** |
| **Pre-Push Public Tables** | 0 (Clean slate) | 0 | **VERIFIED** |

---

## 3. Actual Execution Command & Configuration

The synchronization was executed via a dedicated runner script to pass `.env.staging` directly to Prisma CLI while preventing credential leakage into shell histories or process trees.

### Executed Command:
```bash
# Executed with environment variables dynamically injected from .env.staging:
npx prisma db push --schema=prisma/schema.postgresql.prisma
```

### Safety Flags Audit:
- `--accept-data-loss`: **NOT USED** (Strictly avoided)
- `--force-reset`: **NOT USED** (Strictly avoided)
- Destination protocol: `aws-0-ap-northeast-1.pooler.supabase.com:5432` (Session Mode Pooler)

### Prisma CLI Execution Output:
```text
Environment variables loaded from .env
Prisma schema loaded from prisma\schema.postgresql.prisma
Datasource "db": PostgreSQL database "postgres", schema "public" at "aws-0-ap-northeast-1.pooler.supabase.com:5432"

Your database is now in sync with your Prisma schema. Done in 6.79s
Exit Code: 0
```

---

## 4. Post-Synchronization Database Inventory & Validation

A comprehensive query across PostgreSQL catalogs (`information_schema.tables`, `pg_indexes`, `information_schema.table_constraints`, `information_schema.columns`) was executed immediately following synchronization:

### 4.1 Table Audit (16 Expected, 16 Found)

| # | Table Name | Type | Status | Primary Responsibility |
|---|---|---|---|---|
| 1 | `AuditLog` | BASE TABLE | **PRESENT** | Compliance and security event auditing |
| 2 | `Deposit` | BASE TABLE | **PRESENT** | External funds deposits (Stripe / PayPal / TouchPay) |
| 3 | `Facility` | BASE TABLE | **PRESENT** | Correctional facility settings & spend rules |
| 4 | `FamilyAccount` | BASE TABLE | **PRESENT** | External family accounts |
| 5 | `FamilyOffenderLink` | BASE TABLE | **PRESENT** | Vetted relationships between family and inmates |
| 6 | `GiftPackage` | BASE TABLE | **PRESENT** | Approved care packages |
| 7 | `LedgerEntry` | BASE TABLE | **PRESENT** | Double-entry financial audit trail |
| 8 | `Manifest` | BASE TABLE | **PRESENT** | Facility delivery batch manifests |
| 9 | `Notification` | BASE TABLE | **PRESENT** | User and inmate alerts |
| 10 | `Offender` | BASE TABLE | **PRESENT** | Inmate profile, balance, and spending limits |
| 11 | `Order` | BASE TABLE | **PRESENT** | Commissary purchase orders |
| 12 | `OrderItem` | BASE TABLE | **PRESENT** | Individual line items within an order |
| 13 | `OrderStatusHistory` | BASE TABLE | **PRESENT** | Order lifecycle status transitions |
| 14 | `PickingList` | BASE TABLE | **PRESENT** | Warehouse picking fulfillment sheets |
| 15 | `Product` | BASE TABLE | **PRESENT** | Commissary catalog & inventory items |
| 16 | `User` | BASE TABLE | **PRESENT** | Portal users (Admin, Officer, Family, Warehouse) |

- **Missing Tables:** **0** (`NONE`)
- **Unexpected Tables:** **0** (`NONE`)

---

### 4.2 Indexes & Unique Constraints (28 Total Indexes)

All 16 primary keys and 12 business unique constraints were created as PostgreSQL `UNIQUE INDEX` objects:

| Table | Index Name | Type / Columns |
|---|---|---|
| `AuditLog` | `AuditLog_pkey` | PRIMARY KEY (`id`) |
| `Deposit` | `Deposit_pkey` | PRIMARY KEY (`id`) |
| `Deposit` | `Deposit_providerRef_key` | UNIQUE (`providerRef`) |
| `Deposit` | `Deposit_idempotencyKey_key` | UNIQUE (`idempotencyKey`) |
| `Facility` | `Facility_pkey` | PRIMARY KEY (`id`) |
| `FamilyAccount` | `FamilyAccount_pkey` | PRIMARY KEY (`id`) |
| `FamilyAccount` | `FamilyAccount_userId_key` | UNIQUE (`userId`) |
| `FamilyOffenderLink` | `FamilyOffenderLink_pkey` | PRIMARY KEY (`id`) |
| `FamilyOffenderLink` | `FamilyOffenderLink_familyAccountId_offenderId_key` | UNIQUE (`familyAccountId`, `offenderId`) |
| `GiftPackage` | `GiftPackage_pkey` | PRIMARY KEY (`id`) |
| `LedgerEntry` | `LedgerEntry_pkey` | PRIMARY KEY (`id`) |
| `Manifest` | `Manifest_pkey` | PRIMARY KEY (`id`) |
| `Manifest` | `Manifest_manifestNumber_key` | UNIQUE (`manifestNumber`) |
| `Notification` | `Notification_pkey` | PRIMARY KEY (`id`) |
| `Offender` | `Offender_pkey` | PRIMARY KEY (`id`) |
| `Offender` | `Offender_userId_key` | UNIQUE (`userId`) |
| `Order` | `Order_pkey` | PRIMARY KEY (`id`) |
| `Order` | `Order_orderNumber_key` | UNIQUE (`orderNumber`) |
| `Order` | `Order_barcode_key` | UNIQUE (`barcode`) |
| `OrderItem` | `OrderItem_pkey` | PRIMARY KEY (`id`) |
| `OrderStatusHistory` | `OrderStatusHistory_pkey` | PRIMARY KEY (`id`) |
| `PickingList` | `PickingList_pkey` | PRIMARY KEY (`id`) |
| `PickingList` | `PickingList_orderId_key` | UNIQUE (`orderId`) |
| `Product` | `Product_pkey` | PRIMARY KEY (`id`) |
| `Product` | `Product_sku_key` | UNIQUE (`sku`) |
| `User` | `User_pkey` | PRIMARY KEY (`id`) |
| `User` | `User_email_key` | UNIQUE (`email`) |
| `User` | `User_staffId_key` | UNIQUE (`staffId`) |

---

### 4.3 Foreign Key Relationships (21 Relationships)

All 21 declared Prisma relations were successfully translated into PostgreSQL foreign key constraints with correct referential actions:

| Source Table.Column | Target Table.Column | ON DELETE Action | ON UPDATE Action |
|---|---|---|---|
| `Deposit.familyAccountId` | `FamilyAccount.id` | `SET NULL` | `CASCADE` |
| `Deposit.offenderId` | `Offender.id` | `RESTRICT` | `CASCADE` |
| `FamilyAccount.userId` | `User.id` | `RESTRICT` | `CASCADE` |
| `FamilyOffenderLink.familyAccountId` | `FamilyAccount.id` | `CASCADE` | `CASCADE` |
| `FamilyOffenderLink.offenderId` | `Offender.id` | `CASCADE` | `CASCADE` |
| `GiftPackage.familyAccountId` | `FamilyAccount.id` | `RESTRICT` | `CASCADE` |
| `GiftPackage.offenderId` | `Offender.id` | `RESTRICT` | `CASCADE` |
| `LedgerEntry.offenderId` | `Offender.id` | `RESTRICT` | `CASCADE` |
| `Manifest.facilityId` | `Facility.id` | `RESTRICT` | `CASCADE` |
| `Notification.offenderId` | `Offender.id` | `SET NULL` | `CASCADE` |
| `Offender.facilityId` | `Facility.id` | `RESTRICT` | `CASCADE` |
| `Offender.userId` | `User.id` | `SET NULL` | `CASCADE` |
| `Order.manifestId` | `Manifest.id` | `SET NULL` | `CASCADE` |
| `Order.offenderId` | `Offender.id` | `RESTRICT` | `CASCADE` |
| `OrderItem.orderId` | `Order.id` | `CASCADE` | `CASCADE` |
| `OrderItem.productId` | `Product.id` | `RESTRICT` | `CASCADE` |
| `OrderStatusHistory.orderId` | `Order.id` | `CASCADE` | `CASCADE` |
| `PickingList.orderId` | `Order.id` | `RESTRICT` | `CASCADE` |
| `PickingList.pickerUserId` | `User.id` | `SET NULL` | `CASCADE` |
| `Product.facilityId` | `Facility.id` | `SET NULL` | `CASCADE` |
| `User.facilityId` | `Facility.id` | `SET NULL` | `CASCADE` |

---

### 4.4 Financial Field Precision Audit

19 financial and floating-point columns were verified:
- Inmate balance (`Offender.balance`): `DOUBLE PRECISION`, default `0.0`
- Spend limits (`Offender.weeklyLimit`, `Offender.currentWeeklySpent`): `DOUBLE PRECISION`
- Facility caps (`Facility.maxWeeklySpend`, `Facility.maxDepositAmount`): `DOUBLE PRECISION`
- Double-entry ledger (`LedgerEntry.debit`, `credit`, `balanceBefore`, `balanceAfter`): `DOUBLE PRECISION`
- Deposit accounting (`Deposit.amount`, `fee`, `totalPaid`): `DOUBLE PRECISION`
- Order totals (`Order.subtotal`, `tax`, `total`): `DOUBLE PRECISION`
- Item pricing (`Product.price`, `OrderItem.unitPrice`, `OrderItem.totalPrice`): `DOUBLE PRECISION`

---

### 4.5 Rewards / Loyalty Elimination Verification

A catalog query across all columns in `public` confirmed:
- Columns containing `reward`: **0**
- Columns containing `loyalty`: **0**
- Columns containing `points`: **0**
- Tables containing `reward`: **0**
- **Status:** Complete absence of Rewards artifacts confirmed on the live database.

---

### 4.6 Supabase System Schemas & Permission Integrity

The 7 core Supabase service schemas were re-inspected and confirmed intact:
- `auth`: Preserved
- `extensions`: Preserved (`pg_stat_statements`, `pgcrypto`, `supabase_vault`, `uuid-ossp`)
- `graphql` & `graphql_public`: Preserved
- `realtime`: Preserved
- `storage`: Preserved
- `vault`: Preserved

---

## 5. Errors and Warnings

- **Synchronization Errors:** **0** (Command completed cleanly with exit code 0).
- **Destructive Statements:** **0** (No tables or columns were dropped).
- **Deprecation / Environment Warnings:** None affecting schema integrity.

---

## 6. Production Database Safety Confirmation

- **Production Target:** Vercel production deployment (`canteen-corner.vercel.app`) connects to a completely distinct remote Supabase project.
- **Connection Isolation:** Zero production connection strings exist in local files or `.env.staging`.
- **Status:** **PRODUCTION WAS 100% UNTOUCHED.**

---

## 7. Next Steps & Phase Handoff

In accordance with strict stop conditions:
- **Phase 8F.3 is complete.**
- **Baseline migration generation and registration (Phase 8F.3.2) has NOT been executed.**
- **Standing by for separate review and explicit authorization prior to any subsequent phase.**
