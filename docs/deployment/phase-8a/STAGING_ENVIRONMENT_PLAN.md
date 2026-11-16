# Canteen Corner — Staging Environment Architecture & Security Plan
**Phase:** 8A — PostgreSQL Compatibility Preparation  
**Target Platform:** Supabase PostgreSQL (Staging Project) & Vercel (Preview Deployment)  
**Security Level:** HIGH (Synthetic Data Only — Institutional Isolation)  

---

## 1. Staging Environment Purpose & Core Principles

The staging environment serves as the realistic pre-production staging ground for QA, load testing, and client demonstrations.

### Mandatory Security Directives:
1. **100% Synthetic Data:** No real inmate names, offender identification numbers, social security numbers, or real family addresses may ever be loaded into staging.
2. **Zero Real Financial Processing:** Real credit cards, debit cards, or live bank accounts must never be processed in staging. Stripe and PayPal must strictly operate in Sandbox/Test Mode.
3. **Dedicated Staging Isolation:** Staging must reside in an entirely separate Supabase organization/project and Vercel project from production. They must never share a database, API keys, or JWT secrets.
4. **Audit Logging Active:** All simulated administrative adjustments, login attempts, and order states must be recorded in `public.audit_logs`.

---

## 2. Environment Configuration Matrix

Every environment variable required by the application was verified and classified:

| Variable Name | Required In Staging | Target Staging Value / Format | Security Classification | Purpose / Usage |
| :--- | :--- | :--- | :--- | :--- |
| `DATABASE_URL` | **YES** | `postgresql://postgres:[PW]@[STAGING-HOST]:6543/postgres?pgbouncer=true` | **CRITICAL (Secret)** | Application runtime queries via PgBouncer |
| `DIRECT_URL` | **YES** | `postgresql://postgres:[PW]@[STAGING-HOST]:5432/postgres` | **CRITICAL (Secret)** | Prisma DDL migrations (bypasses PgBouncer) |
| `JWT_SECRET` | **YES** | 64-character random hex string | **CRITICAL (Secret)** | Signs/verifies HttpOnly `canteen_session` cookies |
| `NODE_ENV` | **YES** | `staging` or `production` | Low | Disables dev debug endpoints; activates guards |
| `NEXT_PUBLIC_APP_URL` | Optional | `https://staging.canteen-corner.app` | Low | Canonical URL for absolute link generation |
| `STRIPE_SECRET_KEY` | **YES** | `sk_test_...` | **CRITICAL (Secret)** | Creates Stripe test Checkout sessions |
| `STRIPE_WEBHOOK_SECRET` | **YES**| `whsec_...` | **CRITICAL (Secret)** | Verifies Stripe HMAC webhook signatures |
| `PAYPAL_CLIENT_ID` | **YES** | Sandbox Client ID string | Medium | PayPal Sandbox REST API auth |
| `PAYPAL_CLIENT_SECRET` | **YES** | Sandbox Secret string | **CRITICAL (Secret)** | PayPal Sandbox REST API token exchange |
| `PAYPAL_WEBHOOK_ID` | **YES** | Sandbox 17-char Webhook ID | Medium | Validates PayPal webhook transmission headers |
| `PAYPAL_ENVIRONMENT` | **YES** | `sandbox` | Low | Routes PayPal requests to api-m.sandbox.paypal.com |
| `NEXT_PUBLIC_SUPABASE_URL` | **YES** | `https://[STAGING-ID].supabase.co` | Low (Public) | Supabase project API gateway endpoint |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **YES** | Supabase Staging Anon JWT | Medium (Public) | Public API requests governed by PostgreSQL RLS |
| `SUPABASE_SERVICE_ROLE_KEY` | **YES** | Supabase Staging Service Role JWT | **CRITICAL (Secret)** | Bypasses RLS for authoritative backend RPCs |

---

## 3. Pre-Staging Verification Checklist

Before authorizing the live connection to Supabase staging in Phase 8B:

- [ ] Project owner provisions a separate Supabase project labeled `canteen-corner-staging`.
- [ ] Database password generated with high entropy (>= 32 chars, no shell-sensitive punctuation).
- [ ] Connection pooler confirmed operational on port 6543 (Transaction Mode).
- [ ] Direct database connection confirmed operational on port 5432.
- [ ] Stripe Sandbox account configured with webhook pointing to staging URL.
- [ ] PayPal Developer Sandbox application configured with webhook listener.
- [ ] Branch `release/phase8-postgresql-staging` cut from base commit `9a85512`.
- [ ] Zero changes made to local `prisma/dev.db` during deployment setup.

