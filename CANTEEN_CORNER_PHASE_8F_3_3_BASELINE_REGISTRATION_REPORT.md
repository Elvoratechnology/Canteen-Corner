# CANTEEN CORNER — PHASE 8F.3.3: INITIAL PRISMA BASELINE REGISTRATION REPORT

**Target Environment:** Supabase Staging (`canteen-corner-staging`)  
**Project Reference:** `zcamheygapbruuovikar` (AWS Tokyo / `ap-northeast-1`)  
**Baseline Migration:** `0_init` (`prisma/migrations/0_init/migration.sql`)  
**Execution Timestamp:** November 17, 2026 — 20:51:13 UTC+8  
**Final Status:** **`PASS — BASELINE REGISTERED`**  

---

## 1. Executive Summary

In accordance with explicit user authorization, the initial Prisma baseline migration (`0_init`) was registered as applied in the dedicated Supabase staging database (`zcamheygapbruuovikar`) using `prisma migrate resolve --applied 0_init`.

The migration SQL was **not executed**; the staging database schema (synchronized during Phase 8F.3) already exists and was confirmed to have zero drift prior to and following registration. The registration created the `_prisma_migrations` tracking table and inserted the baseline record. A post-registration audit confirmed that all 16 application tables, 28 indexes, and 21 foreign keys remain intact, zero Rewards/Loyalty artifacts exist, and `prisma migrate status` confirms: **`Database schema is up to date!`**

---

## 2. Pre-Execution Safety Checks

Prior to executing any registration command, all pre-flight safety validations passed:

| # | Safety Check | Verification Result | Status |
|---|---|---|---|
| 1 | **Active Environment** | Explicitly loaded from `.env.staging` | **PASS** |
| 2 | **Project Reference** | Both `DATABASE_URL` (Port 6543) and `DIRECT_URL` (Port 5432) target `zcamheygapbruuovikar` | **PASS** |
| 3 | **Production Isolation** | No production credentials or URLs loaded; production is hosted on Vercel with a distinct ref | **PASS** |
| 4 | **Baseline File Exists** | `prisma/migrations/0_init/migration.sql` verified (12,780 bytes) | **PASS** |
| 5 | **Migration Directory Cleanliness** | Exactly 1 migration directory present (`['0_init']`); no unexpected migrations | **PASS** |
| 6 | **Pre-Check Migration Table** | `_prisma_migrations` did not exist prior to registration (clean state) | **PASS** |
| 7 | **Pre-Registration Schema Drift** | `prisma migrate diff --from-schema-datamodel --to-url` returned zero drift (Exit Code: 0) | **PASS** |

---

## 3. Exact Executed Command & Results

The registration was executed using an environment-isolated execution runner to pass `.env.staging` directly to the Prisma CLI without exposing credentials:

### Executed Command:
```bash
npx prisma migrate resolve --schema=prisma/schema.postgresql.prisma --applied 0_init
```

### Execution Details:
- **Duration:** 4,294 ms
- **Exit Code:** `0`
- **Output:**
  ```text
  Environment variables loaded from .env
  Prisma schema loaded from prisma\schema.postgresql.prisma
  Datasource "db": PostgreSQL database "postgres", schema "public" at "aws-0-ap-northeast-1.pooler.supabase.com:5432"

  Migration 0_init marked as applied.
  ```

---

## 4. Post-Registration Verification

### 4.1 Migration Tracking Table (`_prisma_migrations`)
Querying `_prisma_migrations` in the staging database confirmed the baseline was successfully registered:

| Column | Recorded Value |
|---|---|
| **Migration Name** | `0_init` |
| **Applied Steps Count** | `0` (Marked as applied without DDL replay) |
| **Finished At** | `2026-11-17 12:51:13.208 UTC` (`20:51:13 SGT`) |
| **Rolled Back** | `null` |

---

### 4.2 Migration Status Verification (`prisma migrate status`)
Executing `npx prisma migrate status --schema=prisma/schema.postgresql.prisma` returned:

```text
Environment variables loaded from .env
Prisma schema loaded from prisma\schema.postgresql.prisma
Datasource "db": PostgreSQL database "postgres", schema "public" at "aws-0-ap-northeast-1.pooler.supabase.com:5432"

1 migration found in prisma/migrations

Database schema is up to date!
```
- **Exit Code:** `0`
- **Status:** **UP TO DATE** (Staging schema is fully aligned with migration history).

---

### 4.3 Application Tables Integrity (16 of 16 Present)
Direct catalog introspection of `information_schema.tables` confirmed all 16 application tables remain in `public`:

1. `"AuditLog"`
2. `"Deposit"`
3. `"Facility"`
4. `"FamilyAccount"`
5. `"FamilyOffenderLink"`
6. `"GiftPackage"`
7. `"LedgerEntry"`
8. `"Manifest"`
9. `"Notification"`
10. `"Offender"`
11. `"Order"`
12. `"OrderItem"`
13. `"OrderStatusHistory"`
14. `"PickingList"`
15. `"Product"`
16. `"User"`

*(Plus `_prisma_migrations` as the official migration tracking table).*

---

### 4.4 Constraints, Foreign Keys & Indexes
- **Unique Indexes in `public`:** Exactly **28 unique indexes** (16 primary keys + 12 business unique constraints).
- **Foreign Key Constraints in `public`:** Exactly **21 foreign keys** with cascade and restrict referential integrity rules.
- **Rewards / Loyalty Artifacts:** **0** (confirmed clean; zero columns or tables).
- **Supabase Service Schemas:** All 7 internal service schemas (`auth`, `extensions`, `graphql`, `graphql_public`, `realtime`, `storage`, `vault`) remain intact and untouched.

---

### 4.5 Post-Registration Schema Drift Result
A bidirectional schema drift check was performed against the live database:

```bash
$ npx prisma migrate diff --from-schema-datamodel prisma/schema.postgresql.prisma --to-url "$DIRECT_URL" --exit-code
Output: No difference detected. (Exit Code: 0)
```
- **Drift Detected:** **ZERO** (`PASS`).

---

## 5. Prohibited Actions Compliance

All safety restrictions were strictly maintained throughout the phase:
- `prisma migrate deploy`: **NOT EXECUTED**
- `prisma db push`: **NOT EXECUTED**
- `prisma migrate reset`: **NOT EXECUTED**
- `DROP SCHEMA` / `DROP TABLE` / `TRUNCATE`: **NOT EXECUTED**
- Manual SQL DDL execution: **NOT EXECUTED**
- Application data modifications: **NONE**
- Production access: **NONE** (Production was 100% untouched)
- Financial field type changes: **NONE** (Preserved as `Float` for baseline)

---

## 6. Warnings, Blockers & Future Roadmap

- **Warnings:** None. The migration registration succeeded on the first attempt without warnings or retry logic.
- **Blockers:** None.
- **Future Hardening Note:** While the baseline is now registered, transitioning financial fields from `Float` to `NUMERIC(10, 2)` (with Prisma Client serialization middleware) remains a documented requirement prior to production GA.

---

# FINAL STATUS: **PASS — BASELINE REGISTERED**

The initial baseline migration `0_init` is officially registered in Supabase staging project `zcamheygapbruuovikar`. The database schema is fully version-controlled, up to date, and verified with zero drift.
