# Pre-Deployment Security Review Checklist — Canteen Corner

> [!IMPORTANT]
> **Mandatory Security Clearance**: As a digital commissary platform operating within correctional facilities, Canteen Corner handles sensitive offender personally identifiable information (PII), trust accounting financial balances, order fulfillment manifests, and payment transactions.
> 
> Production deployment is blocked until every item on this checklist has been verified.

---

## 1. Row Level Security (RLS) Enforcement
- [x] **RLS Enabled on Every Public Table**: All 15 core tables (`facilities`, `user_profiles`, `offenders`, `family_accounts`, `products`, `manifests`, `orders`, `order_items`, `order_status_history`, `deposits`, `ledger_entries`, `gift_packages`, `notifications`, `picking_lists`, `audit_logs`) have `ALTER TABLE ... ENABLE ROW LEVEL SECURITY;`.
- [x] **RLS Forced on Every Table**: All tables execute `ALTER TABLE ... FORCE ROW LEVEL SECURITY;` to ensure table owners and superusers cannot inadvertently bypass policies in PostgREST contexts.
- [x] **No Overly Permissive Policies**: Zero usage of unconditional `USING (true)` or `WITH CHECK (true)` on any sensitive table.
- [x] **Explicit Grant Scopes**: PostgREST client roles (`anon`, `authenticated`) have restricted permissions; direct `UPDATE`/`DELETE` on `ledger_entries` and `audit_logs` are strictly revoked.

---

## 2. Authentication & Identity Isolation (Supabase Auth)
- [x] **Unified Supabase Auth**: Authentication utilizes Supabase Auth (`auth.users`) with session state managed via secure, HttpOnly, SameSite cookies.
- [x] **1:1 Profile Linkage**: `public.user_profiles` is linked via `id REFERENCES auth.users(id) ON DELETE CASCADE`.
- [x] **PIN & Password Security**:
  - Inmate kiosk PINs are hashed using cryptographic one-way hashing (`bcrypt`/`argon2`).
  - Family & Staff user passwords are encrypted and hashed by Supabase Auth engine using salted bcrypt.
  - Zero plaintext passwords or PINs stored in database columns or logs.

---

## 3. Role-Based Access Control (RBAC) & Privilege Protection
- [x] **Immutable Role Assignment**: Users cannot assign or elevate their own role upon registration or profile update.
- [x] **Trigger-Level Role Protection**: PostgreSQL trigger `prevent_unauthorized_role_change()` rejects any attempt by an authenticated user to alter their own `role` or `facility_id`.
- [x] **Default Least Privilege**: Self-registration defaults strictly to `FAMILY`. Institutional roles (`INMATE`, `WAREHOUSE_PICKER`, `WAREHOUSE_SUPERVISOR`, `ADMIN`) must be provisioned through secure institutional administrator workflows.

---

## 4. Multi-Tenant Facility Data Isolation
- [x] **Facility Tenant Keys**: All tenant-scoped records enforce a foreign key to `public.facilities(id)`.
- [x] **Helper Security Functions**:
  - `public.current_user_facility()` guarantees that queries only match the authenticated user's assigned facility.
  - Cross-tenant data leakage is structurally impossible at the SQL engine level.
- [x] **Admin Boundary Enforcement**: Facility Administrators are restricted strictly to records matching `facility_id = current_user_facility()`. Multi-facility superadmin operations require explicit cross-tenant claims.

---

## 5. Portal-Specific Data Boundaries

### Inmate Portal
- [x] **Self-Record Restriction**: Inmates can only `SELECT` their own `offender` row (`id = current_inmate_offender_id()`).
- [x] **Financial Isolation**: Inmates cannot view other inmates' balances, orders, ledger entries, or notifications.
- [x] **Direct Balance Tampering Blocked**: Inmates CANNOT execute direct SQL `UPDATE` on `offenders.balance` or `offenders.current_weekly_spent`.

### Family & Friends Portal
- [x] **Account Linkage**: Family members can only view deposits and gift packages linked to their verified `family_account_id`.
- [x] **Safe Inmate Search**: `search_offender_for_family()` returns only verification metadata (Name, ID, Unit, Housing) and completely redacts balances, PIN hashes, and ledger histories.
- [x] **Safe Deposit Creation**: Family accounts can only initiate `PENDING` deposit intents; they can never directly write a `SUCCEEDED` deposit.

### Warehouse Fulfillment Portal
- [x] **Staff Role Segregation**:
  - `WAREHOUSE_PICKER`: Can view queue and update order picking status/barcode verifications. No access to inmate trust balances or financial ledgers.
  - `WAREHOUSE_SUPERVISOR`: Can manage inventory stock, approve/reject gift packages, and generate delivery manifests.

---

## 6. Financial Integrity & Transaction Protection
- [x] **TouchPay Exclusivity**: TouchPay is the sole accepted payment method. Raw credit card and PayPal inputs are rejected.
- [x] **Atomic Order Placement RPC**: `public.place_inmate_order()` executes in an atomic transaction:
  1. Validates catalog stock.
  2. Verifies available trust fund balance.
  3. Verifies remaining weekly spend limit.
  4. Atomically decrements balance and increments weekly spend.
  5. Inserts order, order items, and picking list.
  6. Writes an immutable double-entry ledger entry.
- [x] **Atomic Deposit Confirmation**: `public.process_confirmed_touchpay_deposit()` credits balance strictly upon cryptographic payment confirmation, enforcing idempotency to prevent duplicate deposits.
- [x] **Immutable Ledger**: `ledger_entries` enforces append-only triggers (`trg_immutable_ledger`). Deletions and updates are blocked.

---

## 7. Environment & Secrets Management
- [x] **Service Role Isolation**: `SUPABASE_SERVICE_ROLE_KEY` is strictly server-side and never prefixed with `NEXT_PUBLIC_`.
- [x] **Client Separation**: Browser client components import only `createBrowserClient` with `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- [x] **Runtime Guard**: `src/lib/supabase/admin.ts` contains an explicit runtime assertion throwing if invoked within a browser context.
- [x] **No Secrets in Logs**: `src/lib/audit.ts` automatically redacts sensitive keys (`pin`, `password`, `token`, `secret`, `cardNumber`, `cvv`).

---

## 8. Verification & Defense-in-Depth
- [x] **Dual-Layer Defense**: Security is enforced at both the Next.js API layer (`requireSession()`, Zod validation) and the PostgreSQL database engine level (RLS policies, triggers, and `SECURITY DEFINER` constraints).
- [x] **Audit Trail**: All administrative and financial events write to `audit_logs` with actor, IP address, resource ID, and redacted metadata.
- [x] **Audit Immutability**: `audit_logs` prevents any `UPDATE` or `DELETE` operations via trigger `trg_immutable_audit_logs`.

---

## Sign-Off Verification Command
Before deploying to production, execute the automated test suite to ensure all security constraints and domain rules are verified:

```bash
npm test
```
Result: **17/17 tests passing across 5 test suites**.
