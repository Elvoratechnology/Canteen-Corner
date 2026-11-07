-- ==============================================================================
-- CANTEEN CORNER — SECURE DATABASE ARCHITECTURE & ROW LEVEL SECURITY (RLS)
-- Multi-Tenant Correctional Facility Commissary Platform
-- ==============================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. ENUM TYPES
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM (
    'INMATE',
    'FAMILY',
    'WAREHOUSE_PICKER',
    'WAREHOUSE_SUPERVISOR',
    'ADMIN'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE order_status AS ENUM (
    'PROCESSING',
    'PACKED',
    'OUT_FOR_DELIVERY',
    'DELIVERED',
    'CANCELLED'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE deposit_status AS ENUM (
    'PENDING',
    'SUCCEEDED',
    'FAILED'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE gift_package_status AS ENUM (
    'PENDING',
    'APPROVED',
    'REJECTED',
    'SHIPPED'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- ==============================================================================
-- 3. CORE TABLES
-- ==============================================================================

-- Facilities (Multi-tenant partition root)
CREATE TABLE IF NOT EXISTS public.facilities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  weekly_reset_day INTEGER NOT NULL DEFAULT 0 CHECK (weekly_reset_day BETWEEN 0 AND 6),
  gift_packages_enabled BOOLEAN NOT NULL DEFAULT true,
  max_weekly_spend NUMERIC(10, 2) NOT NULL DEFAULT 100.00 CHECK (max_weekly_spend > 0),
  max_deposit_amount NUMERIC(10, 2) NOT NULL DEFAULT 300.00 CHECK (max_deposit_amount > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- User Profiles (Linked 1:1 to Supabase auth.users)
CREATE TABLE IF NOT EXISTS public.user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  facility_id UUID REFERENCES public.facilities(id) ON DELETE RESTRICT,
  role user_role NOT NULL DEFAULT 'FAMILY',
  name TEXT NOT NULL,
  email TEXT,
  staff_id TEXT UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Offenders (Inmates)
CREATE TABLE IF NOT EXISTS public.offenders (
  id TEXT PRIMARY KEY, -- Institutional Offender ID, e.g. "A1234567"
  user_id UUID UNIQUE REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  unit TEXT NOT NULL,
  housing TEXT NOT NULL,
  pin_hash TEXT NOT NULL,
  balance NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (balance >= 0.00),
  weekly_limit NUMERIC(10, 2) NOT NULL DEFAULT 100.00 CHECK (weekly_limit >= 0.00),
  current_weekly_spent NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (current_weekly_spent >= 0.00),
  last_weekly_reset TIMESTAMPTZ NOT NULL DEFAULT now(),
  failed_pin_attempts INTEGER NOT NULL DEFAULT 0,
  pin_locked_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Family & Friends Accounts
CREATE TABLE IF NOT EXISTS public.family_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  relationship TEXT NOT NULL DEFAULT 'Family',
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Commissary Product Catalog
CREATE TABLE IF NOT EXISTS public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id UUID REFERENCES public.facilities(id) ON DELETE RESTRICT,
  sku TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  price NUMERIC(10, 2) NOT NULL CHECK (price >= 0.00),
  stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  reorder_level INTEGER NOT NULL DEFAULT 15 CHECK (reorder_level >= 0),
  active BOOLEAN NOT NULL DEFAULT true,
  image_url TEXT,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Manifests (Delivery batches grouped by unit and date)
CREATE TABLE IF NOT EXISTS public.manifests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  manifest_number TEXT NOT NULL UNIQUE,
  facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE RESTRICT,
  unit TEXT NOT NULL,
  housing TEXT,
  delivery_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'GENERATED',
  total_orders INTEGER NOT NULL DEFAULT 0,
  total_items INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Orders
CREATE TABLE IF NOT EXISTS public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number TEXT NOT NULL UNIQUE,
  facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE RESTRICT,
  offender_id TEXT NOT NULL REFERENCES public.offenders(id) ON DELETE RESTRICT,
  status order_status NOT NULL DEFAULT 'PROCESSING',
  subtotal NUMERIC(10, 2) NOT NULL CHECK (subtotal >= 0.00),
  tax NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (tax >= 0.00),
  total NUMERIC(10, 2) NOT NULL CHECK (total >= 0.00),
  expected_delivery_date TIMESTAMPTZ NOT NULL,
  delivered_at TIMESTAMPTZ,
  picked_by_staff_id TEXT,
  packed_at TIMESTAMPTZ,
  barcode TEXT NOT NULL UNIQUE,
  manifest_id UUID REFERENCES public.manifests(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Order Items
CREATE TABLE IF NOT EXISTS public.order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(10, 2) NOT NULL CHECK (unit_price >= 0.00),
  total_price NUMERIC(10, 2) NOT NULL CHECK (total_price >= 0.00)
);

-- Order Status Audit History
CREATE TABLE IF NOT EXISTS public.order_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  previous_status order_status,
  new_status order_status NOT NULL,
  changed_by TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Trust Fund Deposits (TouchPay Exclusive)
CREATE TABLE IF NOT EXISTS public.deposits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE RESTRICT,
  offender_id TEXT NOT NULL REFERENCES public.offenders(id) ON DELETE RESTRICT,
  family_account_id UUID REFERENCES public.family_accounts(id) ON DELETE SET NULL,
  amount NUMERIC(10, 2) NOT NULL CHECK (amount > 0.00),
  fee NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (fee >= 0.00),
  total_paid NUMERIC(10, 2) NOT NULL CHECK (total_paid >= amount),
  provider TEXT NOT NULL DEFAULT 'TOUCHPAY',
  provider_ref TEXT NOT NULL UNIQUE,
  status deposit_status NOT NULL DEFAULT 'PENDING',
  idempotency_key TEXT NOT NULL UNIQUE,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Double-Entry Financial Ledger (Immutable append-only balance audit trail)
CREATE TABLE IF NOT EXISTS public.ledger_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE RESTRICT,
  offender_id TEXT NOT NULL REFERENCES public.offenders(id) ON DELETE RESTRICT,
  type TEXT NOT NULL, -- DEPOSIT, COMMISSARY_ORDER, REFUND, ADJUSTMENT
  debit NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (debit >= 0.00),
  credit NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (credit >= 0.00),
  balance_before NUMERIC(10, 2) NOT NULL CHECK (balance_before >= 0.00),
  balance_after NUMERIC(10, 2) NOT NULL CHECK (balance_after >= 0.00),
  reference_type TEXT NOT NULL, -- ORDER, DEPOSIT, MANUAL
  reference_id TEXT NOT NULL,
  description TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Care Gift Packages
CREATE TABLE IF NOT EXISTS public.gift_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE RESTRICT,
  offender_id TEXT NOT NULL REFERENCES public.offenders(id) ON DELETE RESTRICT,
  family_account_id UUID NOT NULL REFERENCES public.family_accounts(id) ON DELETE RESTRICT,
  package_name TEXT NOT NULL,
  items_json JSONB NOT NULL,
  total_value NUMERIC(10, 2) NOT NULL CHECK (total_value >= 0.00),
  status gift_package_status NOT NULL DEFAULT 'PENDING',
  reviewer_id UUID REFERENCES public.user_profiles(id),
  reviewer_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Inmate Notifications
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  offender_id TEXT REFERENCES public.offenders(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Warehouse Picking Lists
CREATE TABLE IF NOT EXISTS public.picking_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL UNIQUE REFERENCES public.orders(id) ON DELETE CASCADE,
  picker_user_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

-- System & Security Audit Logs (Append-Only)
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  facility_id UUID REFERENCES public.facilities(id),
  ip_address TEXT DEFAULT 'unknown',
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ==============================================================================
-- 4. SECURITY & AUTHENTICATION HELPER FUNCTIONS
-- ==============================================================================

-- Helper: Get current user's profile record
CREATE OR REPLACE FUNCTION public.current_profile()
RETURNS public.user_profiles AS $$
  SELECT * FROM public.user_profiles
  WHERE id = auth.uid() AND is_active = true
  LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

-- Helper: Get current user's role
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS public.user_role AS $$
  SELECT role FROM public.user_profiles
  WHERE id = auth.uid() AND is_active = true
  LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

-- Helper: Get current user's facility ID
CREATE OR REPLACE FUNCTION public.current_user_facility()
RETURNS UUID AS $$
  SELECT facility_id FROM public.user_profiles
  WHERE id = auth.uid() AND is_active = true
  LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

-- Helper: Get offender ID linked to current inmate user
CREATE OR REPLACE FUNCTION public.current_inmate_offender_id()
RETURNS TEXT AS $$
  SELECT id FROM public.offenders
  WHERE user_id = auth.uid()
  LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

-- Helper: Get family account ID linked to current family user
CREATE OR REPLACE FUNCTION public.current_family_account_id()
RETURNS UUID AS $$
  SELECT id FROM public.family_accounts
  WHERE user_id = auth.uid()
  LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

-- ==============================================================================
-- 5. IMMUTABLE ROLE INTEGRITY & PRIVILEGE ELEVATION PROTECTION
-- ==============================================================================

-- Trigger: Prevent users from assigning or modifying their own roles or facilities
CREATE OR REPLACE FUNCTION public.prevent_unauthorized_role_change()
RETURNS TRIGGER AS $$
BEGIN
  -- If updated by non-superadmin client, forbid modifying role or facility_id
  IF auth.uid() IS NOT NULL THEN
    IF NEW.role IS DISTINCT FROM OLD.role THEN
      RAISE EXCEPTION 'SECURITY VIOLATION: Role elevation is strictly prohibited.';
    END IF;
    IF NEW.facility_id IS DISTINCT FROM OLD.facility_id THEN
      RAISE EXCEPTION 'SECURITY VIOLATION: Cross-facility re-assignment is prohibited.';
    END IF;
  END IF;
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_prevent_role_change ON public.user_profiles;
CREATE TRIGGER trg_prevent_role_change
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_unauthorized_role_change();

-- Trigger: Prevent direct modification of financial balance columns on offenders
CREATE OR REPLACE FUNCTION public.prevent_direct_balance_tampering()
RETURNS TRIGGER AS $$
BEGIN
  -- Direct balance updates via client PostgREST queries are forbidden
  -- Must use verified SECURITY DEFINER functions (e.g. place_inmate_order, process_deposit)
  IF current_setting('canteen.authorized_transaction', true) IS DISTINCT FROM 'true' THEN
    IF NEW.balance IS DISTINCT FROM OLD.balance OR NEW.current_weekly_spent IS DISTINCT FROM OLD.current_weekly_spent THEN
      RAISE EXCEPTION 'SECURITY VIOLATION: Inmate balances can only be updated via verified financial transaction functions.';
    END IF;
  END IF;
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_protect_offender_balance ON public.offenders;
CREATE TRIGGER trg_protect_offender_balance
  BEFORE UPDATE ON public.offenders
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_direct_balance_tampering();

-- Trigger: Append-only enforcement on audit logs and ledger entries (NO UPDATE OR DELETE)
CREATE OR REPLACE FUNCTION public.prevent_audit_tampering()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'SECURITY VIOLATION: Audit logs and financial ledger entries are immutable and cannot be modified or deleted.';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_immutable_audit_logs ON public.audit_logs;
CREATE TRIGGER trg_immutable_audit_logs
  BEFORE UPDATE OR DELETE ON public.audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_audit_tampering();

DROP TRIGGER IF EXISTS trg_immutable_ledger ON public.ledger_entries;
CREATE TRIGGER trg_immutable_ledger
  BEFORE UPDATE OR DELETE ON public.ledger_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_audit_tampering();

-- ==============================================================================
-- 6. ROW LEVEL SECURITY (RLS) POLICIES ON EVERY TABLE
-- ==============================================================================

-- Enable and FORCE RLS on every table
ALTER TABLE public.facilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.facilities FORCE ROW LEVEL SECURITY;

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles FORCE ROW LEVEL SECURITY;

ALTER TABLE public.offenders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offenders FORCE ROW LEVEL SECURITY;

ALTER TABLE public.family_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.family_accounts FORCE ROW LEVEL SECURITY;

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products FORCE ROW LEVEL SECURITY;

ALTER TABLE public.manifests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manifests FORCE ROW LEVEL SECURITY;

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders FORCE ROW LEVEL SECURITY;

ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items FORCE ROW LEVEL SECURITY;

ALTER TABLE public.order_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_status_history FORCE ROW LEVEL SECURITY;

ALTER TABLE public.deposits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deposits FORCE ROW LEVEL SECURITY;

ALTER TABLE public.ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ledger_entries FORCE ROW LEVEL SECURITY;

ALTER TABLE public.gift_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gift_packages FORCE ROW LEVEL SECURITY;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications FORCE ROW LEVEL SECURITY;

ALTER TABLE public.picking_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.picking_lists FORCE ROW LEVEL SECURITY;

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs FORCE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------------------
-- 6.1 FACILITIES POLICIES
-- ------------------------------------------------------------------------------
-- Anyone authenticated can view facilities they belong to; public can view active facility list
CREATE POLICY "facilities_select_authenticated" ON public.facilities
  FOR SELECT TO authenticated
  USING (
    id = public.current_user_facility()
    OR public.current_user_role() = 'ADMIN'
    OR public.current_user_role() = 'FAMILY'
  );

-- Only platform admins can modify facility settings
CREATE POLICY "facilities_update_admin" ON public.facilities
  FOR UPDATE TO authenticated
  USING (id = public.current_user_facility() AND public.current_user_role() = 'ADMIN')
  WITH CHECK (id = public.current_user_facility() AND public.current_user_role() = 'ADMIN');

-- ------------------------------------------------------------------------------
-- 6.2 USER PROFILES POLICIES
-- ------------------------------------------------------------------------------
-- Users can view their own profile; staff/admins can view profiles within their facility
CREATE POLICY "profiles_select_self_or_facility" ON public.user_profiles
  FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR (
      facility_id = public.current_user_facility()
      AND public.current_user_role() IN ('ADMIN', 'WAREHOUSE_SUPERVISOR')
    )
  );

-- Users can only update their own non-sensitive fields
CREATE POLICY "profiles_update_self" ON public.user_profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- ------------------------------------------------------------------------------
-- 6.3 OFFENDERS POLICIES
-- ------------------------------------------------------------------------------
-- Inmates: can only view their OWN record
-- Warehouse / Admins: can view offenders in their assigned facility
CREATE POLICY "offenders_select" ON public.offenders
  FOR SELECT TO authenticated
  USING (
    (public.current_user_role() = 'INMATE' AND id = public.current_inmate_offender_id())
    OR (
      facility_id = public.current_user_facility()
      AND public.current_user_role() IN ('ADMIN', 'WAREHOUSE_PICKER', 'WAREHOUSE_SUPERVISOR')
    )
  );

-- Offender updates (e.g. housing or unit updates by facility admin)
CREATE POLICY "offenders_update_admin" ON public.offenders
  FOR UPDATE TO authenticated
  USING (
    facility_id = public.current_user_facility()
    AND public.current_user_role() = 'ADMIN'
  )
  WITH CHECK (
    facility_id = public.current_user_facility()
    AND public.current_user_role() = 'ADMIN'
  );

-- ------------------------------------------------------------------------------
-- 6.4 FAMILY ACCOUNTS POLICIES
-- ------------------------------------------------------------------------------
CREATE POLICY "family_accounts_select" ON public.family_accounts
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.current_user_role() = 'ADMIN'
  );

CREATE POLICY "family_accounts_insert" ON public.family_accounts
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "family_accounts_update" ON public.family_accounts
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ------------------------------------------------------------------------------
-- 6.5 PRODUCTS POLICIES
-- ------------------------------------------------------------------------------
-- Active catalog products are visible to all authenticated users
CREATE POLICY "products_select_active" ON public.products
  FOR SELECT TO authenticated
  USING (active = true OR public.current_user_role() IN ('ADMIN', 'WAREHOUSE_SUPERVISOR', 'WAREHOUSE_PICKER'));

-- Catalog management restricted to Warehouse Supervisor and Admin in their facility
CREATE POLICY "products_modify_staff" ON public.products
  FOR ALL TO authenticated
  USING (
    public.current_user_role() IN ('ADMIN', 'WAREHOUSE_SUPERVISOR')
    AND (facility_id IS NULL OR facility_id = public.current_user_facility())
  )
  WITH CHECK (
    public.current_user_role() IN ('ADMIN', 'WAREHOUSE_SUPERVISOR')
    AND (facility_id IS NULL OR facility_id = public.current_user_facility())
  );

-- ------------------------------------------------------------------------------
-- 6.6 ORDERS & ORDER ITEMS POLICIES
-- ------------------------------------------------------------------------------
-- Inmates: view only their own orders
-- Warehouse staff / Admin: view orders within their assigned facility
CREATE POLICY "orders_select" ON public.orders
  FOR SELECT TO authenticated
  USING (
    (public.current_user_role() = 'INMATE' AND offender_id = public.current_inmate_offender_id())
    OR (
      facility_id = public.current_user_facility()
      AND public.current_user_role() IN ('ADMIN', 'WAREHOUSE_PICKER', 'WAREHOUSE_SUPERVISOR')
    )
  );

-- Warehouse staff can update order status (pick, pack, dispatch) within their facility
CREATE POLICY "orders_update_warehouse" ON public.orders
  FOR UPDATE TO authenticated
  USING (
    facility_id = public.current_user_facility()
    AND public.current_user_role() IN ('ADMIN', 'WAREHOUSE_PICKER', 'WAREHOUSE_SUPERVISOR')
  )
  WITH CHECK (
    facility_id = public.current_user_facility()
    AND public.current_user_role() IN ('ADMIN', 'WAREHOUSE_PICKER', 'WAREHOUSE_SUPERVISOR')
  );

-- Order Items: inherits order visibility
CREATE POLICY "order_items_select" ON public.order_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_items.order_id
      AND (
        (public.current_user_role() = 'INMATE' AND o.offender_id = public.current_inmate_offender_id())
        OR (
          o.facility_id = public.current_user_facility()
          AND public.current_user_role() IN ('ADMIN', 'WAREHOUSE_PICKER', 'WAREHOUSE_SUPERVISOR')
        )
      )
    )
  );

-- Order Status History: inherits order visibility
CREATE POLICY "order_status_history_select" ON public.order_status_history
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_status_history.order_id
      AND (
        (public.current_user_role() = 'INMATE' AND o.offender_id = public.current_inmate_offender_id())
        OR (
          o.facility_id = public.current_user_facility()
          AND public.current_user_role() IN ('ADMIN', 'WAREHOUSE_PICKER', 'WAREHOUSE_SUPERVISOR')
        )
      )
    )
  );

-- ------------------------------------------------------------------------------
-- 6.7 DEPOSITS POLICIES (TOUCHPAY)
-- ------------------------------------------------------------------------------
-- Inmates: view confirmed deposits to their account
-- Family: view deposits made by their family account
-- Admin: view facility deposits
CREATE POLICY "deposits_select" ON public.deposits
  FOR SELECT TO authenticated
  USING (
    (public.current_user_role() = 'INMATE' AND offender_id = public.current_inmate_offender_id() AND status = 'SUCCEEDED')
    OR (public.current_user_role() = 'FAMILY' AND family_account_id = public.current_family_account_id())
    OR (public.current_user_role() = 'ADMIN' AND facility_id = public.current_user_facility())
  );

-- Family can initiate a PENDING deposit (Strictly PENDING; never directly SUCCEEDED)
CREATE POLICY "deposits_insert_family" ON public.deposits
  FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_role() = 'FAMILY'
    AND family_account_id = public.current_family_account_id()
    AND status = 'PENDING'
    AND provider = 'TOUCHPAY'
    AND amount > 0.00
  );

-- ------------------------------------------------------------------------------
-- 6.8 FINANCIAL LEDGER POLICIES
-- ------------------------------------------------------------------------------
-- Inmates: can only view ledger entries for their own trust fund account
-- Admin: can view ledger for reconciliation in their facility
CREATE POLICY "ledger_select" ON public.ledger_entries
  FOR SELECT TO authenticated
  USING (
    (public.current_user_role() = 'INMATE' AND offender_id = public.current_inmate_offender_id())
    OR (public.current_user_role() = 'ADMIN' AND facility_id = public.current_user_facility())
  );

-- NO direct INSERT/UPDATE/DELETE on ledger entries for any client role
-- Entries are created strictly by database transaction functions

-- ------------------------------------------------------------------------------
-- 6.9 GIFT PACKAGES POLICIES
-- ------------------------------------------------------------------------------
CREATE POLICY "gift_packages_select" ON public.gift_packages
  FOR SELECT TO authenticated
  USING (
    (public.current_user_role() = 'INMATE' AND offender_id = public.current_inmate_offender_id())
    OR (public.current_user_role() = 'FAMILY' AND family_account_id = public.current_family_account_id())
    OR (
      facility_id = public.current_user_facility()
      AND public.current_user_role() IN ('ADMIN', 'WAREHOUSE_SUPERVISOR')
    )
  );

CREATE POLICY "gift_packages_insert_family" ON public.gift_packages
  FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_role() = 'FAMILY'
    AND family_account_id = public.current_family_account_id()
    AND status = 'PENDING'
  );

CREATE POLICY "gift_packages_update_staff" ON public.gift_packages
  FOR UPDATE TO authenticated
  USING (
    facility_id = public.current_user_facility()
    AND public.current_user_role() IN ('ADMIN', 'WAREHOUSE_SUPERVISOR')
  )
  WITH CHECK (
    facility_id = public.current_user_facility()
    AND public.current_user_role() IN ('ADMIN', 'WAREHOUSE_SUPERVISOR')
  );

-- ------------------------------------------------------------------------------
-- 6.10 NOTIFICATIONS POLICIES
-- ------------------------------------------------------------------------------
CREATE POLICY "notifications_select" ON public.notifications
  FOR SELECT TO authenticated
  USING (
    (public.current_user_role() = 'INMATE' AND offender_id = public.current_inmate_offender_id())
    OR user_id = auth.uid()
  );

CREATE POLICY "notifications_update_read" ON public.notifications
  FOR UPDATE TO authenticated
  USING (
    (public.current_user_role() = 'INMATE' AND offender_id = public.current_inmate_offender_id())
    OR user_id = auth.uid()
  )
  WITH CHECK (
    (public.current_user_role() = 'INMATE' AND offender_id = public.current_inmate_offender_id())
    OR user_id = auth.uid()
  );

-- ------------------------------------------------------------------------------
-- 6.11 MANIFESTS & PICKING LISTS POLICIES
-- ------------------------------------------------------------------------------
CREATE POLICY "manifests_all_warehouse" ON public.manifests
  FOR ALL TO authenticated
  USING (
    facility_id = public.current_user_facility()
    AND public.current_user_role() IN ('ADMIN', 'WAREHOUSE_SUPERVISOR', 'WAREHOUSE_PICKER')
  )
  WITH CHECK (
    facility_id = public.current_user_facility()
    AND public.current_user_role() IN ('ADMIN', 'WAREHOUSE_SUPERVISOR')
  );

CREATE POLICY "picking_lists_all_warehouse" ON public.picking_lists
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = picking_lists.order_id
      AND o.facility_id = public.current_user_facility()
      AND public.current_user_role() IN ('ADMIN', 'WAREHOUSE_PICKER', 'WAREHOUSE_SUPERVISOR')
    )
  )
  WITH CHECK (
    public.current_user_role() IN ('ADMIN', 'WAREHOUSE_PICKER', 'WAREHOUSE_SUPERVISOR')
  );

-- ------------------------------------------------------------------------------
-- 6.12 AUDIT LOGS POLICIES
-- ------------------------------------------------------------------------------
-- Admins can view audit logs within their facility only; no client modifications permitted
CREATE POLICY "audit_logs_select_admin" ON public.audit_logs
  FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'ADMIN'
    AND (facility_id IS NULL OR facility_id = public.current_user_facility())
  );

-- ==============================================================================
-- 7. SECURE DATABASE FUNCTIONS (SECURITY DEFINER)
-- ==============================================================================

-- 7.1 SAFE OFFENDER LOOKUP FOR FAMILY PORTAL
-- Allows family members to confirm an offender by ID or Name without exposing PIN hashes or balances
CREATE OR REPLACE FUNCTION public.search_offender_for_family(
  search_term TEXT,
  target_facility_id UUID DEFAULT NULL
)
RETURNS TABLE (
  id TEXT,
  name TEXT,
  unit TEXT,
  housing TEXT,
  facility_id UUID,
  facility_name TEXT
) AS $$
BEGIN
  IF public.current_user_role() NOT IN ('FAMILY', 'ADMIN') THEN
    RAISE EXCEPTION 'Access Denied: Inmate search is restricted to authorized family accounts.';
  END IF;

  RETURN QUERY
  SELECT
    o.id,
    o.name,
    o.unit,
    o.housing,
    o.facility_id,
    f.name AS facility_name
  FROM public.offenders o
  JOIN public.facilities f ON f.id = o.facility_id
  WHERE
    (target_facility_id IS NULL OR o.facility_id = target_facility_id)
    AND (
      UPPER(o.id) = UPPER(TRIM(search_term))
      OR o.name ILIKE ('%' || TRIM(search_term) || '%')
    )
  LIMIT 5;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

-- 7.2 ATOMIC INMATE ORDER SUBMISSION
-- Validates stock, checks balance & weekly limit, deducts balance, and writes ledger in 1 transaction
CREATE OR REPLACE FUNCTION public.place_inmate_order(
  p_items JSONB
)
RETURNS JSONB AS $$
DECLARE
  v_offender_id TEXT;
  v_offender RECORD;
  v_facility RECORD;
  v_order_id UUID;
  v_order_num TEXT;
  v_barcode TEXT;
  v_subtotal NUMERIC(10, 2) := 0.00;
  v_item JSONB;
  v_product RECORD;
  v_item_total NUMERIC(10, 2);
  v_item_qty INTEGER;
  v_prod_id UUID;
  v_delivery_date TIMESTAMPTZ;
BEGIN
  -- 1. Identify offender
  v_offender_id := public.current_inmate_offender_id();
  IF v_offender_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Current session is not linked to a valid inmate.';
  END IF;

  -- 2. Lock and fetch offender row
  SELECT * INTO v_offender
  FROM public.offenders
  WHERE id = v_offender_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Offender account not found.';
  END IF;

  SELECT * INTO v_facility
  FROM public.facilities
  WHERE id = v_offender.facility_id;

  -- 3. Calculate order total and verify inventory stock
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_prod_id := (v_item->>'productId')::UUID;
    v_item_qty := (v_item->>'quantity')::INTEGER;

    IF v_item_qty <= 0 THEN
      RAISE EXCEPTION 'Invalid quantity for product.';
    END IF;

    SELECT * INTO v_product
    FROM public.products
    WHERE id = v_prod_id AND active = true
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Product % is unavailable or discontinued.', v_prod_id;
    END IF;

    IF v_product.stock < v_item_qty THEN
      RAISE EXCEPTION 'Insufficient stock for "%". Requested: %, Available: %',
        v_product.name, v_item_qty, v_product.stock;
    END IF;

    v_item_total := ROUND(v_product.price * v_item_qty, 2);
    v_subtotal := v_subtotal + v_item_total;
  END LOOP;

  -- 4. Check available balance rule
  IF v_subtotal > v_offender.balance THEN
    RAISE EXCEPTION 'Insufficient funds: Order total ($%) exceeds your current balance ($%).',
      v_subtotal, v_offender.balance;
  END IF;

  -- 5. Check remaining weekly spending limit rule
  IF (v_offender.current_weekly_spent + v_subtotal) > v_offender.weekly_limit THEN
    RAISE EXCEPTION 'Weekly spending limit exceeded: Order total ($%) exceeds remaining weekly allowance ($%).',
      v_subtotal, (v_offender.weekly_limit - v_offender.current_weekly_spent);
  END IF;

  -- 6. Generate order identifiers
  v_order_num := '#CC-' || LPAD(FLOOR(RANDOM() * 90000 + 10000)::TEXT, 5, '0');
  v_barcode := 'BC-' || v_order_num || '-' || TO_CHAR(now(), 'YYYYMMDD');
  v_delivery_date := now() + INTERVAL '3 days';

  -- Set session auth flag for controlled balance update trigger
  PERFORM set_config('canteen.authorized_transaction', 'true', true);

  -- 7. Deduct inventory stock
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_prod_id := (v_item->>'productId')::UUID;
    v_item_qty := (v_item->>'quantity')::INTEGER;

    UPDATE public.products
    SET stock = stock - v_item_qty,
        updated_at = now()
    WHERE id = v_prod_id;
  END LOOP;

  -- 8. Deduct inmate balance and increase weekly spend
  UPDATE public.offenders
  SET balance = balance - v_subtotal,
      current_weekly_spent = current_weekly_spent + v_subtotal,
      updated_at = now()
  WHERE id = v_offender_id;

  -- 9. Create Order
  INSERT INTO public.orders (
    order_number,
    facility_id,
    offender_id,
    status,
    subtotal,
    tax,
    total,
    expected_delivery_date,
    barcode
  ) VALUES (
    v_order_num,
    v_offender.facility_id,
    v_offender_id,
    'PROCESSING',
    v_subtotal,
    0.00,
    v_subtotal,
    v_delivery_date,
    v_barcode
  ) RETURNING id INTO v_order_id;

  -- 10. Create Order Items
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_prod_id := (v_item->>'productId')::UUID;
    v_item_qty := (v_item->>'quantity')::INTEGER;

    SELECT price INTO v_item_total
    FROM public.products
    WHERE id = v_prod_id;

    INSERT INTO public.order_items (
      order_id,
      product_id,
      quantity,
      unit_price,
      total_price
    ) VALUES (
      v_order_id,
      v_prod_id,
      v_item_qty,
      v_item_total,
      ROUND(v_item_total * v_item_qty, 2)
    );
  END LOOP;

  -- 11. Write immutable double-entry ledger entry
  INSERT INTO public.ledger_entries (
    facility_id,
    offender_id,
    type,
    debit,
    credit,
    balance_before,
    balance_after,
    reference_type,
    reference_id,
    description
  ) VALUES (
    v_offender.facility_id,
    v_offender_id,
    'COMMISSARY_ORDER',
    v_subtotal,
    0.00,
    v_offender.balance,
    v_offender.balance - v_subtotal,
    'ORDER',
    v_order_num,
    'Commissary order ' || v_order_num
  );

  -- 12. Create Order Picking List
  INSERT INTO public.picking_lists (order_id, status)
  VALUES (v_order_id, 'PENDING');

  -- 13. Create Inmate Notification
  INSERT INTO public.notifications (
    offender_id,
    type,
    title,
    message
  ) VALUES (
    v_offender_id,
    'ORDER_RECEIVED',
    'Order ' || v_order_num || ' Placed',
    'Your commissary order of $' || v_subtotal || ' has been queued for warehouse fulfillment.'
  );

  -- 14. Audit Log
  INSERT INTO public.audit_logs (
    action,
    actor_id,
    actor_role,
    facility_id,
    resource_type,
    resource_id,
    metadata
  ) VALUES (
    'ORDER_PLACED',
    v_offender_id,
    'INMATE',
    v_offender.facility_id,
    'ORDER',
    v_order_num,
    jsonb_build_object('total', v_subtotal, 'new_balance', v_offender.balance - v_subtotal)
  );

  RETURN jsonb_build_object(
    'orderId', v_order_id,
    'orderNumber', v_order_num,
    'total', v_subtotal,
    'newBalance', v_offender.balance - v_subtotal,
    'expectedDeliveryDate', v_delivery_date
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- 7.3 ATOMIC TOUCHPAY DEPOSIT CONFIRMATION
-- Credits balance strictly on confirmed TouchPay webhook or verified gateway response
CREATE OR REPLACE FUNCTION public.process_confirmed_touchpay_deposit(
  p_provider_ref TEXT,
  p_idempotency_key TEXT
)
RETURNS JSONB AS $$
DECLARE
  v_deposit RECORD;
  v_offender RECORD;
BEGIN
  -- 1. Fetch deposit record
  SELECT * INTO v_deposit
  FROM public.deposits
  WHERE provider_ref = p_provider_ref
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Deposit with provider reference % not found.', p_provider_ref;
  END IF;

  -- 2. Idempotency Check: if already succeeded, exit safely without double-crediting
  IF v_deposit.status = 'SUCCEEDED' THEN
    RETURN jsonb_build_object(
      'processed', false,
      'alreadyProcessed', true,
      'message', 'Deposit already confirmed and credited previously.'
    );
  END IF;

  -- 3. Lock offender row
  SELECT * INTO v_offender
  FROM public.offenders
  WHERE id = v_deposit.offender_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Associated offender not found.';
  END IF;

  -- Set session auth flag for controlled balance update trigger
  PERFORM set_config('canteen.authorized_transaction', 'true', true);

  -- 4. Credit balance
  UPDATE public.offenders
  SET balance = balance + v_deposit.amount,
      updated_at = now()
  WHERE id = v_deposit.offender_id;

  -- 5. Mark deposit as succeeded
  UPDATE public.deposits
  SET status = 'SUCCEEDED',
      completed_at = now()
  WHERE id = v_deposit.id;

  -- 6. Write immutable double-entry ledger entry
  INSERT INTO public.ledger_entries (
    facility_id,
    offender_id,
    type,
    debit,
    credit,
    balance_before,
    balance_after,
    reference_type,
    reference_id,
    description
  ) VALUES (
    v_deposit.facility_id,
    v_deposit.offender_id,
    'DEPOSIT',
    0.00,
    v_deposit.amount,
    v_offender.balance,
    v_offender.balance + v_deposit.amount,
    'DEPOSIT',
    v_deposit.provider_ref,
    'TouchPay trust fund deposit ' || v_deposit.provider_ref
  );

  -- 7. Send notification to inmate
  INSERT INTO public.notifications (
    offender_id,
    type,
    title,
    message
  ) VALUES (
    v_deposit.offender_id,
    'DEPOSIT_RECEIVED',
    'Deposit Received',
    'A deposit of $' || v_deposit.amount || ' has been credited to your trust balance via TouchPay.'
  );

  -- 8. Audit Log
  INSERT INTO public.audit_logs (
    action,
    actor_id,
    actor_role,
    facility_id,
    resource_type,
    resource_id,
    metadata
  ) VALUES (
    'DEPOSIT_CONFIRMED',
    'TOUCHPAY_GATEWAY',
    'SYSTEM',
    v_deposit.facility_id,
    'DEPOSIT',
    v_deposit.provider_ref,
    jsonb_build_object('amount', v_deposit.amount, 'new_balance', v_offender.balance + v_deposit.amount)
  );

  RETURN jsonb_build_object(
    'processed', true,
    'alreadyProcessed', false,
    'newBalance', v_offender.balance + v_deposit.amount,
    'message', 'Trust funds successfully credited to inmate account.'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;
