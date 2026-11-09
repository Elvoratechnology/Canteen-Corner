-- ==============================================================================
-- CANTEEN CORNER — POSTGRESQL ROW LEVEL SECURITY (RLS) & ACCESS CONTROL TEST SUITE
-- ==============================================================================
-- This script tests true database-level RLS policies, column privileges,
-- security triggers, and RPC caller gating using PostgreSQL role switching.
--
-- TARGET ENVIRONMENT:
-- - Run in a LOCAL SUPABASE TEST ENVIRONMENT or a DEDICATED ISOLATED STAGING PROJECT.
-- - DO NOT run against a production database:
--   1. Sequence calls (nextval) inside place_inmate_order (Test 12) are non-transactional
--      in PostgreSQL and will NOT be rolled back.
--   2. Strict safety guards will halt execution if test IDs collide with non-fixture data.
--
-- LIMITATION OF SQL TESTING:
-- - SQL testing verifies PostgreSQL grants, RLS, triggers, and RPC caller gates.
-- - SQL testing CANNOT verify application-layer security:
--   1. Next.js HttpOnly cookie cryptographic signing and HMAC verification.
--   2. Sliding-window IP rate limiting in Next.js middleware / route handlers.
--   3. TouchPay webhook HMAC-SHA256 signature verification in Node.js crypto.
--   These application controls are tested in the Vitest suite (tests/phase1-5).
--
-- EXECUTION:
-- Run this entire script in Supabase SQL Editor as superuser / postgres.
-- It executes within a single transaction block and issues ROLLBACK at the end.
-- ==============================================================================

BEGIN;

-- 0. TEMPORARY RESULT ACCUMULATOR
-- Explicitly grant permissions to anon and authenticated roles so that test
-- blocks running under low-privilege roles do not abort when recording results.
CREATE TEMPORARY TABLE test_results (
  test_num INTEGER,
  test_name TEXT,
  passed BOOLEAN,
  details TEXT
);
GRANT ALL ON TABLE test_results TO anon, authenticated, service_role, PUBLIC;

-- 1. SETUP TEST FIXTURES & SAFE PRE-CLEANUP
DO $$
DECLARE
  v_fac1_id UUID := '11111111-1111-1111-1111-111111111111';
  v_fac2_id UUID := '22222222-2222-2222-2222-222222222222';
  v_inmate_a_uid UUID := 'aaaa1111-aaaa-1111-aaaa-111111111111';
  v_inmate_b_uid UUID := 'bbbb2222-bbbb-2222-bbbb-222222222222';
  v_family_1_uid UUID := 'cccc3333-cccc-3333-cccc-333333333333';
  v_family_2_uid UUID := 'dddd4444-dddd-4444-dddd-444444444444';
  v_staff_fac1_uid UUID := 'eeee5555-eeee-5555-eeee-555555555555';
  v_staff_fac2_uid UUID := 'ffff6666-ffff-6666-ffff-666666666666';
  v_fam_acc1_id UUID := '77777777-7777-7777-7777-777777777771';
  v_fam_acc2_id UUID := '77777777-7777-7777-7777-777777777772';
  v_prod1_id UUID := '88888888-8888-8888-8888-888888888881';
  v_prod2_id UUID := '88888888-8888-8888-8888-888888888882';
  v_order1_id UUID := '99999999-9999-9999-9999-999999999991';
  v_order2_id UUID := '99999999-9999-9999-9999-999999999992';
  v_pick1_id UUID := 'bbbb1111-bbbb-1111-bbbb-111111111111';
  v_pick2_id UUID := 'bbbb2222-bbbb-2222-bbbb-222222222222';
  v_dep1_id UUID := 'aaaaaaaa-1111-1111-1111-aaaaaaaaaaaa';
  v_notif_id UUID := 'aaaaaaaa-2222-2222-2222-aaaaaaaaaaaa';
  v_audit_id UUID := 'aaaaaaaa-3333-3333-3333-aaaaaaaaaaaa';
BEGIN
  RESET ROLE;
  PERFORM set_config('canteen.authorized_transaction', 'true', true);

  -- Safety Verification 1: Verify auth.users fixture identities in both directions before any pre-cleanup
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'auth' AND tablename = 'users') THEN
    -- Check 1A: If an auth.user exists with our test UUIDs, verify its email matches the exact expected fixture email
    IF EXISTS (
      SELECT 1 FROM auth.users
      WHERE id IN (v_inmate_a_uid, v_inmate_b_uid, v_family_1_uid, v_family_2_uid, v_staff_fac1_uid, v_staff_fac2_uid)
      AND email IS DISTINCT FROM CASE
        WHEN id = v_inmate_a_uid THEN 'test_inmate_a_rls@canteen.test'
        WHEN id = v_inmate_b_uid THEN 'test_inmate_b_rls@canteen.test'
        WHEN id = v_family_1_uid THEN 'test_family_1_rls@canteen.test'
        WHEN id = v_family_2_uid THEN 'test_family_2_rls@canteen.test'
        WHEN id = v_staff_fac1_uid THEN 'test_staff_fac1_rls@canteen.test'
        WHEN id = v_staff_fac2_uid THEN 'test_staff_fac2_rls@canteen.test'
      END
    ) THEN
      RAISE EXCEPTION 'SAFETY HALT: Existing auth.users record matches test UUIDs but does not match expected test fixture email. Refusing to delete or overwrite real user.';
    END IF;

    -- Check 1B: If an auth.user exists with our test emails, verify its id matches the exact corresponding test UUID
    IF EXISTS (
      SELECT 1 FROM auth.users
      WHERE email IN (
        'test_inmate_a_rls@canteen.test', 'test_inmate_b_rls@canteen.test',
        'test_family_1_rls@canteen.test', 'test_family_2_rls@canteen.test',
        'test_staff_fac1_rls@canteen.test', 'test_staff_fac2_rls@canteen.test'
      )
      AND id IS DISTINCT FROM CASE
        WHEN email = 'test_inmate_a_rls@canteen.test' THEN v_inmate_a_uid
        WHEN email = 'test_inmate_b_rls@canteen.test' THEN v_inmate_b_uid
        WHEN email = 'test_family_1_rls@canteen.test' THEN v_family_1_uid
        WHEN email = 'test_family_2_rls@canteen.test' THEN v_family_2_uid
        WHEN email = 'test_staff_fac1_rls@canteen.test' THEN v_staff_fac1_uid
        WHEN email = 'test_staff_fac2_rls@canteen.test' THEN v_staff_fac2_uid
      END
    ) THEN
      RAISE EXCEPTION 'SAFETY HALT: Unique email collision detected in auth.users with different user IDs. Test suite must run in an isolated test database.';
    END IF;
  END IF;

  -- Safety Verification 2: Comprehensive NULL-safe collision check across ALL fixture IDs before any pre-cleanup
  IF EXISTS (
    SELECT 1 FROM public.offenders
    WHERE id IN ('A1234567', 'B7654321')
    AND (
      user_id IS DISTINCT FROM CASE WHEN id = 'A1234567' THEN v_inmate_a_uid ELSE v_inmate_b_uid END
      OR facility_id IS DISTINCT FROM CASE WHEN id = 'A1234567' THEN v_fac1_id ELSE v_fac2_id END
      OR name IS DISTINCT FROM CASE WHEN id = 'A1234567' THEN 'Inmate A (Test)' ELSE 'Inmate B (Test)' END
    )
  ) THEN
    RAISE EXCEPTION 'SAFETY HALT: Existing offender records match test offender IDs (A1234567/B7654321) but are not disposable test fixtures.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.offenders
    WHERE user_id IN (v_inmate_a_uid, v_inmate_b_uid)
    AND id IS DISTINCT FROM CASE WHEN user_id = v_inmate_a_uid THEN 'A1234567' ELSE 'B7654321' END
  ) THEN
    RAISE EXCEPTION 'SAFETY HALT: Inmate user ID is linked to a different offender record.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.facilities
    WHERE id IN (v_fac1_id, v_fac2_id)
    AND (
      name IS DISTINCT FROM CASE WHEN id = v_fac1_id THEN 'Cumberland Regional Facility (Test)' ELSE 'Westside Correctional Center (Test)' END
      OR weekly_reset_day IS DISTINCT FROM CASE WHEN id = v_fac1_id THEN 0 ELSE 1 END
      OR max_weekly_spend IS DISTINCT FROM 100.00
    )
  ) THEN
    RAISE EXCEPTION 'SAFETY HALT: Existing facility record matches test UUIDs but does not match complete expected test fixture identity (name, weekly_reset_day, max_weekly_spend).';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.facilities
    WHERE name IN ('Cumberland Regional Facility (Test)', 'Westside Correctional Center (Test)')
    AND id NOT IN (v_fac1_id, v_fac2_id)
  ) THEN
    RAISE EXCEPTION 'SAFETY HALT: Facility name collision detected with different facility ID.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE id IN (v_inmate_a_uid, v_inmate_b_uid, v_family_1_uid, v_family_2_uid, v_staff_fac1_uid, v_staff_fac2_uid)
    AND (
      email IS DISTINCT FROM CASE
        WHEN id = v_inmate_a_uid THEN 'test_inmate_a_rls@canteen.test'
        WHEN id = v_inmate_b_uid THEN 'test_inmate_b_rls@canteen.test'
        WHEN id = v_family_1_uid THEN 'test_family_1_rls@canteen.test'
        WHEN id = v_family_2_uid THEN 'test_family_2_rls@canteen.test'
        WHEN id = v_staff_fac1_uid THEN 'test_staff_fac1_rls@canteen.test'
        WHEN id = v_staff_fac2_uid THEN 'test_staff_fac2_rls@canteen.test'
      END
      OR name IS DISTINCT FROM CASE
        WHEN id = v_inmate_a_uid THEN 'Inmate A (Test)'
        WHEN id = v_inmate_b_uid THEN 'Inmate B (Test)'
        WHEN id = v_family_1_uid THEN 'Family User 1 (Test)'
        WHEN id = v_family_2_uid THEN 'Family User 2 (Test)'
        WHEN id = v_staff_fac1_uid THEN 'Staff Facility 1 (Test)'
        WHEN id = v_staff_fac2_uid THEN 'Staff Facility 2 (Test)'
      END
    )
  ) THEN
    RAISE EXCEPTION 'SAFETY HALT: Existing user profile matches test UUIDs but does not match exact expected test fixture identity.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE email IN (
      'test_inmate_a_rls@canteen.test', 'test_inmate_b_rls@canteen.test',
      'test_family_1_rls@canteen.test', 'test_family_2_rls@canteen.test',
      'test_staff_fac1_rls@canteen.test', 'test_staff_fac2_rls@canteen.test'
    )
    AND id NOT IN (v_inmate_a_uid, v_inmate_b_uid, v_family_1_uid, v_family_2_uid, v_staff_fac1_uid, v_staff_fac2_uid)
  ) THEN
    RAISE EXCEPTION 'SAFETY HALT: User profile email collision detected with different user ID.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.products
    WHERE id IN (v_prod1_id, v_prod2_id)
    AND (
      sku IS DISTINCT FROM CASE WHEN id = v_prod1_id THEN 'SKU-FAC1-01' ELSE 'SKU-FAC2-01' END
      OR facility_id IS DISTINCT FROM CASE WHEN id = v_prod1_id THEN v_fac1_id ELSE v_fac2_id END
    )
  ) THEN
    RAISE EXCEPTION 'SAFETY HALT: Existing product matches test UUIDs but is not a disposable test fixture.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.orders
    WHERE id IN (v_order1_id, v_order2_id)
    AND (
      offender_id IS DISTINCT FROM CASE WHEN id = v_order1_id THEN 'A1234567' ELSE 'B7654321' END
      OR order_number IS DISTINCT FROM CASE WHEN id = v_order1_id THEN '#CC-TEST1' ELSE '#CC-TEST2' END
      OR barcode IS DISTINCT FROM CASE WHEN id = v_order1_id THEN 'BC-TEST1' ELSE 'BC-TEST2' END
      OR facility_id IS DISTINCT FROM CASE WHEN id = v_order1_id THEN v_fac1_id ELSE v_fac2_id END
    )
  ) THEN
    RAISE EXCEPTION 'SAFETY HALT: Existing order matches test UUIDs but does not match complete expected test fixture identity (offender_id, order_number, barcode, facility_id).';
  END IF;

  -- Strictly prevent deleting non-fixture orders that happen to reference the test offender IDs:
  IF EXISTS (
    SELECT 1 FROM public.orders
    WHERE offender_id IN ('A1234567', 'B7654321')
    AND id IS DISTINCT FROM v_order1_id
    AND id IS DISTINCT FROM v_order2_id
  ) THEN
    RAISE EXCEPTION 'SAFETY HALT: Foreign orders reference test offender IDs (A1234567/B7654321). Refusing to run on database with pre-existing inmate order history.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.picking_lists
    WHERE id IN (v_pick1_id, v_pick2_id)
    AND (
      order_id IS DISTINCT FROM CASE WHEN id = v_pick1_id THEN v_order1_id ELSE v_order2_id END
    )
  ) THEN
    RAISE EXCEPTION 'SAFETY HALT: Existing picking list matches test UUIDs but is not a disposable test fixture.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.family_accounts
    WHERE id IN (v_fam_acc1_id, v_fam_acc2_id)
    AND (
      user_id IS DISTINCT FROM CASE WHEN id = v_fam_acc1_id THEN v_family_1_uid ELSE v_family_2_uid END
    )
  ) THEN
    RAISE EXCEPTION 'SAFETY HALT: Existing family account matches test UUIDs but is not a disposable test fixture.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.family_accounts
    WHERE user_id IN (v_family_1_uid, v_family_2_uid)
    AND id IS DISTINCT FROM CASE WHEN user_id = v_family_1_uid THEN v_fam_acc1_id ELSE v_fam_acc2_id END
  ) THEN
    RAISE EXCEPTION 'SAFETY HALT: Family user profile already owns a different family account.';
  END IF;

  -- Safety Verification: Validate relationship links matching test family account UUIDs against exact expected fixture mappings.
  -- Established fixture mappings from test architecture:
  --   * Family Account 1 (v_fam_acc1_id): Mapped strictly to Inmate A ('A1234567') [APPROVED Mother link in baseline setup].
  --   * Family Account 2 (v_fam_acc2_id): Unlinked in baseline setup (transient Test 11 link to Inmate A 'A1234567' permitted if interrupted).
  -- Any existing relationship row matching either test family account that maps to any other offender halts execution immediately.
  IF EXISTS (
    SELECT 1 FROM public.family_offender_links
    WHERE family_account_id = v_fam_acc1_id
    AND offender_id IS DISTINCT FROM 'A1234567'
  ) THEN
    RAISE EXCEPTION 'SAFETY HALT: Family Account 1 (v_fam_acc1_id) has an unverified relationship link. Expected fixture mapping is strictly Inmate A (A1234567).';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.family_offender_links
    WHERE family_account_id = v_fam_acc2_id
    AND offender_id NOT IN ('A1234567', 'B7654321')
  ) THEN
    RAISE EXCEPTION 'SAFETY HALT: Family Account 2 (v_fam_acc2_id) has an unverified relationship link. Only disposable test links to Inmate A or B are permitted.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.deposits
    WHERE (id = v_dep1_id OR provider_ref IN ('TP-TEST-001', 'TP-TEST-MISMATCH-FAC', 'TP-TEST-COMPLETED-AT', 'TP-TEST-VALID-INTENT'))
    AND (
      provider_ref NOT IN ('TP-TEST-001', 'TP-TEST-MISMATCH-FAC', 'TP-TEST-COMPLETED-AT', 'TP-TEST-VALID-INTENT')
      OR offender_id NOT IN ('A1234567', 'B7654321')
    )
  ) THEN
    RAISE EXCEPTION 'SAFETY HALT: Existing deposit matches test UUIDs or test provider refs but is not a disposable test fixture.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.notifications
    WHERE id = v_notif_id
    AND (
      offender_id IS DISTINCT FROM 'A1234567'
      OR type IS DISTINCT FROM 'TEST'
      OR title IS DISTINCT FROM 'Original Title'
      OR message IS DISTINCT FROM 'Original Message'
    )
  ) THEN
    RAISE EXCEPTION 'SAFETY HALT: Existing notification matches test UUID (v_notif_id) but does not match complete expected test fixture identity (offender_id, type, title, message).';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.audit_logs
    WHERE id = v_audit_id
    AND (
      facility_id IS DISTINCT FROM v_fac1_id
      OR user_id IS DISTINCT FROM v_inmate_a_uid
    )
  ) THEN
    RAISE EXCEPTION 'SAFETY HALT: Existing audit log matches test UUIDs but is not a disposable test fixture.';
  END IF;

  -- Scoped Pre-Cleanup: Strictly cleans up prior test artifacts from interrupted previous runs by explicit primary keys
  DELETE FROM public.picking_lists WHERE id IN (v_pick1_id, v_pick2_id);
  DELETE FROM public.order_items WHERE order_id IN (v_order1_id, v_order2_id);
  DELETE FROM public.order_status_history WHERE order_id IN (v_order1_id, v_order2_id);
  DELETE FROM public.orders WHERE id IN (v_order1_id, v_order2_id);
  DELETE FROM public.notifications WHERE id = v_notif_id AND offender_id = 'A1234567' AND type = 'TEST';
  DELETE FROM public.audit_logs WHERE id = v_audit_id;
  DELETE FROM public.deposits WHERE id = v_dep1_id OR provider_ref IN ('TP-TEST-MISMATCH-FAC', 'TP-TEST-COMPLETED-AT', 'TP-TEST-VALID-INTENT');
  DELETE FROM public.family_offender_links
  WHERE (family_account_id = v_fam_acc1_id AND offender_id = 'A1234567')
     OR (family_account_id = v_fam_acc2_id AND offender_id IN ('A1234567', 'B7654321'));
  DELETE FROM public.family_accounts WHERE id IN (v_fam_acc1_id, v_fam_acc2_id);
  DELETE FROM public.products WHERE id IN (v_prod1_id, v_prod2_id);
  DELETE FROM public.offenders WHERE id IN ('A1234567', 'B7654321') AND user_id IN (v_inmate_a_uid, v_inmate_b_uid);
  DELETE FROM public.user_profiles
  WHERE id IN (v_inmate_a_uid, v_inmate_b_uid, v_family_1_uid, v_family_2_uid, v_staff_fac1_uid, v_staff_fac2_uid)
    AND email LIKE '%@canteen.test';
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'auth' AND tablename = 'users') THEN
    DELETE FROM auth.users
    WHERE id IN (v_inmate_a_uid, v_inmate_b_uid, v_family_1_uid, v_family_2_uid, v_staff_fac1_uid, v_staff_fac2_uid)
      AND email LIKE '%@canteen.test';
  END IF;
  DELETE FROM public.facilities
  WHERE id IN (v_fac1_id, v_fac2_id)
    AND name IN ('Cumberland Regional Facility (Test)', 'Westside Correctional Center (Test)');

  -- Insert Facilities
  INSERT INTO public.facilities (id, name, weekly_reset_day, max_weekly_spend)
  VALUES (v_fac1_id, 'Cumberland Regional Facility (Test)', 0, 100.00),
         (v_fac2_id, 'Westside Correctional Center (Test)', 1, 100.00);

  -- Create dummy auth users satisfying GoTrue schema constraints
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'auth' AND tablename = 'users') THEN
    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data
    )
    VALUES
      (v_inmate_a_uid, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', 'test_inmate_a_rls@canteen.test', crypt('testpass', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb),
      (v_inmate_b_uid, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', 'test_inmate_b_rls@canteen.test', crypt('testpass', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb),
      (v_family_1_uid, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', 'test_family_1_rls@canteen.test', crypt('testpass', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb),
      (v_family_2_uid, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', 'test_family_2_rls@canteen.test', crypt('testpass', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb),
      (v_staff_fac1_uid, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', 'test_staff_fac1_rls@canteen.test', crypt('testpass', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb),
      (v_staff_fac2_uid, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', 'test_staff_fac2_rls@canteen.test', crypt('testpass', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb);
  END IF;

  -- Insert User Profiles
  INSERT INTO public.user_profiles (id, facility_id, role, name, email, is_active)
  VALUES (v_inmate_a_uid, v_fac1_id, 'INMATE', 'Inmate A (Test)', 'test_inmate_a_rls@canteen.test', true),
         (v_inmate_b_uid, v_fac2_id, 'INMATE', 'Inmate B (Test)', 'test_inmate_b_rls@canteen.test', true),
         (v_family_1_uid, NULL, 'FAMILY', 'Family User 1 (Test)', 'test_family_1_rls@canteen.test', true),
         (v_family_2_uid, NULL, 'FAMILY', 'Family User 2 (Test)', 'test_family_2_rls@canteen.test', true),
         (v_staff_fac1_uid, v_fac1_id, 'WAREHOUSE_PICKER', 'Staff Facility 1 (Test)', 'test_staff_fac1_rls@canteen.test', true),
         (v_staff_fac2_uid, v_fac2_id, 'WAREHOUSE_PICKER', 'Staff Facility 2 (Test)', 'test_staff_fac2_rls@canteen.test', true);

  -- Insert Offenders
  INSERT INTO public.offenders (id, user_id, facility_id, name, unit, housing, pin_hash, balance, weekly_limit)
  VALUES ('A1234567', v_inmate_a_uid, v_fac1_id, 'Inmate A (Test)', 'Unit 1', 'Cell 101', crypt('1234', gen_salt('bf')), 82.50, 100.00),
         ('B7654321', v_inmate_b_uid, v_fac2_id, 'Inmate B (Test)', 'Unit 2', 'Cell 202', crypt('4321', gen_salt('bf')), 50.00, 100.00);

  -- Insert Family Accounts
  INSERT INTO public.family_accounts (id, user_id, relationship)
  VALUES (v_fam_acc1_id, v_family_1_uid, 'Mother'),
         (v_fam_acc2_id, v_family_2_uid, 'Friend');

  -- Explicit Family Link: Family User 1 is APPROVED for Inmate A ONLY. Family User 2 has NO approved links.
  INSERT INTO public.family_offender_links (family_account_id, offender_id, status, relationship)
  VALUES (v_fam_acc1_id, 'A1234567', 'APPROVED', 'Mother');

  -- Insert Products
  INSERT INTO public.products (id, facility_id, sku, name, category, price, stock, active)
  VALUES (v_prod1_id, v_fac1_id, 'SKU-FAC1-01', 'Facility 1 Soap', 'Hygiene', 2.50, 100, true),
         (v_prod2_id, v_fac2_id, 'SKU-FAC2-01', 'Facility 2 Snack', 'Snacks', 3.00, 100, true);

  -- Insert Orders
  INSERT INTO public.orders (id, order_number, facility_id, offender_id, status, subtotal, total, expected_delivery_date, barcode)
  VALUES (v_order1_id, '#CC-TEST1', v_fac1_id, 'A1234567', 'PROCESSING', 15.00, 15.00, now() + INTERVAL '2 days', 'BC-TEST1'),
         (v_order2_id, '#CC-TEST2', v_fac2_id, 'B7654321', 'PROCESSING', 20.00, 20.00, now() + INTERVAL '2 days', 'BC-TEST2');

  -- Insert Picking Lists
  INSERT INTO public.picking_lists (id, order_id, status)
  VALUES (v_pick1_id, v_order1_id, 'PENDING'),
         (v_pick2_id, v_order2_id, 'PENDING');

  -- Insert Deposit
  INSERT INTO public.deposits (id, facility_id, offender_id, family_account_id, amount, total_paid, provider_ref, idempotency_key, status)
  VALUES (v_dep1_id, v_fac1_id, 'A1234567', v_fam_acc1_id, 25.00, 28.50, 'TP-TEST-001', 'idemp-test-001', 'SUCCEEDED');

  -- Insert Audit Log
  INSERT INTO public.audit_logs (id, user_id, action, entity, entity_id, facility_id, metadata)
  VALUES (v_audit_id, v_inmate_a_uid, 'LOGIN', 'auth', 'A1234567', v_fac1_id, '{"ip":"127.0.0.1"}'::jsonb);

  -- Insert Notification
  INSERT INTO public.notifications (id, offender_id, type, title, message, read)
  VALUES (v_notif_id, 'A1234567', 'TEST', 'Original Title', 'Original Message', false);

  PERFORM set_config('canteen.authorized_transaction', 'false', true);
END $$;

-- ==============================================================================
-- TEST 1: Anonymous (anon) User Access Lockout (Table Grant Revocation & RLS Perimeter)
-- ==============================================================================
DO $$
DECLARE
  v_offenders_exist INTEGER;
  v_orders_exist INTEGER;
  v_audit_exist INTEGER;
  v_offender_blocked BOOLEAN := false;
  v_order_blocked BOOLEAN := false;
  v_audit_blocked BOOLEAN := false;
  v_offender_mech TEXT := '';
  v_order_mech TEXT := '';
  v_audit_mech TEXT := '';
  v_count INTEGER;
  v_err_code TEXT := '';
  v_err_msg TEXT := '';
BEGIN
  -- 1. Baseline Verification as postgres: Prove that target test records physically exist
  RESET ROLE;
  SELECT COUNT(*) INTO v_offenders_exist FROM public.offenders WHERE id IN ('A1234567', 'B7654321');
  SELECT COUNT(*) INTO v_orders_exist FROM public.orders WHERE id IN ('99999999-9999-9999-9999-999999999991', '99999999-9999-9999-9999-999999999992');
  SELECT COUNT(*) INTO v_audit_exist FROM public.audit_logs WHERE id = 'aaaaaaaa-3333-3333-3333-aaaaaaaaaaaa';

  IF v_offenders_exist < 2 OR v_orders_exist < 2 OR v_audit_exist < 1 THEN
    RAISE EXCEPTION 'TEST 1 SETUP INTEGRITY FAILED: Test fixture records missing in database (offenders: %, orders: %, audit: %)',
      v_offenders_exist, v_orders_exist, v_audit_exist;
  END IF;

  -- 2. Switch to anon role
  PERFORM set_config('request.jwt.claims', '', true);
  SET LOCAL ROLE anon;

  -- 3. Check offenders access
  v_err_code := '';
  v_err_msg := '';
  BEGIN
    SELECT COUNT(*) INTO v_count FROM public.offenders;
    IF v_count = 0 THEN
      v_offender_blocked := true;
      v_offender_mech := 'RLS_FILTERED (0 rows)';
    END IF;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err_code = RETURNED_SQLSTATE, v_err_msg = MESSAGE_TEXT;
    IF v_err_code = '42501' OR v_err_msg ILIKE '%permission denied%' THEN
      v_offender_blocked := true;
      v_offender_mech := format('TABLE_GRANT_REVOKED (SQLSTATE %s)', v_err_code);
    END IF;
  END;

  -- 4. Check orders access
  v_err_code := '';
  v_err_msg := '';
  BEGIN
    SELECT COUNT(*) INTO v_count FROM public.orders;
    IF v_count = 0 THEN
      v_order_blocked := true;
      v_order_mech := 'RLS_FILTERED (0 rows)';
    END IF;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err_code = RETURNED_SQLSTATE, v_err_msg = MESSAGE_TEXT;
    IF v_err_code = '42501' OR v_err_msg ILIKE '%permission denied%' THEN
      v_order_blocked := true;
      v_order_mech := format('TABLE_GRANT_REVOKED (SQLSTATE %s)', v_err_code);
    END IF;
  END;

  -- 5. Check audit_logs access
  v_err_code := '';
  v_err_msg := '';
  BEGIN
    SELECT COUNT(*) INTO v_count FROM public.audit_logs;
    IF v_count = 0 THEN
      v_audit_blocked := true;
      v_audit_mech := 'RLS_FILTERED (0 rows)';
    END IF;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err_code = RETURNED_SQLSTATE, v_err_msg = MESSAGE_TEXT;
    IF v_err_code = '42501' OR v_err_msg ILIKE '%permission denied%' THEN
      v_audit_blocked := true;
      v_audit_mech := format('TABLE_GRANT_REVOKED (SQLSTATE %s)', v_err_code);
    END IF;
  END;

  RESET ROLE;
  IF v_offender_blocked AND v_order_blocked AND v_audit_blocked THEN
    INSERT INTO test_results VALUES (1, 'Anon role cannot query offenders, orders, or audit logs', true,
      format('Offenders: %s; Orders: %s; Audit: %s (Fixtures verified: 2 offenders, 2 orders, 1 audit)',
             v_offender_mech, v_order_mech, v_audit_mech));
  ELSE
    INSERT INTO test_results VALUES (1, 'Anon role access lockout failed', false,
      format('Offenders: %s, Orders: %s, Audit: %s', v_offender_blocked, v_order_blocked, v_audit_blocked));
  END IF;
EXCEPTION WHEN OTHERS THEN
  RESET ROLE;
  INSERT INTO test_results VALUES (1, 'Anon query test error', false, SQLERRM);
END $$;

-- ==============================================================================
-- TEST 2: Inmate A Cross-Inmate & Cross-Facility Isolation (RLS Verification)
-- ==============================================================================
DO $$
DECLARE
  v_visible_offenders INTEGER;
  v_visible_facilities INTEGER;
  v_visible_orders INTEGER;
BEGIN
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '{"sub": "aaaa1111-aaaa-1111-aaaa-111111111111", "role": "authenticated"}', true);
  SET LOCAL ROLE authenticated;

  -- Must only see Inmate A (A1234567), NEVER Inmate B (B7654321)
  SELECT COUNT(*) INTO v_visible_offenders FROM public.offenders;
  -- Must only see Facility 1, NEVER Facility 2
  SELECT COUNT(*) INTO v_visible_facilities FROM public.facilities;
  -- Must only see Order 1, NEVER Order 2
  SELECT COUNT(*) INTO v_visible_orders FROM public.orders;

  RESET ROLE;
  IF v_visible_offenders = 1 AND v_visible_facilities = 1 AND v_visible_orders = 1 THEN
    INSERT INTO test_results VALUES (2, 'Inmate A can only view own record, own facility, and own orders', true, 'Strict 1:1 tenant isolation verified');
  ELSE
    INSERT INTO test_results VALUES (2, 'Inmate A isolation breached', false,
      format('Offenders: %s, Facilities: %s, Orders: %s', v_visible_offenders, v_visible_facilities, v_visible_orders));
  END IF;
EXCEPTION WHEN OTHERS THEN
  RESET ROLE;
  INSERT INTO test_results VALUES (2, 'Inmate A isolation test failed with error', false, SQLERRM);
END $$;

-- ==============================================================================
-- TEST 3: Inmate A Direct Balance Modification Rejection (Privilege & Trigger Verification)
-- ==============================================================================
DO $$
DECLARE
  v_blocked BOOLEAN := false;
  v_err_code TEXT := '';
  v_err_msg TEXT := '';
  v_stored_balance NUMERIC(10, 2);
BEGIN
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '{"sub": "aaaa1111-aaaa-1111-aaaa-111111111111", "role": "authenticated"}', true);
  SET LOCAL ROLE authenticated;

  BEGIN
    UPDATE public.offenders SET balance = 9999.00 WHERE id = 'A1234567';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err_code = RETURNED_SQLSTATE, v_err_msg = MESSAGE_TEXT;
    v_blocked := true;
  END;

  RESET ROLE;
  SELECT balance INTO v_stored_balance FROM public.offenders WHERE id = 'A1234567';

  -- Expected rejection: 42501 (column update privilege revoked) or P0001 (tamper trigger raised exception)
  -- and physical balance must remain strictly at 82.50
  IF v_blocked AND (v_err_code IN ('42501', 'P0001') OR v_err_msg ILIKE '%permission denied%' OR v_err_msg ILIKE '%SECURITY VIOLATION%') AND v_stored_balance = 82.50 THEN
    INSERT INTO test_results VALUES (3, 'Inmate A direct balance modification blocked by column privilege/trigger', true, format('Blocked as expected [%s: %s], balance unchanged ($82.50)', v_err_code, v_err_msg));
  ELSE
    INSERT INTO test_results VALUES (3, 'Inmate A direct balance modification not blocked properly', false, format('Blocked: %s, Code: %s, Msg: %s, Stored balance: %s', v_blocked, v_err_code, v_err_msg, v_stored_balance));
  END IF;
EXCEPTION WHEN OTHERS THEN
  RESET ROLE;
  INSERT INTO test_results VALUES (3, 'Direct balance update test error', false, SQLERRM);
END $$;

-- ==============================================================================
-- TEST 3b: Setting Authorization GUC Cannot Bypass Balance / Spending Protection (Bypass Prevention)
-- Verifies that authenticated clients attempting to manipulate custom session GUCs
-- (e.g. canteen.authorized_transaction or canteen._internal_balance_nonce) are strictly
-- blocked from directly modifying inmate balance or current_weekly_spent.
-- ==============================================================================
DO $$
DECLARE
  v_bal_blocked BOOLEAN := false;
  v_bal_err_code TEXT := '';
  v_bal_err_msg TEXT := '';
  v_spent_blocked BOOLEAN := false;
  v_spent_err_code TEXT := '';
  v_spent_err_msg TEXT := '';
  v_admin_bal_blocked BOOLEAN := false;
  v_admin_bal_code TEXT := '';
  v_admin_bal_msg TEXT := '';
  v_stored_balance NUMERIC(10, 2);
  v_stored_spent NUMERIC(10, 2);
BEGIN
  -- Part 1: Inmate A role sets authorization GUCs and attempts direct balance & spent modification
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '{"sub": "aaaa1111-aaaa-1111-aaaa-111111111111", "role": "authenticated"}', true);
  SET LOCAL ROLE authenticated;

  -- Attempt to bypass security boundary by asserting custom GUCs
  PERFORM set_config('canteen.authorized_transaction', 'true', true);
  PERFORM set_config('canteen._internal_balance_nonce', 'true', true);

  BEGIN
    UPDATE public.offenders SET balance = 9999.00 WHERE id = 'A1234567';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_bal_err_code = RETURNED_SQLSTATE, v_bal_err_msg = MESSAGE_TEXT;
    v_bal_blocked := true;
  END;

  BEGIN
    UPDATE public.offenders SET current_weekly_spent = 0.00 WHERE id = 'A1234567';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_spent_err_code = RETURNED_SQLSTATE, v_spent_err_msg = MESSAGE_TEXT;
    v_spent_blocked := true;
  END;

  -- Part 2: Staff / Admin role also attempts direct balance modification via GUC
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '{"sub": "eeee5555-eeee-5555-eeee-555555555555", "role": "authenticated"}', true);
  SET LOCAL ROLE authenticated;

  PERFORM set_config('canteen.authorized_transaction', 'true', true);
  PERFORM set_config('canteen._internal_balance_nonce', 'true', true);

  BEGIN
    UPDATE public.offenders SET balance = 5000.00 WHERE id = 'A1234567';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_admin_bal_code = RETURNED_SQLSTATE, v_admin_bal_msg = MESSAGE_TEXT;
    v_admin_bal_blocked := true;
  END;

  -- Verify physical stored values under superuser
  RESET ROLE;
  SELECT balance, current_weekly_spent INTO v_stored_balance, v_stored_spent
  FROM public.offenders WHERE id = 'A1234567';

  IF v_bal_blocked AND v_spent_blocked AND v_admin_bal_blocked
     AND v_stored_balance = 82.50 AND v_stored_spent = 0.00 THEN
    INSERT INTO test_results VALUES (
      31,
      'Setting authorization GUC cannot bypass balance or weekly spending protection (GUC tamper rejection)',
      true,
      format('All GUC bypass attempts blocked [Inmate bal: %s, Inmate spent: %s, Admin bal: %s], stored balance ($%s) and spent ($%s) intact',
        v_bal_err_code, v_spent_err_code, v_admin_bal_code, v_stored_balance, v_stored_spent)
    );
  ELSE
    INSERT INTO test_results VALUES (
      31,
      'GUC bypass protection failed: direct balance or spending was modifiable via GUC manipulation',
      false,
      format('Bal blocked: %s [%s], Spent blocked: %s [%s], Admin bal blocked: %s [%s], Stored balance: %s, Stored spent: %s',
        v_bal_blocked, v_bal_err_code, v_spent_blocked, v_spent_err_code, v_admin_bal_blocked, v_admin_bal_code, v_stored_balance, v_stored_spent)
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  RESET ROLE;
  INSERT INTO test_results VALUES (31, 'GUC bypass security test error', false, SQLERRM);
END $$;

-- ==============================================================================
-- TEST 4: Family User 1 (Approved link to Inmate A, Facility 1) (RLS Verification)
-- ==============================================================================
DO $$
DECLARE
  v_visible_offenders INTEGER;
  v_visible_facilities INTEGER;
  v_visible_products_fac2 INTEGER;
BEGIN
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '{"sub": "cccc3333-cccc-3333-cccc-333333333333", "role": "authenticated"}', true);
  SET LOCAL ROLE authenticated;

  -- Can view Inmate A (has approved link), CANNOT view Inmate B
  SELECT COUNT(*) INTO v_visible_offenders FROM public.offenders;
  -- Can view Facility 1 (where Inmate A resides), CANNOT view Facility 2
  SELECT COUNT(*) INTO v_visible_facilities FROM public.facilities;
  -- CANNOT view products exclusive to Facility 2
  SELECT COUNT(*) INTO v_visible_products_fac2 FROM public.products WHERE facility_id = '22222222-2222-2222-2222-222222222222';

  RESET ROLE;
  IF v_visible_offenders = 1 AND v_visible_facilities = 1 AND v_visible_products_fac2 = 0 THEN
    INSERT INTO test_results VALUES (4, 'Family User 1 scoped strictly to approved inmate and facility', true, 'Cross-facility leak prevented');
  ELSE
    INSERT INTO test_results VALUES (4, 'Family User 1 policy leak detected', false,
      format('Offenders: %s, Facilities: %s, Fac2 Products: %s', v_visible_offenders, v_visible_facilities, v_visible_products_fac2));
  END IF;
EXCEPTION WHEN OTHERS THEN
  RESET ROLE;
  INSERT INTO test_results VALUES (4, 'Family User 1 test error', false, SQLERRM);
END $$;

-- ==============================================================================
-- TEST 5: Family User 2 (Unlinked Account - Zero Inmate Links) (RLS Verification)
-- ==============================================================================
DO $$
DECLARE
  v_visible_offenders INTEGER;
  v_visible_facilities INTEGER;
BEGIN
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '{"sub": "dddd4444-dddd-4444-dddd-444444444444", "role": "authenticated"}', true);
  SET LOCAL ROLE authenticated;

  SELECT COUNT(*) INTO v_visible_offenders FROM public.offenders;
  SELECT COUNT(*) INTO v_visible_facilities FROM public.facilities;

  RESET ROLE;
  IF v_visible_offenders = 0 AND v_visible_facilities = 0 THEN
    INSERT INTO test_results VALUES (5, 'Unlinked Family User 2 cannot browse any offenders or facilities', true, 'Zero ambient disclosure verified');
  ELSE
    INSERT INTO test_results VALUES (5, 'Unlinked Family User 2 saw private data', false,
      format('Offenders: %s, Facilities: %s', v_visible_offenders, v_visible_facilities));
  END IF;
EXCEPTION WHEN OTHERS THEN
  RESET ROLE;
  INSERT INTO test_results VALUES (5, 'Family User 2 test error', false, SQLERRM);
END $$;

-- ==============================================================================
-- TEST 6: Warehouse Picker Facility 1 Cross-Facility Isolation (RLS & Trigger Verification)
-- ==============================================================================
DO $$
DECLARE
  v_pick1_id UUID := 'bbbb1111-bbbb-1111-bbbb-111111111111';
  v_pick2_id UUID := 'bbbb2222-bbbb-2222-bbbb-222222222222';
  v_order1_id UUID := '99999999-9999-9999-9999-999999999991';
  v_order2_id UUID := '99999999-9999-9999-9999-999999999992';
  v_fac1_picks INTEGER;
  v_fac2_picks INTEGER;
  v_fac2_orders INTEGER;
  v_own_updated INTEGER := 0;
  v_cross_updated INTEGER := 0;
  v_reassign_rows INTEGER := 0;
  v_reassign_blocked BOOLEAN := false;
  v_err_code TEXT := '';
  v_err_msg TEXT := '';
  v_stored_p1_order UUID;
  v_stored_p1_status TEXT;
  v_stored_p2_order UUID;
  v_stored_p2_status TEXT;
BEGIN
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '{"sub": "eeee5555-eeee-5555-eeee-555555555555", "role": "authenticated"}', true);
  SET LOCAL ROLE authenticated;

  -- 1. Visibility Check: Warehouse Picker Facility 1 can see Picking List 1 (Facility 1),
  -- but must NEVER see Picking List 2 (Facility 2) or Orders from Facility 2.
  SELECT COUNT(*) INTO v_fac1_picks FROM public.picking_lists WHERE id = v_pick1_id;
  SELECT COUNT(*) INTO v_fac2_picks FROM public.picking_lists WHERE id = v_pick2_id;
  SELECT COUNT(*) INTO v_fac2_orders FROM public.orders WHERE facility_id = '22222222-2222-2222-2222-222222222222';

  -- 2. Legitimate Operation: Warehouse Picker Facility 1 CAN update Picking List 1 for own facility
  UPDATE public.picking_lists SET status = 'IN_PROGRESS' WHERE id = v_pick1_id;
  GET DIAGNOSTICS v_own_updated = ROW_COUNT;

  -- 3. Blind Foreign Update: Warehouse Picker Facility 1 tries to update Picking List 2 (Facility 2)
  -- RLS USING filter must hide it completely, resulting in 0 rows updated
  UPDATE public.picking_lists SET status = 'COMPLETED' WHERE id = v_pick2_id;
  GET DIAGNOSTICS v_cross_updated = ROW_COUNT;

  -- 4. Cross-Facility Tamper Attack: Warehouse Picker Facility 1 attempts to reassign Picking List 1
  -- to Order 2 (Facility 2).
  -- This MUST be rejected specifically by the facility trigger (P0001) or RLS WITH CHECK (44000).
  -- A general table grant denial (42501) or syntax error is strictly rejected as proof!
  v_reassign_rows := 0;
  v_reassign_blocked := false;
  v_err_code := '';
  v_err_msg := '';
  BEGIN
    UPDATE public.picking_lists SET order_id = v_order2_id WHERE id = v_pick1_id;
    GET DIAGNOSTICS v_reassign_rows = ROW_COUNT;
  EXCEPTION WHEN OTHERS THEN
    v_reassign_rows := 0;
    GET STACKED DIAGNOSTICS v_err_code = RETURNED_SQLSTATE, v_err_msg = MESSAGE_TEXT;
    -- Strictly check for facility isolation: trigger P0001 or RLS WITH CHECK 44000
    IF (v_err_code IN ('P0001', '44000') OR v_err_msg ILIKE '%SECURITY VIOLATION%' OR v_err_msg ILIKE '%row-level security%')
       AND v_err_code != '42501' AND v_err_msg NOT ILIKE '%permission denied%' THEN
      v_reassign_blocked := true;
    END IF;
  END;

  -- 5. Physical Verification: Reset role to postgres and inspect actual rows
  RESET ROLE;
  SELECT order_id, status INTO v_stored_p1_order, v_stored_p1_status FROM public.picking_lists WHERE id = v_pick1_id;
  SELECT order_id, status INTO v_stored_p2_order, v_stored_p2_status FROM public.picking_lists WHERE id = v_pick2_id;

  IF v_fac1_picks = 1 AND v_fac2_picks = 0 AND v_fac2_orders = 0
     AND v_own_updated = 1 AND v_cross_updated = 0
     AND v_reassign_blocked AND COALESCE(v_reassign_rows, 0) = 0
     AND v_stored_p1_order IS NOT DISTINCT FROM v_order1_id AND v_stored_p1_status = 'IN_PROGRESS'
     AND v_stored_p2_order IS NOT DISTINCT FROM v_order2_id AND v_stored_p2_status = 'PENDING' THEN
    INSERT INTO test_results VALUES (6, 'Warehouse Picker Facility 1 cross-facility isolation strictly enforced (RLS & trigger)', true,
      format('Own pick updated (ROW_COUNT=%s); foreign pick hidden & unchanged (ROW_COUNT=%s); cross-facility reassign blocked [%s: %s], order_id unchanged',
             v_own_updated, v_cross_updated, v_err_code, v_err_msg));
  ELSE
    INSERT INTO test_results VALUES (6, 'Warehouse Picker Facility 1 cross-facility isolation breached', false,
      format('Fac1 picks: %s, Fac2 picks: %s, Fac2 orders: %s, Own update: %s, Cross update: %s, Reassign blocked: %s (rows: %s, code: %s), P1 order: %s, P1 status: %s',
             v_fac1_picks, v_fac2_picks, v_fac2_orders, v_own_updated, v_cross_updated, v_reassign_blocked, v_reassign_rows, v_err_code, v_stored_p1_order, v_stored_p1_status));
  END IF;
EXCEPTION WHEN OTHERS THEN
  RESET ROLE;
  INSERT INTO test_results VALUES (6, 'Warehouse picker isolation test error', false, SQLERRM);
END $$;

-- ==============================================================================
-- TEST 7: Notification Update Integrity (Privilege & Trigger Verification)
-- ==============================================================================
DO $$
DECLARE
  v_notif_id UUID := 'aaaaaaaa-2222-2222-2222-aaaaaaaaaaaa';
  v_tamper_blocked BOOLEAN := false;
  v_read_updated BOOLEAN := false;
  v_rows_updated INTEGER := 0;
  v_actual_read BOOLEAN;
  v_err_code TEXT := '';
  v_err_msg TEXT := '';
BEGIN
  -- Ensure test notification fixture is in its pristine unread state
  RESET ROLE;
  IF EXISTS (
    SELECT 1 FROM public.notifications
    WHERE id = v_notif_id
    AND (
      offender_id IS DISTINCT FROM 'A1234567'
      OR type IS DISTINCT FROM 'TEST'
      OR title IS DISTINCT FROM 'Original Title'
      OR message IS DISTINCT FROM 'Original Message'
    )
  ) THEN
    RAISE EXCEPTION 'SAFETY HALT: Notification % exists but does not match exact expected test fixture identity (offender_id, type, title, message). Refusing to overwrite.', v_notif_id;
  END IF;

  INSERT INTO public.notifications (id, offender_id, type, title, message, read)
  VALUES (v_notif_id, 'A1234567', 'TEST', 'Original Title', 'Original Message', false)
  ON CONFLICT (id) DO UPDATE
  SET title = 'Original Title', message = 'Original Message', read = false
  WHERE notifications.offender_id = 'A1234567'
    AND notifications.type = 'TEST'
    AND notifications.title = 'Original Title'
    AND notifications.message = 'Original Message';

  -- Switch to authenticated inmate
  PERFORM set_config('request.jwt.claims', '{"sub": "aaaa1111-aaaa-1111-aaaa-111111111111", "role": "authenticated"}', true);
  SET LOCAL ROLE authenticated;

  -- Attempt to modify notification title or message (must fail via column privilege revocation 42501 or trigger P0001)
  v_tamper_blocked := false;
  v_err_code := '';
  v_err_msg := '';
  BEGIN
    UPDATE public.notifications SET title = 'Forged Title' WHERE id = v_notif_id;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err_code = RETURNED_SQLSTATE, v_err_msg = MESSAGE_TEXT;
    IF v_err_code IN ('42501', 'P0001') OR v_err_msg ILIKE '%permission denied%' OR v_err_msg ILIKE '%SECURITY VIOLATION%' THEN
      v_tamper_blocked := true;
    END IF;
  END;

  -- Legitimate update: marking notification as read (must succeed and update exactly 1 row)
  v_rows_updated := 0;
  v_read_updated := false;
  BEGIN
    UPDATE public.notifications SET read = true WHERE id = v_notif_id;
    GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
    IF v_rows_updated = 1 THEN
      v_read_updated := true;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_rows_updated := 0;
    v_read_updated := false;
  END;

  RESET ROLE;
  SELECT read INTO v_actual_read FROM public.notifications WHERE id = v_notif_id;

  IF v_tamper_blocked AND v_read_updated AND v_actual_read = true THEN
    INSERT INTO test_results VALUES (7, 'Notification content tampering blocked while read status update is permitted', true, format('Tamper blocked [%s], Read status updated (verified read=true)', v_err_code));
  ELSE
    INSERT INTO test_results VALUES (7, 'Notification update integrity failed', false,
      format('Tamper blocked: %s, Read rows updated: %s, Stored read: %s', v_tamper_blocked, v_rows_updated, v_actual_read));
  END IF;
EXCEPTION WHEN OTHERS THEN
  RESET ROLE;
  INSERT INTO test_results VALUES (7, 'Notification update test error', false, SQLERRM);
END $$;

-- ==============================================================================
-- TEST 8: TouchPay Confirmation Function Execution Restricted from Authenticated (RPC Security)
-- ==============================================================================
DO $$
DECLARE
  v_blocked BOOLEAN := false;
  v_err_code TEXT := '';
  v_err_msg TEXT := '';
BEGIN
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '{"sub": "cccc3333-cccc-3333-cccc-333333333333", "role": "authenticated"}', true);
  SET LOCAL ROLE authenticated;

  BEGIN
    PERFORM public.process_confirmed_touchpay_deposit('TP-TEST-001', 'idemp-test-001', 25.00, 'USD');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err_code = RETURNED_SQLSTATE, v_err_msg = MESSAGE_TEXT;
    v_blocked := true;
  END;

  RESET ROLE;
  -- Must be blocked by grant revocation (42501) or internal security caller check (P0001)
  IF v_blocked AND (v_err_code IN ('42501', 'P0001') OR v_err_msg ILIKE '%permission denied%' OR v_err_msg ILIKE '%SECURITY VIOLATION%') THEN
    INSERT INTO test_results VALUES (8, 'process_confirmed_touchpay_deposit revoked from authenticated users', true, format('Execution rejected [%s: %s]', v_err_code, v_err_msg));
  ELSE
    INSERT INTO test_results VALUES (8, 'process_confirmed_touchpay_deposit was callable by authenticated (CRITICAL FAILURE)', false, format('Blocked: %s, Code: %s', v_blocked, v_err_code));
  END IF;
EXCEPTION WHEN OTHERS THEN
  RESET ROLE;
  INSERT INTO test_results VALUES (8, 'TouchPay restriction test error', false, SQLERRM);
END $$;

-- ==============================================================================
-- TEST 8b: Family Deposit Intent Facility Matching & completed_at Guards (Corrective RLS Verification)
-- ==============================================================================
DO $$
DECLARE
  v_fixture_pre INTEGER := 0;
  v_mismatched_fac_blocked BOOLEAN := false;
  v_completed_at_blocked BOOLEAN := false;
  v_legit_deposit_allowed BOOLEAN := false;
  v_mismatch_count INTEGER := 0;
  v_completed_count INTEGER := 0;
  v_err_code TEXT := '';
  v_err_msg TEXT := '';
  v_legit_id UUID;
  v_legit_status TEXT;
  v_legit_completed TIMESTAMPTZ;
BEGIN
  RESET ROLE;
  -- Clean up prior test artifacts if present
  DELETE FROM public.deposits WHERE provider_ref IN ('TP-TEST-MISMATCH-FAC', 'TP-TEST-COMPLETED-AT', 'TP-TEST-VALID-INTENT');

  -- Pre-Check: Ensure target fixtures exist before negative assertions
  SELECT COUNT(*) INTO v_fixture_pre
  FROM public.family_offender_links
  WHERE family_account_id = '77777777-7777-7777-7777-777777777771'
    AND offender_id = 'A1234567'
    AND status = 'APPROVED';

  IF v_fixture_pre != 1 THEN
    RAISE EXCEPTION 'TEST 8b PRE-CHECK FAILED: Family User 1 does not have an approved link to Inmate A.';
  END IF;

  -- Simulate Family User 1 (linked to Inmate A, Facility 1)
  PERFORM set_config('request.jwt.claims', '{"sub": "cccc3333-cccc-3333-cccc-333333333333", "role": "authenticated"}', true);
  SET LOCAL ROLE authenticated;

  -- Case 1: Attempt to insert deposit for Inmate A (Facility 1), but specifying Facility 2
  v_err_code := '';
  v_err_msg := '';
  BEGIN
    INSERT INTO public.deposits (
      facility_id, offender_id, family_account_id, amount, fee, total_paid,
      currency, provider, provider_ref, status, idempotency_key
    ) VALUES (
      '22222222-2222-2222-2222-222222222222', 'A1234567', '77777777-7777-7777-7777-777777777771',
      50.00, 3.50, 53.50, 'USD', 'TOUCHPAY', 'TP-TEST-MISMATCH-FAC', 'PENDING', 'idemp-mismatch-fac'
    );
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err_code = RETURNED_SQLSTATE, v_err_msg = MESSAGE_TEXT;
    IF v_err_code IN ('44000', '42501', 'P0001') OR v_err_msg ILIKE '%row-level security%' OR v_err_msg ILIKE '%check violation%' THEN
      v_mismatched_fac_blocked := true;
    END IF;
  END;

  -- Case 2: Attempt to insert deposit with non-NULL completed_at
  v_err_code := '';
  v_err_msg := '';
  BEGIN
    INSERT INTO public.deposits (
      facility_id, offender_id, family_account_id, amount, fee, total_paid,
      currency, provider, provider_ref, status, idempotency_key, completed_at
    ) VALUES (
      '11111111-1111-1111-1111-111111111111', 'A1234567', '77777777-7777-7777-7777-777777777771',
      50.00, 3.50, 53.50, 'USD', 'TOUCHPAY', 'TP-TEST-COMPLETED-AT', 'PENDING', 'idemp-completed-at', now()
    );
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err_code = RETURNED_SQLSTATE, v_err_msg = MESSAGE_TEXT;
    IF v_err_code IN ('44000', '42501', 'P0001') OR v_err_msg ILIKE '%row-level security%' OR v_err_msg ILIKE '%check violation%' THEN
      v_completed_at_blocked := true;
    END IF;
  END;

  -- Case 3: Legitimate deposit intent (facility matches offender, completed_at is NULL, PENDING status)
  BEGIN
    INSERT INTO public.deposits (
      facility_id, offender_id, family_account_id, amount, fee, total_paid,
      currency, provider, provider_ref, status, idempotency_key, completed_at
    ) VALUES (
      '11111111-1111-1111-1111-111111111111', 'A1234567', '77777777-7777-7777-7777-777777777771',
      50.00, 3.50, 53.50, 'USD', 'TOUCHPAY', 'TP-TEST-VALID-INTENT', 'PENDING', 'idemp-valid-intent-001', NULL
    )
    RETURNING id, status, completed_at INTO v_legit_id, v_legit_status, v_legit_completed;

    IF v_legit_id IS NOT NULL AND v_legit_status = 'PENDING' AND v_legit_completed IS NULL THEN
      v_legit_deposit_allowed := true;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_legit_deposit_allowed := false;
  END;

  RESET ROLE;
  -- Physically verify that blocked attempts persisted zero rows
  SELECT COUNT(*) INTO v_mismatch_count FROM public.deposits WHERE provider_ref = 'TP-TEST-MISMATCH-FAC';
  SELECT COUNT(*) INTO v_completed_count FROM public.deposits WHERE provider_ref = 'TP-TEST-COMPLETED-AT';
  -- Clean up legitimate test deposit
  DELETE FROM public.deposits WHERE provider_ref = 'TP-TEST-VALID-INTENT';

  IF v_mismatched_fac_blocked AND v_mismatch_count = 0
     AND v_completed_at_blocked AND v_completed_count = 0
     AND v_legit_deposit_allowed THEN
    INSERT INTO test_results VALUES (
      82,
      'Family deposit intent rejects mismatched facility_id and forged completed_at while allowing valid intent',
      true,
      'Mismatched facility blocked; non-null completed_at blocked; valid pending intent allowed'
    );
  ELSE
    INSERT INTO test_results VALUES (
      82,
      'Family deposit intent security check failed',
      false,
      format('Mismatched facility blocked: %s (rows=%s), completed_at blocked: %s (rows=%s), Valid intent allowed: %s',
             v_mismatched_fac_blocked, v_mismatch_count, v_completed_at_blocked, v_completed_count, v_legit_deposit_allowed)
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  RESET ROLE;
  INSERT INTO test_results VALUES (82, 'Family deposit intent test error', false, SQLERRM);
END $$;

-- ==============================================================================
-- TEST 9: Inactive Account Access Lockout (is_active = false) (RLS & Helper Verification)
-- ==============================================================================
DO $$
DECLARE
  v_role public.user_role;
  v_offender_id TEXT;
  v_visible_records INTEGER;
BEGIN
  -- Deactivate Inmate A's user profile as postgres admin
  RESET ROLE;
  UPDATE public.user_profiles
  SET is_active = false
  WHERE id = 'aaaa1111-aaaa-1111-aaaa-111111111111';

  -- Switch to authenticated session as Inmate A
  PERFORM set_config('request.jwt.claims', '{"sub": "aaaa1111-aaaa-1111-aaaa-111111111111", "role": "authenticated"}', true);
  SET LOCAL ROLE authenticated;

  v_role := public.current_user_role();
  v_offender_id := public.current_inmate_offender_id();
  SELECT COUNT(*) INTO v_visible_records FROM public.offenders;

  -- Restore active status for subsequent tests
  RESET ROLE;
  UPDATE public.user_profiles
  SET is_active = true
  WHERE id = 'aaaa1111-aaaa-1111-aaaa-111111111111';

  IF v_role IS NULL AND v_offender_id IS NULL AND v_visible_records = 0 THEN
    INSERT INTO test_results VALUES (9, 'Inactive account access revoked immediately across all paths', true, 'Role/OffenderId are NULL, 0 records visible');
  ELSE
    INSERT INTO test_results VALUES (9, 'Inactive account retained access (CRITICAL FAILURE)', false,
      format('Role: %s, OffenderId: %s, Visible records: %s', v_role, v_offender_id, v_visible_records));
  END IF;
EXCEPTION WHEN OTHERS THEN
  RESET ROLE;
  UPDATE public.user_profiles SET is_active = true WHERE id = 'aaaa1111-aaaa-1111-aaaa-111111111111';
  INSERT INTO test_results VALUES (9, 'Inactive account test error', false, SQLERRM);
END $$;

-- ==============================================================================
-- TEST 10: User Profile Column Update Privilege Escalation Block (Column Privilege Verification)
-- ==============================================================================
DO $$
DECLARE
  v_elevation_blocked BOOLEAN := false;
  v_name_updated BOOLEAN := false;
  v_rows_updated INTEGER := 0;
  v_stored_name TEXT;
  v_stored_role public.user_role;
  v_err_code TEXT := '';
  v_err_msg TEXT := '';
BEGIN
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '{"sub": "cccc3333-cccc-3333-cccc-333333333333", "role": "authenticated"}', true);
  SET LOCAL ROLE authenticated;

  -- Attempt to self-assign ADMIN role (must be rejected by column privilege revocation 42501 or trigger P0001)
  v_elevation_blocked := false;
  v_err_code := '';
  v_err_msg := '';
  BEGIN
    UPDATE public.user_profiles SET role = 'ADMIN' WHERE id = 'cccc3333-cccc-3333-cccc-333333333333';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err_code = RETURNED_SQLSTATE, v_err_msg = MESSAGE_TEXT;
    IF v_err_code IN ('42501', 'P0001') OR v_err_msg ILIKE '%permission denied%' OR v_err_msg ILIKE '%SECURITY VIOLATION%' THEN
      v_elevation_blocked := true;
    END IF;
  END;

  -- Allowed update: updating display name (must succeed and update exactly 1 row)
  v_rows_updated := 0;
  v_name_updated := false;
  BEGIN
    UPDATE public.user_profiles SET name = 'Updated Family Name' WHERE id = 'cccc3333-cccc-3333-cccc-333333333333';
    GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
    IF v_rows_updated = 1 THEN
      v_name_updated := true;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_rows_updated := 0;
    v_name_updated := false;
  END;

  RESET ROLE;
  SELECT name, role INTO v_stored_name, v_stored_role FROM public.user_profiles WHERE id = 'cccc3333-cccc-3333-cccc-333333333333';

  IF v_elevation_blocked AND v_name_updated AND v_stored_name = 'Updated Family Name' AND v_stored_role = 'FAMILY' THEN
    INSERT INTO test_results VALUES (10, 'Profile column permissions prevent role/status escalation while permitting name update', true, format('Role change blocked [%s], name updated to "%s" (role remains FAMILY)', v_err_code, v_stored_name));
  ELSE
    INSERT INTO test_results VALUES (10, 'Profile update restriction failed', false, format('Elevation blocked: %s, Name updated: %s, Rows: %s, Stored name: %s, Stored role: %s', v_elevation_blocked, v_name_updated, v_rows_updated, v_stored_name, v_stored_role));
  END IF;
EXCEPTION WHEN OTHERS THEN
  RESET ROLE;
  INSERT INTO test_results VALUES (10, 'Profile update test error', false, SQLERRM);
END $$;

-- ==============================================================================
-- TEST 11: Family Relationship Self-Approval Block (RLS & Trigger Verification)
-- ==============================================================================
DO $$
DECLARE
  v_pre_check INTEGER := 0;
  v_pending_request_allowed BOOLEAN := false;
  v_self_approve_blocked BOOLEAN := false;
  v_status_elevate_blocked BOOLEAN := false;
  v_rows_inserted_pending INTEGER := 0;
  v_rows_inserted_approve INTEGER := 0;
  v_rows_updated INTEGER := 0;
  v_stored_status TEXT;
  v_err_code TEXT := '';
  v_err_msg TEXT := '';
  v_elevation_err_code TEXT := '';
  v_elevation_err_msg TEXT := '';
  v_elevation_caught_by_security BOOLEAN := false;
BEGIN
  -- Safety pre-clean: Ensure no leftover link exists between Family Account 2 and Inmate A
  RESET ROLE;
  DELETE FROM public.family_offender_links
  WHERE family_account_id = '77777777-7777-7777-7777-777777777772' AND offender_id = 'A1234567';

  SELECT COUNT(*) INTO v_pre_check
  FROM public.family_offender_links
  WHERE family_account_id = '77777777-7777-7777-7777-777777777772' AND offender_id = 'A1234567';

  IF v_pre_check != 0 THEN
    RAISE EXCEPTION 'TEST 11 PRE-CHECK FAILED: Existing relationship link could not be cleaned.';
  END IF;

  PERFORM set_config('request.jwt.claims', '{"sub": "dddd4444-dddd-4444-dddd-444444444444", "role": "authenticated"}', true);
  SET LOCAL ROLE authenticated;

  -- Step 1: Prove valid link request with status = PENDING succeeds FIRST.
  -- This proves that the family user DOES possess table INSERT privileges, ensuring that
  -- subsequent approval rejection is truly enforced by security policy, not lack of table grants.
  v_rows_inserted_pending := 0;
  BEGIN
    INSERT INTO public.family_offender_links (family_account_id, offender_id, status, relationship)
    VALUES ('77777777-7777-7777-7777-777777777772', 'A1234567', 'PENDING', 'Friend');
    GET DIAGNOSTICS v_rows_inserted_pending = ROW_COUNT;
    IF v_rows_inserted_pending = 1 THEN
      v_pending_request_allowed := true;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_rows_inserted_pending := 0;
    v_pending_request_allowed := false;
  END;

  -- Step 2: Attempt self-approval elevation on existing link from PENDING to APPROVED
  -- Must be rejected by RLS policy (v_rows_updated = 0) or trigger (P0001) / RLS WITH CHECK (44000).
  -- A general table privilege denial (42501) is strictly rejected as proof!
  v_rows_updated := 0;
  v_elevation_err_code := '';
  v_elevation_err_msg := '';
  v_elevation_caught_by_security := false;
  BEGIN
    UPDATE public.family_offender_links
    SET status = 'APPROVED'
    WHERE family_account_id = '77777777-7777-7777-7777-777777777772' AND offender_id = 'A1234567';
    GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
  EXCEPTION WHEN OTHERS THEN
    v_rows_updated := 0;
    GET STACKED DIAGNOSTICS v_elevation_err_code = RETURNED_SQLSTATE, v_elevation_err_msg = MESSAGE_TEXT;
    IF (v_elevation_err_code IN ('P0001', '44000') OR v_elevation_err_msg ILIKE '%SECURITY VIOLATION%' OR v_elevation_err_msg ILIKE '%row-level security%')
       AND v_elevation_err_code != '42501' AND v_elevation_err_msg NOT ILIKE '%permission denied%' THEN
      v_elevation_caught_by_security := true;
    END IF;
  END;

  -- Step 3: Attempt direct insert of status = APPROVED on a new pair (Inmate B)
  -- Must fail via RLS WITH CHECK (44000) or trigger (P0001); 42501 is strictly rejected
  v_rows_inserted_approve := 0;
  v_err_code := '';
  v_err_msg := '';
  v_self_approve_blocked := false;
  BEGIN
    INSERT INTO public.family_offender_links (family_account_id, offender_id, status, relationship)
    VALUES ('77777777-7777-7777-7777-777777777772', 'B7654321', 'APPROVED', 'Friend');
    GET DIAGNOSTICS v_rows_inserted_approve = ROW_COUNT;
  EXCEPTION WHEN OTHERS THEN
    v_rows_inserted_approve := 0;
    GET STACKED DIAGNOSTICS v_err_code = RETURNED_SQLSTATE, v_err_msg = MESSAGE_TEXT;
    IF (v_err_code IN ('44000', 'P0001') OR v_err_msg ILIKE '%row-level security%' OR v_err_msg ILIKE '%SECURITY VIOLATION%')
       AND v_err_code != '42501' AND v_err_msg NOT ILIKE '%permission denied%' THEN
      v_self_approve_blocked := true;
    END IF;
  END;

  -- Step 4: Reset role to postgres and inspect actual stored database state
  RESET ROLE;

  SELECT status INTO v_stored_status
  FROM public.family_offender_links
  WHERE family_account_id = '77777777-7777-7777-7777-777777777772' AND offender_id = 'A1234567';

  -- Handle ROW_COUNT = 0 explicitly:
  -- The update is blocked if either a security exception was raised OR 0 rows were updated by RLS without generic 42501,
  -- AND the stored physical status must strictly remain 'PENDING'
  IF (v_elevation_caught_by_security OR (COALESCE(v_rows_updated, 0) = 0 AND v_elevation_err_code = ''))
     AND v_stored_status IS NOT DISTINCT FROM 'PENDING' THEN
    v_status_elevate_blocked := true;
  ELSE
    v_status_elevate_blocked := false;
  END IF;

  IF v_pre_check = 0 AND v_pending_request_allowed AND v_rows_inserted_pending = 1
     AND v_status_elevate_blocked AND v_self_approve_blocked AND COALESCE(v_rows_inserted_approve, 0) = 0 THEN
    INSERT INTO test_results VALUES (11, 'Family relationship links require institutional staff approval; self-approval strictly rejected', true,
      format('PENDING insert succeeded (ROW_COUNT=1); elevation blocked (ROW_COUNT=%s, security_exception=%s, physical status remains %s); direct APPROVED insert blocked [%s]',
             v_rows_updated, v_elevation_caught_by_security, v_stored_status, v_err_code));
  ELSE
    INSERT INTO test_results VALUES (11, 'Family relationship link integrity breached', false,
      format('Pre-check: %s, Pending allowed: %s (Rows: %s), Stored status: %s (Elevate blocked: %s, Rows updated: %s, Elevate err: %s), Direct approve blocked: %s (Direct err: %s)',
             v_pre_check, v_pending_request_allowed, v_rows_inserted_pending, v_stored_status, v_status_elevate_blocked, v_rows_updated, v_elevation_err_code, v_self_approve_blocked, v_err_code));
  END IF;
EXCEPTION WHEN OTHERS THEN
  RESET ROLE;
  INSERT INTO test_results VALUES (11, 'Family relationship test error', false, SQLERRM);
END $$;

-- ==============================================================================
-- TEST 11b: Family Links Facility Boundary on UPDATE and DELETE (Corrective RLS Verification)
-- ==============================================================================
DO $$
DECLARE
  v_fac1_link_pre INTEGER := 0;
  v_fac2_link_pre INTEGER := 0;
  v_cross_delete_blocked BOOLEAN := false;
  v_cross_update_blocked BOOLEAN := false;
  v_own_delete_allowed BOOLEAN := false;
  v_rows_affected INTEGER := 0;
  v_fac2_link_count INTEGER := 0;
  v_fac2_link_status TEXT;
  v_fac1_link_count INTEGER := 0;
BEGIN
  RESET ROLE;

  -- Setup: Ensure Link 1 (Facility 1 Offender A) and Link 2 (Facility 2 Offender B) exist
  DELETE FROM public.family_offender_links
  WHERE (family_account_id = '77777777-7777-7777-7777-777777777771' AND offender_id = 'A1234567')
     OR (family_account_id = '77777777-7777-7777-7777-777777777772' AND offender_id = 'B7654321');

  -- Elevate Facility 1 staff (v_staff_fac1_uid) to role 'ADMIN' for Facility 1 testing
  UPDATE public.user_profiles
  SET role = 'ADMIN'
  WHERE id = 'eeee5555-eeee-5555-eeee-555555555555';

  -- Set service_role claims to allow seeding approved and pending link fixtures
  PERFORM set_config('request.jwt.claims', '{"role": "service_role"}', true);

  INSERT INTO public.family_offender_links (family_account_id, offender_id, status, relationship)
  VALUES ('77777777-7777-7777-7777-777777777771', 'A1234567', 'APPROVED', 'Mother'),
         ('77777777-7777-7777-7777-777777777772', 'B7654321', 'PENDING', 'Cousin');

  RESET ROLE;

  -- Pre-Check: Verify both target fixtures exist before negative assertions
  SELECT COUNT(*) INTO v_fac1_link_pre
  FROM public.family_offender_links
  WHERE family_account_id = '77777777-7777-7777-7777-777777777771' AND offender_id = 'A1234567';

  SELECT COUNT(*) INTO v_fac2_link_pre
  FROM public.family_offender_links
  WHERE family_account_id = '77777777-7777-7777-7777-777777777772' AND offender_id = 'B7654321';

  IF v_fac1_link_pre != 1 OR v_fac2_link_pre != 1 THEN
    RAISE EXCEPTION 'TEST 11b PRE-CHECK FAILED: Required test links could not be prepared.';
  END IF;

  -- Case 1: Facility 1 Admin attempts to DELETE Link 2 (belonging to Facility 2 Offender B)
  PERFORM set_config('request.jwt.claims', '{"sub": "eeee5555-eeee-5555-eeee-555555555555", "role": "authenticated"}', true);
  SET LOCAL ROLE authenticated;

  v_rows_affected := 0;
  BEGIN
    DELETE FROM public.family_offender_links
    WHERE family_account_id = '77777777-7777-7777-7777-777777777772' AND offender_id = 'B7654321';
    GET DIAGNOSTICS v_rows_affected = ROW_COUNT;
  EXCEPTION WHEN OTHERS THEN
    v_rows_affected := 0;
  END;

  RESET ROLE;
  SELECT COUNT(*) INTO v_fac2_link_count
  FROM public.family_offender_links
  WHERE family_account_id = '77777777-7777-7777-7777-777777777772' AND offender_id = 'B7654321';

  IF COALESCE(v_rows_affected, 0) = 0 AND v_fac2_link_count = 1 THEN
    v_cross_delete_blocked := true;
  END IF;

  -- Case 2: Facility 1 Staff (Supervisor/Admin) attempts to UPDATE Link 2 (Facility 2 Offender B)
  PERFORM set_config('request.jwt.claims', '{"sub": "eeee5555-eeee-5555-eeee-555555555555", "role": "authenticated"}', true);
  SET LOCAL ROLE authenticated;

  v_rows_affected := 0;
  BEGIN
    UPDATE public.family_offender_links
    SET status = 'APPROVED'
    WHERE family_account_id = '77777777-7777-7777-7777-777777777772' AND offender_id = 'B7654321';
    GET DIAGNOSTICS v_rows_affected = ROW_COUNT;
  EXCEPTION WHEN OTHERS THEN
    v_rows_affected := 0;
  END;

  RESET ROLE;
  SELECT status INTO v_fac2_link_status
  FROM public.family_offender_links
  WHERE family_account_id = '77777777-7777-7777-7777-777777777772' AND offender_id = 'B7654321';

  IF COALESCE(v_rows_affected, 0) = 0 AND v_fac2_link_status = 'PENDING' THEN
    v_cross_update_blocked := true;
  END IF;

  -- Case 3: Authorized Facility 1 Admin DELETES Link 1 (within their own facility: Facility 1 Offender A)
  PERFORM set_config('request.jwt.claims', '{"sub": "eeee5555-eeee-5555-eeee-555555555555", "role": "authenticated"}', true);
  SET LOCAL ROLE authenticated;

  v_rows_affected := 0;
  BEGIN
    DELETE FROM public.family_offender_links
    WHERE family_account_id = '77777777-7777-7777-7777-777777777771' AND offender_id = 'A1234567';
    GET DIAGNOSTICS v_rows_affected = ROW_COUNT;
  EXCEPTION WHEN OTHERS THEN
    v_rows_affected := 0;
  END;

  RESET ROLE;
  SELECT COUNT(*) INTO v_fac1_link_count
  FROM public.family_offender_links
  WHERE family_account_id = '77777777-7777-7777-7777-777777777771' AND offender_id = 'A1234567';

  IF v_rows_affected = 1 AND v_fac1_link_count = 0 THEN
    v_own_delete_allowed := true;
  END IF;

  -- Cleanup & Restore:
  -- Re-insert Link 1 under service_role so subsequent tests retain standard state
  PERFORM set_config('request.jwt.claims', '{"role": "service_role"}', true);

  INSERT INTO public.family_offender_links (family_account_id, offender_id, status, relationship)
  VALUES ('77777777-7777-7777-7777-777777777771', 'A1234567', 'APPROVED', 'Mother')
  ON CONFLICT (family_account_id, offender_id) DO UPDATE SET status = 'APPROVED';

  PERFORM set_config('request.jwt.claims', '', true);

  -- Remove Link 2
  DELETE FROM public.family_offender_links
  WHERE family_account_id = '77777777-7777-7777-7777-777777777772' AND offender_id = 'B7654321';

  -- Restore Facility 1 staff role back to WAREHOUSE_PICKER
  UPDATE public.user_profiles
  SET role = 'WAREHOUSE_PICKER'
  WHERE id = 'eeee5555-eeee-5555-eeee-555555555555';

  IF v_cross_delete_blocked AND v_cross_update_blocked AND v_own_delete_allowed THEN
    INSERT INTO test_results VALUES (
      112,
      'Facility-scoped ADMIN/Staff restricted by facility boundary on DELETE/UPDATE; same-facility DELETE allowed',
      true,
      'Cross-facility delete blocked (0 rows); cross-facility update blocked (0 rows); same-facility delete succeeded (1 row)'
    );
  ELSE
    INSERT INTO test_results VALUES (
      112,
      'Facility boundary test on family links failed',
      false,
      format('Cross-facility delete blocked: %s, Cross-facility update blocked: %s, Own facility delete allowed: %s',
             v_cross_delete_blocked, v_cross_update_blocked, v_own_delete_allowed)
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  RESET ROLE;
  -- Restore role in case of exception
  UPDATE public.user_profiles SET role = 'WAREHOUSE_PICKER' WHERE id = 'eeee5555-eeee-5555-eeee-555555555555';
  INSERT INTO test_results VALUES (112, 'Family links facility boundary test error', false, SQLERRM);
END $$;

-- ==============================================================================
-- TEST 12: Inmate Order Placement Anti-Spoofing & Service Role Gate (RPC Security Verification)
-- ==============================================================================
DO $$
DECLARE
  v_inmate_a_bal_before NUMERIC(10, 2);
  v_inmate_b_bal_before NUMERIC(10, 2);
  v_inmate_a_bal_after NUMERIC(10, 2);
  v_inmate_b_bal_after NUMERIC(10, 2);
  v_inmate_b_bal_final NUMERIC(10, 2);
  v_order_res1 JSONB;
  v_order_res2 JSONB;
  v_order_res3 JSONB;
  v_order1_id UUID;
  v_order2_id UUID;
  v_order3_id UUID;
  v_order1_offender TEXT;
  v_order2_offender TEXT;
  v_order3_offender TEXT;
  v_one_arg_ok BOOLEAN := false;
  v_spoof_prevented BOOLEAN := false;
  v_balance_integrity_ok BOOLEAN := false;
  v_unauthorized_blocked BOOLEAN := false;
  v_anon_blocked BOOLEAN := false;
  v_service_role_null_blocked BOOLEAN := false;
  v_service_role_order_ok BOOLEAN := false;
  v_err_code TEXT := '';
  v_err_msg TEXT := '';
BEGIN
  RESET ROLE;

  -- 1. Snapshot initial balances as postgres before orders are submitted
  SELECT balance INTO v_inmate_a_bal_before FROM public.offenders WHERE id = 'A1234567';
  SELECT balance INTO v_inmate_b_bal_before FROM public.offenders WHERE id = 'B7654321';

  -- 2. Subtest A1: Standard 1-argument client invocation: place_inmate_order(p_items)
  -- Uses default NULL for p_offender_id. Identity must be derived from session (Inmate A).
  PERFORM set_config('request.jwt.claims', '{"sub": "aaaa1111-aaaa-1111-aaaa-111111111111", "role": "authenticated"}', true);
  SET LOCAL ROLE authenticated;

  v_order_res1 := public.place_inmate_order(
    jsonb_build_array(jsonb_build_object('productId', '88888888-8888-8888-8888-888888888881', 'quantity', 1))
  );
  v_order1_id := (v_order_res1->>'orderId')::UUID;

  -- 3. Subtest A2: 2-argument spoof attempt: Inmate A supplies p_offender_id = 'B7654321' (Inmate B)
  -- When auth.role() = 'authenticated', place_inmate_order must ignore the passed p_offender_id
  -- and strictly order for Inmate A.
  v_order_res2 := public.place_inmate_order(
    jsonb_build_array(jsonb_build_object('productId', '88888888-8888-8888-8888-888888888881', 'quantity', 1)),
    'B7654321'
  );
  v_order2_id := (v_order_res2->>'orderId')::UUID;

  -- 4. Reset role to postgres to verify physical database state
  RESET ROLE;

  SELECT offender_id INTO v_order1_offender FROM public.orders WHERE id = v_order1_id;
  SELECT offender_id INTO v_order2_offender FROM public.orders WHERE id = v_order2_id;
  SELECT balance INTO v_inmate_a_bal_after FROM public.offenders WHERE id = 'A1234567';
  SELECT balance INTO v_inmate_b_bal_after FROM public.offenders WHERE id = 'B7654321';

  -- Order 1 (1-arg) must belong to Inmate A
  IF v_order1_offender IS NOT DISTINCT FROM 'A1234567' THEN
    v_one_arg_ok := true;
  END IF;

  -- Order 2 (2-arg spoof attempt) must STILL belong to Inmate A ('A1234567'), NOT Inmate B ('B7654321')
  IF v_order2_offender IS NOT DISTINCT FROM 'A1234567' THEN
    v_spoof_prevented := true;
  END IF;

  -- Balance Integrity:
  -- Inmate A bought 2 items of $2.50 = $5.00 total ($82.50 -> $77.50).
  -- Inmate B's balance was completely UNTOUCHED (remains strictly at $50.00).
  IF v_inmate_a_bal_after = (v_inmate_a_bal_before - 5.00) AND v_inmate_b_bal_after = v_inmate_b_bal_before THEN
    v_balance_integrity_ok := true;
  END IF;

  -- 5. Subtest B: Authenticated Family User 1 attempts to call place_inmate_order() (must fail with UNAUTHORIZED)
  PERFORM set_config('request.jwt.claims', '{"sub": "cccc3333-cccc-3333-cccc-333333333333", "role": "authenticated"}', true);
  SET LOCAL ROLE authenticated;

  BEGIN
    PERFORM public.place_inmate_order(
      jsonb_build_array(jsonb_build_object('productId', '88888888-8888-8888-8888-888888888881', 'quantity', 1))
    );
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err_code = RETURNED_SQLSTATE, v_err_msg = MESSAGE_TEXT;
    IF v_err_msg ILIKE '%UNAUTHORIZED%' THEN
      v_unauthorized_blocked := true;
    END IF;
  END;

  -- 6. Subtest C: Anonymous (anon) caller attempts to invoke place_inmate_order() (must be denied)
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  SET LOCAL ROLE anon;

  BEGIN
    PERFORM public.place_inmate_order(
      jsonb_build_array(jsonb_build_object('productId', '88888888-8888-8888-8888-888888888881', 'quantity', 1))
    );
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err_code = RETURNED_SQLSTATE, v_err_msg = MESSAGE_TEXT;
    IF v_err_code = '42501' OR v_err_msg ILIKE '%UNAUTHORIZED%' OR v_err_msg ILIKE '%permission denied%' THEN
      v_anon_blocked := true;
    END IF;
  END;

  -- 7. Subtest D: Service Role Authorization Path Verification
  -- (Simulates trusted server route handler backend invocation)
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '{"role": "service_role"}', true);
  SET LOCAL ROLE service_role;

  -- D1: service_role calling place_inmate_order without offender_id must be rejected
  BEGIN
    PERFORM public.place_inmate_order(
      jsonb_build_array(jsonb_build_object('productId', '88888888-8888-8888-8888-888888888882', 'quantity', 1)),
      NULL
    );
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err_code = RETURNED_SQLSTATE, v_err_msg = MESSAGE_TEXT;
    IF v_err_msg ILIKE '%Offender ID is required%' THEN
      v_service_role_null_blocked := true;
    END IF;
  END;

  -- D2: service_role calling with valid offender_id (B7654321) places order for Inmate B
  -- Product 2 ($3.00) belongs to Facility 2 (Inmate B's facility)
  v_order_res3 := public.place_inmate_order(
    jsonb_build_array(jsonb_build_object('productId', '88888888-8888-8888-8888-888888888882', 'quantity', 1)),
    'B7654321'
  );
  v_order3_id := (v_order_res3->>'orderId')::UUID;

  RESET ROLE;
  SELECT offender_id INTO v_order3_offender FROM public.orders WHERE id = v_order3_id;
  SELECT balance INTO v_inmate_b_bal_final FROM public.offenders WHERE id = 'B7654321';

  IF v_order3_offender IS NOT DISTINCT FROM 'B7654321' AND v_inmate_b_bal_final = (v_inmate_b_bal_after - 3.00) THEN
    v_service_role_order_ok := true;
  END IF;

  IF v_one_arg_ok AND v_spoof_prevented AND v_balance_integrity_ok AND v_unauthorized_blocked AND v_anon_blocked AND v_service_role_null_blocked AND v_service_role_order_ok THEN
    INSERT INTO test_results VALUES (12, 'Inmate order placement anti-spoofing, balance integrity, and dual-mode role gates enforced', true,
      format('Inmate A 1-arg & 2-arg orders created ($%s -> $%s); Inmate B untouched until authorized service_role call ($%s -> $%s); Family and Anon rejected',
             v_inmate_a_bal_before, v_inmate_a_bal_after, v_inmate_b_bal_before, v_inmate_b_bal_final));
  ELSE
    INSERT INTO test_results VALUES (12, 'Inmate order placement security gate breached', false,
      format('1-arg: %s, Spoof prevented: %s, Bal integrity: %s, Family blocked: %s, Anon blocked: %s, ServiceRole null blocked: %s, ServiceRole order ok: %s',
             v_one_arg_ok, v_spoof_prevented, v_balance_integrity_ok, v_unauthorized_blocked, v_anon_blocked, v_service_role_null_blocked, v_service_role_order_ok));
  END IF;
EXCEPTION WHEN OTHERS THEN
  RESET ROLE;
  INSERT INTO test_results VALUES (12, 'Inmate order placement anti-spoof check error', false, SQLERRM);
END $$;

-- ==============================================================================
-- OUTPUT SUMMARY TABLE
-- ==============================================================================
SELECT
  test_num AS "#",
  test_name AS "Security Test Assertion",
  CASE WHEN passed THEN 'PASS' ELSE 'FAIL' END AS "Result",
  details AS "Verification Details"
FROM test_results
ORDER BY test_num ASC;

-- ==============================================================================
-- FINAL TEST RESULT ENFORCEMENT & INTEGRITY ASSERTION
-- ==============================================================================
DO $$
DECLARE
  v_failed_count INTEGER;
  v_total_count INTEGER;
  v_failed_tests TEXT;
BEGIN
  SELECT COUNT(*) INTO v_total_count FROM test_results;
  SELECT COUNT(*) INTO v_failed_count FROM test_results WHERE passed = false;

  IF v_total_count < 15 THEN
    RAISE EXCEPTION 'TEST SUITE INCOMPLETE: Expected 15 security test results, but only % were recorded.', v_total_count;
  END IF;

  IF v_failed_count > 0 THEN
    SELECT string_agg(format('Test %s (%s): %s', test_num, test_name, details), E'\n  ')
    INTO v_failed_tests
    FROM test_results
    WHERE passed = false;

    RAISE EXCEPTION E'SECURITY TEST SUITE FAILED: % of % tests failed:\n  %', v_failed_count, v_total_count, v_failed_tests;
  END IF;

  RAISE NOTICE 'ALL % SECURITY TESTS VERIFIED SUCCESSFULLY IN LOCAL SESSION.', v_total_count;
END $$;

-- ==============================================================================
-- ROLLBACK ALL TEST FIXTURES
-- ==============================================================================
-- NOTE: All table data changes strictly roll back here.
-- Sequence notice: Order placement in Test 12 internally calls nextval('public.order_number_seq');
-- sequence increments are non-transactional in PostgreSQL and will not be rolled back.
ROLLBACK;
