# CANTEEN CORNER — PHASE 8F.1: STAGING DATABASE CONNECTIVITY TEST REPORT

**Execution Date:** November 17, 2026  
**Target Project:** `canteen-corner-staging`  
**Target Project Reference:** `zcamheygapbruuovikar` (AWS Tokyo / `ap-northeast-1`)  
**Environment File Used:** `.env.staging` (Strictly isolated; `.env` was never loaded)  
**Prisma Version:** `5.22.0`  
**Node.js Version:** `v24.22.1`  
**Overall Result:** **`FAIL`** (Authentication syntax rejection & IPv4 direct DNS resolution)  

---

## 1. OBJECTIVE & EXECUTION SUMMARY

In accordance with Phase 8F.1 protocols, a non-destructive, strictly read-only connectivity test was performed using `.env.staging`. No migrations, schema mutations, seed scripts, or data write operations were executed.

### Test Query Executed:
```sql
SELECT 1 AS connection_test;
```
*(Executed via Prisma database engine without schema modification or data changes).*

---

## 2. PORT & TOPOLOGY VERIFICATION

| Connection Variable | Host Target | Port | Protocol / Mode | Network Reachability | Result | Error Code / Details |
| :--- | :--- | :---: | :--- | :---: | :---: | :--- |
| **`DATABASE_URL`** | `aws-0-ap-northeast-1.pooler.supabase.com` | `6543` | Supabase Transaction Pooler (Supavisor) | **Reachable** (TCP SYN/ACK in 130ms) | **`FAIL`** | `P1000: Authentication failed against database server` |
| **`DIRECT_URL`** | `db.zcamheygapbruuovikar.supabase.co` | `5432` | Direct PostgreSQL Connection | **Unreachable** (DNS `ENOTFOUND`) | **`FAIL`** | `P1001: Can't reach database server at db.zcamheygapbruuovikar.supabase.co:5432` |

---

## 3. ROOT CAUSE ANALYSIS

### A. Root Cause 1: Literal Square Brackets in Database Password (`DATABASE_URL`)
- **Inspection Finding:** In [`.env.staging`](file:///c:/Users/justi/OneDrive/Desktop/Canteen%20Corner/.env.staging), the password value was pasted retaining the surrounding square brackets `[` and `]` from the placeholder `[YOUR-PASSWORD]`.
- **Impact:** PostgreSQL authentication received the square brackets as literal characters of the password. The Supabase pooler actively rejected the credentials with error:
  ```
  Error: P1000: Authentication failed against database server at aws-0-ap-northeast-1.pooler.supabase.com,
  the provided database credentials for postgres are not valid.
  ```
- **Correction:** The square brackets `[` and `]` must be removed so only the actual password string is passed.

### B. Root Cause 2: IPv4 vs. IPv6 DNS Resolution for Direct Connection (`DIRECT_URL`)
- **Inspection Finding:** TCP diagnostics against `db.zcamheygapbruuovikar.supabase.co:5432` failed with:
  ```
  [TCP] Direct (5432) ERROR: getaddrinfo ENOTFOUND db.zcamheygapbruuovikar.supabase.co
  ```
- **Technical Context:** Modern Supabase direct database hostnames (`db.[REF].supabase.co`) resolve exclusively over IPv6 networks. On local development machines operating on IPv4 internet routes, DNS resolution fails.
- **Supabase Official Architecture:** For IPv4 networks, Supabase provides the **Session Mode Pooler** on port `5432` using the pooler host:
  `postgresql://postgres.zcamheygapbruuovikar:<PASSWORD>@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres`
  TCP verification confirmed that `aws-0-ap-northeast-1.pooler.supabase.com:5432` is reachable and connected in **78ms**.

---

## 4. STRICT SAFETY CONFIRMATION

- **Production Safety:** Production database was **NEVER** accessed or contacted.
- **Local SQLite Safety:** Local development database (`prisma/dev.db`) remains 100% untouched.
- **Environment Isolation:** Local `.env` was preserved without modification.
- **Schema Safety:** Neither `prisma/schema.prisma` nor `prisma/schema.postgresql.prisma` was modified.
- **Data Integrity:** **Zero** tables created, **zero** records inserted, modified, or deleted.
- **Source Control Safety:** `.env.staging` remains untracked and Git-ignored.

---

## 5. REQUIRED OWNER ACTIONS & RECOMMENDED NEXT STEPS

To resolve the connectivity failures, update [`.env.staging`](file:///c:/Users/justi/OneDrive/Desktop/Canteen%20Corner/.env.staging) with the following corrected format:

```env
# CANTEEN CORNER — STAGING DATABASE ONLY
# Never put production credentials in this file.

# 1. Transaction Pooler (Port 6543) for runtime queries (brackets removed, pgbouncer=true preserved)
DATABASE_URL="postgresql://postgres.zcamheygapbruuovikar:<ACTUAL_PASSWORD_WITHOUT_BRACKETS>@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true"

# 2. Session Mode Pooler (Port 5432) for direct migrations over IPv4 (brackets removed)
DIRECT_URL="postgresql://postgres.zcamheygapbruuovikar:<ACTUAL_PASSWORD_WITHOUT_BRACKETS>@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres"
```

> [!IMPORTANT]
> 1. Ensure there are **no square brackets `[` or `]`** around your password.
> 2. Notice that for IPv4 networks, `DIRECT_URL` uses username `postgres.zcamheygapbruuovikar` and host `aws-0-ap-northeast-1.pooler.supabase.com:5432`.

Once [`.env.staging`](file:///c:/Users/justi/OneDrive/Desktop/Canteen%20Corner/.env.staging) is updated, we will re-run the non-destructive Phase 8F.1 connectivity verification before proceeding to schema migration.

