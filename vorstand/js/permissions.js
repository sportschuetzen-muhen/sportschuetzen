/**
 * permissions.js – RBAC-Durchsetzung im Vorstandsportal (Pilot: Navigation/Kacheln & Rechnungswesen)
 *
 * Quelle der Wahrheit: public.role_permissions (Matrix im Logins-Modul, Tab 4).
 * Die effektiven Berechtigungen des angemeldeten Benutzers liefert der RPC public.my_permissions()
 * (Live aus user_roles ⨝ role_permissions, Admin = ['*']) – bewusst OHNE JWT-Cache, damit
 * Matrix-Änderungen sofort wirken.
 *
 * Fail-closed: Können die Berechtigungen nicht geladen werden, bleiben geschützte Elemente
 * verborgen und es wird ein Fehler angezeigt (kein stiller Fallback auf Rollennamen).
 *
 * Dokumentation: docs/LOGINS_UND_BENUTZERVERWALTUNG.md, Abschnitt 10.
 */
(function () {
  // Ansicht (navTo-ID) -> erforderliche Berechtigung (mindestens eine davon).
  // Ansichten ohne Eintrag (z. B. dashboard, logins) behalten den bisherigen data-roles-Filter.
  const VIEW_ACCESS = {
    'inventar':               ['inventar.view', 'inventar.manage'],
    'termine':                ['termine.manage'],
    'system-mails':           ['system-mails.manage'],
    'anlaesse':               ['anlaesse.view_internal', 'anlaesse.manage'],
    'umfragen':               ['umfragen.manage'],
    'manager':                ['schiessen.manage'],
    'resultate':              ['schiessen.manage'],
    'jahresmeisterschaft':    ['schiessen.manage'],
    'jahresmeisterschaft-kk': ['schiessen.manage'],
    'vermietung':             ['vermietung.view'],
    'mail':                   ['mail.send'],
    'jahresbeitrag':          ['finanzen.jahresbeitrag'],
    'rechnungen':             ['finanzen.rechnungen'],
    'dokument-vorlagen':      ['dokumente.manage'],
    'buchhaltung':            ['finanzen.buchhaltung'],
    'mitglieder':             ['members.view'],
    'gv-dossier':             ['gv.manage'],
    'archiv':                 ['archiv.view'],
    'meeting-recorder':       ['meeting.record'],
    'news':                   ['news.manage'],
    'galerie':                ['galerie.manage']
  };

  let permSet = null;      // Set<string> | null (null = nicht geladen)
  let loadPromise = null;
  let lastError = null;

  function getClient() {
    return typeof window.getSupabaseClient === 'function' ? window.getSupabaseClient() : null;
  }

  function has(key) {
    if (!permSet) return false;
    return permSet.has('*') || permSet.has(key);
  }

  function hasAny(keys) {
    if (!permSet) return false;
    if (permSet.has('*')) return true;
    return (keys || []).some(k => permSet.has(k));
  }

  function canAccessView(viewId) {
    const req = VIEW_ACCESS[viewId];
    if (!req) return true;           // nicht von der Matrix gesteuert
    return hasAny(req);
  }

  // Ermittelt die navTo-Ansicht eines geschützten Elements (Sidebar-Link oder Dashboard-Kachel)
  function viewIdOfElement(el) {
    const re = /navTo\(['"]([^'"]+)['"]/;
    let src = el.getAttribute('onclick') || '';
    if (!re.test(src)) {
      const child = el.querySelector('[onclick*="navTo"]');
      src = child ? (child.getAttribute('onclick') || '') : '';
    }
    const m = re.exec(src);
    return m ? m[1] : null;
  }

  function isMatrixControlled(el) {
    const id = viewIdOfElement(el);
    return !!(id && VIEW_ACCESS[id]);
  }

  // Blendet matrix-gesteuerte Sidebar-Links und Kacheln anhand der geladenen Berechtigungen ein/aus.
  function applyToDom() {
    document.querySelectorAll('.role-protected').forEach(el => {
      const id = viewIdOfElement(el);
      if (!id || !VIEW_ACCESS[id]) return;   // Legacy data-roles bleibt zuständig
      el.classList.toggle('d-none', !canAccessView(id));
    });
  }

  function reportError(err) {
    lastError = err;
    console.error('⛔ [Perms] Berechtigungen konnten nicht geladen werden:', err);
    const msg = 'Berechtigungen konnten nicht geladen werden. Bitte neu anmelden oder die Seite neu laden. (' +
                ((err && err.message) ? err.message : 'Unbekannter Fehler') + ')';
    if (typeof showError === 'function') showError(msg, 10000);
  }

  // Lädt die Berechtigungen live aus Supabase (immer frisch; parallele Aufrufe werden zusammengeführt).
  function refresh() {
    if (loadPromise) return loadPromise;
    const supa = getClient();
    if (!supa) {
      permSet = null;
      reportError(new Error('Supabase-Client nicht verfügbar'));
      return Promise.resolve(false);
    }
    loadPromise = (async () => {
      try {
        const { data, error } = await supa.rpc('my_permissions');
        if (error) throw error;
        permSet = new Set(Array.isArray(data) ? data : []);
        lastError = null;
        console.log('🔐 [Perms] Berechtigungen geladen:', Array.from(permSet));
        return true;
      } catch (err) {
        permSet = null;               // fail-closed
        reportError(err);
        return false;
      } finally {
        loadPromise = null;
      }
    })();
    return loadPromise;
  }

  function reset() {
    permSet = null;
    loadPromise = null;
    lastError = null;
  }

  window.Perms = {
    VIEW_ACCESS,
    has,
    hasAny,
    canAccessView,
    isMatrixControlled,
    applyToDom,
    refresh,
    reset,
    isLoaded: () => permSet !== null,
    getAll: () => (permSet ? Array.from(permSet) : []),
    getLastError: () => lastError
  };
})();
