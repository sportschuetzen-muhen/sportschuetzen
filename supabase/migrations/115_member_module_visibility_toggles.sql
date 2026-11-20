-- 115_member_module_visibility_toggles.sql
-- Steuerung der Sichtbarkeit von Schichtplan und Festkasse im Mitgliederbereich (intern.html)

INSERT INTO public.system_app_configs (key, value, description, category)
VALUES 
    ('member_schichtplan_enabled', 'false', 'Sichtbarkeit des Helfer- & Schichtplans im Mitgliederbereich (intern.html)', 'website'),
    ('member_festkasse_enabled', 'false', 'Sichtbarkeit des Festkassen-Links (POS) im Mitgliederbereich (intern.html)', 'website')
ON CONFLICT (key) DO NOTHING;

-- RLS-Policy erweitern, damit auch anlaesse.manage diese Einstellungen mutieren darf
DROP POLICY IF EXISTS "Admins can manage system app configs" ON public.system_app_configs;
CREATE POLICY "Admins can manage system app configs" ON public.system_app_configs
  FOR ALL TO authenticated
  USING (( SELECT rbac_allows(ARRAY['dokumente.manage'::text, 'vorstand.manage'::text, 'anlaesse.manage'::text, 'admin'::text]) AS rbac_allows))
  WITH CHECK (( SELECT rbac_allows(ARRAY['dokumente.manage'::text, 'vorstand.manage'::text, 'anlaesse.manage'::text, 'admin'::text]) AS rbac_allows));
