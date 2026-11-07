-- ==============================================================================
-- CANTEEN CORNER — SECURE DATABASE ARCHITECTURE & ROW LEVEL SECURITY (RLS)
-- Multi-Tenant Correctional Facility Commissary Platform
-- Production Hardened Security Remediation Version
-- ==============================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. ENUM TYPES (Idempotent creation)
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
-- 3. CORE TABLES & CONSTRAINTS
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
-- Prevents unauthorized family members from depositing funds or sending packages to unlinked inmates
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

-- 3.12 Double-Entry Financial Ledger (Immutable append-only balance audit trail)
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

-- ==============================================================================
-- 6. SECURITY & AUTHENTICATION HELPER FUNCTIONS
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

-- Helper: Verify if family account is explicitly authorized to access an offender
CREATE OR REPLACE FUNCTION public.is_family_authorized_for_offender(
  p_family_account_id UUID,
  p_offender_id TEXT
)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.family_offender_links
    WHERE family_account_id = p_family_account_id
      AND offender_id = p_offender_id
      AND status = 'APPROVED'
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

-- ==============================================================================
-- 7. IMMUTABLE ROLE INTEGRITY & PRIVILEGE ELEVATION PROTECTION
-- ==============================================================================

-- Trigger: Prevent users from assigning or modifying their own roles or facilities
CREATE OR REPLACE FUNCTION public.prevent_unauthorized_role_change()
RETURNS TRIGGER AS $$
BEGIN
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

-- Trigger: Enforce that users can ONLY update the 'read' status on notifications
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

-- Trigger: Append-only enforcement on audit logs and ledger entries (NO UPDATE OR DELETE)
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
-- 8. ROW LEVEL SECURITY (RLS) POLICIES ON EVERY TABLE
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

-- ------------------------------------------------------------------------------
-- 8.1 FACILITIES POLICIES
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "facilities_select_authenticated" ON public.facilities;
CREATE POLICY "facilities_select_authenticated" ON public.facilities
  FOR SELECT TO authenticated
  USING (
    id = public.current_user_facility()
    OR (public.current_user_role() = 'ADMIN' AND public.current_user_facility() IS NULL)
    OR public.current_user_role() = 'FAMILY'
  );

DROP POLICY IF EXISTS "facilities_update_admin" ON public.facilities;
CREATE POLICY "facilities_update_admin" ON public.facilities
  FOR UPDATE TO authenticated
  USING (id = public.current_user_facility() AND public.current_user_role() = 'ADMIN')
  WITH CHECK (id = public.current_user_facility() AND public.current_user_role() = 'ADMIN');

-- ------------------------------------------------------------------------------
-- 8.2 USER PROFILES POLICIES
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "profiles_select_self_or_facility" ON public.user_profiles;
CREATE POLICY "profiles_select_self_or_facility" ON public.user_profiles
  FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR (
      facility_id = public.current_user_facility()
      AND public.current_user_role() IN ('ADMIN', 'WAREHOUSE_SUPERVISOR')
    )
  );

DROP POLICY IF EXISTS "profiles_update_self" ON public.user_profiles;
CREATE POLICY "profiles_update_self" ON public.user_profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- ------------------------------------------------------------------------------
-- 8.3 OFFENDERS POLICIES
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "offenders_select" ON public.offenders;
CREATE POLICY "offenders_select" ON public.offenders
  FOR SELECT TO authenticated
  USING (
    (public.current_user_role() = 'INMATE' AND id = public.current_inmate_offender_id())
    OR (
      facility_id = public.current_user_facility()
      AND public.current_user_role() IN ('ADMIN', 'WAREHOUSE_PICKER', 'WAREHOUSE_SUPERVISOR')
    )
  );

DROP POLICY IF EXISTS "offenders_update_admin" ON public.offenders;
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
-- 8.4 FAMILY ACCOUNTS & AUTHORIZATION LINKS POLICIES
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "family_accounts_select" ON public.family_accounts;
CREATE POLICY "family_accounts_select" ON public.family_accounts
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR (public.current_user_role() = 'ADMIN')
  );

DROP POLICY IF EXISTS "family_accounts_insert" ON public.family_accounts;
CREATE POLICY "family_accounts_insert" ON public.family_accounts
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "family_accounts_update" ON public.family_accounts;
CREATE POLICY "family_accounts_update" ON public.family_accounts
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Family-Offender Authorization Links
DROP POLICY IF EXISTS "family_links_select" ON public.family_offender_links;
CREATE POLICY "family_links_select" ON public.family_offender_links
  FOR SELECT TO authenticated
  USING (
    family_account_id = public.current_family_account_id()
    OR (public.current_user_role() = 'ADMIN')
  );

DROP POLICY IF EXISTS "family_links_admin_manage" ON public.family_offender_links;
CREATE POLICY "family_links_admin_manage" ON public.family_offender_links
  FOR ALL TO authenticated
  USING (public.current_user_role() = 'ADMIN')
  WITH CHECK (public.current_user_role() = 'ADMIN');

-- ------------------------------------------------------------------------------
-- 8.5 PRODUCTS POLICIES (STRICT FACILITY ISOLATION)
-- ------------------------------------------------------------------------------
-- Prevents cross-facility information leakage to family members or inmates:
-- Family members can ONLY view products belonging to a facility where they have an approved inmate link
DROP POLICY IF EXISTS "products_select_active" ON public.products;
CREATE POLICY "products_select_active" ON public.products
  FOR SELECT TO authenticated
  USING (
    active = true
    AND (
      facility_id IS NULL
      OR facility_id = public.current_user_facility()
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

DROP POLICY IF EXISTS "products_modify_staff" ON public.products;
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
-- 8.6 ORDERS & ORDER ITEMS POLICIES
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "orders_select" ON public.orders;
CREATE POLICY "orders_select" ON public.orders
  FOR SELECT TO authenticated
  USING (
    (public.current_user_role() = 'INMATE' AND offender_id = public.current_inmate_offender_id())
    OR (
      facility_id = public.current_user_facility()
      AND public.current_user_role() IN ('ADMIN', 'WAREHOUSE_PICKER', 'WAREHOUSE_SUPERVISOR')
    )
  );

DROP POLICY IF EXISTS "orders_update_warehouse" ON public.orders;
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

DROP POLICY IF EXISTS "order_items_select" ON public.order_items;
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

DROP POLICY IF EXISTS "order_status_history_select" ON public.order_status_history;
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
-- 8.7 DEPOSITS POLICIES (TOUCHPAY + EXPLICIT ACCESS AUTHORIZATION)
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "deposits_select" ON public.deposits;
CREATE POLICY "deposits_select" ON public.deposits
  FOR SELECT TO authenticated
  USING (
    (public.current_user_role() = 'INMATE' AND offender_id = public.current_inmate_offender_id() AND status = 'SUCCEEDED')
    OR (public.current_user_role() = 'FAMILY' AND family_account_id = public.current_family_account_id())
    OR (public.current_user_role() = 'ADMIN' AND facility_id = public.current_user_facility())
  );

-- Family can initiate a deposit ONLY for an inmate they are explicitly authorized to access
DROP POLICY IF EXISTS "deposits_insert_family" ON public.deposits;
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

-- ------------------------------------------------------------------------------
-- 8.8 FINANCIAL LEDGER POLICIES
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "ledger_select" ON public.ledger_entries;
CREATE POLICY "ledger_select" ON public.ledger_entries
  FOR SELECT TO authenticated
  USING (
    (public.current_user_role() = 'INMATE' AND offender_id = public.current_inmate_offender_id())
    OR (public.current_user_role() = 'ADMIN' AND facility_id = public.current_user_facility())
  );

-- ------------------------------------------------------------------------------
-- 8.9 GIFT PACKAGES POLICIES (EXPLICIT ACCESS AUTHORIZATION)
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "gift_packages_select" ON public.gift_packages;
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

DROP POLICY IF EXISTS "gift_packages_insert_family" ON public.gift_packages;
CREATE POLICY "gift_packages_insert_family" ON public.gift_packages
  FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_role() = 'FAMILY'
    AND family_account_id = public.current_family_account_id()
    AND public.is_family_authorized_for_offender(family_account_id, offender_id)
    AND status = 'PENDING'
  );

DROP POLICY IF EXISTS "gift_packages_update_staff" ON public.gift_packages;
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
-- 8.10 NOTIFICATIONS POLICIES (RESTRICTED TO READ STATUS UPDATE ONLY)
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "notifications_select" ON public.notifications;
CREATE POLICY "notifications_select" ON public.notifications
  FOR SELECT TO authenticated
  USING (
    (public.current_user_role() = 'INMATE' AND offender_id = public.current_inmate_offender_id())
    OR user_id = auth.uid()
  );

DROP POLICY IF EXISTS "notifications_update_read" ON public.notifications;
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
-- 8.11 MANIFESTS & PICKING LISTS POLICIES
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "manifests_all_warehouse" ON public.manifests;
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

DROP POLICY IF EXISTS "picking_lists_all_warehouse" ON public.picking_lists;
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
-- 8.12 AUDIT LOGS POLICIES
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "audit_logs_select_admin" ON public.audit_logs;
CREATE POLICY "audit_logs_select_admin" ON public.audit_logs
  FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'ADMIN'
    AND (facility_id IS NULL OR facility_id = public.current_user_facility())
  );

-- ==============================================================================
-- 9. SECURE DATABASE FUNCTIONS (SECURITY DEFINER)
-- ==============================================================================

-- 9.1 SAFE INMATE PIN VERIFICATION (Defense Against Brute-Force & Hash Exposure)
CREATE OR REPLACE FUNCTION public.verify_inmate_pin(
  p_offender_id TEXT,
  p_pin TEXT
)
RETURNS JSONB AS $$
DECLARE
  v_offender RECORD;
  v_is_valid BOOLEAN := false;
  v_max_attempts CONSTANT INTEGER := 3;
  v_lockout_interval CONSTANT INTERVAL := INTERVAL '15 minutes';
BEGIN
  IF p_offender_id IS NULL OR TRIM(p_offender_id) = '' OR p_pin IS NULL OR TRIM(p_pin) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Offender ID and PIN are required.');
  END IF;

  SELECT id, facility_id, name, pin_hash, failed_pin_attempts, pin_locked_until
  INTO v_offender
  FROM public.offenders
  WHERE UPPER(id) = UPPER(TRIM(p_offender_id))
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid Offender ID or PIN.');
  END IF;

  IF v_offender.pin_locked_until IS NOT NULL AND v_offender.pin_locked_until > now() THEN
    INSERT INTO public.audit_logs (
      action, actor_id, actor_role, facility_id, resource_type, resource_id, metadata
    ) VALUES (
      'LOGIN_ATTEMPT_LOCKED_ACCOUNT', p_offender_id, 'INMATE', v_offender.facility_id, 'OFFENDER', p_offender_id,
      jsonb_build_object('locked_until', v_offender.pin_locked_until)
    );

    RETURN jsonb_build_object(
      'success', false,
      'error', 'Account is locked due to multiple failed attempts. Please try again later or contact unit staff.',
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
      action, actor_id, actor_role, facility_id, resource_type, resource_id
    ) VALUES (
      'INMATE_LOGIN_SUCCESS', v_offender.id, 'INMATE', v_offender.facility_id, 'OFFENDER', v_offender.id
    );

    RETURN jsonb_build_object(
      'success', true,
      'offenderId', v_offender.id,
      'name', v_offender.name,
      'facilityId', v_offender.facility_id
    );
  ELSE
    IF v_offender.failed_pin_attempts + 1 >= v_max_attempts THEN
      UPDATE public.offenders
      SET failed_pin_attempts = v_offender.failed_pin_attempts + 1,
          pin_locked_until = now() + v_lockout_interval,
          updated_at = now()
      WHERE id = v_offender.id;

      INSERT INTO public.audit_logs (
        action, actor_id, actor_role, facility_id, resource_type, resource_id, metadata
      ) VALUES (
        'INMATE_ACCOUNT_LOCKED', v_offender.id, 'INMATE', v_offender.facility_id, 'OFFENDER', v_offender.id,
        jsonb_build_object('attempts', v_offender.failed_pin_attempts + 1, 'locked_until', now() + v_lockout_interval)
      );

      RETURN jsonb_build_object(
        'success', false,
        'error', 'Account locked after 3 failed PIN attempts. Contact unit staff.',
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
        jsonb_build_object('attempts', v_offender.failed_pin_attempts + 1, 'remaining', v_max_attempts - (v_offender.failed_pin_attempts + 1))
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

-- 9.2 SAFE OFFENDER LOOKUP FOR FAMILY PORTAL
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

  IF search_term IS NULL OR LENGTH(TRIM(search_term)) < 2 THEN
    RAISE EXCEPTION 'Search term must be at least 2 characters.';
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

-- 9.3 ATOMIC INMATE ORDER SUBMISSION WITH PRODUCT & FACILITY ISOLATION
CREATE SEQUENCE IF NOT EXISTS public.order_number_seq START WITH 77001;

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
  v_item RECORD;
  v_product RECORD;
  v_item_total NUMERIC(10, 2);
  v_delivery_date TIMESTAMPTZ;
  v_seq_val BIGINT;
  v_retry_count INTEGER := 0;
BEGIN
  v_offender_id := public.current_inmate_offender_id();
  IF v_offender_id IS NULL OR public.current_user_role() != 'INMATE' THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Only authenticated inmates may place commissary orders.';
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Order cart cannot be empty.';
  END IF;

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

  -- Deadlock-safe product sorting, aggregation, and locking (prevents duplicate productId stock bypass)
  FOR v_item IN
    SELECT
      (elem->>'productId')::UUID AS product_id,
      SUM((elem->>'quantity')::INTEGER)::INTEGER AS quantity
    FROM jsonb_array_elements(p_items) AS elem
    GROUP BY (elem->>'productId')::UUID
    ORDER BY (elem->>'productId')::UUID ASC
  LOOP
    IF v_item.quantity <= 0 THEN
      RAISE EXCEPTION 'Invalid item quantity: must be positive integer.';
    END IF;

    SELECT * INTO v_product
    FROM public.products
    WHERE id = v_item.product_id AND active = true
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Product % is unavailable or inactive.', v_item.product_id;
    END IF;

    -- Mandatory Facility Isolation
    IF v_product.facility_id IS NOT NULL AND v_product.facility_id != v_offender.facility_id THEN
      RAISE EXCEPTION 'SECURITY VIOLATION: Product "%" does not belong to your assigned facility.', v_product.name;
    END IF;

    IF v_product.stock < v_item.quantity THEN
      RAISE EXCEPTION 'Insufficient stock for "%". Requested: %, Available: %',
        v_product.name, v_item.quantity, v_product.stock;
    END IF;

    v_item_total := ROUND(v_product.price * v_item.quantity, 2);
    v_subtotal := v_subtotal + v_item_total;
  END LOOP;

  IF v_subtotal > v_offender.balance THEN
    RAISE EXCEPTION 'Insufficient funds: Order total ($%) exceeds your current balance ($%).',
      v_subtotal, v_offender.balance;
  END IF;

  IF (v_offender.current_weekly_spent + v_subtotal) > v_offender.weekly_limit THEN
    RAISE EXCEPTION 'Weekly spending limit exceeded: Order total ($%) exceeds remaining weekly allowance ($%).',
      v_subtotal, (v_offender.weekly_limit - v_offender.current_weekly_spent);
  END IF;

  v_delivery_date := now() + INTERVAL '3 days';

  PERFORM set_config('canteen.authorized_transaction', 'true', true);

  FOR v_item IN
    SELECT
      (elem->>'productId')::UUID AS product_id,
      SUM((elem->>'quantity')::INTEGER)::INTEGER AS quantity
    FROM jsonb_array_elements(p_items) AS elem
    GROUP BY (elem->>'productId')::UUID
    ORDER BY (elem->>'productId')::UUID ASC
  LOOP
    UPDATE public.products
    SET stock = stock - v_item.quantity,
        updated_at = now()
    WHERE id = v_item.product_id;
  END LOOP;

  UPDATE public.offenders
  SET balance = balance - v_subtotal,
      current_weekly_spent = current_weekly_spent + v_subtotal,
      updated_at = now()
  WHERE id = v_offender_id;

  -- Atomic Sequence-driven Order Number & Barcode generation with concurrency retry protection
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

      EXIT; -- Succeeded
    EXCEPTION WHEN unique_violation THEN
      v_retry_count := v_retry_count + 1;
      IF v_retry_count > 5 THEN
        RAISE EXCEPTION 'Concurrency conflict generating order identifier. Please retry.';
      END IF;
    END;
  END LOOP;

  FOR v_item IN
    SELECT
      (elem->>'productId')::UUID AS product_id,
      SUM((elem->>'quantity')::INTEGER)::INTEGER AS quantity
    FROM jsonb_array_elements(p_items) AS elem
    GROUP BY (elem->>'productId')::UUID
    ORDER BY (elem->>'productId')::UUID ASC
  LOOP
    SELECT price INTO v_item_total
    FROM public.products
    WHERE id = v_item.product_id;

    INSERT INTO public.order_items (
      order_id,
      product_id,
      quantity,
      unit_price,
      total_price
    ) VALUES (
      v_order_id,
      v_item.product_id,
      v_item.quantity,
      v_item_total,
      ROUND(v_item_total * v_item.quantity, 2)
    );
  END LOOP;

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
BEGIN
  -- Strict caller gate: only service_role or database superuser
  IF auth.role() IS DISTINCT FROM 'service_role' AND current_user IS DISTINCT FROM 'postgres' THEN
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

  IF v_deposit.amount != p_verified_amount THEN
    UPDATE public.deposits
    SET status = 'FAILED',
        updated_at = now()
    WHERE id = v_deposit.id;

    INSERT INTO public.audit_logs (
      action, actor_id, actor_role, facility_id, resource_type, resource_id, metadata
    ) VALUES (
      'TOUCHPAY_AMOUNT_MISMATCH_FRAUD', 'TOUCHPAY_GATEWAY', 'SYSTEM', v_deposit.facility_id, 'DEPOSIT', p_provider_ref,
      jsonb_build_object(
        'recorded_amount', v_deposit.amount,
        'verified_amount', p_verified_amount
      )
    );

    RAISE EXCEPTION 'Deposit amount mismatch: recorded $%, gateway verified $%. Deposit marked FAILED.',
      v_deposit.amount, p_verified_amount;
  END IF;

  SELECT * INTO v_offender
  FROM public.offenders
  WHERE id = v_deposit.offender_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Associated offender "%" not found.', v_deposit.offender_id;
  END IF;

  PERFORM set_config('canteen.authorized_transaction', 'true', true);

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
-- 10. EXPLICIT PERMISSION GRANTS AND REVOCATIONS (LEAST PRIVILEGE)
-- ==============================================================================

-- 10.1 REVOKE ALL DEFAULT PERMISSIONS ON PUBLIC SCHEMA FUNCTIONS
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM authenticated;

-- 10.2 GRANT MINIMUM EXECUTION RIGHTS ON SPECIFIC FUNCTIONS
GRANT EXECUTE ON FUNCTION public.current_profile() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_facility() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_inmate_offender_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_family_account_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_family_authorized_for_offender(UUID, TEXT) TO authenticated;

GRANT EXECUTE ON FUNCTION public.verify_inmate_pin(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_offender_for_family(TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.place_inmate_order(JSONB) TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.order_number_seq TO authenticated;

-- PRIVILEGED FUNCTION: Restricted exclusively to service_role
GRANT EXECUTE ON FUNCTION public.process_confirmed_touchpay_deposit(TEXT, TEXT, NUMERIC, TEXT) TO service_role;
REVOKE EXECUTE ON FUNCTION public.process_confirmed_touchpay_deposit(TEXT, TEXT, NUMERIC, TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.process_confirmed_touchpay_deposit(TEXT, TEXT, NUMERIC, TEXT) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.process_confirmed_touchpay_deposit(TEXT, TEXT, NUMERIC, TEXT) FROM PUBLIC;

-- 10.3 TABLE-LEVEL PRIVILEGE RESTRICTIONS
REVOKE ALL ON TABLE public.audit_logs FROM anon, authenticated;
GRANT SELECT ON TABLE public.audit_logs TO authenticated;

REVOKE ALL ON TABLE public.ledger_entries FROM anon, authenticated;
GRANT SELECT ON TABLE public.ledger_entries TO authenticated;

REVOKE ALL ON TABLE public.order_status_history FROM anon, authenticated;
GRANT SELECT ON TABLE public.order_status_history TO authenticated;

REVOKE UPDATE, DELETE ON public.notifications FROM anon;
REVOKE UPDATE, DELETE ON public.notifications FROM authenticated;
-- Allow authenticated users to update ONLY the 'read' status column
GRANT UPDATE (read) ON public.notifications TO authenticated;

-- 10.4 CRITICAL COLUMN-LEVEL REVOCATIONS
REVOKE SELECT (pin_hash) ON public.offenders FROM anon, authenticated;
REVOKE UPDATE (pin_hash) ON public.offenders FROM anon, authenticated;
REVOKE UPDATE (balance, current_weekly_spent) ON public.offenders FROM anon, authenticated;
REVOKE UPDATE (role, facility_id) ON public.user_profiles FROM anon, authenticated;
REVOKE UPDATE (status, completed_at, amount, total_paid) ON public.deposits FROM anon, authenticated;
