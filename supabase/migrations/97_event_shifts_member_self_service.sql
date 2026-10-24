-- Migration 97: Schichtplan Self-Service für Mitglieder & Aplano-Integration
-- Ermöglicht authentifizierten Vereinsmitgliedern das Einsehen von Schichten und den sicheren Selbsteintrag.

-- 1. POLICIES: Schichten & Zuteilungen für Mitglieder lesbar machen
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS event_shifts_rbac_select ON public.event_shifts;
DROP POLICY IF EXISTS event_shifts_member_select ON public.event_shifts;

CREATE POLICY event_shifts_member_select ON public.event_shifts
    FOR SELECT TO authenticated
    USING (
        -- Vorstand / Admin mit Berechtigung
        (SELECT public.rbac_allows(ARRAY['anlaesse.view', 'anlaesse.manage']))
        OR 
        -- Oder aktiver Vereinsanlass (keine Vorlage)
        EXISTS (
            SELECT 1 FROM public.events e 
            WHERE e.id = event_shifts.event_id 
              AND e.is_template = false 
              AND e.status IN ('planned', 'in_progress', 'completed')
        )
    );

DROP POLICY IF EXISTS event_shift_assignments_rbac_select ON public.event_shift_assignments;
DROP POLICY IF EXISTS event_shift_assignments_member_select ON public.event_shift_assignments;

CREATE POLICY event_shift_assignments_member_select ON public.event_shift_assignments
    FOR SELECT TO authenticated
    USING (
        -- Vorstand / Admin mit Berechtigung
        (SELECT public.rbac_allows(ARRAY['anlaesse.view', 'anlaesse.manage']))
        OR
        -- Eigene Zuteilung
        user_id = auth.uid()
        OR
        -- Einsicht in Zuteilungen von Vereinsanlässen (wer hilft wo mit)
        EXISTS (
            SELECT 1 FROM public.event_shifts s
            JOIN public.events e ON e.id = s.event_id
            WHERE s.id = event_shift_assignments.shift_id
              AND e.is_template = false
        )
    );

-- 2. RPC-FUNKTION: Sichere Helfer-Eintragung (Self-Service)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.register_member_for_shift(
    p_shift_id UUID,
    p_name TEXT,
    p_phone TEXT DEFAULT NULL,
    p_email TEXT DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_shift RECORD;
    v_assigned_count INT;
    v_new_id UUID;
    v_user_id UUID;
BEGIN
    -- Authentifizierten Benutzer ermitteln
    v_user_id := auth.uid();

    -- Schicht prüfen
    SELECT * INTO v_shift FROM public.event_shifts WHERE id = p_shift_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Schicht nicht gefunden.');
    END IF;

    -- Pflichtfeld Name
    IF p_name IS NULL OR TRIM(p_name) = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Bitte gib deinen Namen an.');
    END IF;

    -- Bisherige Belegung zählen
    SELECT COUNT(*) INTO v_assigned_count 
    FROM public.event_shift_assignments 
    WHERE shift_id = p_shift_id;

    -- Prüfen, ob Schicht bereits voll ist
    IF v_assigned_count >= v_shift.required_helpers THEN
        RETURN jsonb_build_object('success', false, 'error', 'Diese Schicht ist bereits vollständig besetzt.');
    END IF;

    -- Prüfen, ob die Person bereits für diese Schicht eingeteilt ist
    IF v_user_id IS NOT NULL THEN
        IF EXISTS (SELECT 1 FROM public.event_shift_assignments WHERE shift_id = p_shift_id AND user_id = v_user_id) THEN
            RETURN jsonb_build_object('success', false, 'error', 'Du bist für diese Schicht bereits eingetragen.');
        END IF;
    ELSE
        IF EXISTS (SELECT 1 FROM public.event_shift_assignments WHERE shift_id = p_shift_id AND LOWER(TRIM(helper_name)) = LOWER(TRIM(p_name))) THEN
            RETURN jsonb_build_object('success', false, 'error', 'Dieser Name ist für diese Schicht bereits eingetragen.');
        END IF;
    END IF;

    -- Helfer eintragen
    INSERT INTO public.event_shift_assignments (
        shift_id,
        user_id,
        helper_name,
        helper_phone,
        helper_email,
        confirmed_by_helper,
        confirmation_date,
        notes
    ) VALUES (
        p_shift_id,
        v_user_id,
        TRIM(p_name),
        NULLIF(TRIM(p_phone), ''),
        NULLIF(TRIM(p_email), ''),
        true,
        now(),
        NULLIF(TRIM(p_notes), '')
    )
    RETURNING id INTO v_new_id;

    -- Schichtstatus aktualisieren
    IF (v_assigned_count + 1) >= v_shift.required_helpers THEN
        UPDATE public.event_shifts SET status = 'filled' WHERE id = p_shift_id;
    ELSE
        UPDATE public.event_shifts SET status = 'partially_filled' WHERE id = p_shift_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'assignment_id', v_new_id,
        'message', 'Du hast dich erfolgreich für die Schicht eingetragen! Vielen Dank für deine Unterstützung.'
    );
END;
$$;

-- 3. RPC-FUNKTION: Schicht-Zuteilung aufheben (Abmeldung / Storno)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cancel_member_shift_assignment(
    p_assignment_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_assignment RECORD;
    v_shift RECORD;
    v_remaining_count INT;
    v_user_id UUID;
    v_is_manager BOOLEAN;
BEGIN
    v_user_id := auth.uid();
    v_is_manager := (SELECT public.rbac_allows(ARRAY['anlaesse.manage']));

    SELECT * INTO v_assignment FROM public.event_shift_assignments WHERE id = p_assignment_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Zuteilung nicht gefunden.');
    END IF;

    -- Nur der eingeteilte Benutzer selbst oder ein Vorstandsmitglied darf austragen
    IF NOT v_is_manager AND (v_assignment.user_id IS NULL OR v_assignment.user_id != v_user_id) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Keine Berechtigung, diese Schicht-Zuteilung zu stornieren.');
    END IF;

    -- Löschen
    DELETE FROM public.event_shift_assignments WHERE id = p_assignment_id;

    -- Schichtstatus aktualisieren
    SELECT * INTO v_shift FROM public.event_shifts WHERE id = v_assignment.shift_id;
    IF FOUND THEN
        SELECT COUNT(*) INTO v_remaining_count 
        FROM public.event_shift_assignments 
        WHERE shift_id = v_assignment.shift_id;

        IF v_remaining_count = 0 THEN
            UPDATE public.event_shifts SET status = 'open' WHERE id = v_assignment.shift_id;
        ELSIF v_remaining_count < v_shift.required_helpers THEN
            UPDATE public.event_shifts SET status = 'partially_filled' WHERE id = v_assignment.shift_id;
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Zuteilung wurde erfolgreich aufgehoben.'
    );
END;
$$;

-- Berechtigungen vergeben
GRANT EXECUTE ON FUNCTION public.register_member_for_shift TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.cancel_member_shift_assignment TO authenticated, anon;

NOTIFY pgrst, 'reload schema';
