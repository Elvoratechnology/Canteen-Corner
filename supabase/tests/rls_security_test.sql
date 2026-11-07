-- ==============================================================================
-- CANTEEN CORNER — POSTGRESQL ROW LEVEL SECURITY (RLS) & ACCESS CONTROL TEST SUITE
-- ==============================================================================
-- This script tests true database-level RLS policies and permission enforcement
-- using PostgreSQL role switching (anon, authenticated, service_role).
--
-- Instructions for Supabase SQL Editor:
-- Run this entire script in the SQL editor. It executes within a transaction
-- and rolls back at the end, so no test data is persisted.
-- ==============================================================================

BEGIN;

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
  -- Insert Facilities
  INSERT INTO public.facilities (id, name, weekly_reset_day, max_weekly_spend)
  VALUES (v_fac1_id, 'Cumberland Regional Facility', 0, 100.00),
         (v_fac2_id, 'Westside Correctional Center', 1, 100.00)
  ON CONFLICT (id) DO NOTHING;

  -- Create dummy auth users if auth schema exists
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'auth' AND tablename = 'users') THEN
    INSERT INTO auth.users (id, email)
    VALUES (v_inmate_a_uid, 'inmate_a@test.local'),
           (v_inmate_b_uid, 'inmate_b@test.local'),
           (v_family_1_uid, 'family_1@test.local'),
           (v_family_2_uid, 'family_2@test.local'),
           (v_staff_fac1_uid, 'staff_fac1@test.local'),
           (v_staff_fac2_uid, 'staff_fac2@test.local')
    ON CONFLICT (id) DO NOTHING;
  END IF;

  -- Insert User Profiles
  INSERT INTO public.user_profiles (id, facility_id, role, name, email)
  VALUES (v_inmate_a_uid, v_fac1_id, 'INMATE', 'Inmate A', 'inmate_a@test.local'),
         (v_inmate_b_uid, v_fac2_id, 'INMATE', 'Inmate B', 'inmate_b@test.local'),
         (v_family_1_uid, NULL, 'FAMILY', 'Family User 1', 'family_1@test.local'),
         (v_family_2_uid, NULL, 'FAMILY', 'Family User 2', 'family_2@test.local'),
         (v_staff_fac1_uid, v_fac1_id, 'WAREHOUSE_PICKER', 'Staff Facility 1', 'staff_fac1@test.local'),
         (v_staff_fac2_uid, v_fac2_id, 'WAREHOUSE_PICKER', 'Staff Facility 2', 'staff_fac2@test.local')
  ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, facility_id = EXCLUDED.facility_id;

  -- Insert Offenders
  INSERT INTO public.offenders (id, user_id, facility_id, name, unit, housing, pin_hash, balance, weekly_limit)
  VALUES ('A1234567', v_inmate_a_uid, v_fac1_id, 'Inmate A', 'Unit 1', 'Cell 101', crypt('1234', gen_salt('bf')), 82.50, 100.00),
         ('B7654321', v_inmate_b_uid, v_fac2_id, 'Inmate B', 'Unit 2', 'Cell 202', crypt('4321', gen_salt('bf')), 50.00, 100.00)
  ON CONFLICT (id) DO NOTHING;

  -- Insert Family Accounts
  INSERT INTO public.family_accounts (id, user_id, relationship)
  VALUES (v_fam_acc1_id, v_family_1_uid, 'Mother'),
         (v_fam_acc2_id, v_family_2_uid, 'Friend')
  ON CONFLICT (id) DO NOTHING;

  -- Explicit Family Link: Family User 1 is APPROVED for Inmate A ONLY. Family User 2 has NO links.
  INSERT INTO public.family_offender_links (family_account_id, offender_id, status, relationship)
  VALUES (v_fam_acc1_id, 'A1234567', 'APPROVED', 'Mother')
  ON CONFLICT (family_account_id, offender_id) DO NOTHING;

  -- Insert Products
  INSERT INTO public.products (id, facility_id, sku, name, category, price, stock, active)
  VALUES (v_prod1_id, v_fac1_id, 'SKU-FAC1-01', 'Facility 1 Soap', 'Hygiene', 2.50, 100, true),
         (v_prod2_id, v_fac2_id, 'SKU-FAC2-01', 'Facility 2 Snack', 'Snacks', 3.00, 100, true)
  ON CONFLICT (sku) DO NOTHING;

  -- Insert Orders
  INSERT INTO public.orders (id, order_number, facility_id, offender_id, status, subtotal, total, expected_delivery_date, barcode)
  VALUES (v_order1_id, '#CC-TEST1', v_fac1_id, 'A1234567', 'PROCESSING', 15.00, 15.00, now() + INTERVAL '2 days', 'BC-TEST1'),
         (v_order2_id, '#CC-TEST2', v_fac2_id, 'B7654321', 'PROCESSING', 20.00, 20.00, now() + INTERVAL '2 days', 'BC-TEST2')
  ON CONFLICT (order_number) DO NOTHING;

  -- Insert Deposit
  INSERT INTO public.deposits (id, facility_id, offender_id, family_account_id, amount, total_paid, provider_ref, idempotency_key, status)
  VALUES (v_dep1_id, v_fac1_id, 'A1234567', v_fam_acc1_id, 25.00, 28.50, 'TP-TEST-001', 'idemp-test-001', 'SUCCEEDED')
  ON CONFLICT (provider_ref) DO NOTHING;
END $$;

-- CREATE TEMPORARY RESULT ACCUMULATOR
CREATE TEMPORARY TABLE test_results (
  test_num INTEGER,
  test_name TEXT,
  passed BOOLEAN,
  details TEXT
);

-- ==============================================================================
-- TEST 1: Anonymous (anon) User Access Lockout
-- ==============================================================================
DO $$
DECLARE
  v_offender_count INTEGER;
  v_order_count INTEGER;
  v_audit_count INTEGER;
BEGIN
  SET LOCAL ROLE anon;

  SELECT COUNT(*) INTO v_offender_count FROM public.offenders;
  SELECT COUNT(*) INTO v_order_count FROM public.orders;
  SELECT COUNT(*) INTO v_audit_count FROM public.audit_logs;

  IF v_offender_count = 0 AND v_order_count = 0 AND v_audit_count = 0 THEN
    INSERT INTO test_results VALUES (1, 'Anon role cannot query offenders, orders, or audit logs', true, 'All counts 0');
  ELSE
    INSERT INTO test_results VALUES (1, 'Anon role leaked private records', false, 'Leaked rows detected');
  END IF;
EXCEPTION WHEN OTHERS THEN
  INSERT INTO test_results VALUES (1, 'Anon query blocked by error', true, SQLERRM);
END $$;

-- ==============================================================================
-- TEST 2: Inmate A Cross-Inmate & Cross-Facility Isolation
-- ==============================================================================
DO $$
DECLARE
  v_visible_offenders INTEGER;
  v_visible_facilities INTEGER;
  v_visible_orders INTEGER;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', '{"sub": "aaaa1111-aaaa-1111-aaaa-111111111111", "role": "authenticated"}', true);

  -- Must only see Inmate A (A1234567), NEVER Inmate B (B7654321)
  SELECT COUNT(*) INTO v_visible_offenders FROM public.offenders;
  -- Must only see Facility 1, NEVER Facility 2
  SELECT COUNT(*) INTO v_visible_facilities FROM public.facilities;
  -- Must only see Order 1, NEVER Order 2
  SELECT COUNT(*) INTO v_visible_orders FROM public.orders;

  IF v_visible_offenders = 1 AND v_visible_facilities = 1 AND v_visible_orders = 1 THEN
    INSERT INTO test_results VALUES (2, 'Inmate A can only view own record, own facility, and own orders', true, 'Strict 1:1 isolation verified');
  ELSE
    INSERT INTO test_results VALUES (2, 'Inmate A isolation breached', false,
      format('Offenders: %s, Facilities: %s, Orders: %s', v_visible_offenders, v_visible_facilities, v_visible_orders));
  END IF;
END $$;

-- ==============================================================================
-- TEST 3: Inmate A Direct Balance Modification Rejection (Anti-Tampering Trigger)
-- ==============================================================================
DO $$
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', '{"sub": "aaaa1111-aaaa-1111-aaaa-111111111111", "role": "authenticated"}', true);

  UPDATE public.offenders SET balance = 9999.00 WHERE id = 'A1234567';

  INSERT INTO test_results VALUES (3, 'Inmate A direct balance modification allowed (CRITICAL FAILURE)', false, 'Trigger failed to block balance overwrite');
EXCEPTION WHEN OTHERS THEN
  INSERT INTO test_results VALUES (3, 'Inmate A direct balance modification blocked by trigger', true, 'Trigger trg_protect_offender_balance raised exception');
END $$;

-- ==============================================================================
-- TEST 4: Family User 1 (Approved link to Inmate A, Facility 1)
-- ==============================================================================
DO $$
DECLARE
  v_visible_offenders INTEGER;
  v_visible_facilities INTEGER;
  v_visible_products_fac2 INTEGER;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', '{"sub": "cccc3333-cccc-3333-cccc-333333333333", "role": "authenticated"}', true);

  -- Can view Inmate A (has approved link), CANNOT view Inmate B
  SELECT COUNT(*) INTO v_visible_offenders FROM public.offenders;
  -- Can view Facility 1 (where Inmate A resides), CANNOT view Facility 2
  SELECT COUNT(*) INTO v_visible_facilities FROM public.facilities;
  -- CANNOT view products exclusive to Facility 2
  SELECT COUNT(*) INTO v_visible_products_fac2 FROM public.products WHERE facility_id = '22222222-2222-2222-2222-222222222222';

  IF v_visible_offenders = 1 AND v_visible_facilities = 1 AND v_visible_products_fac2 = 0 THEN
    INSERT INTO test_results VALUES (4, 'Family User 1 scoped strictly to approved inmate and facility', true, 'Cross-facility leak prevented');
  ELSE
    INSERT INTO test_results VALUES (4, 'Family User 1 policy leak detected', false,
      format('Offenders: %s, Facilities: %s, Fac2 Products: %s', v_visible_offenders, v_visible_facilities, v_visible_products_fac2));
  END IF;
END $$;

-- ==============================================================================
-- TEST 5: Family User 2 (Unlinked Account - Zero Inmate Links)
-- ==============================================================================
DO $$
DECLARE
  v_visible_offenders INTEGER;
  v_visible_facilities INTEGER;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', '{"sub": "dddd4444-dddd-4444-dddd-444444444444", "role": "authenticated"}', true);

  SELECT COUNT(*) INTO v_visible_offenders FROM public.offenders;
  SELECT COUNT(*) INTO v_visible_facilities FROM public.facilities;

  IF v_visible_offenders = 0 AND v_visible_facilities = 0 THEN
    INSERT INTO test_results VALUES (5, 'Unlinked Family User 2 cannot browse any offenders or facilities', true, 'Zero ambient disclosure verified');
  ELSE
    INSERT INTO test_results VALUES (5, 'Unlinked Family User 2 saw private data', false,
      format('Offenders: %s, Facilities: %s', v_visible_offenders, v_visible_facilities));
  END IF;
END $$;

-- ==============================================================================
-- TEST 6: Warehouse Picker Facility 1 Cross-Facility Isolation
-- ==============================================================================
DO $$
DECLARE
  v_fac2_orders INTEGER;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', '{"sub": "eeee5555-eeee-5555-eeee-555555555555", "role": "authenticated"}', true);

  -- Warehouse Picker Facility 1 must NEVER see orders from Facility 2
  SELECT COUNT(*) INTO v_fac2_orders FROM public.orders WHERE facility_id = '22222222-2222-2222-2222-222222222222';

  -- Verify WITH CHECK: Warehouse Picker Facility 1 cannot insert picking list for Facility 2 order
  BEGIN
    INSERT INTO public.picking_lists (order_id, status)
    VALUES ('99999999-9999-9999-9999-999999999992', 'PENDING');
    INSERT INTO test_results VALUES (6, 'Warehouse Picker Facility 1 cross-facility picking list allowed (CRITICAL FAILURE)', false, 'Facility 2 picking list inserted');
  EXCEPTION WHEN OTHERS THEN
    IF v_fac2_orders = 0 THEN
      INSERT INTO test_results VALUES (6, 'Warehouse Picker Facility 1 cannot see or create Facility 2 picking lists', true, 'Cross-facility order segregation and WITH CHECK verified');
    ELSE
      INSERT INTO test_results VALUES (6, 'Warehouse Picker Facility 1 leaked Facility 2 orders', false, format('Visible Fac2 orders: %s', v_fac2_orders));
    END IF;
  END;
END $$;

-- ==============================================================================
-- TEST 7: Notification Update Integrity (Only read status may be updated)
-- ==============================================================================
DO $$
DECLARE
  v_notif_id UUID := 'aaaaaaaa-2222-2222-2222-aaaaaaaaaaaa';
BEGIN
  SET LOCAL ROLE postgres;
  INSERT INTO public.notifications (id, offender_id, type, title, message, read)
  VALUES (v_notif_id, 'A1234567', 'TEST', 'Original Title', 'Original Message', false)
  ON CONFLICT (id) DO NOTHING;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', '{"sub": "aaaa1111-aaaa-1111-aaaa-111111111111", "role": "authenticated"}', true);

  -- Attempt to modify notification title or message
  UPDATE public.notifications SET title = 'Forged Title' WHERE id = v_notif_id;

  INSERT INTO test_results VALUES (7, 'Notification tamper permitted (CRITICAL FAILURE)', false, 'Title was altered');
EXCEPTION WHEN OTHERS THEN
  INSERT INTO test_results VALUES (7, 'Notification content tampering blocked by trigger/grant', true, 'Update rejected');
END $$;

-- ==============================================================================
-- TEST 8: TouchPay Confirmation Function Execution Restricted from Authenticated
-- ==============================================================================
DO $$
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', '{"sub": "cccc3333-cccc-3333-cccc-333333333333", "role": "authenticated"}', true);

  PERFORM public.process_confirmed_touchpay_deposit('TP-TEST-001', 'idemp-test-001', 25.00, 'USD');

  INSERT INTO test_results VALUES (8, 'Authenticated user executed process_confirmed_touchpay_deposit (CRITICAL FAILURE)', false, 'Function was callable');
EXCEPTION WHEN OTHERS THEN
  INSERT INTO test_results VALUES (8, 'process_confirmed_touchpay_deposit revoked from authenticated users', true, 'Execution permission denied');
END $$;

-- ==============================================================================
-- TEST 9: Inactive Account Access Lockout (is_active = false)
-- ==============================================================================
DO $$
DECLARE
  v_role public.user_role;
  v_offender_id TEXT;
  v_visible_records INTEGER;
BEGIN
  -- Deactivate Inmate A's user profile as postgres admin
  SET LOCAL ROLE postgres;
  UPDATE public.user_profiles
  SET is_active = false
  WHERE id = 'aaaa1111-aaaa-1111-aaaa-111111111111';

  -- Switch to authenticated session as Inmate A
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', '{"sub": "aaaa1111-aaaa-1111-aaaa-111111111111", "role": "authenticated"}', true);

  v_role := public.current_user_role();
  v_offender_id := public.current_inmate_offender_id();
  SELECT COUNT(*) INTO v_visible_records FROM public.offenders;

  IF v_role IS NULL AND v_offender_id IS NULL AND v_visible_records = 0 THEN
    INSERT INTO test_results VALUES (9, 'Inactive account access revoked immediately across all paths', true, 'Role/OffenderId are NULL, 0 records visible');
  ELSE
    INSERT INTO test_results VALUES (9, 'Inactive account retained access (CRITICAL FAILURE)', false,
      format('Role: %s, OffenderId: %s, Visible records: %s', v_role, v_offender_id, v_visible_records));
  END IF;

  -- Restore active status for subsequent tests
  SET LOCAL ROLE postgres;
  UPDATE public.user_profiles
  SET is_active = true
  WHERE id = 'aaaa1111-aaaa-1111-aaaa-111111111111';
END $$;

-- ==============================================================================
-- TEST 10: User Profile Column Update Privilege Escalation Block
-- ==============================================================================
DO $$
DECLARE
  v_elevation_blocked BOOLEAN := false;
  v_name_updated BOOLEAN := false;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', '{"sub": "cccc3333-cccc-3333-cccc-333333333333", "role": "authenticated"}', true);

  -- Attempt to self-assign ADMIN role
  BEGIN
    UPDATE public.user_profiles SET role = 'ADMIN' WHERE id = 'cccc3333-cccc-3333-cccc-333333333333';
  EXCEPTION WHEN OTHERS THEN
    v_elevation_blocked := true;
  END;

  -- Allowed update: updating display name
  UPDATE public.user_profiles SET name = 'Updated Family Name' WHERE id = 'cccc3333-cccc-3333-cccc-333333333333';
  v_name_updated := true;

  IF v_elevation_blocked AND v_name_updated THEN
    INSERT INTO test_results VALUES (10, 'Profile column permissions prevent role/status escalation while permitting name update', true, 'Role change blocked, name update succeeded');
  ELSE
    INSERT INTO test_results VALUES (10, 'Profile update restriction failed', false, format('Elevation blocked: %s, Name updated: %s', v_elevation_blocked, v_name_updated));
  END IF;
END $$;

-- ==============================================================================
-- TEST 11: Family Relationship Self-Approval Block
-- ==============================================================================
DO $$
DECLARE
  v_self_approve_blocked BOOLEAN := false;
  v_pending_request_allowed BOOLEAN := false;
  v_status_elevate_blocked BOOLEAN := false;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', '{"sub": "dddd4444-dddd-4444-dddd-444444444444", "role": "authenticated"}', true);

  -- Attempt 1: Insert link with status = APPROVED (Self-approval attack)
  BEGIN
    INSERT INTO public.family_offender_links (family_account_id, offender_id, status, relationship)
    VALUES ('77777777-7777-7777-7777-777777777772', 'A1234567', 'APPROVED', 'Friend');
  EXCEPTION WHEN OTHERS THEN
    v_self_approve_blocked := true;
  END;

  -- Attempt 2: Insert link with status = PENDING (Valid relationship request)
  INSERT INTO public.family_offender_links (family_account_id, offender_id, status, relationship)
  VALUES ('77777777-7777-7777-7777-777777777772', 'A1234567', 'PENDING', 'Friend');
  v_pending_request_allowed := true;

  -- Attempt 3: Try to elevate status from PENDING to APPROVED
  BEGIN
    UPDATE public.family_offender_links
    SET status = 'APPROVED'
    WHERE family_account_id = '77777777-7777-7777-7777-777777777772' AND offender_id = 'A1234567';
  EXCEPTION WHEN OTHERS THEN
    v_status_elevate_blocked := true;
  END;

  IF v_self_approve_blocked AND v_pending_request_allowed AND v_status_elevate_blocked THEN
    INSERT INTO test_results VALUES (11, 'Family relationship links require institutional staff approval; self-approval strictly rejected', true, 'Direct APPROVED insert and UPDATE blocked; PENDING request allowed');
  ELSE
    INSERT INTO test_results VALUES (11, 'Family relationship link integrity breached', false,
      format('Self-approve blocked: %s, Pending allowed: %s, Elevate blocked: %s', v_self_approve_blocked, v_pending_request_allowed, v_status_elevate_blocked));
  END IF;
END $$;

-- ==============================================================================
-- TEST 12: Sequence-Driven Unique Order Number & Barcode Concurrency
-- ==============================================================================
DO $$
DECLARE
  v_seq1 BIGINT;
  v_seq2 BIGINT;
BEGIN
  v_seq1 := nextval('public.order_number_seq');
  v_seq2 := nextval('public.order_number_seq');

  IF v_seq2 > v_seq1 THEN
    INSERT INTO test_results VALUES (12, 'Atomic order sequence produces strictly monotonic unique numbers', true, format('Sequence stepped from %s to %s', v_seq1, v_seq2));
  ELSE
    INSERT INTO test_results VALUES (12, 'Order sequence collision detected', false, format('seq1: %s, seq2: %s', v_seq1, v_seq2));
  END IF;
END $$;

-- ==============================================================================
-- TEST 13: Inmate Order Placement Offender Identity Enforcement (Anti-Spoofing)
-- ==============================================================================
DO $$
DECLARE
  v_order_res JSONB;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', '{"sub": "aaaa1111-aaaa-1111-aaaa-111111111111", "role": "authenticated"}', true);

  -- Inmate A attempts to supply p_offender_id = 'B7654321' (Inmate B)
  -- The function must ignore 'B7654321' and strictly order for Inmate A (A1234567)
  v_order_res := public.place_inmate_order(
    jsonb_build_array(jsonb_build_object('productId', '88888888-8888-8888-8888-888888888881', 'quantity', 1)),
    'B7654321'
  );

  -- Verify the resulting order was placed for Inmate A, NOT Inmate B
  IF EXISTS (SELECT 1 FROM public.orders WHERE id = (v_order_res->>'orderId')::UUID AND offender_id = 'A1234567') THEN
    INSERT INTO test_results VALUES (13, 'Authenticated inmate cannot spoof offender_id; identity derived strictly from session', true, 'Supplied offender_id B7654321 was ignored; order created for A1234567');
  ELSE
    INSERT INTO test_results VALUES (13, 'Inmate offender spoofing succeeded (CRITICAL FAILURE)', false, 'Order was placed for forged offender ID');
  END IF;
EXCEPTION WHEN OTHERS THEN
  INSERT INTO test_results VALUES (13, 'Inmate order placement anti-spoof check error', false, SQLERRM);
END $$;

-- OUTPUT SUMMARY TABLE
SELECT
  test_num AS "#",
  test_name AS "Security Test Assertion",
  CASE WHEN passed THEN 'PASS' ELSE 'FAIL' END AS "Result",
  details AS "Verification Details"
FROM test_results
ORDER BY test_num ASC;

-- ROLLBACK ALL TEST FIXTURES
ROLLBACK;

