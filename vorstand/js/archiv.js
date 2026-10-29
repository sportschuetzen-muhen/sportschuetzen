/**
 * VEREINS-ARCHIV, DOKUMENTEN-MANAGEMENT & KI-ARCHIVAR (V2)
 * Sportschützen Muhen – Vorstandsportal
 *
 * Single Source of Truth:
 *   - Supabase PostgreSQL: public.documents (1'148+ Dokumente) & public.document_chunks (6'700+ Chunks)
 *   - Supabase Storage: Bucket 'club-documents' (archiv/<subcategory>/...)
 *   - Live-RAG & Volltextsuche: RPC public.search_archive_fulltext + Groq Proxy (qwen/qwen3.8-27b)
 *
 * Richtlinien-Konformität (AGENTS.md):
 *   - Kein GAS-Fallback (getPdfLink entfernt), kein Google-Drive-Iframe
 *   - Einheitliche Du-Form
 *   - UIConfirmKit, UIFormatKit, UIButtonKit, UIExportKit
 */

const ARCHIV_SUPABASE_URL = 'https://supabase-muhen.danfamily.uk';
const ARCHIV_SUPABASE_REST = `${ARCHIV_SUPABASE_URL}/rest/v1`;
const ARCHIV_SUPABASE_STORAGE = `${ARCHIV_SUPABASE_URL}/storage/v1`;
const ARCHIV_SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzg5ODI0MTM4LCJleHAiOjE5NDc1MDQxMzh9.N6UO60NvNYVRcYc4gcDzwNGp676PNM5SkqGcbayzY3M';

// Kanonische Taxonomie (Kategorien & Unterordner)
const ARCHIV_CATEGORIES = {
    all: { label: 'Alle Dokumente', icon: 'fa-layer-group', color: 'primary', group: 'all' },
    // Vorstands-Akten (Vertraulich)
    vorstand: { label: 'Vorstandsprotokolle', icon: 'fa-user-shield', color: 'danger', group: 'vorstand', defaultVis: 'vorstand', defaultSub: 'vorstand_protokolle' },
    gebaeude: { label: 'Gebäude, Umbau & Anlagen', icon: 'fa-building', color: 'warning', group: 'vorstand', defaultVis: 'vorstand', defaultSub: 'schuetzenhaus' },
    versicherungen: { label: 'Versicherungen & Policen', icon: 'fa-shield-halved', color: 'info', group: 'vorstand', defaultVis: 'vorstand', defaultSub: 'policen_schatzungen' },
    anlaesse: { label: 'Festanlässe (ohne Schiessen)', icon: 'fa-champagne-glasses', color: 'success', group: 'vorstand', defaultVis: 'vorstand', defaultSub: 'festanlaesse' },
    schiessbetrieb: { label: 'Schiessbetrieb, KK/LG & Listen', icon: 'fa-bullseye', color: 'secondary', group: 'vorstand', defaultVis: 'vorstand', defaultSub: 'abteilung_kk' },
    // Vereins- & Mitgliederarchiv
    gv: { label: 'GV-Protokolle', icon: 'fa-landmark', color: 'primary', group: 'members', defaultVis: 'members', defaultSub: '01_protokolle' },
    berichte: { label: 'Jahresberichte', icon: 'fa-chart-line', color: 'info', group: 'members', defaultVis: 'members', defaultSub: '05_berichte' },
    einladungen: { label: 'GV-Einladungen', icon: 'fa-envelope-open-text', color: 'success', group: 'members', defaultVis: 'members', defaultSub: '02_einladungen' },
    chronik: { label: 'Chronik & Presse', icon: 'fa-book-open', color: 'warning', group: 'members', defaultVis: 'members', defaultSub: '30_chroniken' },
    statuten: { label: 'Statuten & Reglemente', icon: 'fa-scale-balanced', color: 'dark', group: 'members', defaultVis: 'members', defaultSub: 'statuten_reglemente' }
};

const ARCHIV_SUBCATEGORIES = {
    '01_protokolle': 'GV-Protokolle & Anträge',
    '02_einladungen': 'GV-Einladungen & Traktanden',
    '05_berichte': 'Jahresberichte Präsident & JS',
    '30_chroniken': 'Vereinschroniken & Jubiläen',
    'presse': 'Presseartikel & Zeitungsberichte',
    'statuten_reglemente': 'Statuten, Reglemente & Vereinbarungen',
    'vorstand_protokolle': 'Vorstandsprotokolle (1973–heute)',
    'gv_vorlagen': 'GV-Vorlagen & Entwürfe',
    'schuetzenhaus': 'Schützenhaus & Verträge (Pacht/Baurecht)',
    'umbau_neubau': 'Umbau 1973/74 & Neubau Rüteli',
    'scheiben_2016': 'Elektronische Scheiben 2016',
    'anlagen_50m_10m': '50m & 10m Schiessanlagen (SIUS)',
    'vermietung_historisch': 'Vermietung Schützenstube (Historisch)',
    'policen_schatzungen': 'Policen (AGV/USS) & Schatzungen',
    'festanlaesse': 'Dorffest, Jugendfest, Schülerfest & Anlässe',
    'abteilung_kk': 'Abteilung Kleinkaliber 50m',
    'abteilung_lg': 'Abteilung Luftgewehr 10m',
    'mitglieder_listen': 'Mitglieder-, Gewehr- & Schlüssellisten',
    'kleider_ausbildung': 'Kleider, Jungschützen & Ausbildung'
};

// Modul-Zustand
let archivState = {
    documents: [],
    loaded: false,
    loading: false,
    activeTab: 'explorer',     // 'explorer' | 'ki' | 'werkstatt'
    activeCategory: 'all',
    activeSubcategory: 'all',
    activeDecade: 'all',
    activeStatusFilter: 'all', // 'all' | 'completed' | 'pending'
    activeVisFilter: 'all',    // 'all' | 'vorstand' | 'members'
    searchQuery: '',
    page: 1,
    pageSize: 40,
    aiScopeCategory: 'all',
    currentModalDocId: null
};

let archivAiConfig = {
    model: localStorage.getItem('archiv_ai_model') || 'qwen/qwen3.8-27b',
    endpoint: localStorage.getItem('archiv_ai_endpoint') || 'https://homeassistant-api.dan-hunziker73.workers.dev/groq/chat/completions',
    token: localStorage.getItem('archiv_ai_token') || ''
};

// ============================================================================
// 1. INITIALISIERUNG & NAVIGATION HOOK
// ============================================================================
document.addEventListener('DOMContentLoaded', () => {
    // Falls das Archiv bereits als aktive View geladen ist, initialisieren
    const activeView = document.querySelector('.module-view.active');
    if (activeView && activeView.id === 'view-archiv') {
        initArchiv();
    }
});

function canManageArchiv() {
    if (window.Perms && typeof window.Perms.hasAny === 'function') {
        return window.Perms.hasAny(['archiv.manage', 'dokumente.manage', '*']);
    }
    const r = (typeof userRole !== 'undefined' && userRole) ? userRole : (localStorage.getItem('portal_role') || '');
    return ['admin', 'vorstand', 'aktuar'].includes(r.toLowerCase());
}

async function getArchivAuthHeaders(extra = {}) {
    let token = ARCHIV_SUPABASE_KEY;
    try {
        const supa = typeof window.getSupabaseClient === 'function' ? window.getSupabaseClient() : window.supabaseClient;
        if (supa && supa.auth) {
            const { data } = await supa.auth.getSession();
            if (data?.session?.access_token) {
                token = data.session.access_token;
            }
        }
    } catch (e) {}
    return {
        'apikey': ARCHIV_SUPABASE_KEY,
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...extra
    };
}

async function initArchiv() {
    const container = document.getElementById('view-archiv');
    if (!container) return;

    if (!container.querySelector('.archiv-v2-wrapper')) {
        renderArchivShell(container);
    }

    loadArchivAiConfig();
    if (archivState.loading) {
        return; // Ladevorgang läuft bereits, Doppelaufruf ignorieren
    }
    if (!archivState.loaded) {
        await loadAllArchivDocuments();
    } else {
        updateArchivKpisAndBadges();
        renderArchivExplorer();
    }
}

function renderArchivShell(container) {
    const canManage = canManageArchiv();

    container.innerHTML = `
        <div class="archiv-v2-wrapper">
            <!-- HEADER & KPI LEISTE -->
            <div class="d-flex justify-content-between align-items-start flex-wrap gap-3 mb-4">
                <div>
                    <div class="d-flex align-items-center gap-2 mb-1">
                        <h2 class="fw-bold text-primary mb-0" style="letter-spacing: -0.5px;">
                            <i class="fas fa-box-archive me-2 text-primary"></i>Vereins-Archiv &amp; Dokumenten-Management
                        </h2>
                        <span class="badge bg-success-subtle text-success border border-success-subtle rounded-pill px-2.5 py-1 small fw-semibold">
                            <i class="fas fa-database me-1"></i>Supabase Storage &amp; RAG
                        </span>
                    </div>
                    <p class="text-muted small mb-0">
                        Zentrales Dokumentenarchiv ab 1919 inklusive vertraulicher Vorstandsprotokolle, Gebäudedossiers, Policen und KI-Volltextsuche.
                    </p>
                </div>
                <div class="d-flex align-items-center flex-wrap gap-2">
                    <button class="btn btn-sm btn-outline-secondary rounded-pill px-3 fw-semibold" onclick="refreshArchivDocuments(this)" title="Dokumentenbestand neu laden">
                        <i class="fas fa-sync-alt me-1"></i> Aktualisieren
                    </button>
                    <button class="btn btn-sm btn-outline-primary rounded-pill px-3 fw-semibold" onclick="exportArchivToExcel()" title="Aktuelle Dokumentenliste nach Excel exportieren">
                        <i class="fas fa-file-excel me-1 text-success"></i> Excel-Export
                    </button>
                    <button class="btn btn-sm btn-outline-dark rounded-pill px-3 fw-semibold" onclick="openArchivAiSettingsModal()" title="KI-Sprachmodell &amp; Proxy konfigurieren">
                        <i class="fas fa-sliders-h me-1 text-primary"></i> <span id="archiv-top-model-label">KI-Modell</span>
                    </button>
                    ${canManage ? `
                    <button class="btn btn-sm btn-primary rounded-pill px-3.5 fw-bold shadow-xs" onclick="openArchivUploadModal()">
                        <i class="fas fa-cloud-upload-alt me-1"></i> Neues Dokument hochladen
                    </button>
                    ` : ''}
                </div>
            </div>

            <!-- KPI KACHELN -->
            <div class="row g-3 mb-4">
                <div class="col-6 col-md-3">
                    <div class="card border-0 shadow-xs p-3 h-100" style="border-radius: 14px; border-left: 4px solid var(--primary) !important;">
                        <div class="d-flex justify-content-between align-items-center">
                            <div>
                                <div class="text-muted small fw-semibold">Gesamtbestand</div>
                                <div class="fs-4 fw-bold text-primary" id="archiv-kpi-total">–</div>
                            </div>
                            <div class="rounded-circle bg-primary bg-opacity-10 text-primary d-flex align-items-center justify-content-center" style="width: 42px; height: 42px;">
                                <i class="fas fa-folder-tree"></i>
                            </div>
                        </div>
                        <div class="small text-muted mt-1" id="archiv-kpi-years">Zeitraum 1919–heute</div>
                    </div>
                </div>
                <div class="col-6 col-md-3">
                    <div class="card border-0 shadow-xs p-3 h-100" style="border-radius: 14px; border-left: 4px solid #dc2626 !important;">
                        <div class="d-flex justify-content-between align-items-center">
                            <div>
                                <div class="text-muted small fw-semibold">Vorstands-Akten</div>
                                <div class="fs-4 fw-bold text-danger" id="archiv-kpi-vorstand">–</div>
                            </div>
                            <div class="rounded-circle bg-danger bg-opacity-10 text-danger d-flex align-items-center justify-content-center" style="width: 42px; height: 42px;">
                                <i class="fas fa-user-shield"></i>
                            </div>
                        </div>
                        <div class="small text-muted mt-1">Vertraulich (Protokolle, Gebäude, Policen)</div>
                    </div>
                </div>
                <div class="col-6 col-md-3">
                    <div class="card border-0 shadow-xs p-3 h-100" style="border-radius: 14px; border-left: 4px solid #2563eb !important;">
                        <div class="d-flex justify-content-between align-items-center">
                            <div>
                                <div class="text-muted small fw-semibold">Vereins- &amp; GV-Archiv</div>
                                <div class="fs-4 fw-bold text-primary" id="archiv-kpi-members">–</div>
                            </div>
                            <div class="rounded-circle bg-info bg-opacity-10 text-info d-flex align-items-center justify-content-center" style="width: 42px; height: 42px;">
                                <i class="fas fa-users"></i>
                            </div>
                        </div>
                        <div class="small text-muted mt-1">Für Mitglieder auf intern.html sichtbar</div>
                    </div>
                </div>
                <div class="col-6 col-md-3">
                    <div class="card border-0 shadow-xs p-3 h-100" style="border-radius: 14px; border-left: 4px solid #10b981 !important;">
                        <div class="d-flex justify-content-between align-items-center">
                            <div>
                                <div class="text-muted small fw-semibold">Volltext &amp; KI-Index</div>
                                <div class="fs-4 fw-bold text-success" id="archiv-kpi-fulltext">–</div>
                            </div>
                            <div class="rounded-circle bg-success bg-opacity-10 text-success d-flex align-items-center justify-content-center" style="width: 42px; height: 42px;">
                                <i class="fas fa-magnifying-glass-chart"></i>
                            </div>
                        </div>
                        <div class="small text-muted mt-1" id="archiv-kpi-fulltext-sub">Sofort im Text durchsuchbar</div>
                    </div>
                </div>
            </div>

            <!-- HAUPT-TABS -->
            <ul class="nav nav-pills custom-tabs mb-4 p-1.5 rounded-pill bg-white shadow-xs border d-inline-flex flex-wrap gap-1">
                <li class="nav-item">
                    <button class="nav-link active fw-bold px-4 py-2 rounded-pill bg-primary text-white" id="tab-btn-explorer" onclick="switchArchivTab('explorer')">
                        <i class="fas fa-folder-open me-2"></i>1. Dokumenten-Explorer <span class="badge bg-white text-primary ms-1 rounded-pill" id="tab-badge-explorer">0</span>
                    </button>
                </li>
                <li class="nav-item">
                    <button class="nav-link fw-bold px-4 py-2 rounded-pill text-secondary" id="tab-btn-ki" onclick="switchArchivTab('ki')">
                        <i class="fas fa-robot me-2"></i>2. KI-Archivar &amp; RAG-Suche
                    </button>
                </li>
                <li class="nav-item">
                    <button class="nav-link fw-bold px-4 py-2 rounded-pill text-secondary" id="tab-btn-werkstatt" onclick="switchArchivTab('werkstatt')">
                        <i class="fas fa-wand-magic-sparkles me-2"></i>3. Transkriptions-Werkstatt <span class="badge bg-warning-subtle text-warning border border-warning-subtle ms-1 rounded-pill" id="tab-badge-pending">0</span>
                    </button>
                </li>
            </ul>

            <!-- ============================================================ -->
            <!-- TAB 1: SUPABASE DOKUMENTEN-EXPLORER                          -->
            <!-- ============================================================ -->
            <div id="archiv-tab-explorer" class="tab-pane-content">
                <!-- ORDNER-BEREICHE (VORSTAND vs. MITGLIEDER) -->
                <div class="card border-0 shadow-xs p-3 mb-3" style="border-radius: 16px;">
                    <div class="row g-3">
                        <!-- Spalte A: Vertrauliche Vorstands-Akten -->
                        <div class="col-lg-7">
                            <div class="d-flex align-items-center justify-content-between mb-2">
                                <span class="small fw-bold text-danger text-uppercase" style="letter-spacing: 0.04em;">
                                    <i class="fas fa-lock me-1"></i> Vorstands-Akten (Vertraulich)
                                </span>
                                <button class="btn btn-xs btn-link text-decoration-none p-0 small" onclick="selectArchivCategory('all')">Alle anzeigen</button>
                            </div>
                            <div class="d-flex flex-wrap gap-1.5" id="archiv-cat-pills-vorstand"></div>
                        </div>
                        <!-- Spalte B: Vereins- & Mitglieder-Archiv -->
                        <div class="col-lg-5 border-start-lg ps-lg-3">
                            <div class="d-flex align-items-center justify-content-between mb-2">
                                <span class="small fw-bold text-primary text-uppercase" style="letter-spacing: 0.04em;">
                                    <i class="fas fa-users me-1"></i> Vereins- &amp; GV-Archiv (Mitglieder)
                                </span>
                            </div>
                            <div class="d-flex flex-wrap gap-1.5" id="archiv-cat-pills-members"></div>
                        </div>
                    </div>

                    <!-- FEINFILTER: SUCHFELD, UNTERORDNER, JAHRZEHNT, VOLLTEXT-STATUS -->
                    <hr class="my-3 opacity-25">
                    <div class="row g-2 align-items-center">
                        <div class="col-12 col-md-5">
                            <div class="input-group input-group-sm">
                                <span class="input-group-text bg-white border-end-0 text-muted"><i class="fas fa-search"></i></span>
                                <input type="text" id="archiv-explorer-search" class="form-control border-start-0" placeholder="Suche in Titel, Dateiname, Jahr oder Volltext (z.B. Pachtvertrag, Wasserschaden, 1919)..." oninput="handleArchivSearchInput(this.value)">
                                <button class="btn btn-outline-secondary d-none" id="archiv-search-clear-btn" type="button" onclick="clearArchivExplorerSearch()" title="Suche leeren">
                                    <i class="fas fa-times"></i>
                                </button>
                            </div>
                        </div>
                        <div class="col-6 col-md-3">
                            <select id="archiv-filter-subcat" class="form-select form-select-sm" onchange="handleArchivSubcatChange(this.value)">
                                <option value="all">📁 Alle Unterordner</option>
                            </select>
                        </div>
                        <div class="col-6 col-md-2">
                            <select id="archiv-filter-decade" class="form-select form-select-sm" onchange="handleArchivDecadeChange(this.value)">
                                <option value="all">📅 Alle Jahrzehnte</option>
                                <option value="2020">2020–heute</option>
                                <option value="2010">2010–2019</option>
                                <option value="2000">2000–2009</option>
                                <option value="1990">1990–1999</option>
                                <option value="1980">1980–1989</option>
                                <option value="1950">1950–1979</option>
                                <option value="1919">1919–1949 (Gründerzeit)</option>
                            </select>
                        </div>
                        <div class="col-12 col-md-2">
                            <select id="archiv-filter-status" class="form-select form-select-sm" onchange="handleArchivStatusChange(this.value)">
                                <option value="all">🔍 Alle Status</option>
                                <option value="completed">✅ Mit Volltext</option>
                                <option value="pending">⏳ Nur Bild-Scans (ohne Text)</option>
                            </select>
                        </div>
                    </div>
                </div>

                <!-- ERGEBNIS-TABELLE -->
                <div class="card border-0 shadow-xs overflow-hidden" style="border-radius: 16px;">
                    <div class="px-3 py-2.5 bg-light border-bottom d-flex justify-content-between align-items-center flex-wrap gap-2">
                        <div class="small fw-semibold text-muted" id="archiv-results-summary">Lade Dokumente aus Supabase...</div>
                        <div class="d-flex align-items-center gap-2" id="archiv-pagination-controls"></div>
                    </div>
                    <div class="table-responsive">
                        <table class="table table-hover align-middle mb-0" id="archiv-documents-table">
                            <thead class="table-light small text-uppercase text-muted">
                                <tr>
                                    <th style="width: 110px;">Jahr / Datum</th>
                                    <th>Dokument &amp; Volltext-Treffer</th>
                                    <th style="width: 210px;">Bereich &amp; Unterordner</th>
                                    <th style="width: 120px;">Sichtbarkeit</th>
                                    <th style="width: 125px;">Format &amp; Index</th>
                                    <th class="text-end" style="width: 135px;">Aktion</th>
                                </tr>
                            </thead>
                            <tbody id="archiv-documents-tbody">
                                <tr>
                                    <td colspan="6" class="text-center py-5 text-muted">
                                        <div class="spinner-border spinner-border-sm text-primary me-2"></div>
                                        Lade Vereins- und Vorstandsarchiv aus Supabase...
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <!-- ============================================================ -->
            <!-- TAB 2: KI-ARCHIVAR & RAG-SUCHE                               -->
            <!-- ============================================================ -->
            <div id="archiv-tab-ki" class="tab-pane-content d-none">
                <div class="card border-0 shadow-lg p-0 overflow-hidden" style="border-radius: 20px;">
                    <!-- Chat Header -->
                    <div class="p-3 border-bottom d-flex align-items-center justify-content-between flex-wrap gap-2" style="background: linear-gradient(135deg, var(--primary), var(--primary-hover)); color: white;">
                        <div class="d-flex align-items-center">
                            <div class="position-relative me-3">
                                <div class="bg-white text-primary rounded-circle d-flex align-items-center justify-content-center" style="width: 44px; height: 44px; box-shadow: 0 4px 10px rgba(0,0,0,0.15);">
                                    <i class="fas fa-robot fa-lg text-primary"></i>
                                </div>
                                <span class="position-absolute bottom-0 end-0 bg-success border border-white border-2 rounded-circle" style="width: 12px; height: 12px;"></span>
                            </div>
                            <div>
                                <h6 class="mb-0 fw-bold" id="archiv-ai-header-title">Vereins-Archivar (Groq &amp; Supabase Hybrid-RAG)</h6>
                                <small class="opacity-75" id="archiv-ai-header-subtitle">Durchsucht 6'700+ Textabschnitte aus GV-, Vorstands-, Gebäude- &amp; Vereinsakten</small>
                            </div>
                        </div>
                        <div class="d-flex align-items-center gap-2">
                            <button class="btn btn-sm btn-outline-light rounded-pill px-3 py-1 fs-8 text-white border-white-50" onclick="openArchivAiSettingsModal()">
                                <i class="fas fa-cog me-1"></i> <span id="archiv-model-badge">qwen3.8-27b</span>
                            </button>
                            <button class="btn btn-sm btn-link text-white opacity-75 hover-opacity-100 text-decoration-none" onclick="clearChat()">
                                <i class="fas fa-trash-alt me-1"></i> Verlauf leeren
                            </button>
                        </div>
                    </div>

                    <!-- SUCHBEREICH-FILTER FÜR KI -->
                    <div class="px-4 py-2 bg-light border-bottom d-flex align-items-center flex-wrap gap-1.5">
                        <span class="small fw-bold text-muted me-1"><i class="fas fa-filter me-1 text-primary"></i>Suchbereich:</span>
                        <button class="btn btn-xs btn-primary rounded-pill px-2.5 py-1 archiv-ai-scope-btn" data-scope="all" onclick="setArchivAiScope('all', this)">Alle Bereiche</button>
                        <button class="btn btn-xs btn-outline-secondary rounded-pill px-2.5 py-1 archiv-ai-scope-btn" data-scope="vorstand" onclick="setArchivAiScope('vorstand', this)">📝 Nur Vorstandsprotokolle</button>
                        <button class="btn btn-xs btn-outline-secondary rounded-pill px-2.5 py-1 archiv-ai-scope-btn" data-scope="gv" onclick="setArchivAiScope('gv', this)">🗳️ Nur GV-Protokolle</button>
                        <button class="btn btn-xs btn-outline-secondary rounded-pill px-2.5 py-1 archiv-ai-scope-btn" data-scope="gebaeude" onclick="setArchivAiScope('gebaeude', this)">🏠 Nur Gebäude &amp; Anlagen</button>
                        <button class="btn btn-xs btn-outline-secondary rounded-pill px-2.5 py-1 archiv-ai-scope-btn" data-scope="versicherungen" onclick="setArchivAiScope('versicherungen', this)">🛡️ Nur Versicherungen</button>
                        <button class="btn btn-xs btn-outline-secondary rounded-pill px-2.5 py-1 archiv-ai-scope-btn" data-scope="chronik" onclick="setArchivAiScope('chronik', this)">📖 Nur Chronik &amp; Presse</button>
                    </div>

                    <!-- Chat Messages Area -->
                    <div id="chat-messages-container" class="p-4 overflow-y-auto" style="height: 470px; background: rgba(248, 250, 252, 0.65);">
                        <div class="chat-message bot-msg d-flex mb-3">
                            <div class="avatar-small me-2 bg-primary text-white rounded-circle d-flex align-items-center justify-content-center" style="width: 32px; height: 32px; flex-shrink: 0;">
                                <i class="fas fa-robot fa-xs"></i>
                            </div>
                            <div class="msg-bubble p-3 rounded-4 shadow-xs" style="background: white; border: 1px solid var(--border); max-width: 85%; border-top-left-radius: 4px;">
                                <p class="mb-1 small fw-medium">Grüezi! Ich bin dein KI-Archivar für die Sportschützen Muhen. Ich durchsuche in Echtzeit <strong>alle 1'148 Dokumente und 6'700+ Textabschnitte</strong> in Supabase (GV-Protokolle seit 1919, Vorstandsprotokolle seit 1973, Gebäudedossiers, Pachtverträge, Versicherungen und Reglemente).</p>
                                <p class="mb-0 small text-muted">Klicke unten auf eine Beispielfrage oder stelle deine eigene Frage:</p>
                            </div>
                        </div>
                    </div>

                    <!-- Schnellwahltasten / Echte Beispiele aus dem Archiv -->
                    <div class="px-4 py-2 border-top bg-light d-flex flex-wrap gap-1.5 align-items-center">
                        <span class="small text-muted fw-bold me-1"><i class="fas fa-lightbulb text-warning me-1"></i>Beispiele:</span>
                        <button class="btn btn-xs btn-outline-secondary rounded-pill py-1 px-2.5 fs-8" onclick="askPreset('Wer war bei der Gründung am 4. Dezember 1919 dabei?')">Gründung 1919</button>
                        <button class="btn btn-xs btn-outline-secondary rounded-pill py-1 px-2.5 fs-8" onclick="askPreset('Was wurde 2012 bezüglich des Wasserschadens in der Schützenstube protokolliert?')">Wasserschaden 2012</button>
                        <button class="btn btn-xs btn-outline-secondary rounded-pill py-1 px-2.5 fs-8" onclick="askPreset('Was wurde 2016 zum Einbau der elektronischen Scheiben beschlossen?')">Elektronische Scheiben 2016</button>
                        <button class="btn btn-xs btn-outline-secondary rounded-pill py-1 px-2.5 fs-8" onclick="askPreset('Welche Versicherungspolicen und Gebäudeschatzungen liegen im Archiv vor?')">Versicherungen &amp; Schatzung</button>
                        <button class="btn btn-xs btn-outline-secondary rounded-pill py-1 px-2.5 fs-8" onclick="askPreset('Was ist über den Neubau oder Pachtvertrag Schützenhaus Rüteli dokumentiert?')">Schützenhaus Rüteli &amp; Pachtvertrag</button>
                    </div>

                    <!-- Chat Input Area -->
                    <div class="p-3 border-top bg-white">
                        <div class="input-group">
                            <input type="text" id="archiv-chat-input" class="form-control border-end-0 py-2.5 px-3 rounded-start-pill" placeholder="Stelle eine Frage an das Vereins- und Vorstandsarchiv..." style="border: 1px solid var(--border);" onkeydown="handleChatKey(event)">
                            <button class="btn btn-primary px-4 rounded-end-pill d-flex align-items-center fw-bold" onclick="sendUserMessage()" id="archiv-send-btn">
                                <span>Fragen</span> <i class="fas fa-paper-plane ms-2"></i>
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <!-- ============================================================ -->
            <!-- TAB 3: TRANSKRIPTIONS-WERKSTATT & INDEX-STATUS               -->
            <!-- ============================================================ -->
            <div id="archiv-tab-werkstatt" class="tab-pane-content d-none">
                <div class="row g-4">
                    <div class="col-lg-5">
                        <div class="card border-0 shadow-xs p-4 h-100" style="border-radius: 16px;">
                            <h5 class="fw-bold text-primary mb-2">
                                <i class="fas fa-chart-pie me-2"></i>Volltext-Abdeckung nach Bereich
                            </h5>
                            <p class="small text-muted mb-3">
                                Digitale PDFs, Word- (<code>.doc</code>/<code>.docx</code>), Excel- (<code>.xls</code>/<code>.xlsx</code>) und Mail-Dateien (<code>.msg</code>) sind bereits automatisch indexiert. Reine Bild-Scans (z. B. alte Handschriften 1920–1960) können rechts bei Bedarf transkribiert werden.
                            </p>
                            <div id="archiv-coverage-bars" class="d-flex flex-column gap-2.5"></div>
                        </div>
                    </div>
                    <div class="col-lg-7">
                        <div class="card border-0 shadow-xs p-4 h-100" style="border-radius: 16px;">
                            <div class="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3">
                                <div>
                                    <h5 class="fw-bold text-primary mb-0">
                                        <i class="fas fa-file-signature me-2 text-warning"></i>Bild-Scans ohne Volltext (<span id="werkstatt-pending-count">0</span>)
                                    </h5>
                                    <small class="text-muted">Klicke auf «Öffnen &amp; Transkribieren», um einen Scan im Split-View anzusehen und Text zu hinterlegen.</small>
                                </div>
                            </div>
                            <div id="archiv-pending-list" class="overflow-y-auto pe-1" style="max-height: 440px;"></div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

// ============================================================================
// 2. DATEN LADEN AUS SUPABASE (public.documents)
// ============================================================================
async function loadAllArchivDocuments() {
    archivState.loading = true;
    try {
        const headers = await getArchivAuthHeaders();
        // Lade alle Dokumente (inkl. content_text für blitzschnelle lokale Volltext-Snippet-Suche)
        const res = await fetch(
            `${ARCHIV_SUPABASE_REST}/documents?select=id,title,description,category,subcategory,visibility,file_url,storage_path,original_filename,file_size_kb,file_type,year,document_date,transcription_status,ocr_method,page_count,content_text&order=year.desc.nullslast,document_date.desc.nullslast,title.asc&limit=2000`,
            { headers }
        );
        if (!res.ok) {
            throw new Error(`Supabase HTTP ${res.status}`);
        }
        const data = await res.json();
        archivState.documents = Array.isArray(data) ? data : [];
        archivState.loaded = true;
    } catch (err) {
        console.error('❌ Fehler beim Laden des Archivs aus Supabase:', err);
        const tbody = document.getElementById('archiv-documents-tbody');
        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" class="text-center py-4 text-danger">
                        <i class="fas fa-exclamation-triangle me-2"></i>Fehler beim Laden aus Supabase: ${escapeHtml(err.message)}
                    </td>
                </tr>
            `;
        }
    } finally {
        archivState.loading = false;
    }

    updateArchivKpisAndBadges();
    renderCategoryPills();
    populateSubcategoryDropdown();
    renderArchivExplorer();
    renderArchivWerkstatt();
}

async function refreshArchivDocuments(btn) {
    await UIButtonKit.withLoading(btn, async () => {
        await loadAllArchivDocuments();
        if (typeof showSuccess === 'function') {
            showSuccess(`Archiv aktualisiert (${archivState.documents.length} Dokumente).`);
        }
    });
}

function updateArchivKpisAndBadges() {
    const docs = archivState.documents || [];
    const total = docs.length;
    const vorstandDocs = docs.filter(d => d.visibility === 'vorstand').length;
    const memberDocs = docs.filter(d => d.visibility !== 'vorstand').length;
    const fulltextDocs = docs.filter(d => d.transcription_status === 'completed' || (d.content_text && d.content_text.length > 20)).length;
    const pendingDocs = total - fulltextDocs;
    const pct = total > 0 ? Math.round((fulltextDocs / total) * 100) : 0;

    const years = docs.map(d => d.year).filter(y => y && y >= 1900 && y <= 2100);
    const minYear = years.length ? Math.min(...years) : 1919;
    const maxYear = years.length ? Math.max(...years) : 2026;

    const setEl = (id, txt) => {
        const el = document.getElementById(id);
        if (el) el.textContent = txt;
    };

    setEl('archiv-kpi-total', total.toLocaleString('de-CH'));
    setEl('archiv-kpi-years', `Zeitraum ${minYear}–${maxYear}`);
    setEl('archiv-kpi-vorstand', vorstandDocs.toLocaleString('de-CH'));
    setEl('archiv-kpi-members', memberDocs.toLocaleString('de-CH'));
    setEl('archiv-kpi-fulltext', `${fulltextDocs.toLocaleString('de-CH')} (${pct}%)`);
    setEl('archiv-kpi-fulltext-sub', `${fulltextDocs} mit Volltext • ${pendingDocs} Bild-Scans`);
    setEl('tab-badge-explorer', total.toLocaleString('de-CH'));
    setEl('tab-badge-pending', pendingDocs.toLocaleString('de-CH'));
    setEl('werkstatt-pending-count', pendingDocs.toLocaleString('de-CH'));
}

// ============================================================================
// 3. KATEGORIE-PILLS, FILTER & EXPLORER-RENDERING
// ============================================================================
function renderCategoryPills() {
    const vorstandContainer = document.getElementById('archiv-cat-pills-vorstand');
    const membersContainer = document.getElementById('archiv-cat-pills-members');
    if (!vorstandContainer || !membersContainer) return;

    const counts = {};
    archivState.documents.forEach(d => {
        counts[d.category] = (counts[d.category] || 0) + 1;
    });

    const buildPill = (catKey) => {
        const cfg = ARCHIV_CATEGORIES[catKey];
        if (!cfg) return '';
        const cnt = catKey === 'all' ? archivState.documents.length : (counts[catKey] || 0);
        const isActive = archivState.activeCategory === catKey;
        const activeCls = isActive
            ? `btn-${cfg.color} text-white fw-bold shadow-xs`
            : `btn-outline-${cfg.color} bg-white text-dark fw-semibold`;
        return `
            <button type="button" class="btn btn-xs rounded-pill px-2.5 py-1.5 d-inline-flex align-items-center gap-1.5 ${activeCls}"
                    onclick="selectArchivCategory('${catKey}')">
                <i class="fas ${cfg.icon} ${isActive ? 'text-white' : `text-${cfg.color}`}"></i>
                <span>${escapeHtml(cfg.label)}</span>
                <span class="badge rounded-pill ${isActive ? 'bg-white text-dark' : 'bg-light text-muted border'}" style="font-size: 0.68rem;">${cnt}</span>
            </button>
        `;
    };

    vorstandContainer.innerHTML = ['vorstand', 'gebaeude', 'versicherungen', 'anlaesse', 'schiessbetrieb'].map(buildPill).join('');
    membersContainer.innerHTML = ['gv', 'berichte', 'einladungen', 'chronik', 'statuten'].map(buildPill).join('');
}

function populateSubcategoryDropdown() {
    const sel = document.getElementById('archiv-filter-subcat');
    if (!sel) return;

    const relevantDocs = archivState.activeCategory === 'all'
        ? archivState.documents
        : archivState.documents.filter(d => d.category === archivState.activeCategory);

    const subCounts = {};
    relevantDocs.forEach(d => {
        if (d.subcategory) {
            subCounts[d.subcategory] = (subCounts[d.subcategory] || 0) + 1;
        }
    });

    const subKeys = Object.keys(subCounts).sort((a, b) => (ARCHIV_SUBCATEGORIES[a] || a).localeCompare(ARCHIV_SUBCATEGORIES[b] || b));
    let html = `<option value="all">📁 Alle Unterordner (${relevantDocs.length})</option>`;
    subKeys.forEach(sk => {
        const label = ARCHIV_SUBCATEGORIES[sk] || sk;
        const selected = archivState.activeSubcategory === sk ? 'selected' : '';
        html += `<option value="${escapeHtml(sk)}" ${selected}>${escapeHtml(label)} (${subCounts[sk]})</option>`;
    });
    sel.innerHTML = html;
}

function selectArchivCategory(catKey) {
    archivState.activeCategory = catKey;
    archivState.activeSubcategory = 'all';
    archivState.page = 1;
    renderCategoryPills();
    populateSubcategoryDropdown();
    renderArchivExplorer();
}

function handleArchivSubcatChange(val) {
    archivState.activeSubcategory = val || 'all';
    archivState.page = 1;
    renderArchivExplorer();
}

function handleArchivDecadeChange(val) {
    archivState.activeDecade = val || 'all';
    archivState.page = 1;
    renderArchivExplorer();
}

function handleArchivStatusChange(val) {
    archivState.activeStatusFilter = val || 'all';
    archivState.page = 1;
    renderArchivExplorer();
}

function handleArchivSearchInput(val) {
    archivState.searchQuery = (val || '').trim();
    archivState.page = 1;
    const clearBtn = document.getElementById('archiv-search-clear-btn');
    if (clearBtn) {
        clearBtn.classList.toggle('d-none', !archivState.searchQuery);
    }
    renderArchivExplorer();
}

function clearArchivExplorerSearch() {
    const input = document.getElementById('archiv-explorer-search');
    if (input) input.value = '';
    handleArchivSearchInput('');
}

function getFilteredArchivDocuments() {
    const q = archivState.searchQuery.toLowerCase();
    const terms = q ? q.split(/\s+/).filter(Boolean) : [];

    return archivState.documents.filter(doc => {
        if (archivState.activeCategory !== 'all' && doc.category !== archivState.activeCategory) {
            return false;
        }
        if (archivState.activeSubcategory !== 'all' && doc.subcategory !== archivState.activeSubcategory) {
            return false;
        }
        if (archivState.activeStatusFilter === 'completed') {
            const hasText = doc.transcription_status === 'completed' || (doc.content_text && doc.content_text.length > 20);
            if (!hasText) return false;
        } else if (archivState.activeStatusFilter === 'pending') {
            const hasText = doc.transcription_status === 'completed' || (doc.content_text && doc.content_text.length > 20);
            if (hasText) return false;
        }

        if (archivState.activeDecade !== 'all') {
            const dec = parseInt(archivState.activeDecade, 10);
            const yr = doc.year || 0;
            if (dec === 2020 && yr < 2020) return false;
            if (dec === 2010 && (yr < 2010 || yr > 2019)) return false;
            if (dec === 2000 && (yr < 2000 || yr > 2009)) return false;
            if (dec === 1990 && (yr < 1990 || yr > 1999)) return false;
            if (dec === 1980 && (yr < 1980 || yr > 1989)) return false;
            if (dec === 1950 && (yr < 1950 || yr > 1979)) return false;
            if (dec === 1919 && (yr < 1919 || yr > 1949)) return false;
        }

        if (terms.length > 0) {
            const haystack = `${doc.title || ''} ${doc.description || ''} ${doc.original_filename || ''} ${doc.year || ''} ${doc.document_date || ''} ${doc.content_text || ''}`.toLowerCase();
            for (const t of terms) {
                if (!haystack.includes(t)) return false;
            }
        }
        return true;
    });
}

function buildSearchSnippet(contentText, query) {
    if (!contentText || !query) return '';
    const terms = query.toLowerCase().split(/\s+/).filter(t => t.length >= 2);
    if (terms.length === 0) return '';

    const lower = contentText.toLowerCase();
    let matchIdx = -1;
    let matchedTerm = '';
    for (const t of terms) {
        const idx = lower.indexOf(t);
        if (idx !== -1) {
            matchIdx = idx;
            matchedTerm = t;
            break;
        }
    }
    if (matchIdx === -1) return '';

    const start = Math.max(0, matchIdx - 55);
    const end = Math.min(contentText.length, matchIdx + matchedTerm.length + 95);
    let rawSnippet = contentText.substring(start, end).replace(/[\r\n\t]+/g, ' ').trim();
    let safeSnippet = escapeHtml(rawSnippet);

    // Suchbegriffe im Snippet optisch hervorheben
    terms.forEach(t => {
        const re = new RegExp(`(${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
        safeSnippet = safeSnippet.replace(re, '<mark class="px-1 rounded bg-warning-subtle text-dark fw-bold">$1</mark>');
    });

    return `
        <div class="mt-1.5 p-1.5 rounded-2 bg-primary bg-opacity-10 border-start border-primary border-3 small text-dark" style="font-size: 0.76rem; line-height: 1.35;">
            <i class="fas fa-highlighter text-primary me-1"></i><em>«...${safeSnippet}...»</em>
        </div>
    `;
}

function getFileTypeBadge(ft) {
    const ext = (ft || 'pdf').toLowerCase();
    const map = {
        pdf: { icon: 'fa-file-pdf', cls: 'bg-danger-subtle text-danger border-danger-subtle', label: 'PDF' },
        doc: { icon: 'fa-file-word', cls: 'bg-primary-subtle text-primary border-primary-subtle', label: 'DOC' },
        docx: { icon: 'fa-file-word', cls: 'bg-primary-subtle text-primary border-primary-subtle', label: 'DOCX' },
        dot: { icon: 'fa-file-word', cls: 'bg-primary-subtle text-primary border-primary-subtle', label: 'DOT' },
        dotx: { icon: 'fa-file-word', cls: 'bg-primary-subtle text-primary border-primary-subtle', label: 'DOTX' },
        xls: { icon: 'fa-file-excel', cls: 'bg-success-subtle text-success border-success-subtle', label: 'XLS' },
        xlsx: { icon: 'fa-file-excel', cls: 'bg-success-subtle text-success border-success-subtle', label: 'XLSX' },
        xlsm: { icon: 'fa-file-excel', cls: 'bg-success-subtle text-success border-success-subtle', label: 'XLSM' },
        csv: { icon: 'fa-file-csv', cls: 'bg-success-subtle text-success border-success-subtle', label: 'CSV' },
        pptx: { icon: 'fa-file-powerpoint', cls: 'bg-warning-subtle text-warning border-warning-subtle', label: 'PPTX' },
        msg: { icon: 'fa-envelope', cls: 'bg-info-subtle text-info border-info-subtle', label: 'MAIL' },
        jpg: { icon: 'fa-file-image', cls: 'bg-secondary-subtle text-secondary border-secondary-subtle', label: 'SCAN' },
        jpeg: { icon: 'fa-file-image', cls: 'bg-secondary-subtle text-secondary border-secondary-subtle', label: 'SCAN' },
        png: { icon: 'fa-file-image', cls: 'bg-secondary-subtle text-secondary border-secondary-subtle', label: 'PNG' }
    };
    const info = map[ext] || { icon: 'fa-file-lines', cls: 'bg-secondary-subtle text-secondary border-secondary-subtle', label: ext.toUpperCase() };
    return `<span class="badge border ${info.cls} fw-semibold" style="font-size: 0.68rem;"><i class="fas ${info.icon} me-1"></i>${info.label}</span>`;
}

function renderArchivExplorer() {
    const tbody = document.getElementById('archiv-documents-tbody');
    const summaryEl = document.getElementById('archiv-results-summary');
    const pagEl = document.getElementById('archiv-pagination-controls');
    if (!tbody) return;

    const filtered = getFilteredArchivDocuments();
    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / archivState.pageSize));
    if (archivState.page > totalPages) archivState.page = totalPages;

    const startIdx = (archivState.page - 1) * archivState.pageSize;
    const pageItems = filtered.slice(startIdx, startIdx + archivState.pageSize);
    const canManage = canManageArchiv();

    const catLabel = ARCHIV_CATEGORIES[archivState.activeCategory]?.label || 'Alle Dokumente';
    if (summaryEl) {
        summaryEl.innerHTML = `
            Zeige <strong>${pageItems.length ? startIdx + 1 : 0}–${startIdx + pageItems.length}</strong> von <strong>${total}</strong> Dokumenten
            in <span class="text-primary fw-bold">${escapeHtml(catLabel)}</span>
            ${archivState.searchQuery ? ` • Suchfilter: <span class="badge bg-warning-subtle text-dark border">«${escapeHtml(archivState.searchQuery)}»</span>` : ''}
        `;
    }

    if (pagEl) {
        if (totalPages <= 1) {
            pagEl.innerHTML = '';
        } else {
            pagEl.innerHTML = `
                <button class="btn btn-xs btn-outline-secondary" ${archivState.page <= 1 ? 'disabled' : ''} onclick="changeArchivPage(${archivState.page - 1})">
                    <i class="fas fa-chevron-left"></i>
                </button>
                <span class="small fw-semibold text-muted px-1">Seite ${archivState.page} / ${totalPages}</span>
                <button class="btn btn-xs btn-outline-secondary" ${archivState.page >= totalPages ? 'disabled' : ''} onclick="changeArchivPage(${archivState.page + 1})">
                    <i class="fas fa-chevron-right"></i>
                </button>
            `;
        }
    }

    if (pageItems.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="text-center py-5 text-muted">
                    <i class="fas fa-search fa-2x mb-2 opacity-50 d-block"></i>
                    <strong>Keine Dokumente für diese Filterkombination gefunden.</strong>
                    <div class="mt-2">
                        <button class="btn btn-xs btn-outline-primary rounded-pill px-3" onclick="resetArchivFilters()">Alle Filter zurücksetzen</button>
                    </div>
                </td>
            </tr>
        `;
        return;
    }

    try {
        tbody.innerHTML = pageItems.map(doc => {
            const catCfg = ARCHIV_CATEGORIES[doc.category] || { label: doc.category, icon: 'fa-folder', color: 'secondary' };
            const subLabel = ARCHIV_SUBCATEGORIES[doc.subcategory] || doc.subcategory || '';
            const hasFulltext = doc.transcription_status === 'completed' || (doc.content_text && doc.content_text.length > 20);
            const dateStr = doc.document_date ? String(doc.document_date) : '';
            const dateFormatted = dateStr && !dateStr.endsWith('-01-01')
                ? (window.UIFormatKit?.formatDate ? window.UIFormatKit.formatDate(dateStr) : (window.UIFormatKit?.date ? window.UIFormatKit.date(dateStr) : dateStr))
                : '';
            const sizeLabel = doc.file_size_kb ? `${Number(doc.file_size_kb).toLocaleString('de-CH')} KB` : '';
            const snippetHtml = archivState.searchQuery ? buildSearchSnippet(doc.content_text, archivState.searchQuery) : '';
            const cacheBustedUrl = doc.file_url ? `${doc.file_url}${doc.file_url.includes('?') ? '&' : '?'}t=${Date.now()}` : '#';

            const visBadge = doc.visibility === 'vorstand'
                ? `<span class="badge bg-danger-subtle text-danger border border-danger-subtle rounded-pill" style="font-size: 0.7rem;"><i class="fas fa-lock me-1"></i>Vorstand</span>`
                : doc.visibility === 'public'
                    ? `<span class="badge bg-success-subtle text-success border border-success-subtle rounded-pill" style="font-size: 0.7rem;"><i class="fas fa-globe me-1"></i>Öffentlich</span>`
                    : `<span class="badge bg-primary-subtle text-primary border border-primary-subtle rounded-pill" style="font-size: 0.7rem;"><i class="fas fa-users me-1"></i>Mitglieder</span>`;

            const indexBadge = hasFulltext
                ? `<span class="badge bg-success-subtle text-success border border-success-subtle" style="font-size: 0.65rem;" title="Volltext indexiert und durchsuchbar"><i class="fas fa-check me-1"></i>Volltext</span>`
                : `<span class="badge bg-warning-subtle text-warning border border-warning-subtle" style="font-size: 0.65rem;" title="Bild-Scan ohne extrahierten Text"><i class="fas fa-eye me-1"></i>Scan</span>`;

            return `
                <tr style="cursor: pointer;" onclick="openArchivDocModal('${doc.id}')">
                    <td>
                        <div class="fw-bold text-primary">${doc.year || '–'}</div>
                        ${dateFormatted ? `<div class="small text-muted" style="font-size: 0.72rem;">${escapeHtml(dateFormatted)}</div>` : ''}
                    </td>
                    <td>
                        <div class="fw-bold text-dark">${escapeHtml(doc.title || '')}</div>
                        ${doc.description && doc.description !== doc.title ? `<div class="small text-muted text-truncate" style="max-width: 520px; font-size: 0.76rem;">${escapeHtml(doc.description)}</div>` : ''}
                        ${snippetHtml}
                    </td>
                    <td>
                        <span class="badge bg-${catCfg.color}-subtle text-${catCfg.color} border border-${catCfg.color}-subtle mb-1" style="font-size: 0.7rem;">
                            <i class="fas ${catCfg.icon} me-1"></i>${escapeHtml(catCfg.label)}
                        </span>
                        ${subLabel ? `<div class="small text-muted text-truncate" style="max-width: 200px; font-size: 0.72rem;">${escapeHtml(subLabel)}</div>` : ''}
                    </td>
                    <td>${visBadge}</td>
                    <td>
                        <div class="d-flex flex-wrap gap-1 align-items-center">
                            ${getFileTypeBadge(doc.file_type)}
                            ${indexBadge}
                        </div>
                        ${sizeLabel ? `<div class="small text-muted mt-0.5" style="font-size: 0.68rem;">${sizeLabel}</div>` : ''}
                    </td>
                    <td class="text-end" onclick="event.stopPropagation();">
                        <div class="btn-group btn-group-sm">
                            <button type="button" class="btn btn-outline-primary" onclick="openArchivDocModal('${doc.id}')" title="Im Split-View öffnen (Vorschau &amp; Volltext)">
                                <i class="fas fa-book-open-reader"></i>
                            </button>
                            <a href="${escapeHtml(cacheBustedUrl)}" target="_blank" rel="noopener" class="btn btn-outline-secondary" title="Originaldatei in neuem Tab öffnen / herunterladen">
                                <i class="fas fa-up-right-from-square"></i>
                            </a>
                            ${canManage ? `
                            <button type="button" class="btn btn-outline-danger" onclick="deleteArchivDocument('${doc.id}')" title="Dokument löschen">
                                <i class="fas fa-trash-alt"></i>
                            </button>
                            ` : ''}
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    } catch (err) {
        console.error('❌ Fehler beim Rendern der Archiv-Dokumente:', err);
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="text-center py-4 text-danger">
                    <i class="fas fa-exclamation-triangle me-2"></i>Fehler bei der Tabellendarstellung: ${escapeHtml(err.message)}
                </td>
            </tr>
        `;
    }
}

function changeArchivPage(newPage) {
    archivState.page = newPage;
    renderArchivExplorer();
}

function resetArchivFilters() {
    archivState.activeCategory = 'all';
    archivState.activeSubcategory = 'all';
    archivState.activeDecade = 'all';
    archivState.activeStatusFilter = 'all';
    archivState.searchQuery = '';
    archivState.page = 1;

    const searchEl = document.getElementById('archiv-explorer-search');
    if (searchEl) searchEl.value = '';
    const decEl = document.getElementById('archiv-filter-decade');
    if (decEl) decEl.value = 'all';
    const statEl = document.getElementById('archiv-filter-status');
    if (statEl) statEl.value = 'all';
    const clearBtn = document.getElementById('archiv-search-clear-btn');
    if (clearBtn) clearBtn.classList.add('d-none');

    renderCategoryPills();
    populateSubcategoryDropdown();
    renderArchivExplorer();
}

// ============================================================================
// 4. SPLIT-SCREEN LESE- & BEARBEITUNGS-MODAL (PDF/SCAN LINKS + VOLLTEXT RECHTS)
// ============================================================================
function openArchivDocModal(docId) {
    const doc = archivState.documents.find(d => d.id === docId);
    if (!doc) return;
    archivState.currentModalDocId = docId;

    let modalEl = document.getElementById('archiv-doc-split-modal');
    if (!modalEl) {
        const modalHtml = `
            <div class="modal fade" id="archiv-doc-split-modal" tabindex="-1" aria-hidden="true">
                <div class="modal-dialog modal-xl modal-dialog-centered modal-dialog-scrollable" style="max-width: 94vw;">
                    <div class="modal-content border-0 shadow-lg" style="border-radius: 18px; min-height: 84vh;">
                        <div class="modal-header bg-light border-bottom py-2.5 px-4">
                            <div class="d-flex align-items-center gap-2 flex-wrap">
                                <span id="archiv-modal-cat-badge"></span>
                                <h5 class="modal-title fw-bold text-primary mb-0" id="archiv-modal-title">Dokument</h5>
                            </div>
                            <div class="d-flex align-items-center gap-2 ms-auto me-2">
                                <a id="archiv-modal-external-btn" href="#" target="_blank" rel="noopener" class="btn btn-sm btn-outline-primary rounded-pill px-3 fw-semibold">
                                    <i class="fas fa-external-link-alt me-1"></i> Original öffnen
                                </a>
                            </div>
                            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Schliessen"></button>
                        </div>
                        <div class="modal-body p-0">
                            <div class="row g-0" style="min-height: 74vh;">
                                <!-- LINKE SPALTE: VORSCHAU (PDF / SCAN / OFFICE-INFO) -->
                                <div class="col-lg-7 border-end bg-dark bg-opacity-10 d-flex flex-column" id="archiv-modal-preview-col" style="min-height: 74vh;"></div>
                                <!-- RECHTE SPALTE: METADATEN & DURCHSUCHBARER VOLLTEXT -->
                                <div class="col-lg-5 p-3 d-flex flex-column bg-white" id="archiv-modal-meta-col"></div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        modalEl = document.getElementById('archiv-doc-split-modal');
    }

    const canManage = canManageArchiv();
    const catCfg = ARCHIV_CATEGORIES[doc.category] || { label: doc.category, color: 'primary', icon: 'fa-folder' };
    const cacheBustedUrl = doc.file_url ? `${doc.file_url}${doc.file_url.includes('?') ? '&' : '?'}t=${Date.now()}` : '#';

    document.getElementById('archiv-modal-title').textContent = doc.title || 'Dokument';
    document.getElementById('archiv-modal-cat-badge').innerHTML = `
        <span class="badge bg-${catCfg.color} text-white rounded-pill px-2.5 py-1">
            <i class="fas ${catCfg.icon} me-1"></i>${escapeHtml(catCfg.label)}
        </span>
    `;
    const extBtn = document.getElementById('archiv-modal-external-btn');
    if (extBtn) extBtn.href = cacheBustedUrl;

    // 1. Linke Vorschau rendern
    const previewCol = document.getElementById('archiv-modal-preview-col');
    const ft = (doc.file_type || 'pdf').toLowerCase();
    if (ft === 'pdf') {
        previewCol.innerHTML = `
            <iframe src="${escapeHtml(cacheBustedUrl)}" style="width: 100%; height: 75vh; border: 0; flex-grow: 1;"></iframe>
        `;
    } else if (['jpg', 'jpeg', 'png', 'bmp'].includes(ft)) {
        previewCol.innerHTML = `
            <div class="p-3 d-flex align-items-center justify-content-center flex-grow-1 overflow-auto" style="max-height: 75vh;">
                <img src="${escapeHtml(cacheBustedUrl)}" alt="${escapeHtml(doc.title)}" class="img-fluid rounded shadow-sm" style="max-height: 70vh; object-fit: contain;">
            </div>
        `;
    } else {
        previewCol.innerHTML = `
            <div class="p-5 text-center m-auto" style="max-width: 460px;">
                <div class="mb-3">${getFileTypeBadge(ft)}</div>
                <h5 class="fw-bold text-primary mb-2">${escapeHtml(doc.original_filename || doc.title)}</h5>
                <p class="small text-muted mb-4">
                    Dieses Dokument liegt im Original als <strong>.${escapeHtml(ft.toUpperCase())}</strong>-Datei in Supabase Storage vor.
                    Rechts siehst du den <strong>vollständig extrahierten Textinhalt</strong> direkt im Browser, ohne dass du ein Zusatzprogramm benötigst!
                </p>
                <a href="${escapeHtml(cacheBustedUrl)}" target="_blank" rel="noopener" class="btn btn-primary rounded-pill px-4 fw-bold">
                    <i class="fas fa-download me-2"></i>Original-Datei (.${escapeHtml(ft)}) herunterladen
                </a>
            </div>
        `;
    }

    // 2. Rechte Spalte (Metadaten & Volltext) rendern
    const metaCol = document.getElementById('archiv-modal-meta-col');
    const catOptionsHtml = Object.entries(ARCHIV_CATEGORIES)
        .filter(([k]) => k !== 'all')
        .map(([k, v]) => `<option value="${k}" ${doc.category === k ? 'selected' : ''}>${escapeHtml(v.label)}</option>`)
        .join('');

    const subOptionsHtml = Object.entries(ARCHIV_SUBCATEGORIES)
        .map(([k, label]) => `<option value="${k}" ${doc.subcategory === k ? 'selected' : ''}>${escapeHtml(label)}</option>`)
        .join('');

    metaCol.innerHTML = `
        <div class="border-bottom pb-3 mb-3">
            <div class="d-flex justify-content-between align-items-center mb-2">
                <span class="small fw-bold text-uppercase text-muted"><i class="fas fa-tags me-1 text-primary"></i>Stammdaten &amp; Einordnung</span>
                <span class="small text-muted">${doc.file_size_kb ? `${doc.file_size_kb} KB` : ''} ${doc.page_count ? `• ${doc.page_count} S.` : ''}</span>
            </div>
            <div class="row g-2">
                <div class="col-12">
                    <label class="form-label small fw-semibold mb-0.5">Dokument-Titel</label>
                    <input type="text" id="archiv-edit-title" class="form-control form-control-sm fw-bold" value="${escapeHtml(doc.title || '')}" ${canManage ? '' : 'readonly'}>
                </div>
                <div class="col-6">
                    <label class="form-label small fw-semibold mb-0.5">Hauptbereich</label>
                    <select id="archiv-edit-category" class="form-select form-select-sm" ${canManage ? '' : 'disabled'}>
                        ${catOptionsHtml}
                    </select>
                </div>
                <div class="col-6">
                    <label class="form-label small fw-semibold mb-0.5">Unterordner</label>
                    <select id="archiv-edit-subcategory" class="form-select form-select-sm" ${canManage ? '' : 'disabled'}>
                        <option value="">– Standard –</option>
                        ${subOptionsHtml}
                    </select>
                </div>
                <div class="col-4">
                    <label class="form-label small fw-semibold mb-0.5">Jahr</label>
                    <input type="number" id="archiv-edit-year" class="form-control form-control-sm" value="${doc.year || ''}" ${canManage ? '' : 'readonly'}>
                </div>
                <div class="col-4">
                    <label class="form-label small fw-semibold mb-0.5">Datum</label>
                    <input type="date" id="archiv-edit-date" class="form-control form-control-sm" value="${doc.document_date || ''}" ${canManage ? '' : 'readonly'}>
                </div>
                <div class="col-4">
                    <label class="form-label small fw-semibold mb-0.5">Sichtbarkeit</label>
                    <select id="archiv-edit-visibility" class="form-select form-select-sm" ${canManage ? '' : 'disabled'}>
                        <option value="vorstand" ${doc.visibility === 'vorstand' ? 'selected' : ''}>🔒 Nur Vorstand</option>
                        <option value="members" ${doc.visibility === 'members' ? 'selected' : ''}>👥 Mitglieder</option>
                        <option value="public" ${doc.visibility === 'public' ? 'selected' : ''}>🌍 Öffentlich</option>
                    </select>
                </div>
            </div>
        </div>

        <!-- VOLLTEXT & TRANSKRIPTION -->
        <div class="d-flex justify-content-between align-items-center mb-1.5">
            <label class="form-label small fw-bold text-uppercase text-muted mb-0">
                <i class="fas fa-align-left me-1 text-primary"></i>Extrahierter Volltext / Transkription
            </label>
            <span class="badge ${doc.content_text ? 'bg-success-subtle text-success' : 'bg-warning-subtle text-warning'} border" style="font-size: 0.68rem;">
                ${doc.content_text ? `${doc.content_text.length.toLocaleString('de-CH')} Zeichen indexiert` : 'Noch kein Volltext'}
            </span>
        </div>
        <textarea id="archiv-edit-content" class="form-control font-monospace flex-grow-1 mb-3" style="font-size: 0.78rem; line-height: 1.5; min-height: 280px;"
                  placeholder="Hier steht der durchsuchbare Volltext des Dokuments. Du kannst bei historischen Handschriften oder Scans jederzeit Text ergänzen oder korrigieren..."
                  ${canManage ? '' : 'readonly'}>${escapeHtml(doc.content_text || '')}</textarea>

        ${canManage ? `
        <div class="d-flex justify-content-between align-items-center pt-2 border-top mt-auto">
            <small class="text-muted" style="font-size: 0.72rem;">Änderungen aktualisieren sofort den KI-Suchindex.</small>
            <button type="button" class="btn btn-sm btn-primary rounded-pill px-4 fw-bold" id="archiv-save-doc-btn" onclick="saveArchivDocChanges('${doc.id}', this)">
                <i class="fas fa-save me-1"></i> Speichern &amp; Indexieren
            </button>
        </div>
        ` : ''}
    `;

    if (window.bootstrap && window.bootstrap.Modal) {
        bootstrap.Modal.getOrCreateInstance(modalEl).show();
    }
}

function splitTextIntoChunksClient(text, maxChars = 900) {
    if (!text || !text.trim()) return [];
    const cleaned = text.replace(/\r\n/g, '\n').trim();
    const paragraphs = cleaned.split(/\n\s*\n/);
    const chunks = [];
    let current = '';
    for (let p of paragraphs) {
        p = p.trim();
        if (!p) continue;
        if (current.length + p.length + 2 <= maxChars) {
            current = current ? `${current}\n\n${p}` : p;
        } else {
            if (current) chunks.push(current);
            if (p.length <= maxChars) {
                current = p;
            } else {
                for (let i = 0; i < p.length; i += maxChars) {
                    chunks.push(p.substring(i, i + maxChars));
                }
                current = '';
            }
        }
    }
    if (current) chunks.push(current);
    return chunks.slice(0, 80);
}

async function rebuildDocumentChunksInSupabase(docId, title, category, docDate, contentText) {
    const headers = await getArchivAuthHeaders();
    await fetch(`${ARCHIV_SUPABASE_REST}/document_chunks?document_id=eq.${encodeURIComponent(docId)}`, {
        method: 'DELETE',
        headers
    });

    const chunks = splitTextIntoChunksClient(contentText, 900);
    if (chunks.length === 0) return 0;

    const rows = chunks.map((c, idx) => ({
        document_id: docId,
        document_name: (title || 'Dokument').substring(0, 250),
        category: category || 'gv',
        protocol_date: docDate || null,
        chunk_index: idx,
        page_number: 1,
        content: c
    }));

    await fetch(`${ARCHIV_SUPABASE_REST}/document_chunks`, {
        method: 'POST',
        headers,
        body: JSON.stringify(rows)
    });
    return rows.length;
}

async function saveArchivDocChanges(docId, btnEl) {
    await UIButtonKit.withLoading(btnEl, async () => {
        const title = document.getElementById('archiv-edit-title')?.value.trim();
        const category = document.getElementById('archiv-edit-category')?.value;
        const subcategory = document.getElementById('archiv-edit-subcategory')?.value || null;
        const yearVal = parseInt(document.getElementById('archiv-edit-year')?.value, 10);
        const year = !isNaN(yearVal) ? yearVal : null;
        const docDate = document.getElementById('archiv-edit-date')?.value || (year ? `${year}-01-01` : null);
        const visibility = document.getElementById('archiv-edit-visibility')?.value || 'members';
        const contentText = document.getElementById('archiv-edit-content')?.value.trim() || null;

        if (!title) {
            await UIConfirmKit.alert({ title: 'Pflichtfeld fehlt', message: 'Bitte gib einen Dokument-Titel ein.', type: 'warning' });
            return;
        }

        const hasText = !!(contentText && contentText.length >= 15);
        const payload = {
            title,
            category,
            subcategory,
            year,
            document_date: docDate,
            visibility,
            content_text: contentText,
            transcription_status: hasText ? 'completed' : 'pending',
            ocr_method: hasText ? 'manual' : 'none',
            updated_at: new Date().toISOString()
        };

        const headers = await getArchivAuthHeaders({ 'Prefer': 'return=representation' });
        const res = await fetch(`${ARCHIV_SUPABASE_REST}/documents?id=eq.${encodeURIComponent(docId)}`, {
            method: 'PATCH',
            headers,
            body: JSON.stringify(payload)
        });
        if (!res.ok) {
            throw new Error(`Speichern fehlgeschlagen (HTTP ${res.status})`);
        }

        // Chunks für Volltext-/RAG-Suche aktualisieren
        await rebuildDocumentChunksInSupabase(docId, title, category, docDate, contentText || '');

        // Lokalen State aktualisieren
        const idx = archivState.documents.findIndex(d => d.id === docId);
        if (idx !== -1) {
            archivState.documents[idx] = { ...archivState.documents[idx], ...payload };
        }

        updateArchivKpisAndBadges();
        renderCategoryPills();
        renderArchivExplorer();
        renderArchivWerkstatt();

        if (typeof showSuccess === 'function') {
            showSuccess('Dokument und Volltext-Index erfolgreich in Supabase aktualisiert!');
        }
    });
}

async function deleteArchivDocument(docId) {
    const doc = archivState.documents.find(d => d.id === docId);
    if (!doc) return;

    const confirmed = await UIConfirmKit.confirm({
        title: 'Dokument aus Archiv löschen?',
        message: `Möchtest du das Dokument «${doc.title}» (${doc.year || 'ohne Jahr'}) und alle zugehörigen Volltext-Abschnitte wirklich unwiderruflich aus Supabase löschen?`,
        type: 'danger',
        confirmText: 'Endgültig löschen',
        cancelText: 'Abbrechen'
    });
    if (!confirmed) return;

    try {
        const headers = await getArchivAuthHeaders();
        const res = await fetch(`${ARCHIV_SUPABASE_REST}/documents?id=eq.${encodeURIComponent(docId)}`, {
            method: 'DELETE',
            headers
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        archivState.documents = archivState.documents.filter(d => d.id !== docId);
        updateArchivKpisAndBadges();
        renderCategoryPills();
        populateSubcategoryDropdown();
        renderArchivExplorer();
        renderArchivWerkstatt();

        if (typeof showSuccess === 'function') {
            showSuccess(`Dokument «${doc.title}» wurde gelöscht.`);
        }
    } catch (err) {
        console.error('❌ Fehler beim Löschen:', err);
        await UIConfirmKit.alert({ title: 'Löschfehler', message: `Das Dokument konnte nicht gelöscht werden: ${err.message}`, type: 'danger' });
    }
}

// ============================================================================
// 5. DIREKT-UPLOAD MODAL (SUPABASE STORAGE + SOFORT-INDEXIERUNG)
// ============================================================================
function openArchivUploadModal() {
    let modalEl = document.getElementById('archiv-upload-modal');
    if (!modalEl) {
        const catOptionsHtml = Object.entries(ARCHIV_CATEGORIES)
            .filter(([k]) => k !== 'all')
            .map(([k, v]) => `<option value="${k}">${escapeHtml(v.label)} (${v.group === 'vorstand' ? 'Vorstand' : 'Mitglieder'})</option>`)
            .join('');

        const subOptionsHtml = Object.entries(ARCHIV_SUBCATEGORIES)
            .map(([k, label]) => `<option value="${k}">${escapeHtml(label)}</option>`)
            .join('');

        const modalHtml = `
            <div class="modal fade" id="archiv-upload-modal" tabindex="-1" aria-hidden="true">
                <div class="modal-dialog modal-lg modal-dialog-centered">
                    <div class="modal-content border-0 shadow-lg" style="border-radius: 18px;">
                        <div class="modal-header bg-primary text-white">
                            <h5 class="modal-title fw-bold">
                                <i class="fas fa-cloud-upload-alt me-2"></i>Neues Dokument ins Supabase-Archiv hochladen
                            </h5>
                            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Schliessen"></button>
                        </div>
                        <div class="modal-body p-4">
                            <div class="mb-3">
                                <label class="form-label fw-bold small">1. Datei auswählen (PDF, Word .docx, Excel .xlsx, Bild-Scan, Text)</label>
                                <input type="file" id="archiv-upload-file" class="form-control" accept=".pdf,.doc,.docx,.xls,.xlsx,.xlsm,.pptx,.msg,.odt,.txt,.csv,.jpg,.jpeg,.png" onchange="handleArchivUploadFileSelect(this)">
                                <div class="form-text small" id="archiv-upload-extract-status">
                                    Beim Auswählen einer Datei werden Titel, Datum und (bei DOCX/TXT/CSV) der Volltext direkt automatisch erkannt.
                                </div>
                            </div>
                            <div class="row g-3 mb-3">
                                <div class="col-md-8">
                                    <label class="form-label fw-semibold small">Dokument-Titel *</label>
                                    <input type="text" id="archiv-upload-title" class="form-control" placeholder="z. B. Protokoll Vorstandssitzung vom 29.10.2026">
                                </div>
                                <div class="col-md-4">
                                    <label class="form-label fw-semibold small">Sichtbarkeit *</label>
                                    <select id="archiv-upload-visibility" class="form-select">
                                        <option value="vorstand">🔒 Nur Vorstand (Vertraulich)</option>
                                        <option value="members">👥 Vereinsmitglieder</option>
                                        <option value="public">🌍 Öffentlich (Website)</option>
                                    </select>
                                </div>
                                <div class="col-md-5">
                                    <label class="form-label fw-semibold small">Hauptbereich *</label>
                                    <select id="archiv-upload-category" class="form-select" onchange="syncUploadCategoryDefaults(this.value)">
                                        ${catOptionsHtml}
                                    </select>
                                </div>
                                <div class="col-md-4">
                                    <label class="form-label fw-semibold small">Unterordner</label>
                                    <select id="archiv-upload-subcategory" class="form-select">
                                        ${subOptionsHtml}
                                    </select>
                                </div>
                                <div class="col-md-3">
                                    <label class="form-label fw-semibold small">Dokument-Datum</label>
                                    <input type="date" id="archiv-upload-date" class="form-control">
                                </div>
                            </div>
                            <div class="mb-2">
                                <label class="form-label fw-semibold small">Volltext für die Suche (wird automatisch befüllt oder kann ergänzt werden)</label>
                                <textarea id="archiv-upload-text" class="form-control font-monospace" rows="6" style="font-size: 0.78rem;" placeholder="Der ausgelesene Text erscheint hier automatisch..."></textarea>
                            </div>
                        </div>
                        <div class="modal-footer bg-light">
                            <button type="button" class="btn btn-outline-secondary rounded-pill px-3" data-bs-dismiss="modal">Abbrechen</button>
                            <button type="button" class="btn btn-primary rounded-pill px-4 fw-bold" id="archiv-upload-submit-btn" onclick="submitArchivUpload(this)">
                                <i class="fas fa-check me-1"></i> Hochladen &amp; Indexieren
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        modalEl = document.getElementById('archiv-upload-modal');
    }

    // Vorbelegen anhand des aktuell gewählten Explorer-Ordners
    const initCat = archivState.activeCategory !== 'all' ? archivState.activeCategory : 'vorstand';
    document.getElementById('archiv-upload-file').value = '';
    document.getElementById('archiv-upload-title').value = '';
    document.getElementById('archiv-upload-text').value = '';
    document.getElementById('archiv-upload-date').value = new Date().toISOString().slice(0, 10);
    document.getElementById('archiv-upload-category').value = initCat;
    syncUploadCategoryDefaults(initCat);

    if (window.bootstrap && window.bootstrap.Modal) {
        bootstrap.Modal.getOrCreateInstance(modalEl).show();
    }
}

function syncUploadCategoryDefaults(catKey) {
    const cfg = ARCHIV_CATEGORIES[catKey];
    if (!cfg) return;
    const visEl = document.getElementById('archiv-upload-visibility');
    const subEl = document.getElementById('archiv-upload-subcategory');
    if (visEl && cfg.defaultVis) visEl.value = cfg.defaultVis;
    if (subEl && cfg.defaultSub) subEl.value = cfg.defaultSub;
}

async function handleArchivUploadFileSelect(inputEl) {
    const file = inputEl.files && inputEl.files[0];
    if (!file) return;

    const titleEl = document.getElementById('archiv-upload-title');
    const dateEl = document.getElementById('archiv-upload-date');
    const textEl = document.getElementById('archiv-upload-text');
    const statusEl = document.getElementById('archiv-upload-extract-status');

    const cleanTitle = file.name.replace(/\.[^.]+$/, '').replace(/_/g, ' ').trim();
    if (titleEl && !titleEl.value) titleEl.value = cleanTitle;

    const detectedDate = extractDateFromFilename(file.name);
    if (detectedDate && dateEl) dateEl.value = detectedDate;

    const lower = file.name.toLowerCase();
    try {
        if (lower.endsWith('.docx') && typeof mammoth !== 'undefined') {
            statusEl.innerHTML = `<i class="fas fa-spinner fa-spin text-primary me-1"></i>Lese Word-Dokument (.docx) direkt im Browser aus...`;
            const txt = await extractTextFromDocx(file);
            textEl.value = txt;
            statusEl.innerHTML = `<i class="fas fa-check-circle text-success me-1"></i>Word-Text (${txt.length} Zeichen) erfolgreich ausgelesen.`;
        } else if (lower.endsWith('.txt') || lower.endsWith('.csv')) {
            const txt = await file.text();
            textEl.value = txt;
            statusEl.innerHTML = `<i class="fas fa-check-circle text-success me-1"></i>Textdatei (${txt.length} Zeichen) erfolgreich geladen.`;
        } else if (lower.endsWith('.pdf')) {
            statusEl.innerHTML = `<i class="fas fa-spinner fa-spin text-primary me-1"></i>Extrahiere Text aus PDF...`;
            const base64Pdf = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = e => resolve(e.target.result.split(',')[1]);
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });
            try {
                const res = await apiFetch('news', 'action=extract_pdf', {
                    method: 'POST',
                    body: JSON.stringify({ pdfData: base64Pdf })
                });
                if (res.ok) {
                    const d = await res.json();
                    if (d.text) {
                        textEl.value = d.text;
                        statusEl.innerHTML = `<i class="fas fa-check-circle text-success me-1"></i>PDF-Volltext (${d.text.length} Zeichen) automatisch extrahiert!`;
                        return;
                    }
                }
            } catch (e) {}
            statusEl.innerHTML = `<i class="fas fa-info-circle text-muted me-1"></i>PDF bereit zum Upload. Du kannst optional rechts/unten noch Suchtext ergänzen.`;
        }
    } catch (e) {
        statusEl.innerHTML = `<i class="fas fa-info-circle text-muted me-1"></i>Datei ausgewählt (${Math.round(file.size / 1024)} KB).`;
    }
}

function sanitizeClientStorageFilename(name) {
    const map = { 'ä': 'ae', 'ö': 'oe', 'ü': 'ue', 'Ä': 'Ae', 'Ö': 'Oe', 'Ü': 'Ue', 'ß': 'ss' };
    let s = name.replace(/[äöüÄÖÜß]/g, m => map[m] || m);
    s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const dotIdx = s.lastIndexOf('.');
    const ext = dotIdx !== -1 ? s.substring(dotIdx).toLowerCase() : '';
    const base = (dotIdx !== -1 ? s.substring(0, dotIdx) : s).replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^_+|_+$/g, '');
    return `${(base || 'dokument').substring(0, 120)}${ext}`;
}

async function submitArchivUpload(btnEl) {
    await UIButtonKit.withLoading(btnEl, async () => {
        const fileInput = document.getElementById('archiv-upload-file');
        const file = fileInput?.files?.[0];
        const title = document.getElementById('archiv-upload-title')?.value.trim();
        const category = document.getElementById('archiv-upload-category')?.value || 'vorstand';
        const subcategory = document.getElementById('archiv-upload-subcategory')?.value || 'vorstand_protokolle';
        const visibility = document.getElementById('archiv-upload-visibility')?.value || 'vorstand';
        const docDate = document.getElementById('archiv-upload-date')?.value || new Date().toISOString().slice(0, 10);
        const contentText = document.getElementById('archiv-upload-text')?.value.trim() || null;

        if (!file || !title) {
            await UIConfirmKit.alert({
                title: 'Angaben unvollständig',
                message: 'Bitte wähle eine Datei aus und vergib einen Dokument-Titel.',
                type: 'warning'
            });
            return;
        }

        const year = docDate ? parseInt(docDate.slice(0, 4), 10) : new Date().getFullYear();
        const safeName = sanitizeClientStorageFilename(file.name);
        const prefix = String(Date.now()).slice(-5);
        const storagePath = `archiv/${subcategory}/${prefix}_${safeName}`;
        const encodedPath = storagePath.split('/').map(encodeURIComponent).join('/');

        // 1. Datei in Supabase Storage Bucket 'club-documents' hochladen
        const authHeaders = await getArchivAuthHeaders();
        const uploadRes = await fetch(`${ARCHIV_SUPABASE_STORAGE}/object/club-documents/${encodedPath}`, {
            method: 'POST',
            headers: {
                'apikey': ARCHIV_SUPABASE_KEY,
                'Authorization': authHeaders['Authorization'],
                'Content-Type': file.type || 'application/octet-stream',
                'x-upsert': 'true'
            },
            body: file
        });
        if (!uploadRes.ok) {
            throw new Error(`Storage-Upload fehlgeschlagen (HTTP ${uploadRes.status})`);
        }

        const fileUrl = `${ARCHIV_SUPABASE_STORAGE}/object/public/club-documents/${encodedPath}`;
        const ext = (file.name.split('.').pop() || 'pdf').toLowerCase();
        const hasText = !!(contentText && contentText.length >= 15);

        // 2. Datensatz in public.documents anlegen
        const rowPayload = {
            title,
            description: `${ARCHIV_CATEGORIES[category]?.label || category}: ${title}`,
            category,
            subcategory,
            visibility,
            file_url: fileUrl,
            storage_path: storagePath,
            source_path: `PortalUpload/${Date.now()}_${file.name}`,
            original_filename: file.name,
            file_size_kb: Math.max(1, Math.round(file.size / 1024)),
            file_type: ext,
            year,
            document_date: docDate,
            content_text: contentText,
            transcription_status: hasText ? 'completed' : 'pending',
            ocr_method: hasText ? 'digital_pdf' : 'none',
            page_count: 1,
            sort_order: 100
        };

        const insertRes = await fetch(`${ARCHIV_SUPABASE_REST}/documents`, {
            method: 'POST',
            headers: { ...authHeaders, 'Prefer': 'return=representation' },
            body: JSON.stringify(rowPayload)
        });
        if (!insertRes.ok) {
            throw new Error(`Datenbank-Eintrag fehlgeschlagen (HTTP ${insertRes.status})`);
        }
        const insertedRows = await insertRes.json();
        const newDoc = Array.isArray(insertedRows) ? insertedRows[0] : insertedRows;

        if (hasText && newDoc?.id) {
            await rebuildDocumentChunksInSupabase(newDoc.id, title, category, docDate, contentText);
        }

        const modalEl = document.getElementById('archiv-upload-modal');
        if (modalEl && window.bootstrap?.Modal) {
            bootstrap.Modal.getInstance(modalEl)?.hide();
        }

        await loadAllArchivDocuments();
        if (typeof showSuccess === 'function') {
            showSuccess(`Dokument «${title}» erfolgreich hochgeladen und indexiert!`);
        }
    });
}

// ============================================================================
// 6. TAB 3: TRANSKRIPTIONS-WERKSTATT & VOLLTEXT-ABDECKUNG
// ============================================================================
function renderArchivWerkstatt() {
    const barsEl = document.getElementById('archiv-coverage-bars');
    const pendingListEl = document.getElementById('archiv-pending-list');
    if (!barsEl || !pendingListEl) return;

    const catOrder = ['vorstand', 'gebaeude', 'versicherungen', 'anlaesse', 'schiessbetrieb', 'gv', 'berichte', 'einladungen', 'chronik', 'statuten'];
    barsEl.innerHTML = catOrder.map(catKey => {
        const cfg = ARCHIV_CATEGORIES[catKey];
        const catDocs = archivState.documents.filter(d => d.category === catKey);
        if (catDocs.length === 0) return '';
        const withText = catDocs.filter(d => d.transcription_status === 'completed' || (d.content_text && d.content_text.length > 20)).length;
        const pct = Math.round((withText / catDocs.length) * 100);
        return `
            <div>
                <div class="d-flex justify-content-between small mb-1">
                    <span class="fw-semibold"><i class="fas ${cfg.icon} text-${cfg.color} me-1.5"></i>${escapeHtml(cfg.label)}</span>
                    <span class="text-muted">${withText} / ${catDocs.length} (${pct}%)</span>
                </div>
                <div class="progress" style="height: 7px; border-radius: 4px;">
                    <div class="progress-bar bg-${cfg.color}" style="width: ${pct}%;"></div>
                </div>
            </div>
        `;
    }).join('');

    const pendingDocs = archivState.documents.filter(d => !(d.transcription_status === 'completed' || (d.content_text && d.content_text.length > 20)));
    if (pendingDocs.length === 0) {
        pendingListEl.innerHTML = `
            <div class="text-center py-5 text-success">
                <i class="fas fa-check-circle fa-2x mb-2 d-block"></i>
                <strong>Alle Dokumente verfügen über einen durchsuchbaren Volltext!</strong>
            </div>
        `;
        return;
    }

    pendingListEl.innerHTML = pendingDocs.slice(0, 80).map(doc => {
        const catCfg = ARCHIV_CATEGORIES[doc.category] || { label: doc.category, color: 'secondary' };
        return `
            <div class="d-flex justify-content-between align-items-center p-2.5 mb-1.5 rounded-3 border bg-light bg-opacity-50">
                <div class="text-truncate me-2">
                    <div class="fw-bold small text-dark text-truncate">${escapeHtml(doc.title)}</div>
                    <div class="text-muted" style="font-size: 0.72rem;">
                        <span class="badge bg-${catCfg.color}-subtle text-${catCfg.color} border me-1">${escapeHtml(catCfg.label)}</span>
                        Jahr: <strong>${doc.year || '–'}</strong> • Format: ${(doc.file_type || 'PDF').toUpperCase()}
                    </div>
                </div>
                <button class="btn btn-xs btn-outline-primary rounded-pill px-3 fw-semibold flex-shrink-0" onclick="openArchivDocModal('${doc.id}')">
                    <i class="fas fa-book-open me-1"></i> Öffnen &amp; Text erfassen
                </button>
            </div>
        `;
    }).join('');
}

// ============================================================================
// 7. EXCEL-EXPORT (UIExportKit)
// ============================================================================
function exportArchivToExcel() {
    const filtered = getFilteredArchivDocuments();
    if (!filtered.length) return;

    const cols = [
        { key: 'year', header: 'Jahr' },
        { key: 'document_date', header: 'Datum' },
        { key: 'title', header: 'Dokument-Titel' },
        { key: 'category_label', header: 'Hauptbereich' },
        { key: 'subcategory_label', header: 'Unterordner' },
        { key: 'visibility', header: 'Sichtbarkeit' },
        { key: 'file_type', header: 'Format' },
        { key: 'file_size_kb', header: 'Grösse (KB)' },
        { key: 'has_fulltext', header: 'Volltext indexiert' },
        { key: 'file_url', header: 'Supabase Direktlink' }
    ];

    const rows = filtered.map(d => ({
        year: d.year || '',
        document_date: d.document_date || '',
        title: d.title || '',
        category_label: ARCHIV_CATEGORIES[d.category]?.label || d.category,
        subcategory_label: ARCHIV_SUBCATEGORIES[d.subcategory] || d.subcategory || '',
        visibility: d.visibility === 'vorstand' ? 'Nur Vorstand' : (d.visibility === 'public' ? 'Öffentlich' : 'Mitglieder'),
        file_type: (d.file_type || 'pdf').toUpperCase(),
        file_size_kb: d.file_size_kb || 0,
        has_fulltext: (d.transcription_status === 'completed' || (d.content_text && d.content_text.length > 20)) ? 'Ja' : 'Nein (Scan)',
        file_url: d.file_url || ''
    }));

    if (window.UIExportKit && typeof window.UIExportKit.dataToExcel === 'function') {
        window.UIExportKit.dataToExcel(rows, cols, `Vereinsarchiv_Sportschuetzen_Muhen_${new Date().toISOString().slice(0, 10)}.xlsx`);
    }
}

// ============================================================================
// 8. TAB SWITCHER & KI-ARCHIVAR (HYBRID-RAG DIREKT GEGEN SUPABASE + GROQ)
// ============================================================================
function switchArchivTab(tabName) {
    archivState.activeTab = tabName;
    const tabs = ['explorer', 'ki', 'werkstatt'];
    tabs.forEach(t => {
        const pane = document.getElementById(`archiv-tab-${t}`);
        const btn = document.getElementById(`tab-btn-${t}`);
        if (pane) pane.classList.toggle('d-none', t !== tabName);
        if (btn) {
            if (t === tabName) {
                btn.classList.add('active', 'bg-primary', 'text-white');
                btn.classList.remove('text-secondary');
            } else {
                btn.classList.remove('active', 'bg-primary', 'text-white');
                btn.classList.add('text-secondary');
            }
        }
    });
    if (tabName === 'werkstatt') {
        renderArchivWerkstatt();
    }
}

function setArchivAiScope(scope, btnEl) {
    archivState.aiScopeCategory = scope || 'all';
    document.querySelectorAll('.archiv-ai-scope-btn').forEach(b => {
        b.classList.remove('btn-primary');
        b.classList.add('btn-outline-secondary');
    });
    if (btnEl) {
        btnEl.classList.remove('btn-outline-secondary');
        btnEl.classList.add('btn-primary');
    }
}

function askPreset(question) {
    const input = document.getElementById('archiv-chat-input');
    if (input) {
        input.value = question;
        sendUserMessage();
    }
}

function clearChat() {
    const chatContainer = document.getElementById('chat-messages-container');
    if (chatContainer) {
        chatContainer.innerHTML = `
            <div class="chat-message bot-msg d-flex mb-3">
                <div class="avatar-small me-2 bg-primary text-white rounded-circle d-flex align-items-center justify-content-center" style="width: 32px; height: 32px; flex-shrink: 0;">
                    <i class="fas fa-robot fa-xs"></i>
                </div>
                <div class="msg-bubble p-3 rounded-4 shadow-xs" style="background: white; border: 1px solid var(--border); max-width: 80%; border-top-left-radius: 4px;">
                    <p class="mb-0 small fw-medium">Der Chatverlauf wurde geleert. Welche Frage zum Vereins- oder Vorstandsarchiv darf ich für dich recherchieren?</p>
                </div>
            </div>
        `;
    }
}

function handleChatKey(event) {
    if (event.key === 'Enter') {
        event.preventDefault();
        sendUserMessage();
    }
}

async function sendUserMessage() {
    const input = document.getElementById('archiv-chat-input');
    const chatContainer = document.getElementById('chat-messages-container');
    const sendBtn = document.getElementById('archiv-send-btn');

    if (!input || !input.value.trim()) return;
    const question = input.value.trim();
    input.value = '';

    const userMsgHtml = `
        <div class="chat-message user-msg d-flex mb-3 justify-content-end">
            <div class="msg-bubble p-3 rounded-4 shadow-xs text-white" style="background: linear-gradient(135deg, var(--primary), var(--primary-hover)); max-width: 80%; border-top-right-radius: 4px;">
                <p class="mb-0 small fw-medium">${escapeHtml(question)}</p>
            </div>
            <div class="avatar-small ms-2 bg-secondary text-white rounded-circle d-flex align-items-center justify-content-center" style="width: 32px; height: 32px; flex-shrink: 0; font-size: 0.75rem; font-weight: bold;">
                Du
            </div>
        </div>
    `;
    chatContainer.insertAdjacentHTML('beforeend', userMsgHtml);
    chatContainer.scrollTop = chatContainer.scrollHeight;

    const botTypingId = `typing-${Date.now()}`;
    chatContainer.insertAdjacentHTML('beforeend', `
        <div class="chat-message bot-msg d-flex mb-3" id="${botTypingId}">
            <div class="avatar-small me-2 bg-primary text-white rounded-circle d-flex align-items-center justify-content-center" style="width: 32px; height: 32px; flex-shrink: 0;">
                <i class="fas fa-robot fa-xs"></i>
            </div>
            <div class="msg-bubble p-3 rounded-4 shadow-xs" style="background: white; border: 1px solid var(--border); max-width: 80%; border-top-left-radius: 4px;">
                <div class="d-flex align-items-center gap-2 small text-muted">
                    <span class="spinner-border spinner-border-sm text-primary"></span>
                    <span>Durchsuche Supabase-Archiv (6'700+ Textabschnitte) &amp; generiere Antwort...</span>
                </div>
            </div>
        </div>
    `);
    chatContainer.scrollTop = chatContainer.scrollHeight;

    input.disabled = true;
    sendBtn.disabled = true;

    try {
        // 1. Direkt-Suche in Supabase PostgreSQL via RPC search_archive_fulltext
        const headers = await getArchivAuthHeaders();
        const catParam = archivState.aiScopeCategory === 'all' ? null : archivState.aiScopeCategory;
        const rpcRes = await fetch(`${ARCHIV_SUPABASE_REST}/rpc/search_archive_fulltext`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                p_query: question,
                p_category: catParam,
                p_limit: 7,
                p_include_vorstand: true
            })
        });

        let sources = [];
        if (rpcRes.ok) {
            const rpcData = await rpcRes.json();
            if (Array.isArray(rpcData)) {
                sources = rpcData.map(row => ({
                    id: row.id,
                    document_id: row.document_id,
                    document_name: row.document_name,
                    protocol_date: row.protocol_date || (row.year ? `${row.year}` : 'unbekannt'),
                    year: row.year,
                    category: row.category,
                    subcategory: row.subcategory,
                    visibility: row.visibility,
                    file_url: row.file_url,
                    file_type: row.file_type,
                    content: row.content || '',
                    similarity: Math.min(0.99, Math.max(0.55, (row.rank || 0.2) * 0.8 + 0.5))
                }));
            }
        }

        // 2. Antwort über Worker / Groq Proxy erzeugen
        let answer = '';
        if (sources.length === 0) {
            answer = 'Ich konnte im ausgewählten Archiv-Bereich leider keine passenden Textstellen zu deiner Frage finden. Versuche es gerne mit einem kürzeren Stichwort oder wähle oben «Alle Bereiche».';
        } else {
            const res = await apiFetch('archiv', { action: 'ask' }, {
                method: 'POST',
                body: JSON.stringify({
                    question,
                    category: catParam,
                    model: archivAiConfig.model,
                    endpoint: archivAiConfig.endpoint,
                    token: archivAiConfig.token,
                    preloadedSources: sources
                })
            });
            const data = await res.json();
            if (data && data.success && data.answer) {
                answer = data.answer;
                if (Array.isArray(data.sources) && data.sources.length > 0 && sources.length === 0) {
                    sources = data.sources;
                }
            } else {
                throw new Error(data?.error || 'Keine Antwort vom KI-Endpunkt erhalten.');
            }
        }

        document.getElementById(botTypingId)?.remove();

        // 3. Quellen-Akkordeon mit direktem Supabase Split-View & Original-PDF Link rendern
        let sourcesHtml = '';
        if (sources.length > 0) {
            const uniqueId = `sources-${Date.now()}`;
            sourcesHtml = `
                <div class="mt-3 pt-2.5 border-top">
                    <span class="d-block small text-muted fw-bold mb-2">
                        <i class="fas fa-book-bookmark me-1 text-primary"></i> Gefundene Original-Quellen in Supabase (${sources.length}):
                    </span>
                    <div class="accordion accordion-flush" id="${uniqueId}">
                        ${sources.map((src, index) => {
                            const collapseId = `${uniqueId}-collapse-${index}`;
                            const catCfg = ARCHIV_CATEGORIES[src.category] || { label: src.category || 'Archiv', color: 'primary' };
                            const cacheUrl = src.file_url ? `${src.file_url}${src.file_url.includes('?') ? '&' : '?'}t=${Date.now()}` : '';
                            return `
                                <div class="accordion-item border-0 bg-transparent mb-1.5">
                                    <h2 class="accordion-header">
                                        <button class="accordion-button collapsed py-1.5 px-2.5 bg-light rounded text-dark fs-8 border d-flex justify-content-between align-items-center w-100" type="button" data-bs-toggle="collapse" data-bs-target="#${collapseId}" aria-expanded="false" style="box-shadow: none; font-size: 0.78rem;">
                                            <span class="text-truncate" style="max-width: 72%;">
                                                <i class="fas fa-file-lines me-1.5 text-primary"></i>
                                                <strong>${escapeHtml(src.document_name)}</strong>
                                                <span class="text-muted ms-1">(${escapeHtml(String(src.year || src.protocol_date || ''))})</span>
                                            </span>
                                            <span class="badge bg-${catCfg.color}-subtle text-${catCfg.color} border ms-auto me-2">${escapeHtml(catCfg.label)}</span>
                                        </button>
                                    </h2>
                                    <div id="${collapseId}" class="accordion-collapse collapse" data-bs-parent="#${uniqueId}">
                                        <div class="accordion-body p-2.5 bg-white border border-top-0 rounded-bottom fs-8 text-muted" style="white-space: pre-wrap; line-height: 1.45; font-size: 0.76rem; max-height: 200px; overflow-y: auto;">
                                            <div class="font-monospace">${escapeHtml(src.content)}</div>
                                            <div class="mt-2 pt-2 border-top d-flex justify-content-end gap-2">
                                                ${src.document_id ? `
                                                <button type="button" class="btn btn-xs btn-outline-primary py-1 px-2.5 fw-semibold rounded-pill" onclick="openArchivDocModal('${src.document_id}')" style="font-size: 0.72rem;">
                                                    <i class="fas fa-book-open-reader me-1"></i> Im Split-View öffnen
                                                </button>
                                                ` : ''}
                                                ${cacheUrl ? `
                                                <a href="${escapeHtml(cacheUrl)}" target="_blank" rel="noopener" class="btn btn-xs btn-primary py-1 px-2.5 fw-semibold rounded-pill text-white text-decoration-none" style="font-size: 0.72rem;">
                                                    <i class="fas fa-up-right-from-square me-1"></i> Original-Datei öffnen
                                                </a>
                                                ` : ''}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
            `;
        }

        const botResponseHtml = `
            <div class="chat-message bot-msg d-flex mb-3">
                <div class="avatar-small me-2 bg-primary text-white rounded-circle d-flex align-items-center justify-content-center" style="width: 32px; height: 32px; flex-shrink: 0;">
                    <i class="fas fa-robot fa-xs"></i>
                </div>
                <div class="msg-bubble p-3 rounded-4 shadow-xs" style="background: white; border: 1px solid var(--border); max-width: 85%; border-top-left-radius: 4px;">
                    <div class="markdown-body small fw-medium" style="line-height: 1.55; white-space: pre-wrap;">${escapeHtml(answer)}</div>
                    ${sourcesHtml}
                </div>
            </div>
        `;
        chatContainer.insertAdjacentHTML('beforeend', botResponseHtml);
    } catch (err) {
        console.error('❌ Archiv Chat Fehler:', err);
        document.getElementById(botTypingId)?.remove();
        chatContainer.insertAdjacentHTML('beforeend', `
            <div class="chat-message bot-msg d-flex mb-3">
                <div class="avatar-small me-2 bg-danger text-white rounded-circle d-flex align-items-center justify-content-center" style="width: 32px; height: 32px; flex-shrink: 0;">
                    <i class="fas fa-exclamation-triangle fa-xs"></i>
                </div>
                <div class="msg-bubble p-3 rounded-4 shadow-xs border border-danger-subtle bg-danger-subtle text-danger" style="max-width: 80%; border-top-left-radius: 4px;">
                    <p class="mb-0 small fw-bold">Fehler bei der Archiv-Abfrage</p>
                    <p class="mb-0 small">${escapeHtml(err.message)}</p>
                </div>
            </div>
        `);
    } finally {
        chatContainer.scrollTop = chatContainer.scrollHeight;
        input.disabled = false;
        sendBtn.disabled = false;
        input.focus();
    }
}

// ============================================================================
// 9. HILFSFUNKTIONEN & DYNAMISCHE KI-KONFIGURATION
// ============================================================================
function extractDateFromFilename(filename) {
    const dmyMatch = filename.match(/(\d{1,2})[\.\-\_](\d{1,2})[\.\-\_](\d{4})/);
    if (dmyMatch) {
        return `${dmyMatch[3]}-${dmyMatch[2].padStart(2, '0')}-${dmyMatch[1].padStart(2, '0')}`;
    }
    const ymdMatch = filename.match(/(\d{4})[\.\-\_](\d{1,2})[\.\-\_](\d{1,2})/);
    if (ymdMatch) {
        return `${ymdMatch[1]}-${ymdMatch[2].padStart(2, '0')}-${ymdMatch[3].padStart(2, '0')}`;
    }
    const ymdCompact = filename.match(/(19|20)(\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])/);
    if (ymdCompact) {
        return `${ymdCompact[1]}${ymdCompact[2]}-${ymdCompact[3]}-${ymdCompact[4]}`;
    }
    const yearMatch = filename.match(/(?:^|[^0-9])(19\d{2}|20\d{2})(?:[^0-9]|$)/);
    if (yearMatch) {
        return `${yearMatch[1]}-01-01`;
    }
    return null;
}

function extractTextFromDocx(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = function (e) {
            if (typeof mammoth === 'undefined') {
                reject(new Error('Mammoth.js ist nicht geladen.'));
                return;
            }
            mammoth.extractRawText({ arrayBuffer: e.target.result })
                .then(result => resolve((result.value || '').trim()))
                .catch(err => reject(err));
        };
        reader.onerror = () => reject(new Error('Dateilesefehler'));
        reader.readAsArrayBuffer(file);
    });
}

async function loadArchivAiConfig() {
    try {
        const res = await fetch(`${ARCHIV_SUPABASE_REST}/system_app_configs?category=eq.archiv&select=key,value`, {
            headers: {
                'apikey': ARCHIV_SUPABASE_KEY,
                'Authorization': `Bearer ${ARCHIV_SUPABASE_KEY}`
            }
        });
        if (res.ok) {
            const configs = await res.json();
            if (Array.isArray(configs)) {
                configs.forEach(c => {
                    if (c.key === 'archiv_ai_model' && c.value) {
                        archivAiConfig.model = c.value;
                        localStorage.setItem('archiv_ai_model', c.value);
                    }
                    if (c.key === 'archiv_ai_endpoint' && c.value) {
                        archivAiConfig.endpoint = c.value;
                        localStorage.setItem('archiv_ai_endpoint', c.value);
                    }
                    if (c.key === 'archiv_ai_token' && c.value) {
                        archivAiConfig.token = c.value;
                        localStorage.setItem('archiv_ai_token', c.value);
                    }
                });
            }
        }
    } catch (err) {
        console.warn('Archiv AI Config aus lokalem Cache verwendet:', err);
    }
    updateArchivAiHeaderBadge();
}

function updateArchivAiHeaderBadge() {
    const shortName = (archivAiConfig.model || 'qwen3.8-27b').split('/').pop();
    const badge = document.getElementById('archiv-model-badge');
    const topLabel = document.getElementById('archiv-top-model-label');
    const headerTitle = document.getElementById('archiv-ai-header-title');
    if (badge) badge.textContent = shortName;
    if (topLabel) topLabel.textContent = shortName;
    if (headerTitle) headerTitle.textContent = `Vereins-Archivar (${shortName} & Supabase Hybrid-RAG)`;
}

function openArchivAiSettingsModal() {
    let modalEl = document.getElementById('archiv-ai-settings-modal');
    if (!modalEl) {
        const modalHtml = `
            <div class="modal fade" id="archiv-ai-settings-modal" tabindex="-1" aria-hidden="true">
                <div class="modal-dialog modal-dialog-centered">
                    <div class="modal-content border-0 shadow-lg" style="border-radius: 16px;">
                        <div class="modal-header bg-light border-bottom">
                            <h5 class="modal-title fw-bold">
                                <i class="fas fa-sliders-h text-primary me-2"></i>KI-Archiv-Konfiguration
                            </h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Schliessen"></button>
                        </div>
                        <div class="modal-body p-4">
                            <p class="small text-muted mb-3">
                                Hier kannst du das aktive Sprachmodell und den API-Proxy jederzeit anpassen, ohne den Programmcode zu ändern.
                            </p>
                            <div class="mb-3">
                                <label class="form-label small fw-bold text-muted mb-1">Empfohlene Modelle (1-Klick-Schnellwahl):</label>
                                <div class="d-flex flex-wrap gap-1">
                                    <button type="button" class="btn btn-xs btn-outline-primary rounded-pill py-1 px-2.5 fs-8" onclick="applyArchivModelPreset('qwen/qwen3.8-27b')">
                                        ⚡ Qwen 3.8 27B (Groq)
                                    </button>
                                    <button type="button" class="btn btn-xs btn-outline-primary rounded-pill py-1 px-2.5 fs-8" onclick="applyArchivModelPreset('openai/gpt-oss-120b')">
                                        🧠 GPT-OSS 120B (Groq)
                                    </button>
                                    <button type="button" class="btn btn-xs btn-outline-secondary rounded-pill py-1 px-2.5 fs-8" onclick="applyArchivLocalOllamaPreset()">
                                        🏠 Lokales Ollama (GTX 1070)
                                    </button>
                                </div>
                            </div>
                            <div class="mb-3">
                                <label for="archiv-cfg-model" class="form-label small fw-bold">Modell-Name (ID):</label>
                                <input type="text" class="form-control font-monospace fs-8" id="archiv-cfg-model" placeholder="z. B. qwen/qwen3.8-27b">
                            </div>
                            <div class="mb-3">
                                <label for="archiv-cfg-endpoint" class="form-label small fw-bold">API-Endpunkt (Chat-Proxy):</label>
                                <input type="text" class="form-control font-monospace fs-8" id="archiv-cfg-endpoint">
                            </div>
                            <div class="mb-3">
                                <label for="archiv-cfg-token" class="form-label small fw-bold">Proxy Bearer-Token:</label>
                                <input type="password" class="form-control font-monospace fs-8" id="archiv-cfg-token" placeholder="Bearer Token">
                            </div>
                        </div>
                        <div class="modal-footer bg-light border-top">
                            <button type="button" class="btn btn-sm btn-outline-secondary px-3" data-bs-dismiss="modal">Abbrechen</button>
                            <button type="button" class="btn btn-sm btn-primary px-4 fw-bold" onclick="saveArchivAiSettingsFromModal()">
                                <i class="fas fa-check me-1"></i> Speichern &amp; Aktivieren
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        modalEl = document.getElementById('archiv-ai-settings-modal');
    }

    document.getElementById('archiv-cfg-model').value = archivAiConfig.model;
    document.getElementById('archiv-cfg-endpoint').value = archivAiConfig.endpoint;
    document.getElementById('archiv-cfg-token').value = archivAiConfig.token;

    if (window.bootstrap && window.bootstrap.Modal) {
        bootstrap.Modal.getOrCreateInstance(modalEl).show();
    }
}

function applyArchivModelPreset(modelName) {
    const input = document.getElementById('archiv-cfg-model');
    if (input) input.value = modelName;
    const ep = document.getElementById('archiv-cfg-endpoint');
    if (ep && ep.value.includes(':11434')) {
        ep.value = 'https://homeassistant-api.dan-hunziker73.workers.dev/groq/chat/completions';
    }
}

function applyArchivLocalOllamaPreset() {
    const input = document.getElementById('archiv-cfg-model');
    const ep = document.getElementById('archiv-cfg-endpoint');
    if (input) input.value = 'qwen2.5:7b';
    if (ep) ep.value = 'http://192.168.68.56:11434/api/generate';
}

async function saveArchivAiSettingsFromModal() {
    const newModel = document.getElementById('archiv-cfg-model').value.trim();
    const newEndpoint = document.getElementById('archiv-cfg-endpoint').value.trim();
    const newToken = document.getElementById('archiv-cfg-token').value.trim();

    if (!newModel || !newEndpoint) {
        if (typeof showError === 'function') showError('Modell-Name und Endpunkt dürfen nicht leer sein.');
        return;
    }

    archivAiConfig.model = newModel;
    archivAiConfig.endpoint = newEndpoint;
    archivAiConfig.token = newToken;

    localStorage.setItem('archiv_ai_model', newModel);
    localStorage.setItem('archiv_ai_endpoint', newEndpoint);
    localStorage.setItem('archiv_ai_token', newToken);

    try {
        const headers = await getArchivAuthHeaders();
        await fetch(`${ARCHIV_SUPABASE_REST}/system_app_configs?key=eq.archiv_ai_model`, {
            method: 'PATCH',
            headers,
            body: JSON.stringify({ value: newModel, updated_at: new Date().toISOString() })
        });
        await fetch(`${ARCHIV_SUPABASE_REST}/system_app_configs?key=eq.archiv_ai_endpoint`, {
            method: 'PATCH',
            headers,
            body: JSON.stringify({ value: newEndpoint, updated_at: new Date().toISOString() })
        });
        await fetch(`${ARCHIV_SUPABASE_REST}/system_app_configs?key=eq.archiv_ai_token`, {
            method: 'PATCH',
            headers,
            body: JSON.stringify({ value: newToken, updated_at: new Date().toISOString() })
        });
    } catch (e) {
        console.warn('Sync zu Supabase fehlgeschlagen (lokal gespeichert):', e);
    }

    updateArchivAiHeaderBadge();
    const modalEl = document.getElementById('archiv-ai-settings-modal');
    if (modalEl && window.bootstrap?.Modal) {
        bootstrap.Modal.getInstance(modalEl)?.hide();
    }
    if (typeof showSuccess === 'function') {
        showSuccess(`KI-Modell erfolgreich auf «${newModel.split('/').pop()}» aktualisiert!`);
    }
}

// Globale Exporte für HTML onclick-Handler
window.initArchiv = initArchiv;
window.switchArchivTab = switchArchivTab;
window.selectArchivCategory = selectArchivCategory;
window.handleArchivSubcatChange = handleArchivSubcatChange;
window.handleArchivDecadeChange = handleArchivDecadeChange;
window.handleArchivStatusChange = handleArchivStatusChange;
window.handleArchivSearchInput = handleArchivSearchInput;
window.clearArchivExplorerSearch = clearArchivExplorerSearch;
window.changeArchivPage = changeArchivPage;
window.resetArchivFilters = resetArchivFilters;
window.openArchivDocModal = openArchivDocModal;
window.saveArchivDocChanges = saveArchivDocChanges;
window.deleteArchivDocument = deleteArchivDocument;
window.openArchivUploadModal = openArchivUploadModal;
window.syncUploadCategoryDefaults = syncUploadCategoryDefaults;
window.handleArchivUploadFileSelect = handleArchivUploadFileSelect;
window.submitArchivUpload = submitArchivUpload;
window.refreshArchivDocuments = refreshArchivDocuments;
window.exportArchivToExcel = exportArchivToExcel;
window.setArchivAiScope = setArchivAiScope;
window.askPreset = askPreset;
window.clearChat = clearChat;
window.handleChatKey = handleChatKey;
window.sendUserMessage = sendUserMessage;
window.openArchivAiSettingsModal = openArchivAiSettingsModal;
window.applyArchivModelPreset = applyArchivModelPreset;
window.applyArchivLocalOllamaPreset = applyArchivLocalOllamaPreset;
window.saveArchivAiSettingsFromModal = saveArchivAiSettingsFromModal;
