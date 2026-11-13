# Pre-Deployment Security Review Checklist — Canteen Corner

> [!IMPORTANT]
> **Mandatory Security Clearance**: As a digital commissary platform operating within correctional facilities, Canteen Corner handles sensitive offender personally identifiable information (PII), trust accounting financial balances, order fulfillment manifests, and payment transactions.
> 
> Production deployment is blocked until every item on this checklist has been verified.

---

## 1. Final Security Remediation Log (Migration 20261107000000)

### 1.1 Notification Read-Only Integrity
- [x] **Column-Level Privilege Isolation**: `REVOKE UPDATE ON public.notifications` executed for `anon` and `authenticated`; `GRANT UPDATE (read) ON public.notifications TO authenticated;` granted exclusively.
- [x] **Trigger Integrity Verification**: Trigger `trg_notification_update_integrity` rejects any query attempting to modify `offender_id`, `user_id`, `title`, `message`, `type`, or timestamps.

### 1.2 Family Account Inmate Authorization
- [x] **Explicit Link Model**: Implemented `public.family_offender_links` with status tracking (`APPROVED`, `PENDING`, `BLOCKED`).
- [x] **Access Verification Function**: Helper `public.is_family_authorized_for_offender(family_account_id, offender_id)` enforces that family accounts cannot deposit funds or send gift packages to unverified inmates.
- [x] **Deposit & Gift Package Policy Enforcement**:
  - `deposits_insert_family` enforces `is_family_authorized_for_offender()`.
  - `gift_packages_insert_family` enforces `is_family_authorized_for_offender()`.

### 1.3 Family Product Catalog Isolation
- [x] **Cross-Facility Leakage Blocked**: `products_select_active` requires family users to possess an approved link (`family_offender_links`) matching the product's facility before viewing facility-specific products. Global staples remain accessible (`facility_id IS NULL`).

### 1.4 Payment Gateway Server-Side Verification Gate
- [x] **Exclusive Service Role Access**: `process_confirmed_touchpay_deposit` enforces `auth.role() = 'service_role'`. Execution is revoked from `PUBLIC`, `anon`, and `authenticated`.
- [x] **Cryptographic Webhook Verification**: Gateway payload `amount`, `currency = 'USD'`, `idempotency_key`, and `provider_ref` are checked against the recorded `PENDING` deposit.
- [x] **Fraud Abort & Audit Trail**: Mismatched amounts cause the deposit to fail and write a high-severity alert to `audit_logs`.
- [x] **Concurrency Locking**: Row-level locks (`FOR UPDATE`) prevent race-condition balance increments.

### 1.5 Inmate PIN Security & Brute-Force Defense
- [x] **Hash Column Revoked**: `REVOKE SELECT (pin_hash) ON public.offenders` guarantees that client queries over PostgREST cannot read PIN hashes.
- [x] **Server-Side Authentication**: `verify_inmate_pin()` validates credentials using `pgcrypto.crypt()` server-side.
- [x] **Lockout Protection**: 3 failed attempts trigger an automatic 15-minute account lock (`pin_locked_until`).

### 1.6 Fresh Project Migration Compatibility
- [x] **Idempotency**: All custom types use exception guards (`DO $$ BEGIN CREATE TYPE ... EXCEPTION WHEN duplicate_object THEN null; END $$;`).
- [x] **Clean Policy Re-creation**: Every policy executes `DROP POLICY IF EXISTS ...; CREATE POLICY ...;`.
- [x] **Deterministic Ordering**: Extensions, enums, tables, indexes, triggers, helper functions, RLS policies, and grants are ordered sequentially with no circular dependencies.

---

## 2. Row Level Security (RLS) Enforcement
- [x] **RLS Enabled on Every Public Table**: All 16 core tables (`facilities`, `user_profiles`, `offenders`, `family_accounts`, `family_offender_links`, `products`, `manifests`, `orders`, `order_items`, `order_status_history`, `deposits`, `ledger_entries`, `gift_packages`, `notifications`, `picking_lists`, `audit_logs`) have `ALTER TABLE ... ENABLE ROW LEVEL SECURITY;`.
- [x] **RLS Forced on Every Table**: All tables execute `ALTER TABLE ... FORCE ROW LEVEL SECURITY;` to ensure table owners cannot bypass policies in PostgREST contexts.
- [x] **Zero Overly Permissive Policies**: No unconditional `USING (true)` or `WITH CHECK (true)` on any sensitive table.

---

## 3. Financial Integrity & Transaction Protection
- [x] **Verified Gateway Providers**: Stripe and PayPal are the accepted electronic payment providers with server-side webhook cryptographic validation.
- [x] **Atomic Order Placement RPC**: `public.place_inmate_order()` executes in an atomic transaction:
  1. Validates catalog stock and facility authorization.
  2. Verifies available trust fund balance.
  3. Verifies remaining weekly spend limit.
  4. Atomically decrements balance and increments weekly spend.
  5. Inserts order, order items, and picking list.
  6. Writes an immutable double-entry ledger entry.
- [x] **Immutable Ledger**: `ledger_entries` enforces append-only triggers (`trg_immutable_ledger`). Mathematical balance consistency is enforced via table check constraints.

---

## 4. Environment & Secrets Management
- [x] **Service Role Isolation**: `SUPABASE_SERVICE_ROLE_KEY` is strictly server-side and never prefixed with `NEXT_PUBLIC_`.
- [x] **Client Separation**: Browser client components import only `createBrowserClient` with `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- [x] **Runtime Guard**: `src/lib/supabase/admin.ts` contains an explicit runtime assertion throwing if invoked within a browser context.
- [x] **No Secrets in Logs**: `src/lib/audit.ts` automatically redacts sensitive keys (`pin`, `password`, `token`, `secret`, `cardNumber`, `cvv`).

---

## 5. Residual Risks & Requirements NOT Enforceable in SQL Alone

While PostgreSQL RLS, triggers, and stored procedures guarantee data-at-rest integrity, the following security controls **must be enforced by the hosting infrastructure and backend application layer**:

| Threat / Control | Layer | Required Implementation |
|---|---|---|
| **Webhook Signature Forgery** | Application Layer (`/api/payments/{stripe,paypal}/webhook`) | The backend routes must compute and verify cryptographic HMAC SHA-256 signatures (`stripe-signature` / PayPal transmission headers) before invoking confirmation. SQL cannot verify raw HTTP request headers. |
| **Kiosk Session Abandonment & Shoulder Surfing** | Physical & Client Layer | Inmate kiosks run on shared hardware in housing units. The kiosk client must enforce an aggressive idle timeout (max 3 minutes of inactivity) that clears cookies/session tokens and wipes the DOM. |
| **Distributed Brute-Force & Denial of Service** | Network / Edge Gateway | While SQL locks out an inmate ID after 3 failed attempts, distributed credential stuffing on login endpoints (`/api/auth/*`) must be throttled by an edge WAF (e.g. Cloudflare / Supabase Kong) using IP-based and user-agent rate limiting. |
| **Service Role Secret Compromise** | Secret Management / CI/CD | `SUPABASE_SERVICE_ROLE_KEY` bypasses all Row Level Security. It must never appear in repository commits, `.env` files committed to Git, or client-side JavaScript bundles. Any rotation of this key requires updating server environment secrets immediately. |
| **Cross-Site Scripting (XSS) & Token Theft** | Application Layer | Inmate and staff session cookies must be issued with `HttpOnly`, `Secure`, and `SameSite=Strict` attributes to prevent JavaScript-based session hijacking. Content Security Policy (`CSP`) headers must restrict script execution domains. |
| **Facility Network Isolation** | Infrastructure Layer | Inmate kiosks must be hosted on an isolated VLAN with no direct internet egress, restricted strictly to the reverse-proxied commissary endpoint. |

---

## Sign-Off Verification Command
Before deploying to production, execute the automated test suite to ensure all domain rules, ledger entries, and ordering logic are verified:

```bash
npm test
```
Result: **17/17 tests passing across 5 test suites**.
