# Canteen Corner — PostgreSQL RLS & Session Authorization Review
**Phase:** 8A — PostgreSQL Compatibility Preparation  
**Generated:** 2026-11-17  
**Scope:** Review of Row Level Security (RLS), stored procedures, authorization context flags, connection pooling implications, and fail-closed security invariants.

---

## 1. Executive Summary

In a multi-tenant correctional platform, database-level security ensures that inmates, family members, warehouse staff, and administrative actors cannot tamper with balances, view records outside their facility, or bypass authorization rules—even if application logic contains vulnerabilities.

Canteen Corner features two layers of security:
1. **Application-Layer Authorization:** RBAC enforced across 31 API routes via HttpOnly JWT session tokens (`getCurrentSession()`).
2. **Database-Layer RLS & Balance Invariant Triggers:** Defined in `supabase/migrations/` for Supabase PostgreSQL.

This review identifies critical alignment gaps between the application's Prisma transactions and the database triggers that must be resolved before deploying to PostgreSQL.

---

## 2. The Balance Protection Trigger & Authorization Tokens

In `supabase/migrations/20261107000000_canteen_corner_security_rls.sql` and `20261113000000_canteen_corner_stripe_paypal_providers.sql`, balance mutations on `public.offenders` are guarded by the trigger function:
`public.prevent_direct_balance_tampering()`

### Trigger Mechanics:
1. **Role Guard:** Rejects direct balance/spending updates if `current_user IN ('authenticated', 'anon')`.
2. **Delta Invariant Verification:**
   - *Order Deduction:* `delta(balance) < 0` AND `delta(spend) = -delta(balance)` AND `new_spend <= weekly_limit`.
   - *Deposit Credit:* `delta(balance) > 0` AND `delta(spend) = 0`.
   - *Weekly Reset:* `delta(balance) = 0` AND `new_spend = 0` AND `old_spend > 0`.
   - Any mutation outside these three invariants is immediately rejected with `42501 SECURITY VIOLATION`.
3. **Single-Use Dynamic Token Guard:**
   Checks `current_setting('canteen_internal.active_tx_auth', true)`.
   Upon verification, the trigger immediately clears the token:
   `PERFORM set_config('canteen_internal.active_tx_auth', '', true);`
4. **Execution Stack Diagnostic:**
   Inspects `GET DIAGNOSTICS v_stack = PG_CONTEXT;`.
   Demands that the calling function matches `place_inmate_order`, `process_confirmed_electronic_deposit`, or `process_confirmed_touchpay_deposit`.

---

## 3. Critical Discrepancy: Prisma Transactions vs. Database Triggers

### Verified Discrepancy in Application Code:
In `src/app/api/inmate/order/route.ts` line 142 and `src/lib/payments/confirmation.ts` line 166:
```typescript
if (process.env.DATABASE_URL?.startsWith('postgres')) {
  await tx.$executeRawUnsafe(`SELECT set_config('canteen.authorized_transaction', 'true', true);`).catch(() => {});
}
```

### Analysis of the Discrepancy:
1. **Parameter Name Mismatch:** The TypeScript code sets `canteen.authorized_transaction = 'true'`, but the PostgreSQL trigger expects `canteen_internal.active_tx_auth` containing a dynamically generated single-use token.
2. **Context Stack Requirement:** The PostgreSQL trigger inspects `PG_CONTEXT` to verify that execution occurs within `place_inmate_order` or `process_confirmed_electronic_deposit`. A raw Prisma `tx.offender.update(...)` does not originate from a PL/pgSQL function and will be rejected by the trigger.
3. **The `.catch(() => {})` Problem:** Swallowing errors on `set_config` hides failures. In SQLite, `set_config` is safely skipped or caught. However, against PostgreSQL, if `set_config` fails or if `tx.offender.update` is blocked by the trigger, the entire transaction will abort.

### Mandatory Fail-Closed Requirement:
- If an authorization context cannot be established in PostgreSQL, the financial mutation MUST fail immediately.
- Swallowing `set_config` errors with `.catch(() => {})` violates the fail-closed mandate.

---

## 4. Connection Pooling (PgBouncer) & Context Leakage

When deploying on Supabase and Vercel:
- Vercel functions connect via Supabase Transaction Pooler (PgBouncer on port `6543`).
- **Session-level settings:** `set_config('key', 'val', false)` persists on the physical connection and leaks into subsequent requests handled by the same connection pool socket.
- **Transaction-local settings:** `set_config('key', 'val', true)` (with `is_local = true`) is automatically reset by PostgreSQL upon transaction `COMMIT` or `ROLLBACK`.

### Verified Finding:
The application's `set_config` invocations correctly pass `is_local = true` as the third parameter. However, Prisma interactive transactions over PgBouncer require careful session management:
- Prisma interactive transactions (`prisma.$transaction(async (tx) => { ... })`) maintain a single dedicated connection checkout from the pool for the lifetime of the transaction closure.
- Therefore, `is_local = true` parameters are safe from connection leakage, provided the interactive transaction block does not exceed timeout limits (default 5000ms).

---

## 5. RLS Risk Matrix & Pre-Staging Remediation Plan

| Risk ID | Risk Description | Severity | Remediation Plan for Phase 8B |
| :--- | :--- | :--- | :--- |
| **RLS-01** | `canteen.authorized_transaction` vs `canteen_internal.active_tx_auth` parameter mismatch | **CRITICAL** | Update trigger to support an authorized application service token, or route inmate orders through the `place_inmate_order` RPC. |
| **RLS-02** | Swallowed errors via `.catch(() => {})` in financial routes | **HIGH** | Remove silent `.catch(() => {})` handlers. Require explicit error logging and immediate transaction abortion. |
| **RLS-03** | Prisma PascalCase `"User"` vs Supabase lowercase `user_profiles` | **CRITICAL** | Reconcile table names in `schema.postgresql.prisma` using `@@map("user_profiles")` and column `@map`. |
| **RLS-04** | Direct client execution bypassing RLS via `service_role` | **HIGH** | Confirm `SUPABASE_SERVICE_ROLE_KEY` is exclusively imported in trusted backend webhook verification and admin confirmation. |

