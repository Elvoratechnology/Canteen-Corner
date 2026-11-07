import { createClient } from '@supabase/supabase-js';

/**
 * Privileged Admin Supabase Client.
 * 
 * SECURITY MANDATES:
 * 1. This client bypasses Row Level Security (RLS) using SUPABASE_SERVICE_ROLE_KEY.
 * 2. It MUST ONLY be imported in trusted, server-side backend operations
 *    (e.g., verifying cryptographic TouchPay payment gateway webhooks, background schedulers).
 * 3. NEVER expose SUPABASE_SERVICE_ROLE_KEY to the browser or prefix with NEXT_PUBLIC_.
 */
export function createAdminClient() {
  if (typeof window !== 'undefined') {
    throw new Error('SECURITY VIOLATION: createAdminClient called in a browser environment!');
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      'Missing Supabase privileged configuration (SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY).'
    );
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

