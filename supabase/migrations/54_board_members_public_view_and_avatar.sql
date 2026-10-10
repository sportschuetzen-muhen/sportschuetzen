-- ==============================================================================
-- 54_board_members_public_view_and_avatar.sql
-- Migration: Öffentliche Vorstands-View und Avatar-Unterstützung
-- Projekt: Vereinsportal Sportschützen Muhen
-- ==============================================================================

-- 1. SPALTE: avatar_url in public.members ergänzen
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- 2. VIEW: public.v_board_members_public
CREATE OR REPLACE VIEW public.v_board_members_public AS
SELECT 
    m.person_number,
    m.first_name,
    m.last_name,
    string_agg(mf.official_function_category, ' & ' ORDER BY 
        CASE 
            WHEN mf.official_function_category ILIKE '%pr%sident%' AND mf.official_function_category NOT ILIKE '%vize%' THEN 1
            WHEN mf.official_function_category ILIKE '%vize%' THEN 2
            WHEN mf.official_function_category ILIKE '%kassier%' THEN 3
            WHEN mf.official_function_category ILIKE '%juniorenleiter%' OR mf.official_function_category ILIKE '%junioren%' THEN 4
            WHEN mf.official_function_category ILIKE '%sch%tzenmeister%' THEN 5
            WHEN mf.official_function_category ILIKE '%mitgliederverwalter%' THEN 6
            ELSE 10 
        END
    ) AS role_title,
    m.avatar_url,
    MIN(CASE 
        WHEN mf.official_function_category ILIKE '%pr%sident%' AND mf.official_function_category NOT ILIKE '%vize%' THEN 1
        WHEN mf.official_function_category ILIKE '%vize%' OR mf.official_function_category ILIKE '%kassier%' THEN 2
        WHEN mf.official_function_category ILIKE '%juniorenleiter%' OR mf.official_function_category ILIKE '%junioren%' THEN 3
        WHEN mf.official_function_category ILIKE '%sch%tzenmeister%' THEN 4
        WHEN mf.official_function_category ILIKE '%mitgliederverwalter%' THEN 5
        ELSE 10
    END) AS sort_order
FROM public.members m
JOIN public.member_functions mf ON m.person_number = mf.person_number
WHERE mf.official_function_exit_date IS NULL
  AND m.is_active IS TRUE
  AND (mf.rabattkategorie = 'RA001' OR mf.official_function_category ILIKE '%vorstand%')
GROUP BY m.person_number, m.first_name, m.last_name, m.avatar_url
ORDER BY sort_order, m.last_name;

-- 3. BERECHTIGUNGEN: Öffentlicher Lesezugriff auf die View (datenschutzkonform ohne private Adressdaten)
GRANT SELECT ON public.v_board_members_public TO anon, authenticated;
