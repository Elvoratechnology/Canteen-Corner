# Canteen Corner — PostgreSQL Compatibility Report
**Phase:** 8A — PostgreSQL Compatibility Preparation  
**Generated:** 2026-11-17  
**Prisma CLI Version:** 5.22.0  
**@prisma/client Version:** 5.22.0  
**Installed Node.js:** v24.22.1  
**Current Development Database:** SQLite (`prisma/dev.db`)  
**Target Staging Database:** Supabase PostgreSQL  

---

## 1. Executive Summary

This report delivers a comprehensive structural, architectural, and compatibility analysis of Canteen Corner's database layer. The current local development environment uses SQLite via Prisma 5.22.0, while future staging and production environments will run on Supabase PostgreSQL.

The audit examined all 16 Prisma models, 137 model attributes, 4 historical SQL migrations in `supabase/migrations/`, and runtime behaviors across 31 API routes and services.

---

## 2. Prisma Engine & Dependency Inventory

The application utilizes **Prisma 5.22.0** (latest stable release of Prisma 5 series; not Prisma 6 or Prisma 7).

```json
"dependencies": {
  "@prisma/client": "^5.21.1", // Resolved at runtime: 5.22.0
  "@supabase/ssr": "^0.12.7",
  "@supabase/supabase-js": "^2.119.0",
  "next": "^14.2.18",
  "react": "^18.3.1"
},
"devDependencies": {
  "prisma": "^5.21.1" // Resolved at runtime: 5.22.0
}
```

### Architecture Characteristics in Prisma 5.22.0:
- **Datasource provider:** Static (`provider = "sqlite"` cannot be dynamically evaluated from an environment variable).
- **Client Output:** Generates TypeScript definitions directly to `node_modules/@prisma/client`.
- **Query Engine:** Node-API library engine (`query_engine-windows.dll.node` locally, Linux binary in container).
- **Migration Engine:** `schema-engine-cli`.

---

## 3. SQLite vs. PostgreSQL Model Compatibility Matrix

Every Prisma model defined in `prisma/schema.prisma` was evaluated against PostgreSQL requirements:

| Model | SQLite Current Type | Target PostgreSQL Type | Migration Concerns & Required Changes |
| :--- | :--- | :--- | :--- |
| **Facility** | `maxWeeklySpend: Float`<br>`maxDepositAmount: Float` | `@db.Decimal(10, 2)` | Convert `Float` to `Decimal(10, 2)` to eliminate floating-point drift. Add check constraint `max_weekly_spend > 0`. |
| **User** | `role: String`<br>`passwordHash: String?`<br>`staffId: String? @unique` | `role: UserRole` (Enum) or `VarChar` | In PostgreSQL, validate against `user_role` enum (`INMATE`, `FAMILY`, `WAREHOUSE_PICKER`, `WAREHOUSE_SUPERVISOR`, `ADMIN`). |
| **Offender** | `id: String @id`<br>`balance: Float`<br>`weeklyLimit: Float`<br>`currentWeeklySpent: Float` | `id: Text @id`<br>`balance: Decimal(10,2)`<br>`weeklyLimit: Decimal(10,2)`<br>`currentWeeklySpent: Decimal(10,2)` | Critical financial table. Requires PostgreSQL CHECK constraint `balance >= 0.00` and `current_weekly_spent <= weekly_limit`. |
| **FamilyAccount** | `id: String @id @default(cuid())`<br>`userId: String @unique` | `id: Text @id @default(cuid())`<br>`userId: Text @unique` | Foreign key to `User(id)`. Fully compatible. |
| **Product** | `price: Float`<br>`stock: Int`<br>`reorderLevel: Int` | `price: Decimal(10,2)`<br>`stock: Int`<br>`reorderLevel: Int` | Add PostgreSQL check constraint `price >= 0.00` and `stock >= 0`. |
| **Order** | `subtotal: Float`<br>`tax: Float`<br>`total: Float`<br>`orderNumber: String @unique` | `@db.Decimal(10, 2)`<br>`status: OrderStatus` (Enum) | Ensure `subtotal + tax = total` check constraint in PostgreSQL. |
| **OrderItem** | `unitPrice: Float`<br>`totalPrice: Float` | `@db.Decimal(10, 2)` | Ensure `quantity * unitPrice = totalPrice` invariant. `onDelete: Cascade` supported in both. |
| **OrderStatusHistory** | `previousStatus: String?`<br>`newStatus: String` | `OrderStatus` (Enum) or `Text` | Fully compatible. `onDelete: Cascade` with `Order`. |
| **Deposit** | `amount: Float`<br>`fee: Float`<br>`totalPaid: Float`<br>`provider: String` | `@db.Decimal(10, 2)`<br>`provider: DepositProvider` (Enum) | Enforce `totalPaid >= amount` constraint. `provider` accepts `STRIPE`, `PAYPAL`, and historical `TOUCHPAY`. |
| **LedgerEntry** | `debit: Float`<br>`credit: Float`<br>`balanceBefore: Float`<br>`balanceAfter: Float` | `@db.Decimal(10, 2)` | Strict double-entry balance check constraint in PostgreSQL: `balance_after = balance_before + credit - debit`. |
| **GiftPackage** | `itemsJson: String`<br>`totalValue: Float` | `itemsJson: Json` / `@db.JsonB`<br>`totalValue: Decimal(10,2)` | In SQLite, stored as stringified JSON. In PostgreSQL, native `Json` or `JsonB` allows query indexing. |
| **Notification** | `id: String @id @default(cuid())`<br>`read: Boolean @default(false)` | Fully compatible | Maps directly to PostgreSQL `boolean` and `text`. |
| **PickingList** | `orderId: String @unique`<br>`status: String` | Fully compatible | Unique 1:1 relation to `Order`. |
| **Manifest** | `manifestNumber: String @unique`<br>`deliveryDate: DateTime` | Fully compatible | Maps `DateTime` to `TIMESTAMP WITH TIME ZONE`. |
| **AuditLog** | `metadata: String?` | `metadata: Json?` / `@db.JsonB` | In SQLite stored as text; in PostgreSQL, native `JsonB` provides structured indexing. |
| **FamilyOffenderLink**| `@@unique([familyAccountId, offenderId])` | Fully compatible | Composite unique constraint supported natively by both SQLite and PostgreSQL. |

---

## 4. Evaluation of Dual-Database Schema Strategies

To allow local development with SQLite while supporting Supabase PostgreSQL staging, three architectural approaches were evaluated:

### Option A — Separate Prisma Schema Files
- Structure: `prisma/schema.sqlite.prisma` and `prisma/schema.postgresql.prisma`.
- **Pros:** Full access to PostgreSQL-specific native types (`@db.Decimal`, `@db.JsonB`, native enums).
- **Cons:**
  1. *Schema drift hazard:* Field additions or changes must be manually maintained in two files.
  2. *Prisma Client collision:* Running `prisma generate` overwrites `node_modules/@prisma/client`. When the PostgreSQL schema generates `Prisma.Decimal`, local code expecting JavaScript `number` will trigger TypeScript compiler errors.
  3. *CLI complexity:* Requires custom npm wrapper scripts for every Prisma CLI command (`--schema=...`).

### Option B — Shared Portable Schema
- Structure: A single `prisma/schema.prisma` using generic types supported by both engines (e.g. `Float`, `String` for enums and JSON).
- **Pros:** Zero risk of schema drift; unified Prisma Client generation.
- **Cons:**
  1. Sacrifices PostgreSQL native `Decimal(10, 2)` and relies on JavaScript IEEE 754 floating point in production.
  2. Prevents the use of native PostgreSQL check constraints and triggers that enforce financial safety.
  3. Fails institutional banking audit requirements for commissary accounting.

### Option C — PostgreSQL Migration Staging Branch (RECOMMENDED STRATEGY)
- Structure:
  1. `main` branch maintains current verified SQLite schema and tests for rapid offline local development.
  2. A dedicated `release/phase8-postgresql-staging` branch transitions `prisma/schema.prisma` to `provider = "postgresql"` with `@db.Decimal(10, 2)` and native PostgreSQL migrations.
  3. Continuous integration runs test suites against both:
     - SQLite suite for unit/integration tests (`npm test`).
     - PostgreSQL test suite for staging CI/CD.
- **Why Option C is Superior:**
  - Preserves 100% of the Phase 1–7 completed work on `main` without risk of corruption.
  - Eliminates client-generation overwrite issues.
  - Follows standard enterprise release engineering: schema migrations live on release branches and are verified against staging before merging.

---

## 5. Table Name Case-Sensitivity Discrepancy

A critical structural discovery was made regarding table naming:
- In `supabase/migrations/`: Earlier SQL migrations created snake_case plural tables: `facilities`, `user_profiles`, `offenders`, `products`, `orders`, `order_items`, `deposits`, `ledger_entries`.
- In `prisma/schema.prisma`: Models are PascalCase singular without `@@map`: `Facility`, `User`, `Offender`, `Product`, `Order`, `OrderItem`, `Deposit`, `LedgerEntry`.
- **PostgreSQL Impact:** PostgreSQL identifiers are case-sensitive when quoted. Prisma queries `SELECT ... FROM "User"`. If the database only has `public.user_profiles` or `public.users`, Prisma queries fail with `relation "User" does not exist`.
- **Resolution Strategy for Phase 8B:**
  In the PostgreSQL Prisma schema, explicitly map models to PostgreSQL conventions using `@@map("table_name")` and `@map("column_name")`, OR let Prisma generate its native tables and reconcile with Supabase RLS.

