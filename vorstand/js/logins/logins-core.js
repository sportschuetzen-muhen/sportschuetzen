// =========================================================
//  LOGINS - Core / State / Utilities
// =========================================================

const LoginsState = {
  login_daten: [],
  app_login:   [],
  login_sessions: [],
  role_permissions: [],
  sortKey:     { login_daten: 'username', app_login: 'lastname', login_sessions: 'loginTime', role_permissions: 'module' },
  sortDir:     { login_daten: 1, app_login: 1, login_sessions: -1, role_permissions: 1 },
  activeTab:   'login_daten',
  loaded:      false
};

const RBAC_ROLES = [
  { key: 'admin', label: 'Admin', badge: 'bg-danger' },
  { key: 'vorstand', label: 'Vorstand', badge: 'bg-primary' },
  { key: 'kassier', label: 'Kassier', badge: 'bg-success' },
  { key: 'aktuar', label: 'Aktuar', badge: 'bg-info text-dark' },
  { key: 'schuetzenmeister', label: 'Schützenmeister', badge: 'bg-warning text-dark' },
  { key: 'vermieter', label: 'Vermieter', badge: 'bg-secondary' },
  { key: 'materialwart', label: 'Materialwart', badge: 'bg-dark' },
  { key: 'member', label: 'Mitglied', badge: 'bg-light text-dark border' }
];

const RBAC_MODULES = [
  {
    module: 'Vermietung',
    icon: 'fa-building',
    permissions: [
      { key: 'vermietung.view', label: 'Buchungen & Kalender einsehen', desc: 'Zugriff auf Belegungsübersicht & Buchungsliste' },
      { key: 'vermietung.create', label: 'Buchung manuell anlegen', desc: 'Neue Vermietungen im Portal erfassen' },
      { key: 'vermietung.edit', label: 'Buchungsdetails & Preise bearbeiten', desc: 'Mietdaten, Tarife und Kaution anpassen' },
      { key: 'vermietung.approve', label: 'Buchung freigeben / bestätigen', desc: 'Definitive Buchungszusage erteilen & Kalender aktualisieren' },
      { key: 'vermietung.cancel', label: 'Buchung stornieren / ablehnen', desc: 'Mietgesuche ablehnen oder Reservierung stornieren' },
      { key: 'vermietung.contract', label: 'Mietvertrag erzeugen (PDF)', desc: 'Mietvertrag mit QR-Rechnung & PDF generieren' }
    ]
  },
  {
    module: 'Anlässe & Termine',
    icon: 'fa-calendar-alt',
    permissions: [
      { key: 'anlaesse.view_public', label: 'Öffentliche Termine einsehen', desc: 'Termine für Vereinswebsite & Portal' },
      { key: 'anlaesse.view_internal', label: 'Interne Anlässe einsehen', desc: 'Interne Vereinsanlässe & Helferlisten einsehen' },
      { key: 'anlaesse.manage', label: 'Anlässe erfassen & verwalten', desc: 'Anlässe erstellen, bearbeiten oder absagen' },
      { key: 'anlaesse.rsvp_self', label: 'Eigene An-/Abmeldung erfassen', desc: 'Eigene Teilnahme & Menüwahl melden' },
      { key: 'anlaesse.rsvp_all', label: 'Teilnehmer- & Helferliste verwalten', desc: 'Helfer einteilen und Meldungen bearbeiten' }
    ]
  },
  {
    module: 'Mitglieder',
    icon: 'fa-users',
    permissions: [
      { key: 'members.view', label: 'Mitgliederliste & Kontaktdaten einsehen', desc: 'Mitgliederstamm, Adressen & SSV-Lizenzstatus' },
      { key: 'members.edit', label: 'Mitgliederstammdaten mutieren', desc: 'Adressen, Funktionen und Status ändern/hinzufügen' },
      { key: 'members.export', label: 'Mitgliederdaten exportieren', desc: 'Excel-/CSV-Export der Vereinsmitglieder' }
    ]
  },
  {
    module: 'Finanzen & Rechnungen',
    icon: 'fa-file-invoice-dollar',
    permissions: [
      { key: 'finanzen.rechnungen', label: 'Fakturierung & Rechnungen verwalten', desc: 'Rechnungen erstellen, versenden & Mahnungen auslösen' },
      { key: 'finanzen.jahresbeitrag', label: 'Jahresbeitrag & Tarife verwalten', desc: 'Mitgliederbeiträge berechnen und in Rechnung stellen' },
      { key: 'finanzen.buchhaltung', label: 'Doppelte Buchhaltung & Kontenrahmen', desc: 'Kassabuch, Bilanz/ER und Buchungsjournal' }
    ]
  },
  {
    module: 'Schiessbetrieb & Inventar',
    icon: 'fa-bullseye',
    permissions: [
      { key: 'inventar.view', label: 'Vereinsinventar einsehen', desc: 'Materialbestand, Munition und Leihwaffen einsehen' },
      { key: 'inventar.manage', label: 'Inventar & Ausleihe verwalten', desc: 'Waffenausleihe, Chargen & Bestandsmutationen' },
      { key: 'schiessen.manage', label: 'Schiessbetrieb, Teams & JM leiten', desc: 'Gruppenmeisterschaft, Schiessresultate und Jahresmeisterschaft' }
    ]
  },
  {
    module: 'Administration & Governance',
    icon: 'fa-user-shield',
    permissions: [
      { key: 'gv.manage', label: 'Generalversammlung & Stimmrecht', desc: 'Traktanden, Vor-Ort-Präsenz & Stimmrecht verwalten' },
      { key: 'mail.send', label: 'Vereins-Mails & Newsletter versenden', desc: 'Zentrale Mail-Engine für Rundmails und Benachrichtigungen' },
      { key: 'system-mails.manage', label: 'System-Mail-Vorlagen konfigurieren', desc: 'SMTP-Zugangsdaten & HTML-Mail-Templates bearbeiten' },
      { key: 'logins.manage', label: 'Logins & Berechtigungsmatrix verwalten', desc: 'Admin-Profile, Rollen, Berechtigungen und Sitzungs-Audit' }
    ]
  }
];

function roleBadgeColor(rolle) {
  const map = {
    admin:         'bg-danger',
    vorstand:      'bg-primary',
    kassier:       'bg-success',
    aktuar:        'bg-info text-dark',
    schuetzenmeister: 'bg-warning text-dark',
    vermieter:     'bg-secondary',
    materialwart:  'bg-dark'
  };
  const r = String(rolle || '').split(',')[0].trim().toLowerCase();
  return map[r] || 'bg-secondary';
}

function parseGermanDate(str) {
  if (!str) return new Date(0);
  try {
    const parts = str.split(' ');
    const dateParts = parts[0].split('.');
    const timeParts = parts[1] ? parts[1].split(':') : ['00', '00', '00'];
    return new Date(
      parseInt(dateParts[2]), // Jahr
      parseInt(dateParts[1]) - 1, // Monat
      parseInt(dateParts[0]), // Tag
      parseInt(timeParts[0]), // Stunde
      parseInt(timeParts[1]), // Minute
      parseInt(timeParts[2]) || 0 // Sekunde
    );
  } catch (e) {
    return new Date(str) || new Date(0);
  }
}

function formatDuration(secStr) {
  const sec = parseInt(secStr || '0');
  if (sec <= 0) return '0 Sek';
  if (sec < 60) return `${sec} Sek`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m < 60) {
    return s > 0 ? `${m} Min, ${s} Sek` : `${m} Min`;
  }
  const h = Math.floor(m / 60);
  const remMin = m % 60;
  return remMin > 0 ? `${h} Std, ${remMin} Min` : `${h} Std`;
}

function simplifyUserAgent(ua) {
  if (!ua) return 'unbekannt';
  const uaLower = ua.toLowerCase();
  
  let os = 'Unbekannt';
  if (uaLower.includes('windows')) os = 'Windows';
  else if (uaLower.includes('android')) os = 'Android';
  else if (uaLower.includes('iphone') || uaLower.includes('ipad')) os = 'iOS';
  else if (uaLower.includes('macintosh') || uaLower.includes('mac os')) os = 'macOS';
  else if (uaLower.includes('linux')) os = 'Linux';

  let browser = 'Browser';
  if (uaLower.includes('edg/')) browser = 'Edge';
  else if (uaLower.includes('chrome')) browser = 'Chrome';
  else if (uaLower.includes('safari')) browser = 'Safari';
  else if (uaLower.includes('firefox')) browser = 'Firefox';
  else if (uaLower.includes('trident') || uaLower.includes('msie')) browser = 'IE';

  return `${os} (${browser})`;
}

function getDeviceIcon(ua) {
  if (!ua) return 'fa-laptop';
  const uaLower = ua.toLowerCase();
  if (uaLower.includes('iphone') || uaLower.includes('android') && uaLower.includes('mobile')) return 'fa-mobile-alt';
  if (uaLower.includes('ipad') || uaLower.includes('tablet')) return 'fa-tablet-alt';
  return 'fa-laptop';
}
