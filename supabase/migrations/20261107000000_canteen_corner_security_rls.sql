-- ==============================================================================
-- CANTEEN CORNER — SECURE DATABASE ARCHITECTURE & ROW LEVEL SECURITY (RLS)
-- Multi-Tenant Correctional Facility Commissary Platform
-- Production Hardened Security Remediation Version
-- ==============================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. ENUM & COMPOSITE TYPES (Idempotent creation)
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
  ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'SUPER_ADMIN';
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

-- Strongly typed internal composite record for atomic in-memory cart processing
-- Eliminates caller-controlled temporary tables entirely
DO $$ BEGIN
  CREATE TYPE public.order_cart_item AS (
    product_id UUID,
    quantity INTEGER,
    product_name TEXT,
    locked_price NUMERIC(10, 2),
    item_subtotal NUMERIC(10, 2)
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- ==============================================================================
-- 3. CORE TABLES & CONSTRAINTS (ZERO DESTRUCTIVE OPERATIONS)
-- Existing tables and live records are preserved without drops or truncations.
-- ==============================================================================

-- 3.1 Facilities (Multi-tenant partition root)
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

-- 3.2 User Profiles (Linked 1:1 to Supabase auth.users)
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

-- 3.3 Offenders (Inmates)
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
  failed_pin_attempts INTEGER NOT NULL DEFAULT 0 CHECK (failed_pin_attempts >= 0),
  pin_locked_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_offender_weekly_spent CHECK (current_weekly_spent <= weekly_limit)
);

-- 3.4 Family & Friends Accounts
CREATE TABLE IF NOT EXISTS public.family_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  relationship TEXT NOT NULL DEFAULT 'Family',
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3.5 Authorized Family-Offender Relationships (Explicit Access Control)
CREATE TABLE IF NOT EXISTS public.family_offender_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_account_id UUID NOT NULL REFERENCES public.family_accounts(id) ON DELETE CASCADE,
  offender_id TEXT NOT NULL REFERENCES public.offenders(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'APPROVED' CHECK (status IN ('PENDING', 'APPROVED', 'BLOCKED')),
  relationship TEXT NOT NULL DEFAULT 'Family',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(family_account_id, offender_id)
);

-- 3.6 Commissary Product Catalog
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

-- 3.7 Manifests (Delivery batches grouped by unit and date)
CREATE TABLE IF NOT EXISTS public.manifests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  manifest_number TEXT NOT NULL UNIQUE,
  facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE RESTRICT,
  unit TEXT NOT NULL,
  housing TEXT,
  delivery_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'GENERATED',
  total_orders INTEGER NOT NULL DEFAULT 0 CHECK (total_orders >= 0),
  total_items INTEGER NOT NULL DEFAULT 0 CHECK (total_items >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3.8 Orders
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

-- 3.9 Order Items
CREATE TABLE IF NOT EXISTS public.order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(10, 2) NOT NULL CHECK (unit_price >= 0.00),
  total_price NUMERIC(10, 2) NOT NULL CHECK (total_price >= 0.00)
);

-- 3.10 Order Status Audit History
CREATE TABLE IF NOT EXISTS public.order_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  previous_status order_status,
  new_status order_status NOT NULL,
  changed_by TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3.11 Trust Fund Deposits (TouchPay Exclusive)
CREATE TABLE IF NOT EXISTS public.deposits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE RESTRICT,
  offender_id TEXT NOT NULL REFERENCES public.offenders(id) ON DELETE RESTRICT,
  family_account_id UUID REFERENCES public.family_accounts(id) ON DELETE SET NULL,
  amount NUMERIC(10, 2) NOT NULL CHECK (amount > 0.00),
  fee NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (fee >= 0.00),
  total_paid NUMERIC(10, 2) NOT NULL CHECK (total_paid >= amount),
  currency TEXT NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
  provider TEXT NOT NULL DEFAULT 'TOUCHPAY' CHECK (provider = 'TOUCHPAY'),
  provider_ref TEXT NOT NULL UNIQUE,
  status deposit_status NOT NULL DEFAULT 'PENDING',
  idempotency_key TEXT NOT NULL UNIQUE,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3.12 Inmate Subsidiary Trust Fund Ledger (Immutable balance audit trail)
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
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_ledger_entry_math CHECK (
    (credit > 0.00 AND debit = 0.00 AND balance_after = balance_before + credit) OR
    (debit > 0.00 AND credit = 0.00 AND balance_after = balance_before - debit) OR
    (credit = 0.00 AND debit = 0.00 AND balance_after = balance_before)
  )
);

-- 3.13 Care Gift Packages
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

-- 3.14 Inmate Notifications
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

-- 3.15 Warehouse Picking Lists
CREATE TABLE IF NOT EXISTS public.picking_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL UNIQUE REFERENCES public.orders(id) ON DELETE CASCADE,
  picker_user_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

-- 3.16 System & Security Audit Logs (Append-Only)
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
-- 3.17 PRE-MIGRATION DIAGNOSTIC CHECKS & SCHEMA UPGRADES
-- ==============================================================================

DO $$
DECLARE
  v_invalid_count INTEGER;
BEGIN
  -- Check 1: Inmate balances and spend limits
  SELECT COUNT(*) INTO v_invalid_count
  FROM public.offenders
  WHERE balance < 0.00 OR current_weekly_spent < 0.00 OR current_weekly_spent > weekly_limit;
  IF v_invalid_count > 0 THEN
    RAISE EXCEPTION 'PRE-MIGRATION DATA CHECK FAILED: % offender records have negative balances or spend exceeding weekly limit.', v_invalid_count;
  END IF;

  -- Check 2: Facility consistency between orders and offenders
  SELECT COUNT(*) INTO v_invalid_count
  FROM public.orders o
  JOIN public.offenders f ON o.offender_id = f.id
  WHERE o.facility_id != f.facility_id;
  IF v_invalid_count > 0 THEN
    RAISE EXCEPTION 'PRE-MIGRATION DATA CHECK FAILED: % orders have facility_id mismatched with offender facility.', v_invalid_count;
  END IF;

  -- Check 3: Facility consistency between deposits and offenders
  SELECT COUNT(*) INTO v_invalid_count
  FROM public.deposits d
  JOIN public.offenders f ON d.offender_id = f.id
  WHERE d.facility_id != f.facility_id;
  IF v_invalid_count > 0 THEN
    RAISE EXCEPTION 'PRE-MIGRATION DATA CHECK FAILED: % deposits have facility_id mismatched with offender facility.', v_invalid_count;
  END IF;
END $$;

-- Idempotent column additions for existing installations
ALTER TABLE public.facilities ADD COLUMN IF NOT EXISTS weekly_reset_day INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.facilities ADD COLUMN IF NOT EXISTS gift_packages_enabled BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.facilities ADD COLUMN IF NOT EXISTS max_weekly_spend NUMERIC(10, 2) NOT NULL DEFAULT 100.00;
ALTER TABLE public.facilities ADD COLUMN IF NOT EXISTS max_deposit_amount NUMERIC(10, 2) NOT NULL DEFAULT 300.00;

ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS facility_id UUID REFERENCES public.facilities(id) ON DELETE RESTRICT;
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS role user_role NOT NULL DEFAULT 'FAMILY';
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS staff_id TEXT;
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE public.offenders ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL;
ALTER TABLE public.offenders ADD COLUMN IF NOT EXISTS current_weekly_spent NUMERIC(10, 2) NOT NULL DEFAULT 0.00;
ALTER TABLE public.offenders ADD COLUMN IF NOT EXISTS last_weekly_reset TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.offenders ADD COLUMN IF NOT EXISTS failed_pin_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.offenders ADD COLUMN IF NOT EXISTS pin_locked_until TIMESTAMPTZ;

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS manifest_id UUID REFERENCES public.manifests(id) ON DELETE SET NULL;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS tax NUMERIC(10, 2) NOT NULL DEFAULT 0.00;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS barcode TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS tracking_barcode TEXT;

ALTER TABLE public.deposits ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'USD';
ALTER TABLE public.deposits ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
ALTER TABLE public.deposits ADD COLUMN IF NOT EXISTS provider_ref TEXT;
ALTER TABLE public.deposits ADD COLUMN IF NOT EXISTS fee NUMERIC(10, 2) NOT NULL DEFAULT 3.50;
ALTER TABLE public.deposits ADD COLUMN IF NOT EXISTS total_paid NUMERIC(10, 2) NOT NULL DEFAULT 0.00;

ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS read BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.picking_lists ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL;
ALTER TABLE public.picking_lists ADD COLUMN IF NOT EXISTS flagged_reason TEXT;

-- Validation Assertion: Confirm physical schema presence of all required columns
DO $$
DECLARE
  v_missing_cols TEXT := '';
BEGIN
  SELECT string_agg(req.tbl || '.' || req.col, ', ')
  INTO v_missing_cols
  FROM (
    VALUES
      ('facilities', 'weekly_reset_day'),
      ('facilities', 'gift_packages_enabled'),
      ('facilities', 'max_weekly_spend'),
      ('facilities', 'max_deposit_amount'),
      ('user_profiles', 'facility_id'),
      ('user_profiles', 'role'),
      ('user_profiles', 'staff_id'),
      ('user_profiles', 'is_active'),
      ('offenders', 'user_id'),
      ('offenders', 'current_weekly_spent'),
      ('offenders', 'last_weekly_reset'),
      ('offenders', 'failed_pin_attempts'),
      ('offenders', 'pin_locked_until'),
      ('orders', 'manifest_id'),
      ('orders', 'tax'),
      ('orders', 'barcode'),
      ('orders', 'tracking_barcode'),
      ('deposits', 'currency'),
      ('deposits', 'idempotency_key'),
      ('deposits', 'provider_ref'),
      ('deposits', 'fee'),
      ('deposits', 'total_paid'),
      ('notifications', 'read'),
      ('picking_lists', 'assigned_to'),
      ('picking_lists', 'flagged_reason')
  ) AS req(tbl, col)
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = req.tbl
      AND column_name = req.col
  );

  IF v_missing_cols IS NOT NULL AND v_missing_cols <> '' THEN
    RAISE EXCEPTION 'MIGRATION VALIDATION FAILURE: Required schema columns missing: %', v_missing_cols;
  END IF;
END $$;

-- ==============================================================================
-- 4. PERFORMANCE & SECURITY INDEXES
-- ==============================================================================

CREATE INDEX IF NOT EXISTS idx_user_profiles_facility ON public.user_profiles(facility_id);
CREATE INDEX IF NOT EXISTS idx_offenders_facility ON public.offenders(facility_id);
CREATE INDEX IF NOT EXISTS idx_offenders_user_id ON public.offenders(user_id);
CREATE INDEX IF NOT EXISTS idx_family_offender_links_lookup ON public.family_offender_links(family_account_id, offender_id, status);
CREATE INDEX IF NOT EXISTS idx_products_facility ON public.products(facility_id) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_orders_offender_id ON public.orders(offender_id);
CREATE INDEX IF NOT EXISTS idx_orders_facility_status ON public.orders(facility_id, status);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON public.order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_deposits_offender_status ON public.deposits(offender_id, status);
CREATE INDEX IF NOT EXISTS idx_deposits_provider_ref ON public.deposits(provider_ref);
CREATE INDEX IF NOT EXISTS idx_deposits_idempotency ON public.deposits(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_ledger_offender ON public.ledger_entries(offender_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_facility_action ON public.audit_logs(facility_id, action, created_at DESC);

-- ==============================================================================
-- 5. CROSS-ENTITY FACILITY CONSISTENCY TRIGGERS
-- ==============================================================================

-- 5.1 Enforce facility match between Order and Offender
CREATE OR REPLACE FUNCTION public.check_order_facility_consistency()
RETURNS TRIGGER AS $$
DECLARE
  v_offender_facility UUID;
BEGIN
  SELECT facility_id INTO v_offender_facility
  FROM public.offenders
  WHERE id = NEW.offender_id;

  IF v_offender_facility IS NULL OR v_offender_facility != NEW.facility_id THEN
    RAISE EXCEPTION 'SECURITY VIOLATION: Order facility (%) does not match offender facility (%).',
      NEW.facility_id, v_offender_facility;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_order_facility_consistency ON public.orders;
CREATE TRIGGER trg_order_facility_consistency
  BEFORE INSERT OR UPDATE OF facility_id, offender_id ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.check_order_facility_consistency();

-- 5.2 Enforce facility match between Deposit and Offender
CREATE OR REPLACE FUNCTION public.check_deposit_facility_consistency()
RETURNS TRIGGER AS $$
DECLARE
  v_offender_facility UUID;
BEGIN
  SELECT facility_id INTO v_offender_facility
  FROM public.offenders
  WHERE id = NEW.offender_id;

  IF v_offender_facility IS NULL OR v_offender_facility != NEW.facility_id THEN
    RAISE EXCEPTION 'SECURITY VIOLATION: Deposit facility (%) does not match offender facility (%).',
      NEW.facility_id, v_offender_facility;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_deposit_facility_consistency ON public.deposits;
CREATE TRIGGER trg_deposit_facility_consistency
  BEFORE INSERT OR UPDATE OF facility_id, offender_id ON public.deposits
  FOR EACH ROW
  EXECUTE FUNCTION public.check_deposit_facility_consistency();

-- 5.3 Enforce facility match between Picking List Order and Acting Staff
CREATE OR REPLACE FUNCTION public.check_picking_list_order_facility()
RETURNS TRIGGER AS $$
DECLARE
  v_order_facility UUID;
BEGIN
  SELECT facility_id INTO v_order_facility
  FROM public.orders
  WHERE id = NEW.order_id;

  IF v_order_facility IS NULL THEN
    RAISE EXCEPTION 'SECURITY VIOLATION: Referenced order (%) does not exist.', NEW.order_id;
  END IF;

  IF auth.role() = 'authenticated' AND public.current_user_role() != 'ADMIN' THEN
    IF public.current_user_facility() IS NULL OR v_order_facility IS DISTINCT FROM public.current_user_facility() THEN
      RAISE EXCEPTION 'SECURITY VIOLATION: Cannot assign or modify picking lists for orders outside your assigned facility.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_picking_list_order_facility ON public.picking_lists;
CREATE TRIGGER trg_picking_list_order_facility
  BEFORE INSERT OR UPDATE OF order_id ON public.picking_lists
  FOR EACH ROW
  EXECUTE FUNCTION public.check_picking_list_order_facility();

-- ==============================================================================
-- 6. SECURITY & AUTHENTICATION HELPER FUNCTIONS
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.current_profile()
RETURNS public.user_profiles AS $$
  SELECT * FROM public.user_profiles
  WHERE id = auth.uid() AND is_active = true
  LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS public.user_role AS $$
  SELECT role FROM public.user_profiles
  WHERE id = auth.uid() AND is_active = true
  LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.current_user_facility()
RETURNS UUID AS $$
  SELECT facility_id FROM public.user_profiles
  WHERE id = auth.uid() AND is_active = true
  LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.current_inmate_offender_id()
RETURNS TEXT AS $$
  SELECT o.id FROM public.offenders o
  JOIN public.user_profiles up ON up.id = o.user_id
  WHERE o.user_id = auth.uid() AND up.is_active = true
  LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.current_family_account_id()
RETURNS UUID AS $$
  SELECT fa.id FROM public.family_accounts fa
  JOIN public.user_profiles up ON up.id = fa.user_id
  WHERE fa.user_id = auth.uid() AND up.is_active = true
  LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.is_family_authorized_for_offender(
  p_family_account_id UUID,
  p_offender_id TEXT
)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.family_offender_links fol
    JOIN public.family_accounts fa ON fa.id = fol.family_account_id
    JOIN public.user_profiles up ON up.id = fa.user_id
    WHERE fol.family_account_id = p_family_account_id
      AND fol.offender_id = p_offender_id
      AND fol.status = 'APPROVED'
      AND up.is_active = true
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

-- ==============================================================================
-- 7. IMMUTABLE ROLE INTEGRITY & PRIVILEGE ELEVATION PROTECTION
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.prevent_unauthorized_role_change()
RETURNS TRIGGER AS $$
DECLARE
  v_caller_role public.user_role;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' AND auth.uid() IS NOT NULL THEN
    v_caller_role := public.current_user_role();

    IF TG_OP = 'INSERT' THEN
      IF v_caller_role IS DISTINCT FROM 'ADMIN' THEN
        IF NEW.role IS DISTINCT FROM 'FAMILY' THEN
          RAISE EXCEPTION 'SECURITY VIOLATION: Role elevation is strictly prohibited during profile registration.';
        END IF;
        IF NEW.staff_id IS NOT NULL THEN
          RAISE EXCEPTION 'SECURITY VIOLATION: Staff ID cannot be assigned during self-registration.';
        END IF;
        IF NEW.facility_id IS NOT NULL THEN
          RAISE EXCEPTION 'SECURITY VIOLATION: Facility assignment cannot be assigned during self-registration.';
        END IF;
        IF NEW.is_active IS DISTINCT FROM true THEN
          RAISE EXCEPTION 'SECURITY VIOLATION: Account activation status cannot be modified during self-registration.';
        END IF;
      END IF;
    ELSIF TG_OP = 'UPDATE' THEN
      IF v_caller_role IS DISTINCT FROM 'ADMIN' THEN
        IF NEW.role IS DISTINCT FROM OLD.role THEN
          RAISE EXCEPTION 'SECURITY VIOLATION: Role elevation is strictly prohibited.';
        END IF;
        IF NEW.facility_id IS DISTINCT FROM OLD.facility_id THEN
          RAISE EXCEPTION 'SECURITY VIOLATION: Facility assignment cannot be modified by user.';
        END IF;
        IF NEW.is_active IS DISTINCT FROM OLD.is_active THEN
          RAISE EXCEPTION 'SECURITY VIOLATION: Account activation status can only be modified by administrators.';
        END IF;
        IF NEW.staff_id IS DISTINCT FROM OLD.staff_id THEN
          RAISE EXCEPTION 'SECURITY VIOLATION: Staff ID cannot be modified by user.';
        END IF;
      END IF;

      IF auth.uid() = OLD.id THEN
        IF NEW.role IS DISTINCT FROM OLD.role THEN
          RAISE EXCEPTION 'SECURITY VIOLATION: Administrators cannot modify their own administrative role.';
        END IF;
        IF NEW.is_active IS DISTINCT FROM OLD.is_active AND NEW.is_active = false THEN
          RAISE EXCEPTION 'SECURITY VIOLATION: Administrators cannot deactivate their own active account.';
        END IF;
      END IF;
    END IF;
  END IF;
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_prevent_role_change ON public.user_profiles;
CREATE TRIGGER trg_prevent_role_change
  BEFORE INSERT OR UPDATE ON public.user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_unauthorized_role_change();

CREATE OR REPLACE FUNCTION public.check_family_link_status_guard()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IN ('APPROVED', 'BLOCKED') THEN
    IF (OLD IS NULL OR OLD.status IS DISTINCT FROM NEW.status) THEN
      IF auth.role() IS DISTINCT FROM 'service_role' AND public.current_user_role() NOT IN ('ADMIN', 'WAREHOUSE_SUPERVISOR') THEN
        RAISE EXCEPTION 'SECURITY VIOLATION: Relationship approval or blocking requires institutional staff authorization.';
      END IF;
    END IF;
  END IF;

  IF OLD IS NOT NULL AND auth.role() IS DISTINCT FROM 'service_role' THEN
    IF NEW.family_account_id IS DISTINCT FROM OLD.family_account_id OR NEW.offender_id IS DISTINCT FROM OLD.offender_id THEN
      RAISE EXCEPTION 'SECURITY VIOLATION: Cannot reassign family account or inmate on an existing relationship link.';
    END IF;
  END IF;

  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_family_link_status_guard ON public.family_offender_links;
CREATE TRIGGER trg_family_link_status_guard
  BEFORE INSERT OR UPDATE ON public.family_offender_links
  FOR EACH ROW
  EXECUTE FUNCTION public.check_family_link_status_guard();

-- Trigger: Prevent direct modification of financial balance columns on offenders
-- MULTI-LAYER DEFENSE ARCHITECTURE:
-- Layer 1: PostgreSQL Column Privileges: UPDATE (balance, current_weekly_spent) is REVOKED
--          from PUBLIC, anon, and authenticated. Direct client DML is rejected at SQLSTATE 42501.
-- Layer 2: Client Role Boundary: Unconditional rejection if current_user is authenticated or anon.
-- Layer 3: Dynamic Transaction Authorization Token: Ephemeral single-use SHA-256 token set
--          strictly within authorized financial functions and immediately consumed/cleared.
--          Caller-settable static GUCs (e.g. 'true') are strictly rejected.
-- Layer 4: Financial Delta Invariants: Validates that balance and spend deltas mathematically
--          conform to either an order deduction, deposit credit, or weekly reset.
-- Layer 5: Execution Context Verification: Confirms execution is under SECURITY DEFINER as postgres.
CREATE OR REPLACE FUNCTION public.prevent_direct_balance_tampering()
RETURNS TRIGGER AS $$
DECLARE
  v_stack TEXT;
  v_auth_token TEXT;
  v_bal_delta NUMERIC(10, 2);
  v_spent_delta NUMERIC(10, 2);
  v_is_order_deduction BOOLEAN := false;
  v_is_deposit_credit BOOLEAN := false;
  v_is_weekly_reset BOOLEAN := false;
BEGIN
  IF NEW.balance IS DISTINCT FROM OLD.balance OR NEW.current_weekly_spent IS DISTINCT FROM OLD.current_weekly_spent THEN
    -- Layer 2: Direct client execution is unconditionally rejected
    IF current_user IN ('authenticated', 'anon') THEN
      RAISE EXCEPTION 'SECURITY VIOLATION: Direct balance or spending modification is strictly prohibited for client roles (42501).';
    END IF;

    -- Layer 4: Mathematical Delta Invariant Verification
    v_bal_delta := NEW.balance - OLD.balance;
    v_spent_delta := NEW.current_weekly_spent - OLD.current_weekly_spent;

    -- Valid Delta Invariant 1: Commissary order deduction (balance decreases, spend increases by exact same amount)
    IF v_bal_delta < 0.00 AND v_spent_delta = -v_bal_delta AND NEW.current_weekly_spent <= NEW.weekly_limit THEN
      v_is_order_deduction := true;
    -- Valid Delta Invariant 2: TouchPay deposit credit (balance increases, spend untouched)
    ELSIF v_bal_delta > 0.00 AND v_spent_delta = 0.00 THEN
      v_is_deposit_credit := true;
    -- Valid Delta Invariant 3: Weekly spending reset (balance untouched, spend zeroed)
    ELSIF v_bal_delta = 0.00 AND NEW.current_weekly_spent = 0.00 AND OLD.current_weekly_spent > 0.00 THEN
      v_is_weekly_reset := true;
    END IF;

    -- If deltas do not match any recognized financial operation invariant, reject immediately
    IF NOT (v_is_order_deduction OR v_is_deposit_credit OR v_is_weekly_reset) THEN
      RAISE EXCEPTION 'SECURITY VIOLATION: Balance/spend delta does not conform to an authorized financial transaction invariant.';
    END IF;

    -- Layer 3: Single-Use Dynamic Transaction Token Verification
    v_auth_token := current_setting('canteen_internal.active_tx_auth', true);
    IF v_auth_token IS NOT NULL AND v_auth_token <> '' AND v_auth_token <> 'true' THEN
      -- Token is immediately cleared upon consumption so it cannot be reused
      PERFORM set_config('canteen_internal.active_tx_auth', '', true);
    ELSE
      -- Permit direct DBA/migration console execution ONLY if executing as postgres without auth JWT session
      IF session_user = 'postgres' AND current_user = 'postgres' AND auth.role() IS NULL THEN
        NULL;
      ELSE
        RAISE EXCEPTION 'SECURITY VIOLATION: Financial columns can only be modified via verified transactional functions (place_inmate_order, process_confirmed_touchpay_deposit). Static GUC bypass rejected.';
      END IF;
    END IF;

    -- Layer 5: Verify execution context via call diagnostics
    GET DIAGNOSTICS v_stack = PG_CONTEXT;
    IF NOT (v_stack ILIKE '%place_inmate_order%'
            OR v_stack ILIKE '%process_confirmed_touchpay_deposit%'
            OR (session_user = 'postgres' AND current_user = 'postgres' AND auth.role() IS NULL)) THEN
      RAISE EXCEPTION 'SECURITY VIOLATION: Execution context is not an authorized financial transaction function.';
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

CREATE OR REPLACE FUNCTION public.check_notification_update_integrity()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.id != OLD.id OR
     NEW.offender_id IS DISTINCT FROM OLD.offender_id OR
     NEW.user_id IS DISTINCT FROM OLD.user_id OR
     NEW.type IS DISTINCT FROM OLD.type OR
     NEW.title IS DISTINCT FROM OLD.title OR
     NEW.message IS DISTINCT FROM OLD.message OR
     NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'SECURITY VIOLATION: Modifying notification contents, recipients, or metadata is prohibited. Only the read status may be updated.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_notification_update_integrity ON public.notifications;
CREATE TRIGGER trg_notification_update_integrity
  BEFORE UPDATE ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.check_notification_update_integrity();

CREATE OR REPLACE FUNCTION public.prevent_audit_tampering()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'SECURITY VIOLATION: Audit logs, ledger entries, and status histories are immutable and cannot be modified or deleted.';
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

DROP TRIGGER IF EXISTS trg_immutable_status_history ON public.order_status_history;
CREATE TRIGGER trg_immutable_status_history
  BEFORE UPDATE OR DELETE ON public.order_status_history
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_audit_tampering();

-- ==============================================================================
-- 8. COMPREHENSIVE DYNAMIC RLS PURGE & FULL POLICY MATRIX ON ALL 16 TABLES
-- ==============================================================================

ALTER TABLE public.facilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.facilities FORCE ROW LEVEL SECURITY;

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles FORCE ROW LEVEL SECURITY;

ALTER TABLE public.offenders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offenders FORCE ROW LEVEL SECURITY;

ALTER TABLE public.family_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.family_accounts FORCE ROW LEVEL SECURITY;

ALTER TABLE public.family_offender_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.family_offender_links FORCE ROW LEVEL SECURITY;

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

-- Dynamic Loop: Purge ALL existing policies across all 16 tables
DO $$
DECLARE
  r RECORD;
  v_tables TEXT[] := ARRAY[
    'facilities', 'user_profiles', 'offenders', 'family_accounts',
    'family_offender_links', 'products', 'manifests', 'orders',
    'order_items', 'order_status_history', 'deposits', 'ledger_entries',
    'gift_packages', 'notifications', 'picking_lists', 'audit_logs'
  ];
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = ANY(v_tables)
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I;', r.policyname, r.schemaname, r.tablename);
  END LOOP;
END $$;

-- 8.1 FACILITIES POLICIES
CREATE POLICY "facilities_select_authenticated" ON public.facilities
  FOR SELECT TO authenticated
  USING (
    (public.current_user_facility() IS NOT NULL AND id = public.current_user_facility())
    OR (public.current_user_role() = 'ADMIN' AND public.current_user_facility() IS NULL)
    OR (
      public.current_user_role() = 'FAMILY'
      AND EXISTS (
        SELECT 1 FROM public.family_offender_links fol
        JOIN public.offenders o ON o.id = fol.offender_id
        WHERE fol.family_account_id = public.current_family_account_id()
          AND fol.status = 'APPROVED'
          AND o.facility_id = facilities.id
      )
    )
  );

CREATE POLICY "facilities_update_admin" ON public.facilities
  FOR UPDATE TO authenticated
  USING (
    public.current_user_role() = 'ADMIN'
    AND (public.current_user_facility() IS NULL OR id = public.current_user_facility())
  )
  WITH CHECK (
    public.current_user_role() = 'ADMIN'
    AND (public.current_user_facility() IS NULL OR id = public.current_user_facility())
  );

-- 8.2 USER PROFILES POLICIES
CREATE POLICY "profiles_select_self_or_facility" ON public.user_profiles
  FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR (
      public.current_user_facility() IS NOT NULL
      AND facility_id = public.current_user_facility()
      AND public.current_user_role() IN ('ADMIN', 'WAREHOUSE_SUPERVISOR')
    )
    OR (public.current_user_role() = 'ADMIN' AND public.current_user_facility() IS NULL)
  );

CREATE POLICY "profiles_insert_self" ON public.user_profiles
  FOR INSERT TO authenticated
  WITH CHECK (
    id = auth.uid()
    AND (
      (role = 'FAMILY' AND staff_id IS NULL AND facility_id IS NULL)
      OR public.current_user_role() = 'ADMIN'
    )
  );

CREATE POLICY "profiles_insert_admin" ON public.user_profiles
  FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_role() = 'ADMIN'
    AND (public.current_user_facility() IS NULL OR facility_id = public.current_user_facility())
  );

CREATE POLICY "profiles_update_self" ON public.user_profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid() AND is_active = true)
  WITH CHECK (id = auth.uid() AND is_active = true);

CREATE POLICY "profiles_update_admin" ON public.user_profiles
  FOR UPDATE TO authenticated
  USING (
    public.current_user_role() = 'ADMIN'
    AND (public.current_user_facility() IS NULL OR facility_id = public.current_user_facility())
  )
  WITH CHECK (
    public.current_user_role() = 'ADMIN'
    AND (public.current_user_facility() IS NULL OR facility_id = public.current_user_facility())
  );

-- 8.3 OFFENDERS POLICIES
CREATE POLICY "offenders_select" ON public.offenders
  FOR SELECT TO authenticated
  USING (
    (public.current_user_role() = 'INMATE' AND id = public.current_inmate_offender_id())
    OR (
      public.current_user_facility() IS NOT NULL
      AND facility_id = public.current_user_facility()
      AND public.current_user_role() IN ('ADMIN', 'WAREHOUSE_PICKER', 'WAREHOUSE_SUPERVISOR')
    )
    OR (public.current_user_role() = 'ADMIN' AND public.current_user_facility() IS NULL)
    OR (
      public.current_user_role() = 'FAMILY'
      AND public.is_family_authorized_for_offender(public.current_family_account_id(), offenders.id)
    )
  );

CREATE POLICY "offenders_update_admin" ON public.offenders
  FOR UPDATE TO authenticated
  USING (
    public.current_user_role() = 'ADMIN'
    AND (
      public.current_user_facility() IS NULL
      OR facility_id = public.current_user_facility()
    )
  )
  WITH CHECK (
    public.current_user_role() = 'ADMIN'
    AND (
      public.current_user_facility() IS NULL
      OR facility_id = public.current_user_facility()
    )
  );

-- 8.4 FAMILY ACCOUNTS & AUTHORIZATION LINKS POLICIES
CREATE POLICY "family_accounts_select" ON public.family_accounts
  FOR SELECT TO authenticated
  USING (
    (
      user_id = auth.uid()
      AND EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.id = auth.uid() AND up.is_active = true)
    )
    OR (public.current_user_role() = 'ADMIN')
  );

CREATE POLICY "family_accounts_insert" ON public.family_accounts
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.id = auth.uid() AND up.is_active = true)
  );

CREATE POLICY "family_accounts_update" ON public.family_accounts
  FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.id = auth.uid() AND up.is_active = true)
  )
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.id = auth.uid() AND up.is_active = true)
  );

CREATE POLICY "family_links_select" ON public.family_offender_links
  FOR SELECT TO authenticated
  USING (
    family_account_id = public.current_family_account_id()
    OR (public.current_user_role() = 'ADMIN' AND public.current_user_facility() IS NULL)
    OR (
      public.current_user_role() IN ('ADMIN', 'WAREHOUSE_SUPERVISOR')
      AND public.current_user_facility() IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.offenders o
        WHERE o.id = family_offender_links.offender_id
          AND o.facility_id = public.current_user_facility()
      )
    )
  );

CREATE POLICY "family_links_insert_family" ON public.family_offender_links
  FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_role() = 'FAMILY'
    AND family_account_id = public.current_family_account_id()
    AND status = 'PENDING'
  );

CREATE POLICY "family_links_staff_update" ON public.family_offender_links
  FOR UPDATE TO authenticated
  USING (
    public.current_user_role() IN ('ADMIN', 'WAREHOUSE_SUPERVISOR')
    AND (
      (public.current_user_role() = 'ADMIN' AND public.current_user_facility() IS NULL)
      OR EXISTS (
        SELECT 1 FROM public.offenders o
        WHERE o.id = family_offender_links.offender_id
          AND o.facility_id = public.current_user_facility()
      )
    )
  )
  WITH CHECK (
    public.current_user_role() IN ('ADMIN', 'WAREHOUSE_SUPERVISOR')
  );

CREATE POLICY "family_links_admin_delete" ON public.family_offender_links
  FOR DELETE TO authenticated
  USING (public.current_user_role() = 'ADMIN');

-- 8.5 PRODUCTS POLICIES (STRICT FACILITY ISOLATION)
CREATE POLICY "products_select_active" ON public.products
  FOR SELECT TO authenticated
  USING (
    active = true
    AND (
      (public.current_user_facility() IS NOT NULL AND facility_id = public.current_user_facility())
      OR (public.current_user_role() = 'ADMIN' AND public.current_user_facility() IS NULL)
      OR (
        public.current_user_role() = 'FAMILY'
        AND EXISTS (
          SELECT 1 FROM public.family_offender_links fol
          JOIN public.offenders o ON o.id = fol.offender_id
          WHERE fol.family_account_id = public.current_family_account_id()
            AND fol.status = 'APPROVED'
            AND o.facility_id = products.facility_id
        )
      )
    )
  );

CREATE POLICY "products_modify_staff" ON public.products
  FOR ALL TO authenticated
  USING (
    public.current_user_role() IN ('ADMIN', 'WAREHOUSE_SUPERVISOR')
    AND (
      (public.current_user_facility() IS NOT NULL AND facility_id = public.current_user_facility())
      OR (public.current_user_role() = 'ADMIN' AND public.current_user_facility() IS NULL)
    )
  )
  WITH CHECK (
    public.current_user_role() IN ('ADMIN', 'WAREHOUSE_SUPERVISOR')
    AND (
      (public.current_user_facility() IS NOT NULL AND facility_id = public.current_user_facility())
      OR (public.current_user_role() = 'ADMIN' AND public.current_user_facility() IS NULL)
    )
  );

-- 8.6 ORDERS & ORDER ITEMS POLICIES
CREATE POLICY "orders_select" ON public.orders
  FOR SELECT TO authenticated
  USING (
    (public.current_user_role() = 'INMATE' AND offender_id = public.current_inmate_offender_id())
    OR (
      public.current_user_facility() IS NOT NULL
      AND facility_id = public.current_user_facility()
      AND public.current_user_role() IN ('ADMIN', 'WAREHOUSE_PICKER', 'WAREHOUSE_SUPERVISOR')
    )
    OR (public.current_user_role() = 'ADMIN' AND public.current_user_facility() IS NULL)
  );

CREATE POLICY "orders_update_warehouse" ON public.orders
  FOR UPDATE TO authenticated
  USING (
    public.current_user_facility() IS NOT NULL
    AND facility_id = public.current_user_facility()
    AND public.current_user_role() IN ('ADMIN', 'WAREHOUSE_PICKER', 'WAREHOUSE_SUPERVISOR')
  )
  WITH CHECK (
    public.current_user_facility() IS NOT NULL
    AND facility_id = public.current_user_facility()
    AND public.current_user_role() IN ('ADMIN', 'WAREHOUSE_PICKER', 'WAREHOUSE_SUPERVISOR')
  );

CREATE POLICY "order_items_select" ON public.order_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_items.order_id
      AND (
        (public.current_user_role() = 'INMATE' AND o.offender_id = public.current_inmate_offender_id())
        OR (
          public.current_user_facility() IS NOT NULL
          AND o.facility_id = public.current_user_facility()
          AND public.current_user_role() IN ('ADMIN', 'WAREHOUSE_PICKER', 'WAREHOUSE_SUPERVISOR')
        )
        OR (public.current_user_role() = 'ADMIN' AND public.current_user_facility() IS NULL)
      )
    )
  );

CREATE POLICY "order_status_history_select" ON public.order_status_history
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_status_history.order_id
      AND (
        (public.current_user_role() = 'INMATE' AND o.offender_id = public.current_inmate_offender_id())
        OR (
          public.current_user_facility() IS NOT NULL
          AND o.facility_id = public.current_user_facility()
          AND public.current_user_role() IN ('ADMIN', 'WAREHOUSE_PICKER', 'WAREHOUSE_SUPERVISOR')
        )
        OR (public.current_user_role() = 'ADMIN' AND public.current_user_facility() IS NULL)
      )
    )
  );

-- 8.7 DEPOSITS POLICIES (TOUCHPAY + EXPLICIT ACCESS AUTHORIZATION)
CREATE POLICY "deposits_select" ON public.deposits
  FOR SELECT TO authenticated
  USING (
    (public.current_user_role() = 'INMATE' AND offender_id = public.current_inmate_offender_id() AND status = 'SUCCEEDED')
    OR (public.current_user_role() = 'FAMILY' AND family_account_id = public.current_family_account_id())
    OR (
      public.current_user_facility() IS NOT NULL
      AND facility_id = public.current_user_facility()
      AND public.current_user_role() = 'ADMIN'
    )
    OR (public.current_user_role() = 'ADMIN' AND public.current_user_facility() IS NULL)
  );

CREATE POLICY "deposits_insert_family" ON public.deposits
  FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_role() = 'FAMILY'
    AND family_account_id = public.current_family_account_id()
    AND public.is_family_authorized_for_offender(family_account_id, offender_id)
    AND status = 'PENDING'
    AND provider = 'TOUCHPAY'
    AND currency = 'USD'
    AND amount > 0.00
    AND total_paid >= amount
  );

-- 8.8 FINANCIAL LEDGER POLICIES
CREATE POLICY "ledger_select" ON public.ledger_entries
  FOR SELECT TO authenticated
  USING (
    (public.current_user_role() = 'INMATE' AND offender_id = public.current_inmate_offender_id())
    OR (
      public.current_user_facility() IS NOT NULL
      AND facility_id = public.current_user_facility()
      AND public.current_user_role() = 'ADMIN'
    )
    OR (public.current_user_role() = 'ADMIN' AND public.current_user_facility() IS NULL)
  );

-- 8.9 GIFT PACKAGES POLICIES (EXPLICIT ACCESS AUTHORIZATION)
CREATE POLICY "gift_packages_select" ON public.gift_packages
  FOR SELECT TO authenticated
  USING (
    (public.current_user_role() = 'INMATE' AND offender_id = public.current_inmate_offender_id())
    OR (public.current_user_role() = 'FAMILY' AND family_account_id = public.current_family_account_id())
    OR (
      public.current_user_facility() IS NOT NULL
      AND facility_id = public.current_user_facility()
      AND public.current_user_role() IN ('ADMIN', 'WAREHOUSE_SUPERVISOR')
    )
    OR (public.current_user_role() = 'ADMIN' AND public.current_user_facility() IS NULL)
  );

CREATE POLICY "gift_packages_insert_family" ON public.gift_packages
  FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_role() = 'FAMILY'
    AND family_account_id = public.current_family_account_id()
    AND public.is_family_authorized_for_offender(family_account_id, offender_id)
    AND status = 'PENDING'
  );

CREATE POLICY "gift_packages_update_staff" ON public.gift_packages
  FOR UPDATE TO authenticated
  USING (
    public.current_user_facility() IS NOT NULL
    AND facility_id = public.current_user_facility()
    AND public.current_user_role() IN ('ADMIN', 'WAREHOUSE_SUPERVISOR')
  )
  WITH CHECK (
    public.current_user_facility() IS NOT NULL
    AND facility_id = public.current_user_facility()
    AND public.current_user_role() IN ('ADMIN', 'WAREHOUSE_SUPERVISOR')
  );

-- 8.10 NOTIFICATIONS POLICIES (RESTRICTED TO READ STATUS UPDATE ONLY)
CREATE POLICY "notifications_select" ON public.notifications
  FOR SELECT TO authenticated
  USING (
    (public.current_user_role() = 'INMATE' AND offender_id = public.current_inmate_offender_id())
    OR (
      user_id = auth.uid()
      AND EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.id = auth.uid() AND up.is_active = true)
    )
  );

CREATE POLICY "notifications_update_read" ON public.notifications
  FOR UPDATE TO authenticated
  USING (
    (public.current_user_role() = 'INMATE' AND offender_id = public.current_inmate_offender_id())
    OR (
      user_id = auth.uid()
      AND EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.id = auth.uid() AND up.is_active = true)
    )
  )
  WITH CHECK (
    (public.current_user_role() = 'INMATE' AND offender_id = public.current_inmate_offender_id())
    OR (
      user_id = auth.uid()
      AND EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.id = auth.uid() AND up.is_active = true)
    )
  );

-- 8.11 MANIFESTS & PICKING LISTS POLICIES
CREATE POLICY "manifests_select_warehouse" ON public.manifests
  FOR SELECT TO authenticated
  USING (
    (
      public.current_user_facility() IS NOT NULL
      AND facility_id = public.current_user_facility()
      AND public.current_user_role() IN ('ADMIN', 'WAREHOUSE_SUPERVISOR', 'WAREHOUSE_PICKER')
    )
    OR (public.current_user_role() = 'ADMIN' AND public.current_user_facility() IS NULL)
  );

CREATE POLICY "manifests_modify_supervisor" ON public.manifests
  FOR ALL TO authenticated
  USING (
    public.current_user_facility() IS NOT NULL
    AND facility_id = public.current_user_facility()
    AND public.current_user_role() IN ('ADMIN', 'WAREHOUSE_SUPERVISOR')
  )
  WITH CHECK (
    public.current_user_facility() IS NOT NULL
    AND facility_id = public.current_user_facility()
    AND public.current_user_role() IN ('ADMIN', 'WAREHOUSE_SUPERVISOR')
  );

CREATE POLICY "picking_lists_all_warehouse" ON public.picking_lists
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = picking_lists.order_id
      AND (
        (public.current_user_facility() IS NOT NULL AND o.facility_id = public.current_user_facility())
        OR (public.current_user_role() = 'ADMIN' AND public.current_user_facility() IS NULL)
      )
      AND public.current_user_role() IN ('ADMIN', 'WAREHOUSE_PICKER', 'WAREHOUSE_SUPERVISOR')
    )
  )
  WITH CHECK (
    public.current_user_role() IN ('ADMIN', 'WAREHOUSE_PICKER', 'WAREHOUSE_SUPERVISOR')
    AND EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = picking_lists.order_id
      AND (
        (public.current_user_facility() IS NOT NULL AND o.facility_id = public.current_user_facility())
        OR (public.current_user_role() = 'ADMIN' AND public.current_user_facility() IS NULL)
      )
    )
  );

-- 8.12 AUDIT LOGS POLICIES
CREATE POLICY "audit_logs_select_admin" ON public.audit_logs
  FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'ADMIN'
    AND (
      public.current_user_facility() IS NULL
      OR (public.current_user_facility() IS NOT NULL AND facility_id = public.current_user_facility())
    )
  );

-- ==============================================================================
-- 9. SECURE DATABASE FUNCTIONS (SECURITY DEFINER)
-- ==============================================================================

-- 9.1 SAFE INMATE PIN VERIFICATION (Defense Against Brute-Force & Hash Exposure)
DROP FUNCTION IF EXISTS public.verify_inmate_pin(TEXT, TEXT);
DROP FUNCTION IF EXISTS public.verify_inmate_pin(TEXT, TEXT, TEXT);
CREATE OR REPLACE FUNCTION public.verify_inmate_pin(
  p_offender_id TEXT,
  p_pin TEXT,
  p_ip_address TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_offender RECORD;
  v_is_valid BOOLEAN := false;
  v_max_attempts CONSTANT INTEGER := 3;
  v_lockout_interval INTERVAL;
BEGIN
  IF p_offender_id IS NULL OR TRIM(p_offender_id) = '' OR p_pin IS NULL OR TRIM(p_pin) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Offender ID and PIN are required.');
  END IF;

  SELECT id, user_id, facility_id, name, pin_hash, failed_pin_attempts, pin_locked_until
  INTO v_offender
  FROM public.offenders
  WHERE UPPER(id) = UPPER(TRIM(p_offender_id))
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid Offender ID or PIN.');
  END IF;

  IF v_offender.user_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = v_offender.user_id AND is_active = false
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Account is deactivated. Contact unit staff.');
    END IF;
  END IF;

  IF v_offender.pin_locked_until IS NOT NULL AND v_offender.pin_locked_until > now() THEN
    INSERT INTO public.audit_logs (
      action, actor_id, actor_role, facility_id, resource_type, resource_id, metadata
    ) VALUES (
      'LOGIN_ATTEMPT_LOCKED_ACCOUNT', p_offender_id, 'INMATE', v_offender.facility_id, 'OFFENDER', p_offender_id,
      jsonb_build_object('locked_until', v_offender.pin_locked_until, 'ip_address', p_ip_address)
    );

    RETURN jsonb_build_object(
      'success', false,
      'error', 'Invalid Offender ID or PIN. Account temporarily locked.',
      'lockedUntil', v_offender.pin_locked_until
    );
  END IF;

  v_is_valid := (crypt(TRIM(p_pin), v_offender.pin_hash) = v_offender.pin_hash);

  IF v_is_valid THEN
    UPDATE public.offenders
    SET failed_pin_attempts = 0,
        pin_locked_until = NULL,
        updated_at = now()
    WHERE id = v_offender.id;

    INSERT INTO public.audit_logs (
      action, actor_id, actor_role, facility_id, resource_type, resource_id, metadata
    ) VALUES (
      'INMATE_LOGIN_SUCCESS', v_offender.id, 'INMATE', v_offender.facility_id, 'OFFENDER', v_offender.id,
      jsonb_build_object('ip_address', p_ip_address)
    );

    RETURN jsonb_build_object(
      'success', true,
      'offenderId', v_offender.id,
      'name', v_offender.name,
      'facilityId', v_offender.facility_id
    );
  ELSE
    IF v_offender.failed_pin_attempts + 1 >= v_max_attempts THEN
      IF v_offender.failed_pin_attempts + 1 = 3 THEN
        v_lockout_interval := INTERVAL '2 minutes';
      ELSIF v_offender.failed_pin_attempts + 1 = 4 THEN
        v_lockout_interval := INTERVAL '5 minutes';
      ELSE
        v_lockout_interval := INTERVAL '15 minutes';
      END IF;

      UPDATE public.offenders
      SET failed_pin_attempts = v_offender.failed_pin_attempts + 1,
          pin_locked_until = now() + v_lockout_interval,
          updated_at = now()
      WHERE id = v_offender.id;

      INSERT INTO public.audit_logs (
        action, actor_id, actor_role, facility_id, resource_type, resource_id, metadata
      ) VALUES (
        'INMATE_ACCOUNT_LOCKED', v_offender.id, 'INMATE', v_offender.facility_id, 'OFFENDER', v_offender.id,
        jsonb_build_object(
          'attempts', v_offender.failed_pin_attempts + 1,
          'locked_until', now() + v_lockout_interval,
          'ip_address', p_ip_address
        )
      );

      RETURN jsonb_build_object(
        'success', false,
        'error', 'Invalid Offender ID or PIN. Account temporarily locked.',
        'lockedUntil', now() + v_lockout_interval
      );
    ELSE
      UPDATE public.offenders
      SET failed_pin_attempts = v_offender.failed_pin_attempts + 1,
          updated_at = now()
      WHERE id = v_offender.id;

      INSERT INTO public.audit_logs (
        action, actor_id, actor_role, facility_id, resource_type, resource_id, metadata
      ) VALUES (
        'INMATE_LOGIN_FAILED', v_offender.id, 'INMATE', v_offender.facility_id, 'OFFENDER', v_offender.id,
        jsonb_build_object(
          'attempts', v_offender.failed_pin_attempts + 1,
          'remaining', v_max_attempts - (v_offender.failed_pin_attempts + 1),
          'ip_address', p_ip_address
        )
      );

      RETURN jsonb_build_object(
        'success', false,
        'error', 'Invalid Offender ID or PIN.',
        'attemptsRemaining', v_max_attempts - (v_offender.failed_pin_attempts + 1)
      );
    END IF;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- 9.2 SAFE INMATE LOOKUP & FAMILY DISCOVERY (ANTI-ENUMERATION & LEAST PRIVILEGE)
-- Masking: Returns only minimal locator fields (id, name, facility_id, facility_name).
-- Sensitive housing and internal cell details are never exposed to unapproved callers.
DROP FUNCTION IF EXISTS public.search_offender_for_family(TEXT, UUID);
DROP FUNCTION IF EXISTS public.search_offender_for_family(TEXT);
CREATE OR REPLACE FUNCTION public.search_offender_for_family(
  search_term TEXT,
  target_facility_id UUID DEFAULT NULL
)
RETURNS TABLE (
  id TEXT,
  name TEXT,
  facility_id UUID,
  facility_name TEXT
) AS $$
DECLARE
  v_cleaned_term TEXT;
BEGIN
  IF public.current_user_role() NOT IN ('FAMILY', 'ADMIN') THEN
    RAISE EXCEPTION 'Access Denied: Inmate lookup is restricted to authorized family accounts.';
  END IF;

  IF search_term IS NULL THEN
    RETURN;
  END IF;

  v_cleaned_term := TRIM(search_term);

  IF LENGTH(v_cleaned_term) < 3 THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    o.id,
    o.name,
    o.facility_id,
    f.name AS facility_name
  FROM public.offenders o
  JOIN public.facilities f ON f.id = o.facility_id
  WHERE
    (target_facility_id IS NULL OR o.facility_id = target_facility_id)
    AND (
      UPPER(o.id) = UPPER(v_cleaned_term)
      OR (target_facility_id IS NOT NULL AND o.name ILIKE ('%' || v_cleaned_term || '%'))
    )
  LIMIT 5;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

-- 9.3 ATOMIC INMATE ORDER SUBMISSION
-- SECURITY NOTE: Does NOT use caller-controlled temporary tables. Cart items are
-- validated and stored in a private in-memory array of public.order_cart_item.
-- Also incorporates concurrency-aware, lazy weekly spend limit reset.
CREATE SEQUENCE IF NOT EXISTS public.order_number_seq START WITH 77001;

DROP FUNCTION IF EXISTS public.place_inmate_order(JSONB);
DROP FUNCTION IF EXISTS public.place_inmate_order(JSONB, TEXT);
CREATE OR REPLACE FUNCTION public.place_inmate_order(
  p_items JSONB,
  p_offender_id TEXT DEFAULT NULL
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
  v_item RECORD;
  v_product RECORD;
  v_item_total NUMERIC(10, 2);
  v_delivery_date TIMESTAMPTZ;
  v_seq_val BIGINT;
  v_retry_count INTEGER := 0;
  v_elem JSONB;
  v_items_buffer public.order_cart_item[] := ARRAY[]::public.order_cart_item[];
  v_days_since_reset INTEGER;
  v_current_period_start TIMESTAMPTZ;
  v_auth_token TEXT;
BEGIN
  -- Dual-Mode Authentication Bridge
  IF auth.role() = 'authenticated' THEN
    IF public.current_user_role() != 'INMATE' THEN
      RAISE EXCEPTION 'UNAUTHORIZED: Only authenticated active inmates may place commissary orders.';
    END IF;
    v_offender_id := public.current_inmate_offender_id();
    IF v_offender_id IS NULL THEN
      RAISE EXCEPTION 'UNAUTHORIZED: Active inmate account not found for current session.';
    END IF;
  ELSIF auth.role() = 'service_role' OR (session_user = 'postgres' AND auth.role() IS NULL) THEN
    IF p_offender_id IS NULL OR TRIM(p_offender_id) = '' THEN
      RAISE EXCEPTION 'Offender ID is required for backend service_role invocation.';
    END IF;
    v_offender_id := UPPER(TRIM(p_offender_id));
  ELSE
    RAISE EXCEPTION 'UNAUTHORIZED: Calling place_inmate_order requires authenticated inmate session or trusted backend service_role.';
  END IF;

  -- 1. Input Structure & Boundary Validation
  IF p_items IS NULL OR jsonb_typeof(p_items) != 'array' THEN
    RAISE EXCEPTION 'Order cart must be a JSON array.';
  END IF;

  IF jsonb_array_length(p_items) < 1 OR jsonb_array_length(p_items) > 50 THEN
    RAISE EXCEPTION 'Order cart must contain between 1 and 50 items.';
  END IF;

  FOR v_elem IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    IF jsonb_typeof(v_elem) != 'object' THEN
      RAISE EXCEPTION 'Each cart item must be a JSON object.';
    END IF;
    IF v_elem->>'productId' IS NULL OR (v_elem->>'productId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      RAISE EXCEPTION 'Each cart item must specify a valid UUID productId.';
    END IF;
    IF v_elem->>'quantity' IS NULL OR (v_elem->>'quantity') !~ '^[1-9][0-9]*$' THEN
      RAISE EXCEPTION 'Item quantity must be a positive integer.';
    END IF;
  END LOOP;

  -- 2. Lock Offender Row
  SELECT * INTO v_offender
  FROM public.offenders
  WHERE id = v_offender_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Offender account not found.';
  END IF;

  IF v_offender.user_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = v_offender.user_id AND is_active = true
    ) THEN
      RAISE EXCEPTION 'ACCOUNT INACTIVE: Inmate account is deactivated.';
    END IF;
  END IF;

  IF v_offender.pin_locked_until IS NOT NULL AND v_offender.pin_locked_until > now() THEN
    RAISE EXCEPTION 'ACCOUNT_LOCKED: Inmate account is temporarily locked.';
  END IF;

  SELECT * INTO v_facility
  FROM public.facilities
  WHERE id = v_offender.facility_id;

  -- 3. Concurrency-Aware Lazy Weekly Spending Reset
  v_days_since_reset := ((EXTRACT(DOW FROM now())::INTEGER - v_facility.weekly_reset_day + 7) % 7);
  v_current_period_start := date_trunc('day', now()) - (v_days_since_reset || ' days')::INTERVAL;

  IF v_offender.last_weekly_reset < v_current_period_start THEN
    v_offender.current_weekly_spent := 0.00;
    v_offender.last_weekly_reset := v_current_period_start;
  END IF;

  -- 4. In-Memory Locked Product Validation & Price Derivation (Deadlock-free ORDER BY product_id ASC)
  FOR v_item IN
    SELECT
      (elem->>'productId')::UUID AS product_id,
      SUM((elem->>'quantity')::INTEGER)::INTEGER AS quantity
    FROM jsonb_array_elements(p_items) AS elem
    GROUP BY (elem->>'productId')::UUID
    ORDER BY (elem->>'productId')::UUID ASC
  LOOP
    IF v_item.quantity <= 0 OR v_item.quantity > 99 THEN
      RAISE EXCEPTION 'Invalid item quantity: must be an integer between 1 and 99.';
    END IF;

    SELECT * INTO v_product
    FROM public.products
    WHERE id = v_item.product_id AND active = true
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Product % is unavailable or inactive.', v_item.product_id;
    END IF;

    IF v_product.facility_id IS NOT NULL AND v_product.facility_id != v_offender.facility_id THEN
      RAISE EXCEPTION 'SECURITY VIOLATION: Product "%" does not belong to your assigned facility.', v_product.name;
    END IF;

    IF v_product.stock < v_item.quantity THEN
      RAISE EXCEPTION 'Insufficient stock for "%". Requested: %, Available: %',
        v_product.name, v_item.quantity, v_product.stock;
    END IF;

    v_item_total := ROUND(v_product.price * v_item.quantity, 2);
    v_subtotal := v_subtotal + v_item_total;

    v_items_buffer := array_append(
      v_items_buffer,
      ROW(v_product.id, v_item.quantity, v_product.name, v_product.price, v_item_total)::public.order_cart_item
    );
  END LOOP;

  IF v_subtotal <= 0.00 THEN
    RAISE EXCEPTION 'Order subtotal must be greater than zero.';
  END IF;

  -- 5. Financial Limits Enforcement
  IF v_subtotal > v_offender.balance THEN
    RAISE EXCEPTION 'Insufficient funds: Order total ($%) exceeds your current balance ($%).',
      v_subtotal, v_offender.balance;
  END IF;

  IF (v_offender.current_weekly_spent + v_subtotal) > v_offender.weekly_limit THEN
    RAISE EXCEPTION 'Weekly spending limit exceeded: Order total ($%) exceeds remaining weekly allowance ($%).',
      v_subtotal, (v_offender.weekly_limit - v_offender.current_weekly_spent);
  END IF;

  v_delivery_date := now() + INTERVAL '3 days';

  -- 6. Deduct Stock using in-memory buffer
  UPDATE public.products p
  SET stock = p.stock - b.quantity,
      updated_at = now()
  FROM unnest(v_items_buffer) b
  WHERE p.id = b.product_id;

  -- 7. Update Offender Balance using Dynamic Transaction Authorization Token
  v_auth_token := encode(digest(v_offender_id || ':' || v_subtotal::text || ':' || gen_random_uuid()::text, 'sha256'), 'hex');
  PERFORM set_config('canteen_internal.active_tx_auth', v_auth_token, true);

  UPDATE public.offenders
  SET balance = balance - v_subtotal,
      current_weekly_spent = v_offender.current_weekly_spent + v_subtotal,
      last_weekly_reset = v_offender.last_weekly_reset,
      updated_at = now()
  WHERE id = v_offender_id;

  -- 8. Atomic Sequence-driven Order Number & Barcode generation
  LOOP
    BEGIN
      v_seq_val := nextval('public.order_number_seq');
      v_order_num := '#CC-' || LPAD(v_seq_val::TEXT, 5, '0');
      v_barcode := 'BC-' || SUBSTRING(v_order_num FROM 2) || '-' || TO_CHAR(now(), 'YYYYMMDD');

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

      EXIT;
    EXCEPTION WHEN unique_violation THEN
      v_retry_count := v_retry_count + 1;
      IF v_retry_count > 5 THEN
        RAISE EXCEPTION 'Concurrency conflict generating order identifier. Please retry.';
      END IF;
    END;
  END LOOP;

  -- 9. Insert Order Items from In-Memory Buffer
  INSERT INTO public.order_items (order_id, product_id, quantity, unit_price, total_price)
  SELECT
    v_order_id,
    b.product_id,
    b.quantity,
    b.locked_price,
    b.item_subtotal
  FROM unnest(v_items_buffer) b;

  INSERT INTO public.order_status_history (
    order_id,
    previous_status,
    new_status,
    changed_by,
    notes
  ) VALUES (
    v_order_id,
    NULL,
    'PROCESSING',
    v_offender_id,
    'Order submitted via inmate commissary kiosk.'
  );

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

  INSERT INTO public.picking_lists (order_id, status)
  VALUES (v_order_id, 'PENDING');

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

-- 9.4 TRUSTED SERVER-SIDE TOUCHPAY DEPOSIT CONFIRMATION
DROP FUNCTION IF EXISTS public.process_confirmed_touchpay_deposit(TEXT, TEXT);
DROP FUNCTION IF EXISTS public.process_confirmed_touchpay_deposit(TEXT, TEXT, NUMERIC, TEXT);
CREATE OR REPLACE FUNCTION public.process_confirmed_touchpay_deposit(
  p_provider_ref TEXT,
  p_idempotency_key TEXT,
  p_verified_amount NUMERIC(10, 2),
  p_currency TEXT DEFAULT 'USD'
)
RETURNS JSONB AS $$
DECLARE
  v_deposit RECORD;
  v_offender RECORD;
  v_max_deposit NUMERIC(10, 2);
  v_auth_token TEXT;
BEGIN
  -- Strict caller gate: only service_role or database direct superuser session
  IF auth.role() IS DISTINCT FROM 'service_role' AND (session_user IS DISTINCT FROM 'postgres' OR auth.role() IS NOT NULL) THEN
    RAISE EXCEPTION 'SECURITY VIOLATION: process_confirmed_touchpay_deposit is restricted to trusted backend service_role.';
  END IF;

  IF p_provider_ref IS NULL OR TRIM(p_provider_ref) = '' THEN
    RAISE EXCEPTION 'Provider reference is required.';
  END IF;

  IF p_idempotency_key IS NULL OR TRIM(p_idempotency_key) = '' THEN
    RAISE EXCEPTION 'Idempotency key is required.';
  END IF;

  IF p_verified_amount IS NULL OR p_verified_amount <= 0.00 THEN
    RAISE EXCEPTION 'Verified deposit amount must be positive.';
  END IF;

  IF p_currency IS DISTINCT FROM 'USD' THEN
    RAISE EXCEPTION 'Unsupported currency (%). Only USD is accepted.', p_currency;
  END IF;

  -- Cross-Idempotency Protection: Verify idempotency key is not bound to a different provider reference
  IF EXISTS (
    SELECT 1 FROM public.deposits
    WHERE idempotency_key = p_idempotency_key AND provider_ref != p_provider_ref
  ) THEN
    RAISE EXCEPTION 'SECURITY VIOLATION: Idempotency key "%" is already bound to a different provider reference.', p_idempotency_key;
  END IF;

  SELECT * INTO v_deposit
  FROM public.deposits
  WHERE provider_ref = p_provider_ref
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Deposit with provider reference "%" not found.', p_provider_ref;
  END IF;

  IF v_deposit.idempotency_key IS DISTINCT FROM p_idempotency_key THEN
    RAISE EXCEPTION 'Idempotency key mismatch for provider reference "%".', p_provider_ref;
  END IF;

  -- Exact Replay Idempotency
  IF v_deposit.status = 'SUCCEEDED' THEN
    RETURN jsonb_build_object(
      'processed', false,
      'alreadyProcessed', true,
      'status', 'SUCCEEDED',
      'message', 'Deposit was already confirmed and credited previously.'
    );
  END IF;

  IF v_deposit.status != 'PENDING' THEN
    RAISE EXCEPTION 'Deposit "%" cannot be processed because current status is "%".',
      p_provider_ref, v_deposit.status;
  END IF;

  -- Amount Mismatch Fraud Detection
  IF v_deposit.amount != p_verified_amount THEN
    UPDATE public.deposits
    SET status = 'FAILED'
    WHERE id = v_deposit.id;

    INSERT INTO public.audit_logs (
      action, actor_id, actor_role, facility_id, resource_type, resource_id, metadata
    ) VALUES (
      'TOUCHPAY_AMOUNT_MISMATCH_FRAUD', 'TOUCHPAY_GATEWAY', 'SYSTEM', v_deposit.facility_id, 'DEPOSIT', p_provider_ref,
      jsonb_build_object(
        'recorded_amount', v_deposit.amount,
        'verified_amount', p_verified_amount,
        'status', 'FAILED',
        'reason', 'Amount mismatch between recorded intent and verified gateway payload'
      )
    );

    RETURN jsonb_build_object(
      'processed', false,
      'alreadyProcessed', false,
      'status', 'FAILED',
      'error', 'AMOUNT_MISMATCH',
      'message', 'Security Alert: Deposit amount mismatch. Deposit marked FAILED and no funds were credited.',
      'recordedAmount', v_deposit.amount,
      'verifiedAmount', p_verified_amount
    );
  END IF;

  -- Facility deposit limit verification
  SELECT max_deposit_amount INTO v_max_deposit
  FROM public.facilities
  WHERE id = v_deposit.facility_id;

  IF v_deposit.amount > v_max_deposit THEN
    UPDATE public.deposits
    SET status = 'FAILED'
    WHERE id = v_deposit.id;

    INSERT INTO public.audit_logs (
      action, actor_id, actor_role, facility_id, resource_type, resource_id, metadata
    ) VALUES (
      'DEPOSIT_EXCEEDS_FACILITY_LIMIT', 'TOUCHPAY_GATEWAY', 'SYSTEM', v_deposit.facility_id, 'DEPOSIT', p_provider_ref,
      jsonb_build_object('amount', v_deposit.amount, 'facility_max', v_max_deposit)
    );

    RETURN jsonb_build_object(
      'processed', false,
      'alreadyProcessed', false,
      'status', 'FAILED',
      'error', 'EXCEEDS_FACILITY_LIMIT',
      'message', format('Deposit amount ($%s) exceeds facility limit ($%s).', v_deposit.amount, v_max_deposit)
    );
  END IF;

  SELECT * INTO v_offender
  FROM public.offenders
  WHERE id = v_deposit.offender_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Associated offender "%" not found.', v_deposit.offender_id;
  END IF;

  -- Dynamic Transaction Token
  v_auth_token := encode(digest(v_deposit.offender_id || ':' || v_deposit.amount::text || ':' || gen_random_uuid()::text, 'sha256'), 'hex');
  PERFORM set_config('canteen_internal.active_tx_auth', v_auth_token, true);

  UPDATE public.offenders
  SET balance = balance + v_deposit.amount,
      updated_at = now()
  WHERE id = v_deposit.offender_id;

  UPDATE public.deposits
  SET status = 'SUCCEEDED',
      completed_at = now()
  WHERE id = v_deposit.id;

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

  INSERT INTO public.audit_logs (
    action,
    actor_id,
    actor_role,
    facility_id,
    resource_type,
    resource_id,
    metadata
  ) VALUES (
    'TOUCHPAY_DEPOSIT_CONFIRMED',
    'TOUCHPAY_GATEWAY',
    'SYSTEM',
    v_deposit.facility_id,
    'DEPOSIT',
    v_deposit.provider_ref,
    jsonb_build_object(
      'amount', v_deposit.amount,
      'currency', p_currency,
      'idempotency_key', p_idempotency_key,
      'new_balance', v_offender.balance + v_deposit.amount
    )
  );

  RETURN jsonb_build_object(
    'processed', true,
    'alreadyProcessed', false,
    'status', 'SUCCEEDED',
    'newBalance', v_offender.balance + v_deposit.amount,
    'message', 'Trust funds successfully credited to inmate account.'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- ==============================================================================
-- 10. EXPLICIT PERMISSION GRANTS AND REVOCATIONS (LEAST PRIVILEGE AUDIT)
-- ==============================================================================

-- 10.1 FUNCTION PRIVILEGES & EXPLICIT OWNERSHIP
-- Ensure all functions execute under superuser postgres ownership for SECURITY DEFINER integrity
DO $$
DECLARE
  v_func_sig TEXT;
  v_app_funcs TEXT[] := ARRAY[
    'check_order_facility_consistency()',
    'check_deposit_facility_consistency()',
    'check_picking_list_order_facility()',
    'current_profile()',
    'current_user_role()',
    'current_user_facility()',
    'current_inmate_offender_id()',
    'current_family_account_id()',
    'is_family_authorized_for_offender(uuid, text)',
    'prevent_unauthorized_role_change()',
    'check_family_link_status_guard()',
    'prevent_direct_balance_tampering()',
    'check_notification_update_integrity()',
    'prevent_audit_tampering()',
    'verify_inmate_pin(text, text, text)',
    'search_offender_for_family(text, uuid)',
    'place_inmate_order(jsonb, text)',
    'process_confirmed_touchpay_deposit(text, text, numeric, text)'
  ];
BEGIN
  FOREACH v_func_sig IN ARRAY v_app_funcs LOOP
    BEGIN
      EXECUTE format('ALTER FUNCTION public.%s OWNER TO postgres;', v_func_sig);
      EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon, authenticated;', v_func_sig);
    EXCEPTION WHEN undefined_function THEN
      NULL;
    END;
  END LOOP;
END $$;

-- 10.2 GRANT MINIMUM EXECUTION RIGHTS ON SPECIFIC APPLICATION FUNCTIONS
GRANT EXECUTE ON FUNCTION public.current_profile() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_facility() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_inmate_offender_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_family_account_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_family_authorized_for_offender(UUID, TEXT) TO authenticated;

GRANT EXECUTE ON FUNCTION public.verify_inmate_pin(TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_offender_for_family(TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.place_inmate_order(JSONB, TEXT) TO authenticated, service_role;

-- Revoke direct sequence usage from authenticated clients (managed internally via SECURITY DEFINER)
REVOKE ALL ON SEQUENCE public.order_number_seq FROM PUBLIC, anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.order_number_seq TO service_role;

GRANT EXECUTE ON FUNCTION public.process_confirmed_touchpay_deposit(TEXT, TEXT, NUMERIC, TEXT) TO service_role;
REVOKE EXECUTE ON FUNCTION public.process_confirmed_touchpay_deposit(TEXT, TEXT, NUMERIC, TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.process_confirmed_touchpay_deposit(TEXT, TEXT, NUMERIC, TEXT) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.process_confirmed_touchpay_deposit(TEXT, TEXT, NUMERIC, TEXT) FROM PUBLIC;

-- 10.3 EXPLICIT TABLE-LEVEL PRIVILEGE MATRIX ACROSS ALL 16 TABLES
REVOKE ALL ON TABLE public.facilities FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.user_profiles FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.offenders FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.family_accounts FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.family_offender_links FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.products FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.manifests FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.orders FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.order_items FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.order_status_history FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.deposits FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.ledger_entries FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.gift_packages FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.notifications FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.picking_lists FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.audit_logs FROM PUBLIC, anon, authenticated;

-- Trusted service_role access
GRANT ALL ON TABLE public.facilities TO service_role;
GRANT ALL ON TABLE public.user_profiles TO service_role;
GRANT ALL ON TABLE public.offenders TO service_role;
GRANT ALL ON TABLE public.family_accounts TO service_role;
GRANT ALL ON TABLE public.family_offender_links TO service_role;
GRANT ALL ON TABLE public.products TO service_role;
GRANT ALL ON TABLE public.manifests TO service_role;
GRANT ALL ON TABLE public.orders TO service_role;
GRANT ALL ON TABLE public.order_items TO service_role;
GRANT ALL ON TABLE public.order_status_history TO service_role;
GRANT ALL ON TABLE public.deposits TO service_role;
GRANT ALL ON TABLE public.ledger_entries TO service_role;
GRANT ALL ON TABLE public.gift_packages TO service_role;
GRANT ALL ON TABLE public.notifications TO service_role;
GRANT ALL ON TABLE public.picking_lists TO service_role;
GRANT ALL ON TABLE public.audit_logs TO service_role;

-- Authenticated least-privilege grants governed by RLS
GRANT SELECT, UPDATE ON TABLE public.facilities TO authenticated;
GRANT SELECT, INSERT ON TABLE public.user_profiles TO authenticated;
GRANT UPDATE (name, email) ON public.user_profiles TO authenticated;

GRANT SELECT ON TABLE public.offenders TO authenticated;
GRANT UPDATE (unit, housing, weekly_limit) ON public.offenders TO authenticated;
REVOKE SELECT (pin_hash) ON public.offenders FROM authenticated;
REVOKE UPDATE (pin_hash, balance, current_weekly_spent) ON public.offenders FROM authenticated;

GRANT SELECT, INSERT, UPDATE ON TABLE public.family_accounts TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.family_offender_links TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.products TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.manifests TO authenticated;

GRANT SELECT ON TABLE public.orders TO authenticated;
GRANT UPDATE (status, tracking_barcode) ON public.orders TO authenticated;

GRANT SELECT ON TABLE public.order_items TO authenticated;
GRANT SELECT ON TABLE public.order_status_history TO authenticated;

GRANT SELECT, INSERT ON TABLE public.deposits TO authenticated;
REVOKE UPDATE ON public.deposits FROM authenticated;

GRANT SELECT ON TABLE public.ledger_entries TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.gift_packages TO authenticated;

GRANT SELECT ON TABLE public.notifications TO authenticated;
GRANT UPDATE (read) ON public.notifications TO authenticated;

GRANT SELECT, UPDATE ON TABLE public.picking_lists TO authenticated;
GRANT SELECT ON TABLE public.audit_logs TO authenticated;
