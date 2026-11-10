BEGIN;

DROP POLICY IF EXISTS "family_accounts_update"
ON public.family_accounts;

REVOKE UPDATE ON TABLE public.family_accounts
FROM authenticated;

COMMIT;