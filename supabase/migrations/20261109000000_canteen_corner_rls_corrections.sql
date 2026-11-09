-- ==============================================================================
-- CANTEEN CORNER — CORRECTIVE RLS MIGRATION
-- Migration: 20261109000000_canteen_corner_rls_corrections.sql
-- Description: Minimal corrective migration addressing RLS policy facility
--              boundaries and table privileges identified in post-migration audit.
-- Safe to apply once to an already-migrated Supabase production database.
-- ZERO destructive operations. NO DROPS OF TABLES, SCHEMAS, OR DATA.
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. CORRECTION: family_offender_links UPDATE POLICY (family_links_staff_update)
-- Enforces facility isolation in both USING and WITH CHECK clauses:
--   - Global ADMIN (facility_id IS NULL) can update links across any facility.
--   - Institutional staff (facility-scoped ADMIN or WAREHOUSE_SUPERVISOR) can
--     only update links for offenders housed at their assigned facility.
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "family_links_staff_update" ON public.family_offender_links;
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
    AND (
      (public.current_user_role() = 'ADMIN' AND public.current_user_facility() IS NULL)
      OR EXISTS (
        SELECT 1 FROM public.offenders o
        WHERE o.id = family_offender_links.offender_id
          AND o.facility_id = public.current_user_facility()
      )
    )
  );

-- ------------------------------------------------------------------------------
-- 2. CORRECTION: family_offender_links DELETE POLICY (family_links_admin_delete)
-- Enforces facility isolation on relationship deletions:
--   - Global ADMIN (facility_id IS NULL) can delete links across any facility.
--   - Facility-scoped ADMIN can only delete links for offenders at their facility.
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "family_links_admin_delete" ON public.family_offender_links;
CREATE POLICY "family_links_admin_delete" ON public.family_offender_links
  FOR DELETE TO authenticated
  USING (
    public.current_user_role() = 'ADMIN'
    AND (
      public.current_user_facility() IS NULL
      OR EXISTS (
        SELECT 1 FROM public.offenders o
        WHERE o.id = family_offender_links.offender_id
          AND o.facility_id = public.current_user_facility()
      )
    )
  );

-- ------------------------------------------------------------------------------
-- 3. CORRECTION: TABLE-LEVEL PRIVILEGES FOR family_offender_links
-- Aligns PostgreSQL table privileges with the family_links_admin_delete policy.
-- Grants DELETE to authenticated role (governed strictly by RLS above).
-- ------------------------------------------------------------------------------
GRANT DELETE ON TABLE public.family_offender_links TO authenticated;

-- ------------------------------------------------------------------------------
-- 4. CORRECTION: deposits INSERT POLICY (deposits_insert_family)
-- Enforces that:
--   - The deposit facility_id matches the associated offender's actual facility_id.
--   - completed_at is NULL upon intent creation (cannot forge completion timestamp).
--   - Preserves existing PENDING status, TOUCHPAY provider, USD currency, and
--     explicit relationship authorization checks.
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "deposits_insert_family" ON public.deposits;
CREATE POLICY "deposits_insert_family" ON public.deposits
  FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_role() = 'FAMILY'
    AND family_account_id = public.current_family_account_id()
    AND public.is_family_authorized_for_offender(family_account_id, offender_id)
    AND EXISTS (
      SELECT 1 FROM public.offenders o
      WHERE o.id = deposits.offender_id
        AND o.facility_id = deposits.facility_id
    )
    AND status = 'PENDING'
    AND provider = 'TOUCHPAY'
    AND currency = 'USD'
    AND amount > 0.00
    AND total_paid >= amount
    AND completed_at IS NULL
  );

COMMIT;

