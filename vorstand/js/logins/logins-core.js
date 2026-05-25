// =========================================================
//  LOGINS - Core / State / Utilities
// =========================================================

const LoginsState = {
  login_daten: [],
  app_login:   [],
  login_sessions: [],
  sortKey:     { login_daten: 'username', app_login: 'lastname', login_sessions: 'loginTime' },
  sortDir:     { login_daten: 1, app_login: 1, login_sessions: -1 },
  activeTab:   'login_daten',
  loaded:      false
};

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
