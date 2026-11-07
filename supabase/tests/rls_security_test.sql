-- ==============================================================================
-- CANTEEN CORNER — POSTGRESQL ROW LEVEL SECURITY (RLS) & ACCESS CONTROL TEST SUITE
-- ==============================================================================
-- This script tests true database-level RLS policies, column privileges,
-- security triggers, and RPC caller gating using PostgreSQL role switching.
--
-- TARGET ENVIRONMENT:
-- - Run in a LOCAL SUPABASE TEST ENVIRONMENT or a DEDICATED ISOLATED STAGING PROJECT.
-- - DO NOT run against a production database:
--   1. Sequence calls (nextval) are non-transactional and will NOT be rolled back.
--   2. Incomplete or interrupted execution could leave test fixtures in place.
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

-- 1. SETUP TEST FIXTURES
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
  v_dep1_id UUID := 'aaaaaaaa-1111-1111-1111-aaaaaaaaaaaa';
BEGIN
  RESET ROLE;
  PERFORM set_config('canteen.authorized_transaction', 'true', true);

  -- Insert Facilities
  INSERT INTO public.facilities (id, name, weekly_reset_day, max_weekly_spend)
  VALUES (v_fac1_id, 'Cumberland Regional Facility (Test)', 0, 100.00),
         (v_fac2_id, 'Westside Correctional Center (Test)', 1, 100.00)
  ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, max_weekly_spend = EXCLUDED.max_weekly_spend;

  -- Safety Verification: Ensure test emails do not collide with existing auth.users under different IDs
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'auth' AND tablename = 'users') THEN
    IF EXISTS (
      SELECT 1 FROM auth.users
      WHERE email IN (
        'test_inmate_a_rls@canteen.test', 'test_inmate_b_rls@canteen.test',
        'test_family_1_rls@canteen.test', 'test_family_2_rls@canteen.test',
        'test_staff_fac1_rls@canteen.test', 'test_staff_fac2_rls@canteen.test'
      )
      AND id NOT IN (
        v_inmate_a_uid, v_inmate_b_uid, v_family_1_uid,
        v_family_2_uid, v_staff_fac1_uid, v_staff_fac2_uid
      )
    ) THEN
      RAISE EXCEPTION 'SAFETY HALT: Unique email collision detected in auth.users with different user IDs. Test suite must run in an isolated test database.';
    END IF;

    -- Clean up prior test rows from previous aborted runs (strictly scoped to test UUIDs)
    DELETE FROM public.user_profiles WHERE id IN (v_inmate_a_uid, v_inmate_b_uid, v_family_1_uid, v_family_2_uid, v_staff_fac1_uid, v_staff_fac2_uid);
    DELETE FROM auth.users WHERE id IN (v_inmate_a_uid, v_inmate_b_uid, v_family_1_uid, v_family_2_uid, v_staff_fac1_uid, v_staff_fac2_uid);

    -- Create dummy auth users satisfying GoTrue schema constraints
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
         (v_staff_fac2_uid, v_fac2_id, 'WAREHOUSE_PICKER', 'Staff Facility 2 (Test)', 'test_staff_fac2_rls@canteen.test', true)
  ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, facility_id = EXCLUDED.facility_id, is_active = true;

  -- Insert Offenders
  INSERT INTO public.offenders (id, user_id, facility_id, name, unit, housing, pin_hash, balance, weekly_limit)
  VALUES ('A1234567', v_inmate_a_uid, v_fac1_id, 'Inmate A (Test)', 'Unit 1', 'Cell 101', crypt('1234', gen_salt('bf')), 82.50, 100.00),
         ('B7654321', v_inmate_b_uid, v_fac2_id, 'Inmate B (Test)', 'Unit 2', 'Cell 202', crypt('4321', gen_salt('bf')), 50.00, 100.00)
  ON CONFLICT (id) DO UPDATE SET balance = EXCLUDED.balance, user_id = EXCLUDED.user_id, facility_id = EXCLUDED.facility_id;

  -- Insert Family Accounts
  INSERT INTO public.family_accounts (id, user_id, relationship)
  VALUES (v_fam_acc1_id, v_family_1_uid, 'Mother'),
         (v_fam_acc2_id, v_family_2_uid, 'Friend')
  ON CONFLICT (id) DO UPDATE SET user_id = EXCLUDED.user_id;

  -- Explicit Family Link: Family User 1 is APPROVED for Inmate A ONLY. Family User 2 has NO approved links.
  INSERT INTO public.family_offender_links (family_account_id, offender_id, status, relationship)
  VALUES (v_fam_acc1_id, 'A1234567', 'APPROVED', 'Mother')
  ON CONFLICT (family_account_id, offender_id) DO UPDATE SET status = 'APPROVED';

  -- Insert Products
  INSERT INTO public.products (id, facility_id, sku, name, category, price, stock, active)
  VALUES (v_prod1_id, v_fac1_id, 'SKU-FAC1-01', 'Facility 1 Soap', 'Hygiene', 2.50, 100, true),
         (v_prod2_id, v_fac2_id, 'SKU-FAC2-01', 'Facility 2 Snack', 'Snacks', 3.00, 100, true)
  ON CONFLICT (sku) DO UPDATE SET price = EXCLUDED.price, stock = EXCLUDED.stock, active = true;

  -- Insert Orders
  INSERT INTO public.orders (id, order_number, facility_id, offender_id, status, subtotal, total, expected_delivery_date, barcode)
  VALUES (v_order1_id, '#CC-TEST1', v_fac1_id, 'A1234567', 'PROCESSING', 15.00, 15.00, now() + INTERVAL '2 days', 'BC-TEST1'),
         (v_order2_id, '#CC-TEST2', v_fac2_id, 'B7654321', 'PROCESSING', 20.00, 20.00, now() + INTERVAL '2 days', 'BC-TEST2')
  ON CONFLICT (order_number) DO UPDATE SET status = EXCLUDED.status, facility_id = EXCLUDED.facility_id;

  -- Insert Deposit
  INSERT INTO public.deposits (id, facility_id, offender_id, family_account_id, amount, total_paid, provider_ref, idempotency_key, status)
  VALUES (v_dep1_id, v_fac1_id, 'A1234567', v_fam_acc1_id, 25.00, 28.50, 'TP-TEST-001', 'idemp-test-001', 'SUCCEEDED')
  ON CONFLICT (provider_ref) DO UPDATE SET status = EXCLUDED.status;

  PERFORM set_config('canteen.authorized_transaction', 'false', true);
END $$;

-- ==============================================================================
-- TEST 1: Anonymous (anon) User Access Lockout (RLS Verification)
-- ==============================================================================
DO $$
DECLARE
  v_offender_count INTEGER;
  v_order_count INTEGER;
  v_audit_count INTEGER;
BEGIN
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  SET LOCAL ROLE anon;

  SELECT COUNT(*) INTO v_offender_count FROM public.offenders;
  SELECT COUNT(*) INTO v_order_count FROM public.orders;
  SELECT COUNT(*) INTO v_audit_count FROM public.audit_logs;

  RESET ROLE;
  IF v_offender_count = 0 AND v_order_count = 0 AND v_audit_count = 0 THEN
    INSERT INTO test_results VALUES (1, 'Anon role cannot query offenders, orders, or audit logs', true, 'All counts 0; RLS blocked anon visibility');
  ELSE
    INSERT INTO test_results VALUES (1, 'Anon role leaked private records', false, format('Offenders: %s, Orders: %s, Audit: %s', v_offender_count, v_order_count, v_audit_count));
  END IF;
EXCEPTION WHEN OTHERS THEN
  RESET ROLE;
  INSERT INTO test_results VALUES (1, 'Anon query failed with unexpected error', false, SQLERRM);
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
  -- Expected rejection: 42501 (column update privilege revoked) or P0001 (tamper trigger raised exception)
  IF v_blocked AND (v_err_code IN ('42501', 'P0001') OR v_err_msg ILIKE '%permission denied%' OR v_err_msg ILIKE '%SECURITY VIOLATION%') THEN
    INSERT INTO test_results VALUES (3, 'Inmate A direct balance modification blocked by column privilege/trigger', true, format('Blocked as expected [%s: %s]', v_err_code, v_err_msg));
  ELSE
    INSERT INTO test_results VALUES (3, 'Inmate A direct balance modification not blocked properly', false, format('Blocked: %s, Code: %s, Msg: %s', v_blocked, v_err_code, v_err_msg));
  END IF;
EXCEPTION WHEN OTHERS THEN
  RESET ROLE;
  INSERT INTO test_results VALUES (3, 'Direct balance update test error', false, SQLERRM);
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
  v_fac2_orders INTEGER;
  v_insert_blocked BOOLEAN := false;
  v_err_code TEXT := '';
  v_err_msg TEXT := '';
BEGIN
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '{"sub": "eeee5555-eeee-5555-eeee-555555555555", "role": "authenticated"}', true);
  SET LOCAL ROLE authenticated;

  -- Warehouse Picker Facility 1 must NEVER see orders from Facility 2
  SELECT COUNT(*) INTO v_fac2_orders FROM public.orders WHERE facility_id = '22222222-2222-2222-2222-222222222222';

  -- Verify WITH CHECK & Trigger: Warehouse Picker Facility 1 cannot insert picking list for Facility 2 order
  BEGIN
    INSERT INTO public.picking_lists (order_id, status)
    VALUES ('99999999-9999-9999-9999-999999999992', 'PENDING');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err_code = RETURNED_SQLSTATE, v_err_msg = MESSAGE_TEXT;
    v_insert_blocked := true;
  END;

  RESET ROLE;
  IF v_fac2_orders = 0 AND v_insert_blocked THEN
    INSERT INTO test_results VALUES (6, 'Warehouse Picker Facility 1 cannot see or create Facility 2 picking lists', true, format('Cross-facility segregation & WITH CHECK verified [%s]', v_err_code));
  ELSE
    INSERT INTO test_results VALUES (6, 'Warehouse Picker Facility 1 cross-facility isolation breached', false,
      format('Fac2 visible orders: %s, Insert blocked: %s', v_fac2_orders, v_insert_blocked));
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
  v_err_code TEXT := '';
  v_err_msg TEXT := '';
BEGIN
  -- Setup notification as postgres
  RESET ROLE;
  INSERT INTO public.notifications (id, offender_id, type, title, message, read)
  VALUES (v_notif_id, 'A1234567', 'TEST', 'Original Title', 'Original Message', false)
  ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, message = EXCLUDED.message, read = false;

  -- Switch to authenticated inmate
  PERFORM set_config('request.jwt.claims', '{"sub": "aaaa1111-aaaa-1111-aaaa-111111111111", "role": "authenticated"}', true);
  SET LOCAL ROLE authenticated;

  -- Attempt to modify notification title or message (must fail via column privilege revocation or trigger)
  BEGIN
    UPDATE public.notifications SET title = 'Forged Title' WHERE id = v_notif_id;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err_code = RETURNED_SQLSTATE, v_err_msg = MESSAGE_TEXT;
    v_tamper_blocked := true;
  END;

  -- Legitimate update: marking notification as read (must succeed)
  BEGIN
    UPDATE public.notifications SET read = true WHERE id = v_notif_id;
    v_read_updated := true;
  EXCEPTION WHEN OTHERS THEN
    v_read_updated := false;
  END;

  RESET ROLE;
  IF v_tamper_blocked AND v_read_updated THEN
    INSERT INTO test_results VALUES (7, 'Notification content tampering blocked while read status update is permitted', true, format('Tamper blocked [%s], Read status update succeeded', v_err_code));
  ELSE
    INSERT INTO test_results VALUES (7, 'Notification update integrity failed', false,
      format('Tamper blocked: %s, Read update succeeded: %s', v_tamper_blocked, v_read_updated));
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
  v_err_code TEXT := '';
  v_err_msg TEXT := '';
BEGIN
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '{"sub": "cccc3333-cccc-3333-cccc-333333333333", "role": "authenticated"}', true);
  SET LOCAL ROLE authenticated;

  -- Attempt to self-assign ADMIN role (must be rejected by column privilege revocation / trigger)
  BEGIN
    UPDATE public.user_profiles SET role = 'ADMIN' WHERE id = 'cccc3333-cccc-3333-cccc-333333333333';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err_code = RETURNED_SQLSTATE, v_err_msg = MESSAGE_TEXT;
    v_elevation_blocked := true;
  END;

  -- Allowed update: updating display name
  BEGIN
    UPDATE public.user_profiles SET name = 'Updated Family Name' WHERE id = 'cccc3333-cccc-3333-cccc-333333333333';
    v_name_updated := true;
  EXCEPTION WHEN OTHERS THEN
    v_name_updated := false;
  END;

  RESET ROLE;
  IF v_elevation_blocked AND v_name_updated THEN
    INSERT INTO test_results VALUES (10, 'Profile column permissions prevent role/status escalation while permitting name update', true, format('Role change blocked [%s], name update succeeded', v_err_code));
  ELSE
    INSERT INTO test_results VALUES (10, 'Profile update restriction failed', false, format('Elevation blocked: %s, Name updated: %s', v_elevation_blocked, v_name_updated));
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
  v_self_approve_blocked BOOLEAN := false;
  v_pending_request_allowed BOOLEAN := false;
  v_status_elevate_blocked BOOLEAN := false;
  v_stored_status TEXT;
  v_err_code TEXT := '';
  v_err_msg TEXT := '';
BEGIN
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '{"sub": "dddd4444-dddd-4444-dddd-444444444444", "role": "authenticated"}', true);
  SET LOCAL ROLE authenticated;

  -- Attempt 1: Insert link with status = APPROVED (Self-approval attack - must fail via RLS WITH CHECK or trigger)
  BEGIN
    INSERT INTO public.family_offender_links (family_account_id, offender_id, status, relationship)
    VALUES ('77777777-7777-7777-7777-777777777772', 'A1234567', 'APPROVED', 'Friend');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err_code = RETURNED_SQLSTATE, v_err_msg = MESSAGE_TEXT;
    v_self_approve_blocked := true;
  END;

  -- Attempt 2: Insert link with status = PENDING (Valid relationship request - must succeed)
  BEGIN
    INSERT INTO public.family_offender_links (family_account_id, offender_id, status, relationship)
    VALUES ('77777777-7777-7777-7777-777777777772', 'A1234567', 'PENDING', 'Friend');
    v_pending_request_allowed := true;
  EXCEPTION WHEN OTHERS THEN
    v_pending_request_allowed := false;
  END;

  -- Attempt 3: Try to elevate status from PENDING to APPROVED (Self-approval elevation attack)
  BEGIN
    UPDATE public.family_offender_links
    SET status = 'APPROVED'
    WHERE family_account_id = '77777777-7777-7777-7777-777777777772' AND offender_id = 'A1234567';
  EXCEPTION WHEN OTHERS THEN
    -- If an exception was raised, the trigger or permission blocked it
    v_status_elevate_blocked := true;
  END;

  -- Crucial Verification Step:
  -- Reset role to postgres (trusted superuser context) to bypass RLS and query the true physical state.
  -- A zero-row SELECT under authenticated RLS must NEVER be treated as proof of success.
  RESET ROLE;

  SELECT status INTO v_stored_status
  FROM public.family_offender_links
  WHERE family_account_id = '77777777-7777-7777-7777-777777777772' AND offender_id = 'A1234567';

  IF v_stored_status = 'PENDING' THEN
    -- The record physically exists and remained strictly PENDING
    v_status_elevate_blocked := true;
  ELSE
    -- If it became APPROVED (or was deleted/missing), elevation was not blocked
    v_status_elevate_blocked := false;
  END IF;

  IF v_self_approve_blocked AND v_pending_request_allowed AND v_status_elevate_blocked THEN
    INSERT INTO test_results VALUES (11, 'Family relationship links require institutional staff approval; self-approval strictly rejected', true, 'Direct APPROVED insert blocked; PENDING allowed; elevation to APPROVED blocked (verified status remains PENDING in database)');
  ELSE
    INSERT INTO test_results VALUES (11, 'Family relationship link integrity breached', false,
      format('Self-approve blocked: %s, Pending allowed: %s, Stored status: %s (Elevate blocked: %s)',
             v_self_approve_blocked, v_pending_request_allowed, v_stored_status, v_status_elevate_blocked));
  END IF;
EXCEPTION WHEN OTHERS THEN
  RESET ROLE;
  INSERT INTO test_results VALUES (11, 'Family relationship test error', false, SQLERRM);
END $$;

-- ==============================================================================
-- TEST 12: Sequence Monotonicity & Non-Transactional Side-Effect Audit (Static Check)
-- ==============================================================================
-- CLASSIFICATION: STATIC CHECK / NON-SECURITY TEST
-- AUDIT NOTICE: PostgreSQL sequence nextval() calls are strictly non-transactional
-- and will NOT roll back at the end of this script.
DO $$
DECLARE
  v_seq1 BIGINT;
  v_seq2 BIGINT;
BEGIN
  RESET ROLE;
  v_seq1 := nextval('public.order_number_seq');
  v_seq2 := nextval('public.order_number_seq');

  IF v_seq2 > v_seq1 THEN
    INSERT INTO test_results VALUES (12, '[STATIC CHECK] Atomic order sequence produces strictly monotonic numbers', true, format('Sequence stepped from %s to %s (Permanent sequence side-effect noted)', v_seq1, v_seq2));
  ELSE
    INSERT INTO test_results VALUES (12, '[STATIC CHECK] Order sequence collision detected', false, format('seq1: %s, seq2: %s', v_seq1, v_seq2));
  END IF;
EXCEPTION WHEN OTHERS THEN
  RESET ROLE;
  INSERT INTO test_results VALUES (12, '[STATIC CHECK] Sequence test error', false, SQLERRM);
END $$;

-- ==============================================================================
-- TEST 13: Inmate Order Placement Anti-Spoofing & Role Gate (RPC Security Verification)
-- ==============================================================================
DO $$
DECLARE
  v_inmate_a_bal_before NUMERIC(10, 2);
  v_inmate_b_bal_before NUMERIC(10, 2);
  v_inmate_a_bal_after NUMERIC(10, 2);
  v_inmate_b_bal_after NUMERIC(10, 2);
  v_order_res JSONB;
  v_created_order_id UUID;
  v_order_offender_id TEXT;
  v_spoof_prevented BOOLEAN := false;
  v_balance_integrity_ok BOOLEAN := false;
  v_unauthorized_blocked BOOLEAN := false;
  v_anon_blocked BOOLEAN := false;
  v_err_code TEXT := '';
  v_err_msg TEXT := '';
BEGIN
  RESET ROLE;

  -- 1. Snapshot balances as postgres before order placement
  SELECT balance INTO v_inmate_a_bal_before FROM public.offenders WHERE id = 'A1234567';
  SELECT balance INTO v_inmate_b_bal_before FROM public.offenders WHERE id = 'B7654321';

  -- 2. Subtest A: Authenticated Inmate A calls place_inmate_order attempting to spoof Inmate B (p_offender_id = 'B7654321')
  -- When auth.role() = 'authenticated', place_inmate_order ignores p_offender_id and strictly orders for Inmate A
  -- (derived from current_inmate_offender_id()).
  PERFORM set_config('request.jwt.claims', '{"sub": "aaaa1111-aaaa-1111-aaaa-111111111111", "role": "authenticated"}', true);
  SET LOCAL ROLE authenticated;

  v_order_res := public.place_inmate_order(
    jsonb_build_array(jsonb_build_object('productId', '88888888-8888-8888-8888-888888888881', 'quantity', 1)),
    'B7654321'
  );
  v_created_order_id := (v_order_res->>'orderId')::UUID;

  -- 3. Reset role to postgres to verify physical database state
  RESET ROLE;

  SELECT offender_id INTO v_order_offender_id FROM public.orders WHERE id = v_created_order_id;
  SELECT balance INTO v_inmate_a_bal_after FROM public.offenders WHERE id = 'A1234567';
  SELECT balance INTO v_inmate_b_bal_after FROM public.offenders WHERE id = 'B7654321';

  -- Confirm the order belongs to Inmate A ('A1234567') and NOT Inmate B ('B7654321')
  IF v_order_offender_id = 'A1234567' THEN
    v_spoof_prevented := true;
  END IF;

  -- Confirm Inmate A's balance was deducted ($2.50 for soap: 82.50 -> 80.00)
  -- and Inmate B's balance was completely UNTOUCHED (remains 50.00)
  IF v_inmate_a_bal_after = (v_inmate_a_bal_before - 2.50) AND v_inmate_b_bal_after = v_inmate_b_bal_before THEN
    v_balance_integrity_ok := true;
  END IF;

  -- 4. Subtest B: Authenticated Family User 1 attempts to call place_inmate_order() (must fail with UNAUTHORIZED)
  PERFORM set_config('request.jwt.claims', '{"sub": "cccc3333-cccc-3333-cccc-333333333333", "role": "authenticated"}', true);
  SET LOCAL ROLE authenticated;

  BEGIN
    PERFORM public.place_inmate_order(
      jsonb_build_array(jsonb_build_object('productId', '88888888-8888-8888-8888-888888888881', 'quantity', 1)),
      'A1234567'
    );
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err_code = RETURNED_SQLSTATE, v_err_msg = MESSAGE_TEXT;
    IF v_err_msg ILIKE '%UNAUTHORIZED%' THEN
      v_unauthorized_blocked := true;
    END IF;
  END;

  -- 5. Subtest C: Anonymous (anon) caller attempts to invoke place_inmate_order() (must be denied)
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  SET LOCAL ROLE anon;

  BEGIN
    PERFORM public.place_inmate_order(
      jsonb_build_array(jsonb_build_object('productId', '88888888-8888-8888-8888-888888888881', 'quantity', 1)),
      'A1234567'
    );
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err_code = RETURNED_SQLSTATE, v_err_msg = MESSAGE_TEXT;
    -- Blocked either by grant revocation (42501) or caller role check
    IF v_err_code = '42501' OR v_err_msg ILIKE '%UNAUTHORIZED%' OR v_err_msg ILIKE '%permission denied%' THEN
      v_anon_blocked := true;
    END IF;
  END;

  RESET ROLE;
  IF v_spoof_prevented AND v_balance_integrity_ok AND v_unauthorized_blocked AND v_anon_blocked THEN
    INSERT INTO test_results VALUES (13, 'Inmate order placement anti-spoofing, balance integrity, and role gates enforced', true,
      format('Spoofed ID ignored (order assigned to A1234567); Inmate A debited $2.50 (bal: $%s -> $%s); Inmate B untouched ($%s); Family and Anon rejected',
             v_inmate_a_bal_before, v_inmate_a_bal_after, v_inmate_b_bal_after));
  ELSE
    INSERT INTO test_results VALUES (13, 'Inmate order placement security gate breached', false,
      format('Spoof prevented: %s, Balance integrity: %s (A: %s->%s, B: %s->%s), Family blocked: %s, Anon blocked: %s',
             v_spoof_prevented, v_balance_integrity_ok, v_inmate_a_bal_before, v_inmate_a_bal_after, v_inmate_b_bal_before, v_inmate_b_bal_after, v_unauthorized_blocked, v_anon_blocked));
  END IF;
EXCEPTION WHEN OTHERS THEN
  RESET ROLE;
  INSERT INTO test_results VALUES (13, 'Inmate order placement anti-spoof check error', false, SQLERRM);
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
-- ROLLBACK ALL TEST FIXTURES
-- ==============================================================================
-- WARNING: All database table changes roll back here.
-- Sequence increments generated by nextval() in Tests 12 and 13 persist permanently.
ROLLBACK;
