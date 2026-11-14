-- =====================================================================
-- Migration 132: RLS-Härtung für public.accounting_payment_orders
-- Gemäss AGENTS.md Regel 7 («View & Manage» Kontrakt):
--   SELECT -> buchhaltung.view | buchhaltung.manage
--   WRITE  -> buchhaltung.manage
-- =====================================================================

ALTER TABLE public.accounting_payment_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS acc_pay_orders_select ON public.accounting_payment_orders;
DROP POLICY IF EXISTS acc_pay_orders_write ON public.accounting_payment_orders;
DROP POLICY IF EXISTS accounting_payment_orders_rbac_select ON public.accounting_payment_orders;
DROP POLICY IF EXISTS accounting_payment_orders_rbac_write ON public.accounting_payment_orders;

CREATE POLICY accounting_payment_orders_rbac_select
  ON public.accounting_payment_orders
  FOR SELECT
  TO authenticated
  USING ((SELECT public.rbac_allows(ARRAY['buchhaltung.view', 'buchhaltung.manage'])));

CREATE POLICY accounting_payment_orders_rbac_write
  ON public.accounting_payment_orders
  FOR ALL
  TO authenticated
  USING ((SELECT public.rbac_allows(ARRAY['buchhaltung.manage'])))
  WITH CHECK ((SELECT public.rbac_allows(ARRAY['buchhaltung.manage'])));
