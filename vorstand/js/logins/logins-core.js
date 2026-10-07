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
  { key: 'materialwart', label: 'Materialwart', badge: 'bg-dark' }
];

const RBAC_MODULES = [
  {
    module: 'Inventar',
    icon: 'fa-boxes-stacked',
    permissions: [
      { key: 'inventar.view', label: '👁️ Einsehen (Read-Only)', desc: 'Kachel & Navigation freischalten, Inventar- und Materialdaten einsehen' },
      { key: 'inventar.manage', label: '✏️ Verwalten (Schreiben)', desc: 'Inventar mutieren, Ausleihe/Rücknahme, Bestände verwalten' }
    ]
  },
  {
    module: 'Jahresprogramm',
    icon: 'fa-calendar-alt',
    permissions: [
      { key: 'termine.view', label: '👁️ Einsehen (Read-Only)', desc: 'Kachel & Navigation freischalten, Jahresprogramm & Termine einsehen' },
      { key: 'termine.manage', label: '✏️ Verwalten (Schreiben)', desc: 'Termine erstellen, mutieren, verschieben & löschen' }
    ]
  },
  {
    module: 'System-Mails',
    icon: 'fa-envelope-open-text',
    permissions: [
      { key: 'system-mails.view', label: '👁️ Einsehen (Read-Only)', desc: 'Kachel & Navigation freischalten, Mail-Vorlagen & Logs einsehen' },
      { key: 'system-mails.manage', label: '✏️ Verwalten (Schreiben)', desc: 'System-Mail-Vorlagen, SMTP & Konfigurationen verwalten' }
    ]
  },
  {
    module: 'Anlässe & Controlling',
    icon: 'fa-calendar-check',
    permissions: [
      { key: 'anlaesse.view', label: '👁️ Einsehen (Read-Only)', desc: 'Kachel & Navigation freischalten, Anlässe & Margen einsehen' },
      { key: 'anlaesse.manage', label: '✏️ Verwalten (Schreiben)', desc: 'Anlässe planen, Helfer, Bestellungen & Controlling verwalten' }
    ]
  },
  {
    module: 'Anlässe & Umfragen',
    icon: 'fa-poll',
    permissions: [
      { key: 'umfragen.view', label: '👁️ Einsehen (Read-Only)', desc: 'Kachel & Navigation freischalten, Umfragen & Rückmeldungen einsehen' },
      { key: 'umfragen.manage', label: '✏️ Verwalten (Schreiben)', desc: 'Umfragen anlegen, auswerten, RSVP & Erinnerungsmails steuern' }
    ]
  },
  {
    module: 'Team Manager',
    icon: 'fa-shield-halved',
    permissions: [
      { key: 'manager.view', label: '👁️ Einsehen (Read-Only)', desc: 'Kachel & Navigation freischalten, Gruppen & Teams einsehen' },
      { key: 'manager.manage', label: '✏️ Verwalten (Schreiben)', desc: 'Teams zusammenstellen, Schützen zuteilen & Setups speichern' }
    ]
  },
  {
    module: 'Resultate',
    icon: 'fa-trophy',
    permissions: [
      { key: 'resultate.view', label: '👁️ Einsehen (Read-Only)', desc: 'Kachel & Navigation freischalten, Ranglisten & Resultate einsehen' },
      { key: 'resultate.manage', label: '✏️ Verwalten (Schreiben)', desc: 'Resultate erfassen, OCR-Uploads auswerten & publizieren' }
    ]
  },
  {
    module: 'Vermietung',
    icon: 'fa-house',
    permissions: [
      { key: 'vermietung.view', label: '👁️ Einsehen (Read-Only)', desc: 'Kachel & Navigation freischalten, Mietgesuche & Belegung einsehen' },
      { key: 'vermietung.manage', label: '✏️ Verwalten (Schreiben)', desc: 'Buchungen freigeben, Verträge/Rechnungen auslösen, stornieren' }
    ]
  },
  {
    module: 'Jahresmeisterschaft KK',
    icon: 'fa-medal',
    permissions: [
      { key: 'jahresmeisterschaft.view', label: '👁️ Einsehen (Read-Only)', desc: 'Kachel & Navigation freischalten, Meisterschaftsstand einsehen' },
      { key: 'jahresmeisterschaft.manage', label: '✏️ Verwalten (Schreiben)', desc: 'Saisons konfigurieren, Ränge berechnen & abschliessen' }
    ]
  },
  {
    module: 'Mail (Verteiler & Rundmails)',
    icon: 'fa-paper-plane',
    permissions: [
      { key: 'mail.view', label: '👁️ Einsehen (Read-Only)', desc: 'Kachel & Navigation freischalten, Verteiler & Verlauf einsehen' },
      { key: 'mail.manage', label: '✏️ Verwalten (Schreiben)', desc: 'Rundmails verfassen, Kampagnen versenden & Verteiler verwalten' }
    ]
  },
  {
    module: 'Jahresbeitrag',
    icon: 'fa-coins',
    permissions: [
      { key: 'jahresbeitrag.view', label: '👁️ Einsehen (Read-Only)', desc: 'Kachel & Navigation freischalten, Beitragsberechnungen einsehen' },
      { key: 'jahresbeitrag.manage', label: '✏️ Verwalten (Schreiben)', desc: 'Tarife berechnen, Beitragsrechnungen generieren, verbuchen' }
    ]
  },
  {
    module: 'Rechnungen',
    icon: 'fa-file-invoice-dollar',
    permissions: [
      { key: 'rechnungen.view', label: '👁️ Einsehen (Read-Only)', desc: 'Kachel & Navigation freischalten, Debitoren & Rechnungsliste einsehen' },
      { key: 'rechnungen.manage', label: '✏️ Verwalten (Schreiben)', desc: 'Rechnungen erstellen, versenden, mahnen & Zahlungen erfassen' }
    ]
  },
  {
    module: 'Dokumente & Vorlagen',
    icon: 'fa-file-lines',
    permissions: [
      { key: 'dokumente.view', label: '👁️ Einsehen (Read-Only)', desc: 'Kachel & Navigation freischalten, Vorlagen-Pool & Klauseln einsehen' },
      { key: 'dokumente.manage', label: '✏️ Verwalten (Schreiben)', desc: 'Vorlagen bearbeiten, neue Klauseln anlegen & Vorlagen publizieren' }
    ]
  },
  {
    module: 'Buchhaltung',
    icon: 'fa-chart-pie',
    permissions: [
      { key: 'buchhaltung.view', label: '👁️ Einsehen (Read-Only)', desc: 'Kachel & Navigation freischalten, Journal & Bilanz/ER einsehen' },
      { key: 'buchhaltung.manage', label: '✏️ Verwalten (Schreiben)', desc: 'Buchungen vornehmen, CAMT importieren, Kontenrahmen mutieren' }
    ]
  },
  {
    module: 'Mitglieder',
    icon: 'fa-users',
    permissions: [
      { key: 'members.view', label: '👁️ Einsehen (Read-Only)', desc: 'Kachel & Navigation freischalten, Mitgliederstamm & Lizenzen einsehen' },
      { key: 'members.manage', label: '✏️ Verwalten (Schreiben)', desc: 'Mitglieder anlegen/mutieren, SSV-Import ausführen, austreten' }
    ]
  },
  {
    module: 'Generalversammlung (GV)',
    icon: 'fa-landmark',
    permissions: [
      { key: 'gv.view', label: '👁️ Einsehen (Read-Only)', desc: 'Kachel & Navigation freischalten, GV-Dossier & Traktanden einsehen' },
      { key: 'gv.manage', label: '✏️ Verwalten (Schreiben)', desc: 'Traktanden verwalten, Präsenz erfassen, Beschlüsse protokollieren' }
    ]
  },
  {
    module: 'Vereins-Archiv & KI',
    icon: 'fa-folder-open',
    permissions: [
      { key: 'archiv.view', label: '👁️ Einsehen (Read-Only)', desc: 'Kachel & Navigation freischalten, Dokumente suchen & einsehen' },
      { key: 'archiv.manage', label: '✏️ Verwalten (Schreiben)', desc: 'Dokumente hochladen, archivieren & KI-Metadaten verwalten' }
    ]
  },
  {
    module: 'Meeting-Recorder',
    icon: 'fa-microphone',
    permissions: [
      { key: 'meeting.view', label: '👁️ Einsehen (Read-Only)', desc: 'Kachel & Navigation freischalten, Protokolle & Aufnahmen einsehen' },
      { key: 'meeting.manage', label: '✏️ Verwalten (Schreiben)', desc: 'Neue Meetings aufnehmen, transkribieren & Protokoll erzeugen' }
    ]
  },
  {
    module: 'News KI',
    icon: 'fa-newspaper',
    permissions: [
      { key: 'news.view', label: '👁️ Einsehen (Read-Only)', desc: 'Kachel & Navigation freischalten, News-Entwürfe einsehen' },
      { key: 'news.manage', label: '✏️ Verwalten (Schreiben)', desc: 'News mit KI generieren, freigeben & auf Website publizieren' }
    ]
  },
  {
    module: 'Galerie Manager',
    icon: 'fa-images',
    permissions: [
      { key: 'galerie.view', label: '👁️ Einsehen (Read-Only)', desc: 'Kachel & Navigation freischalten, Alben & Fotos betrachten' },
      { key: 'galerie.manage', label: '✏️ Verwalten (Schreiben)', desc: 'Fotos hochladen, Alben verwalten, Gesichter & EXIF-Tags bearbeiten' }
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
