/**
 * supabase-client.js
 * Initialisierung des offiziellen @supabase/supabase-js Clients für das Vorstand-Portal.
 * Host: 192.168.68.117:8000
 * Modul: ANLÄSSE & Controlling (Native Supabase Migration)
 */

(function () {
    const SUPABASE_URL = 'http://192.168.68.117:8000';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzg5ODI0MTM4LCJleHAiOjE5NDc1MDQxMzh9.N6UO60NvNYVRcYc4gcDzwNGp676PNM5SkqGcbayzY3M';

    let client = null;

    function initSupabase() {
        if (typeof window.supabase !== 'undefined' && typeof window.supabase.createClient === 'function') {
            try {
                client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
                    auth: {
                        persistSession: true,
                        autoRefreshToken: true
                    }
                });
                window.supabaseClient = client;
                console.log('✅ Supabase Client erfolgreich initialisiert (Host: ' + SUPABASE_URL + ')');
            } catch (err) {
                console.error('❌ Fehler bei Supabase Client Initialisierung:', err);
            }
        } else {
            console.warn('⚠️ Supabase JS SDK (@supabase/supabase-js) noch nicht geladen.');
        }
        return client;
    }

    // Sofort initialisieren oder sobald SDK verfügbar ist
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initSupabase);
    } else {
        initSupabase();
    }

    // Globale Hilfsobjekte
    window.getSupabaseClient = function () {
        if (!client) {
            initSupabase();
        }
        return client;
    };

    window.checkSupabaseConnection = async function () {
        const supa = window.getSupabaseClient();
        if (!supa) return { ok: false, message: 'Supabase SDK nicht geladen' };
        try {
            const { data, error } = await supa.from('events').select('id').limit(1);
            if (error) throw error;
            return { ok: true, data: data };
        } catch (err) {
            console.error('Supabase Verbindungsprüfung fehlgeschlagen:', err);
            return { ok: false, error: err };
        }
    };
})();
