'use strict';

// ── State ─────────────────────────────────────────────────────────────────────

let allGroups        = [];
let activeFilter     = 'all';
let activeTypeFilter = null;
let mergeMode        = false;
const STORAGE_KEY = 'parcoursup_v1';
const USERS_KEY   = 'parcoursup_users';
const ACTIVE_USER_KEY = 'parcoursup_active_user';

// ── Probabilité d'admission ────────────────────────────────────────────────────

const CHANCE_CYCLE = ['', 'sure', 'probable', 'unlikely'];

// ── Formation type ────────────────────────────────────────────────────────────

const TYPE_SLUGS = {
    'Ingénieur': 'ingenieur',
    'BUT':       'but',
    'CPGE':      'cpge',
    'Licence':   'licence',
    'Bachelor':  'bachelor',
    'DNT':       'dnt',
};

function getFormationType(detail, name = '') {
    // "Bachelor" dans le nom prend priorité (ex: "Icam - Bachelor international…")
    if (/\bBachelor\b/i.test(name)) return 'Bachelor';
    if (!detail) return null;
    if (/^Formation d[''']/.test(detail)) return 'Ingénieur';
    if (detail.startsWith('BUT -'))    return 'BUT';
    if (detail.startsWith('CPGE -'))   return 'CPGE';
    if (detail.startsWith('Licence -')) return 'Licence';
    if (detail.startsWith('Bachelor')) return 'Bachelor';
    if (detail.startsWith('Diplôme national de technologie')) return 'DNT';
    return null;
}

// ── localStorage ──────────────────────────────────────────────────────────────

function slug(str) {
    return str
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
}

function userSlug(name) {
    return slug(name || '');
}

function _storageKey() {
    const active = getActiveUser();
    return active ? (STORAGE_KEY + '_' + userSlug(active)) : STORAGE_KEY;
}

function storageSave(data) {
    try { localStorage.setItem(_storageKey(), JSON.stringify(data)); } catch (_) {}
}

function storageLoad() {
    try { return JSON.parse(localStorage.getItem(_storageKey())); } catch (_) { return null; }
}

function getActiveUser() {
    try { return localStorage.getItem(ACTIVE_USER_KEY); } catch (_) { return null; }
}

function setActiveUser(name) {
    try {
        if (name) localStorage.setItem(ACTIVE_USER_KEY, name);
        else localStorage.removeItem(ACTIVE_USER_KEY);
    } catch (_) {}
}

function getUsers() {
    try { return JSON.parse(localStorage.getItem(USERS_KEY)) || []; } catch (_) { return []; }
}

function addUser(name) {
    const users = getUsers();
    if (!users.includes(name)) {
        users.push(name);
        try { localStorage.setItem(USERS_KEY, JSON.stringify(users)); } catch (_) {}
    }
}

function migrateLegacySession() {
    try {
        const users = getUsers();
        if (users.length > 0) return; // déjà migré
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return;
        const data = JSON.parse(raw);
        if (!data || (!data.text && (!data.snapshot || data.snapshot.length === 0))) return;
        const defaultName = 'Moi';
        const key = STORAGE_KEY + '_' + userSlug(defaultName);
        if (localStorage.getItem(key)) return; // évite d'écraser si déjà existant
        localStorage.setItem(key, raw);
        addUser(defaultName);
        setActiveUser(defaultName);
    } catch (_) {}
}

function switchUser(name) {
    if (!name) return;
    setActiveUser(name);
    location.reload();
}

function createUser(name) {
    const clean = (name || '').trim();
    if (!clean) { alert('Veuillez entrer un nom.'); return; }
    const s = userSlug(clean);
    const existing = getUsers().find(u => userSlug(u) === s);
    if (existing) {
        switchUser(existing);
        return;
    }
    addUser(clean);
    setActiveUser(clean);
    location.reload();
}

function createUserFromInput() {
    const input = document.getElementById('userInput');
    if (!input) return;
    createUser(input.value);
}

function _setupUserInput() {
    const input = document.getElementById('userInput');
    if (!input) return;
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            createUserFromInput();
        }
    });
}

function _populateUserSelect() {
    const select = document.getElementById('userSelect');
    if (!select) return;
    const users = getUsers();
    const active = getActiveUser();
    select.innerHTML = '';
    if (users.length === 0) {
        select.hidden = true;
        return;
    }
    select.hidden = false;
    for (const u of users) {
        const opt = document.createElement('option');
        opt.value = u;
        opt.textContent = u;
        if (u === active) opt.selected = true;
        select.appendChild(opt);
    }
}

// ── Export / Import / Partage par lien ────────────────────────────────────────

function _encodeState(data) {
    // JSON → UTF-8 percent-encoded → latin1 → base64 (supporte les accents)
    return btoa(unescape(encodeURIComponent(JSON.stringify(data))));
}

function _decodeState(b64) {
    return JSON.parse(decodeURIComponent(escape(atob(b64))));
}

function exportJSON() {
    const saved = storageLoad();
    if (!saved || !saved.snapshot) { alert('Aucune session à exporter.'); return; }
    const version = (saved.version || 0) + 1;
    const payload = { ...saved, version, lastModified: Date.now(), lastExportedVersion: version };
    storageSave(payload);
    _updateExportStatus();
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'parcoursup-classement.json';
    a.click();
    URL.revokeObjectURL(url);
}

function importJSON(event) {
    const file = event.target.files[0];
    if (!file) return;
    event.target.value = '';
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            if (!data.snapshot && !data.text) throw new Error();

            const saved = storageLoad() || {};
            const localVersion = saved.version || 0;
            const fileVersion  = data.version || 0;
            const localDate = saved.lastModified ? new Date(saved.lastModified).toLocaleString('fr-FR') : 'inconnue';
            const fileDate  = data.lastModified ? new Date(data.lastModified).toLocaleString('fr-FR') : 'inconnue';

            if (fileVersion < localVersion) {
                const msg =
                    'Ce fichier (v' + fileVersion + ', ' + fileDate + ') est plus ancien que votre session locale (v' + localVersion + ', ' + localDate + ').\n\n' +
                    'Importer quand même ? Cela écrasera vos modifications locales.';
                if (!confirm(msg)) return;
            }

            storageSave(data);
            resumeSession();
            const s = storageLoad() || {};
            storageSave({ ...s, lastExportedVersion: s.version || 0 });
            _updateExportStatus();
        } catch (_) { alert('Fichier invalide ou corrompu.'); }
    };
    reader.readAsText(file);
}

function copyShareLink() {
    const saved = storageLoad();
    if (!saved || !saved.snapshot || !saved.snapshot.length) {
        alert('Aucune session à partager.'); return;
    }
    const b64 = _encodeState({
        snapshot:        saved.snapshot,
        headlessGroups:  saved.headlessGroups  || [],
        statusOverrides: saved.statusOverrides || {},
    });
    const url = location.href.split('#')[0] + '#' + b64;
    navigator.clipboard.writeText(url).then(() => {
        const btn = document.querySelector('.btn-share');
        if (!btn) return;
        const orig = btn.textContent;
        btn.textContent = '✓ Lien copié !';
        setTimeout(() => { btn.textContent = orig; }, 2500);
    }).catch(() => { prompt('Copiez ce lien :', url); });
}

// ── Synchronisation cloud ─────────────────────────────────────────────────────
//
// Supabase est mis en pause (voir CLAUDE.md). La synchro se fait par fichier JSON
// exporté/importé dans un dossier synchronisé (iCloud Drive, Dropbox, etc.).
//
// Fragment URL de partage :
//   #BASE64  → snapshot figé (lecture seule, fonctionne sans compte)

// ── Supabase (désactivé par défaut) ────────────────────────────────────────────
// Pour réactiver Supabase, passez SUPABASE_ENABLED à true et remplissez les clés.
const SUPABASE_ENABLED = false;
const SUPABASE_URL = 'https://cpbacjalatdzxozgkpln.supabase.co';      // ← REMPLACE ICI
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNwYmFjamFsYXRkenhvemdrcGxuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1MjM5NzEsImV4cCI6MjA5NDA5OTk3MX0.2bH1nDHO7oPPn986ty5jg_JMUiQyOB_8nCGSaXF77dI';                       // ← REMPLACE ICI

let _syncTimer    = null;
let _pollInterval = null;
let _skipNextSync = false; // empêche un push immédiat après un tirage cloud

function _buildSyncPayload() {
    const s = storageLoad() || {};
    return {
        snapshot:        s.snapshot        || [],
        headlessGroups:  s.headlessGroups  || [],
        statusOverrides: s.statusOverrides  || {},
        chanceOverrides: s.chanceOverrides  || {},
        notes:           s.notes            || {},
        groupOrder:      s.groupOrder      || [],
        itemOrders:      s.itemOrders      || {},
        lastModified:    Date.now(),
    };
}

// ── Supabase API ──────────────────────────────────────────────────────────────

async function _supaSave(roomId, payload) {
    const id = roomId || crypto.randomUUID();
    const url = roomId
        ? `${SUPABASE_URL}/rest/v1/rankings?id=eq.${encodeURIComponent(roomId)}`
        : `${SUPABASE_URL}/rest/v1/rankings`;
    const method = roomId ? 'PATCH' : 'POST';
    const body = roomId ? { data: payload } : { id, data: payload };
    const res = await fetch(url, {
        method,
        headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal'
        },
        body: JSON.stringify(body)
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Supabase save failed (' + res.status + ')');
    }
    return id;
}

async function _supaLoad(roomId) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rankings?id=eq.${encodeURIComponent(roomId)}&select=data`, {
        headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
        }
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Supabase load failed (' + res.status + ')');
    }
    const arr = await res.json();
    if (!arr || arr.length === 0) throw new Error('Not found');
    return arr[0].data;
}

// ── Sync orchestration ─────────────────────────────────────────────────────────

function _setSyncStatus(state) {
    const el = document.getElementById('syncStatusText');
    if (!el) return;
    el.className   = 'sync-status-text ' + state;
    el.textContent = state === 'pending' ? '⏳ Synchronisation…'
                   : state === 'error'   ? '⚠ Erreur de sync'
                   :                       '☁ Synchronisé';
}

function _renderSyncBarInactive(container) {
    container.innerHTML =
        '<span class="sync-label">Partager / Sync :</span>' +
        '<button class="btn-share" onclick="copyShareLink()">🔗 Lien snapshot</button>' +
        '<label class="btn-export-json btn-import-results" title="Importer une sauvegarde JSON">↑ Importer<input type="file" accept=".json" hidden onchange="importJSON(event)"></label>' +
        '<button class="btn-export-json" onclick="exportJSON()">↓ Exporter</button>' +
        '<button class="btn-cloud-setup" onclick="openSyncSetup()" title="Options de synchronisation avancées">☁ Cloud</button>' +
        '<span class="export-status" id="exportStatusIndicator"></span>';
}

function _renderSyncBarActive(container, paused) {
    const label = '☁ Synchronisé';
    container.innerHTML = paused
        ? '<span class="sync-status-text paused">✎ Mode local</span>' +
          '<button class="btn-sync-action btn-sync-resume" onclick="resumeSync()" title="Reprendre la synchronisation cloud">☁ Rejoindre</button>' +
          '<button class="btn-sync-action btn-sync-disconnect" onclick="disconnectSync()" title="Désactiver définitivement">✕ Déconnecter</button>' +
          '<label class="btn-export-json btn-import-results" title="Importer une sauvegarde JSON">↑ Importer<input type="file" accept=".json" hidden onchange="importJSON(event)"></label>' +
          '<button class="btn-export-json" onclick="exportJSON()">↓ Exporter</button>'
        : '<span id="syncStatusText" class="sync-status-text ok">' + label + '</span>' +
          '<button class="btn-cloud-link" onclick="copyCloudLink()">🔗 Copier le lien</button>' +
          '<button class="btn-sync-action" onclick="refreshFromCloud()" title="Récupérer la version cloud">↻ Rafraîchir</button>' +
          '<button class="btn-sync-action btn-sync-pause" onclick="pauseSync()" title="Travailler en local sans synchroniser">⏸ Mode local</button>' +
          '<button class="btn-sync-action btn-sync-disconnect" onclick="disconnectSync()" title="Désactiver définitivement">✕ Déconnecter</button>' +
          '<label class="btn-export-json btn-import-results" title="Importer une sauvegarde JSON">↑ Importer<input type="file" accept=".json" hidden onchange="importJSON(event)"></label>' +
          '<button class="btn-export-json" onclick="exportJSON()">↓ Exporter</button>';
}

function _updateSyncUI() {
    const container = document.getElementById('syncBar');
    if (!container) return;
    const saved  = storageLoad();
    const sync   = saved && saved.sync;

    // Migration : les anciens providers gist/blob/cf ne sont plus supportés
    if (sync && sync.provider && sync.provider !== 'supabase') {
        delete saved.sync;
        storageSave(saved);
        container.innerHTML = '<span class="sync-status-text error">⚠ Ancienne synchro désactivée. Réactive-la ci-dessous.</span>' +
            '<button class="btn-cloud-setup" onclick="openSyncSetup()">☁ Synchro cloud</button>' +
            '<label class="btn-export-json btn-import-results" title="Importer une sauvegarde JSON">↑ Importer<input type="file" accept=".json" hidden onchange="importJSON(event)"></label>' +
            '<button class="btn-export-json" onclick="exportJSON()">↓ Exporter</button>';
        _stopPolling();
        return;
    }

    const paused = sync && sync.paused;
    if (sync && sync.id && sync.provider === 'supabase') {
        _renderSyncBarActive(container, paused);
        paused ? _stopPolling() : _startPolling();
    } else {
        _renderSyncBarInactive(container);
        _stopPolling();
    }
    const setup = document.getElementById('syncSetup');
    if (setup) setup.hidden = true;
}

function _updateExportStatus() {
    const indicator = document.getElementById('exportStatusIndicator');
    if (!indicator) return;
    const saved = storageLoad() || {};
    const version = saved.version || 0;
    const lastExported = saved.lastExportedVersion || 0;
    if (version > lastExported) {
        indicator.textContent = '● Modifié';
        indicator.className = 'export-status export-status--dirty';
        indicator.title = 'Version ' + version + ' (non exportée)';
    } else {
        indicator.textContent = '✓ À jour';
        indicator.className = 'export-status export-status--ok';
        indicator.title = 'Version ' + version;
    }
}

function _scheduleSync() {
    if (_skipNextSync) { _skipNextSync = false; return; }
    const saved = storageLoad();
    if (!saved || !saved.sync || !saved.sync.id || saved.sync.paused) return;
    if (saved.sync.provider === 'supabase' && !SUPABASE_ENABLED) return;
    clearTimeout(_syncTimer);
    _setSyncStatus('pending');
    _syncTimer = setTimeout(() => {
        if (saved.sync.provider === 'supabase') _pushSync();
    }, 2000);
}

async function _pushSync() {
    const saved = storageLoad();
    if (!saved || !saved.sync || !saved.sync.id) return;
    try {
        const payload = _buildSyncPayload();
        await _supaSave(saved.sync.id, payload);
        const s = storageLoad() || {};
        storageSave({ ...s, sync: { ...s.sync, lastPushed: payload.lastModified } });
        _setSyncStatus('ok');
        _hideUpdateBanner();
    } catch (e) {
        _setSyncStatus('error');
        console.error('[sync]', e);
    }
}

function openSyncSetup() {
    const setup = document.getElementById('syncSetup');
    if (!setup) return;
    setup.hidden = !setup.hidden;
}

async function activateSupabaseSync() {
    if (!SUPABASE_ENABLED) {
        alert('Supabase est désactivé par défaut.\n\nPassez SUPABASE_ENABLED à true dans app.js si vous souhaitez vraiment l\'utiliser (voir CLAUDE.md).');
        return;
    }
    const btn = document.querySelector('.btn-sync-supabase');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Création…'; }
    try {
        const roomId = await _supaSave(null, _buildSyncPayload());
        const saved = storageLoad() || {};
        storageSave({ ...saved, sync: { provider: 'supabase', id: roomId } });
        _updateSyncUI();
        _setSyncStatus('ok');
    } catch (e) {
        if (btn) { btn.disabled = false; btn.textContent = 'Activer'; }
        alert('Impossible d\'activer la synchro cloud : ' + e.message);
    }
}

async function refreshFromCloud() {
    const saved = storageLoad();
    if (!saved || !saved.sync || !saved.sync.id) return;
    _setSyncStatus('pending');
    try {
        let data;
        data = await _supaLoad(saved.sync.id);
        storageSave({ ...saved, ...data, sync: { ...saved.sync, lastPushed: data.lastModified || 0 } });
        _skipNextSync = true;
        _restoreFromSnapshot(data.snapshot);
        _setSyncStatus('ok');
        _hideUpdateBanner();
    } catch (e) {
        _setSyncStatus('error');
        console.error('[sync]', e);
    }
}

function copyCloudLink() {
    const saved = storageLoad();
    if (!saved || !saved.sync || !saved.sync.id) return;
    const url = location.href.split('#')[0] + '#cf:' + saved.sync.id;
    navigator.clipboard.writeText(url).then(() => {
        const btn = document.querySelector('.btn-cloud-link');
        if (!btn) return;
        const orig = btn.textContent;
        btn.textContent = '✓ Copié !';
        setTimeout(() => { btn.textContent = orig; }, 2500);
    }).catch(() => { prompt('Lien en direct :', url); });
}

function pauseSync() {
    const saved = storageLoad();
    if (!saved || !saved.sync) return;
    storageSave({ ...saved, sync: { ...saved.sync, paused: true } });
    _stopPolling();
    clearTimeout(_syncTimer);
    _updateSyncUI();
}

async function resumeSync() {
    const saved = storageLoad();
    if (!saved || !saved.sync) return;
    storageSave({ ...saved, sync: { ...saved.sync, paused: false } });
    try {
        let data;
        data = await _supaLoad(saved.sync.id);
        const s = storageLoad() || {};
        storageSave({ ...s, ...data, sync: { ...s.sync, paused: false, lastPushed: data.lastModified || 0 } });
        _skipNextSync = true;
        _restoreFromSnapshot(data.snapshot);
    } catch (_) {}
    _updateSyncUI();
}

function disconnectSync() {
    const saved = storageLoad();
    if (!saved) return;
    delete saved.sync;
    storageSave(saved);
    _stopPolling();
    _updateSyncUI();
}

// ── Polling cloud (lecture automatique toutes les 30 s) ────────────────────────

function _startPolling() {
    _stopPolling();
    _pollInterval = setInterval(_pollCloud, 30000);
}

function _stopPolling() {
    if (_pollInterval) { clearInterval(_pollInterval); _pollInterval = null; }
}

async function _pollCloud() {
    const saved = storageLoad();
    if (!saved || !saved.sync || !saved.sync.id) { _stopPolling(); return; }
    try {
        if (saved.sync.provider === 'supabase') {
            const data = await _supaLoad(saved.sync.id);
            const remoteTs = data.lastModified || 0;
            const localTs  = saved.sync.lastPushed || 0;
            if (remoteTs > localTs) {
                _showUpdateBanner(data);
            }
        }
    } catch (_) {} // silencieux si offline ou backend indisponible
}

function _showUpdateBanner(remoteData) {
    let banner = document.getElementById('cloudUpdateBanner');
    if (banner) return; // déjà visible
    banner = document.createElement('div');
    banner.id        = 'cloudUpdateBanner';
    banner.className = 'cloud-update-banner';
    banner.innerHTML =
        '<span>☁ Modifications depuis un autre appareil</span>' +
        '<button class="btn-banner-apply" onclick="applyCloudUpdate()">Appliquer</button>' +
        '<button class="btn-banner-dismiss" onclick="_hideUpdateBanner()" title="Ignorer">✕</button>';
    banner._remoteData = remoteData;
    const resultsSection = document.getElementById('resultsSection');
    if (resultsSection) resultsSection.prepend(banner);
}

function _hideUpdateBanner() {
    const banner = document.getElementById('cloudUpdateBanner');
    if (banner) banner.remove();
}

function applyCloudUpdate() {
    const banner = document.getElementById('cloudUpdateBanner');
    const data   = banner && banner._remoteData;
    if (!data) { _hideUpdateBanner(); return; }
    const saved = storageLoad() || {};
    storageSave({ ...saved, ...data, sync: { ...saved.sync, lastPushed: data.lastModified || 0 } });
    _skipNextSync = true;
    _restoreFromSnapshot(data.snapshot);
    _hideUpdateBanner();
    _setSyncStatus('ok');
}

// ── Startup ───────────────────────────────────────────────────────────────────

window.addEventListener('DOMContentLoaded', async () => {
    migrateLegacySession();
    _populateUserSelect();
    _setupUserInput();

    const hash = location.hash.slice(1);

    // Anciens liens gist/blob/cf/drive — plus supportés
    if (hash.startsWith('gist:') || hash.startsWith('blob:') || hash.startsWith('cf:') || hash.startsWith('drive:')) {
        alert('Ce lien de synchronisation n\'est plus supporté.\n\nVeuillez utiliser l\'import/export JSON ou réactiver la synchro cloud depuis l\'app.');
        history.replaceState(null, '', location.pathname + location.search);
    }

    // 0a. Lien snapshot base64 (lecture seule, figé au moment du partage)
    if (hash) {
        try {
            const data = _decodeState(hash);
            if (data.snapshot && data.snapshot.length > 0) {
                storageSave(data);
                history.replaceState(null, '', location.pathname + location.search);
                _restoreFromSnapshot(data.snapshot);
                return;
            }
        } catch (_) {}
    }

    const saved = storageLoad();

    // 0b. Sync Supabase active et non pausée → tirer le cloud au démarrage
    if (saved && saved.sync && saved.sync.id && !saved.sync.paused && saved.sync.provider === 'supabase' && SUPABASE_ENABLED) {
        try {
            const data = await _supaLoad(saved.sync.id);
            storageSave({ ...saved, ...data, sync: { ...saved.sync, lastPushed: data.lastModified || 0 } });
            _skipNextSync = true;
            _restoreFromSnapshot(data.snapshot);
            return;
        } catch (_) {} // offline → continuer avec localStorage
    }

    // 1. Restauration depuis le texte original (chemin normal)
    if (saved && saved.text) {
        try {
            const parsed = parseParcoursupText(saved.text);
            if (parsed.length > 0) {
                prepareGroups(parsed);
                applyStoredOrder(saved);
                _showResults();
                return;
            }
        } catch (_) {}
    }

    // 2. Restauration depuis le snapshot DOM (texte absent ou inutilisable)
    if (saved && saved.snapshot && saved.snapshot.length > 0) {
        _restoreFromSnapshot(saved.snapshot);
        return;
    }

    // 3. Données partielles détectées → afficher le bouton "Reprendre"
    if (saved && (saved.groupOrder || saved.snapshot)) {
        const hint = document.getElementById('resumeHint');
        if (hint) hint.hidden = false;
    }

    _updateExportStatus();
});

function resumeSession() {
    const saved = storageLoad();
    if (!saved) return;
    if (saved.text) {
        try {
            const parsed = parseParcoursupText(saved.text);
            if (parsed.length > 0) {
                prepareGroups(parsed);
                applyStoredOrder(saved);
                _showResults();
                return;
            }
        } catch (_) {}
    }
    if (saved.snapshot && saved.snapshot.length > 0) {
        _restoreFromSnapshot(saved.snapshot);
    }
}

function _restoreFromSnapshot(snapshot) {
    allGroups = snapshot.map(g => ({
        name:  g.groupName,
        items: g.items.map(i => ({ name: i.name, detail: i.detail, status: i.status, note: i.note || '', chance: i.chance || '' })),
    }));
    _showResults();
}

function importMore() {
    mergeMode = true;
    document.getElementById('pasteArea').value       = '';
    document.getElementById('inputSection').hidden   = false;
    document.getElementById('resultsSection').hidden = true;
}

// ── Public actions ─────────────────────────────────────────────────────────────

function analyze() {
    const text = document.getElementById('pasteArea').value.trim();
    if (!text) {
        alert("Veuillez coller votre texte Parcoursup avant d'analyser.");
        return;
    }
    const parsed = parseParcoursupText(text);
    if (parsed.length === 0) {
        alert(
            'Aucun vœu détecté.\n\n' +
            "Assurez-vous d'avoir copié le texte depuis la page listant vos vœux " +
            '(la page doit contenir les mentions « Compte pour un vœu » ou « Compte pour un sous-vœu »).'
        );
        return;
    }

    if (mergeMode) {
        // Fusionner avec les groupes existants (ignorer les doublons de nom)
        const existingNames = new Set(allGroups.map(g => g.name));
        const newGroups = parsed
            .map(g => ({ name: g.name, items: extractDisplayItems(g) }))
            .filter(g => g.items.length > 0 && !existingNames.has(g.name));
        allGroups.push(...newGroups);
        mergeMode = false;
    } else {
        prepareGroups(parsed);
        const saved = storageLoad();
        if (saved && saved.text === text) {
            applyStoredOrder(saved);
        } else {
            storageSave({ text });
        }
    }
    _showResults();
}

// Retour au formulaire sans effacer la session sauvegardée
function reset() {
    allGroups        = [];
    activeFilter     = 'all';
    activeTypeFilter = null;
    mergeMode        = false;
    const saved = storageLoad();
    document.getElementById('pasteArea').value            = (saved && saved.text) || '';
    document.getElementById('resultsContainer').innerHTML = '';
    document.getElementById('inputSection').hidden        = false;
    document.getElementById('resultsSection').hidden      = true;
    document.querySelectorAll('.filter-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.filter === 'all');
    });
    const tb = document.getElementById('typeFilterBar');
    if (tb) tb.hidden = true;
}

// RAZ complète : efface la session persistée et revient à l'état initial
function clearAll() {
    try { localStorage.removeItem(_storageKey()); } catch (_) {}
    reset();
}

function applyFilter(filter) {
    activeFilter = filter;
    document.querySelectorAll('.filter-btn[data-filter]').forEach(b => {
        b.classList.toggle('active', b.dataset.filter === filter);
    });
    _applyFilterToDOM();
}

function applyTypeFilter(type) {
    activeTypeFilter = type;
    document.querySelectorAll('#typeFilterBar .filter-btn').forEach(b => {
        b.classList.toggle('active', (b.dataset.type || null) === activeTypeFilter);
    });
    _applyFilterToDOM();
}

function exportRanking() {
    const container = document.getElementById('resultsContainer');
    const lines     = ['Parcoursup — Mon classement', ''];

    for (const section of container.querySelectorAll('.group-section:not([hidden])')) {
        lines.push('▸ ' + section.dataset.groupName);
        let rank = 1;
        for (const item of section.querySelectorAll('.item:not([hidden])')) {
            const name   = item.querySelector('.item-name').textContent;
            const type   = item.dataset.type ? ` [${item.dataset.type}]` : '';
            const status = item.dataset.status === 'confirmed'  ? '✓'
                         : item.dataset.status === 'incomplete' ? '⚠' : '?';
            const chance = item.dataset.chance === 'sure'     ? ' 🟢'
                         : item.dataset.chance === 'probable' ? ' 🟡'
                         : item.dataset.chance === 'unlikely' ? ' 🔴' : '';
            const note   = item.querySelector('.item-note')?.textContent.trim();
            lines.push(`  ${rank}. ${name}${type} ${status}${chance}`);
            if (note) lines.push(`     → ${note}`);
            rank++;
        }
        lines.push('');
    }

    const text = lines.join('\n').trim();
    navigator.clipboard.writeText(text).then(() => {
        const btn  = document.querySelector('.btn-export');
        const orig = btn.textContent;
        btn.textContent = '✓ Copié !';
        setTimeout(() => { btn.textContent = orig; }, 2000);
    }).catch(() => {
        prompt('Copiez ce texte :', text);
    });
}

// ── Data helpers ───────────────────────────────────────────────────────────────

function prepareGroups(parsed) {
    allGroups = parsed
        .map(g => ({ name: g.name, items: extractDisplayItems(g) }))
        .filter(g => g.items.length > 0);
}

function itemKey(item) {
    return (item.name + '||' + (item.detail || '')).slice(0, 200);
}

function applyStoredOrder(saved) {
    // 1. Ordre des groupes
    if (saved.groupOrder && saved.groupOrder.length) {
        allGroups.sort((a, b) => {
            const ia = saved.groupOrder.indexOf(a.name);
            const ib = saved.groupOrder.indexOf(b.name);
            if (ia === -1 && ib === -1) return 0;
            if (ia === -1) return 1;
            if (ib === -1) return -1;
            return ia - ib;
        });
    }

    if (!saved.itemOrders) return;

    // 2. Table de tous les items (clé → {item, groupe d'origine})
    const itemMap = {};
    for (const group of allGroups) {
        for (const item of group.items) {
            itemMap[itemKey(item)] = { item, originGroup: group.name };
        }
    }

    // 3. Vider les listes, puis les repeupler selon l'ordre sauvegardé
    //    (un item peut avoir été déplacé dans un autre groupe)
    for (const group of allGroups) group.items = [];

    const placed = new Set();
    for (const group of allGroups) {
        const order = saved.itemOrders[group.name] || [];
        for (const k of order) {
            if (itemMap[k]) {
                group.items.push(itemMap[k].item);
                placed.add(k);
            }
        }
    }

    // 4. Ré-insérer les items absents de la sauvegarde dans leur groupe d'origine
    for (const [k, { item, originGroup }] of Object.entries(itemMap)) {
        if (!placed.has(k)) {
            const g = allGroups.find(g => g.name === originGroup);
            if (g) g.items.push(item);
        }
    }

    // 5. Supprimer les groupes vidés (dissous par un déplacement inter-groupes)
    allGroups.splice(0, allGroups.length, ...allGroups.filter(g => g.items.length > 0));
}

function _saveCurrentOrder() {
    const container  = document.getElementById('resultsContainer');
    const groupOrder = [...container.querySelectorAll('.group-section')]
        .map(el => el.dataset.groupName);
    const itemOrders = {};
    for (const section of container.querySelectorAll('.group-section')) {
        itemOrders[section.dataset.groupName] = [...section.querySelectorAll('.item')]
            .map(el => el.dataset.itemKey);
    }
    const headlessGroups = [...container.querySelectorAll('.group-section--headless')]
        .map(el => el.dataset.groupName);

    // Snapshot complet : permet de restaurer sans re-parser le texte original
    const snapshot = [...container.querySelectorAll('.group-section')].map(sec => ({
        groupName: sec.dataset.groupName,
        headless:  sec.classList.contains('group-section--headless'),
        items: [...sec.querySelectorAll('.item')].map(li => ({
            name:   li.querySelector('.item-name').textContent,
            detail: li.dataset.detail || '',
            status: li.dataset.status,
            chance: li.dataset.chance || '',
            note:   li.querySelector('.item-note')?.textContent.trim() || '',
        })),
    }));

    const saved = storageLoad() || {};
    const version = (saved.version || 0) + 1;
    storageSave({ ...saved, groupOrder, itemOrders, headlessGroups, snapshot, version, lastModified: Date.now() });
    _scheduleSync();
    _updateExportStatus();
}

// ── Rendering ──────────────────────────────────────────────────────────────────

function _showResults() {
    _renderResults();
    document.getElementById('inputSection').hidden   = true;
    document.getElementById('resultsSection').hidden = false;
    _saveCurrentOrder(); // Snapshot initial pour restauration sans re-parsing
    _updateSyncUI();
}

function _renderResults() {
    const container      = document.getElementById('resultsContainer');
    container.innerHTML  = '';

    const saved          = storageLoad();
    const overrides      = (saved && saved.statusOverrides)  ? saved.statusOverrides  : {};
    const chances        = (saved && saved.chanceOverrides)  ? saved.chanceOverrides  : {};
    const notes          = (saved && saved.notes)            ? saved.notes            : {};
    const headlessGroups = (saved && saved.headlessGroups)   ? saved.headlessGroups   : [];

    for (const group of allGroups) {
        const sec = _buildGroupSection(group, overrides, notes, chances);
        if (headlessGroups.includes(group.name)) {
            sec.querySelector('.group-header').hidden = true;
            sec.classList.add('group-section--headless');
        }
        container.appendChild(sec);
    }

    // Drag groupes (réordonner les blocs)
    makeSortable(container, '.group-section', '.drag-handle--group', _saveCurrentOrder);

    // Drag items : zone globale — permet le déplacement ENTRE groupes
    makeItemsSortable(container, _saveCurrentOrder);

    _populateTypeFilter();
    _applyFilterToDOM();
}

function _buildGroupSection(group, overrides, notes = {}, chances = {}) {
    const section = document.createElement('div');
    section.className       = 'group-section';
    section.dataset.groupName = group.name;

    const header  = document.createElement('div');
    header.className = 'group-header';

    header.appendChild(createGrip('drag-handle--group'));

    const nameEl = document.createElement('span');
    nameEl.className   = 'group-name';
    nameEl.textContent = group.name;

    const countEl = document.createElement('span');
    countEl.className = 'item-count';

    header.appendChild(nameEl);
    header.appendChild(countEl);
    section.appendChild(header);

    const list = document.createElement('ul');
    list.className = 'items-list';
    group.items.forEach((item, i) => list.appendChild(_buildItem(item, i + 1, overrides, notes, chances)));
    section.appendChild(list);

    return section;
}

function _buildItem(item, rank, overrides, notes = {}, chances = {}) {
    const li = document.createElement('li');
    li.className       = 'item';
    li.dataset.itemKey = itemKey(item);
    li.dataset.detail  = item.detail || ''; // conservé pour le snapshot, non affiché

    const status = (overrides && overrides[itemKey(item)]) || item.status || 'unknown';
    li.dataset.status = status;

    const chance = item.chance || (chances && chances[itemKey(item)]) || '';
    li.dataset.chance = chance;

    const type = getFormationType(item.detail, item.name);
    if (type) li.dataset.type = type;

    const chanceBar = document.createElement('div');
    chanceBar.className = 'item-chance-bar';
    chanceBar.title     = 'Cliquer pour indiquer la probabilité d\'admission';
    chanceBar.addEventListener('click',       () => _cycleChance(li));
    chanceBar.addEventListener('pointerdown', e  => e.stopPropagation());
    li.appendChild(chanceBar);

    li.appendChild(createGrip('drag-handle--item'));

    const rankEl = document.createElement('span');
    rankEl.className   = 'item-rank';
    rankEl.textContent = rank;
    li.appendChild(rankEl);

    const badge = document.createElement('span');
    badge.className = 'status-badge';
    badge.title     = 'Cliquer pour modifier le statut';
    _applyStatusToBadge(badge, status);
    badge.addEventListener('click', () => _cycleStatus(li));
    li.appendChild(badge);

    const content = document.createElement('div');
    content.className = 'item-content';

    const nameRow = document.createElement('div');
    nameRow.className = 'item-name-row';

    const nameEl = document.createElement('span');
    nameEl.className   = 'item-name';
    nameEl.textContent = item.name;
    nameRow.appendChild(nameEl);

    if (type) {
        const typeEl = document.createElement('span');
        typeEl.className   = 'type-badge ' + (TYPE_SLUGS[type] || 'other');
        typeEl.textContent = type;
        nameRow.appendChild(typeEl);
    }

    content.appendChild(nameRow);

    const note = item.note || notes[itemKey(item)] || '';
    const noteEl = document.createElement('div');
    noteEl.className         = 'item-note';
    noteEl.contentEditable   = 'true';
    noteEl.dataset.placeholder = 'Ajouter une note…';
    if (note) noteEl.textContent = note;
    noteEl.addEventListener('blur', () => _saveNote(li, noteEl.textContent.trim()));
    noteEl.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); noteEl.blur(); }
        e.stopPropagation(); // empêche l'interférence avec le drag
    });
    noteEl.addEventListener('pointerdown', e => e.stopPropagation()); // empêche le drag
    content.appendChild(noteEl);

    li.appendChild(content);
    return li;
}

function _saveNote(li, text) {
    const saved = storageLoad() || {};
    const notes = saved.notes || {};
    if (text) {
        notes[li.dataset.itemKey] = text;
    } else {
        delete notes[li.dataset.itemKey];
    }
    storageSave({ ...saved, notes });
    _saveCurrentOrder(); // met à jour le snapshot avec la note
}

function createGrip(extraClass) {
    const ns  = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('width',   '10');
    svg.setAttribute('height',  '16');
    svg.setAttribute('viewBox', '0 0 10 16');
    svg.setAttribute('fill',    'currentColor');
    svg.setAttribute('aria-hidden', 'true');

    for (const [cx, cy] of [[3,3],[7,3],[3,8],[7,8],[3,13],[7,13]]) {
        const c = document.createElementNS(ns, 'circle');
        c.setAttribute('cx', cx);
        c.setAttribute('cy', cy);
        c.setAttribute('r',  '1.5');
        svg.appendChild(c);
    }

    const span = document.createElement('span');
    span.className = 'drag-handle ' + extraClass;
    span.title     = extraClass.includes('group') ? 'Déplacer ce groupe' : 'Déplacer';
    span.appendChild(svg);
    return span;
}

// ── Filter ────────────────────────────────────────────────────────────────────

function _populateTypeFilter() {
    const typeBar = document.getElementById('typeFilterBar');
    if (!typeBar) return;

    const types = [...new Set(
        allGroups.flatMap(g => g.items)
            .map(i => getFormationType(i.detail, i.name))
            .filter(Boolean)
    )];

    if (types.length < 2) { typeBar.hidden = true; return; }

    typeBar.hidden   = false;
    typeBar.innerHTML = '<span class="filter-label">Type :</span>';

    const allBtn = document.createElement('button');
    allBtn.className   = 'filter-btn' + (activeTypeFilter === null ? ' active' : '');
    allBtn.dataset.type = '';
    allBtn.textContent  = 'Tous';
    allBtn.onclick = () => applyTypeFilter(null);
    typeBar.appendChild(allBtn);

    for (const type of types) {
        const slug = TYPE_SLUGS[type] || '';
        const btn  = document.createElement('button');
        btn.className   = `filter-btn filter-btn--type ${slug}${activeTypeFilter === type ? ' active' : ''}`;
        btn.dataset.type = type;
        btn.textContent  = type;
        btn.onclick = () => applyTypeFilter(type);
        typeBar.appendChild(btn);
    }
}

function _applyFilterToDOM() {
    const container = document.getElementById('resultsContainer');
    for (const section of container.querySelectorAll('.group-section')) {
        let visible = 0;
        for (const item of section.querySelectorAll('.item')) {
            const statusOk = activeFilter === 'all' || item.dataset.status === activeFilter;
            const typeOk   = !activeTypeFilter || item.dataset.type === activeTypeFilter;
            item.hidden    = !(statusOk && typeOk);
            if (!item.hidden) visible++;
        }
        _updateRanks(section);
        section.hidden = visible === 0;
        const countEl  = section.querySelector('.item-count');
        if (countEl) countEl.textContent = `${visible} sous-vœu${visible > 1 ? 'x' : ''}`;
    }
}

function _updateRanks(section) {
    let r = 1;
    for (const item of section.querySelectorAll('.item')) {
        if (!item.hidden) item.querySelector('.item-rank').textContent = r++;
    }
}

// ── Status override ───────────────────────────────────────────────────────────

const STATUS_CYCLE = ['confirmed', 'incomplete', 'unknown'];

function _applyStatusToBadge(badge, status) {
    badge.className = 'status-badge ' + status;
    badge.textContent = status === 'confirmed'  ? '✓ Confirmé'
                      : status === 'incomplete' ? '⚠ Incomplet'
                      :                           '— ?';
}

function _cycleStatus(li) {
    const current = li.dataset.status;
    const next    = STATUS_CYCLE[(STATUS_CYCLE.indexOf(current) + 1) % STATUS_CYCLE.length];

    li.dataset.status = next;
    _applyStatusToBadge(li.querySelector('.status-badge'), next);

    const saved     = storageLoad() || {};
    const overrides = saved.statusOverrides || {};
    overrides[li.dataset.itemKey] = next;
    storageSave({ ...saved, statusOverrides: overrides });

    _applyFilterToDOM();
}

function _cycleChance(li) {
    const current = li.dataset.chance || '';
    const next    = CHANCE_CYCLE[(CHANCE_CYCLE.indexOf(current) + 1) % CHANCE_CYCLE.length];
    li.dataset.chance = next;

    const saved   = storageLoad() || {};
    const chances = saved.chanceOverrides || {};
    if (next) { chances[li.dataset.itemKey] = next; }
    else       { delete chances[li.dataset.itemKey]; }
    storageSave({ ...saved, chanceOverrides: chances });
    _saveCurrentOrder();
}

// ── Dissolution de groupes ────────────────────────────────────────────────────

// Quand un item quitte son groupe d'origine : fusionne les deux sections en
// supprimant leur entête, de façon à obtenir une liste plate sans groupe.
function _mergeGroupSections(srcSection, dstSection) {
    // Quelle section est au-dessus dans le DOM ?
    const isSrcFirst = !!(srcSection.compareDocumentPosition(dstSection) & Node.DOCUMENT_POSITION_FOLLOWING);
    const [topSec, botSec] = isSrcFirst ? [srcSection, dstSection] : [dstSection, srcSection];

    // Déplacer les items de la section du bas dans celle du haut
    const list     = topSec.querySelector('.items-list');
    const botItems = [...botSec.querySelectorAll('.item')];
    botItems.forEach(item => list.appendChild(item));

    // Marquer la section résultante comme "sans entête"
    topSec.querySelector('.group-header').hidden = true;
    topSec.classList.add('group-section--headless');

    // Supprimer la section vidée
    botSec.remove();
}

// ── Drag-and-drop sortable (pointer events — desktop + iPad) ──────────────────
//
// Règles clés :
//   • PAS de preventDefault() sur pointerdown → évite pointercancel immédiat sur iOS
//   • setPointerCapture sur l'élément déplacé → tous les events restent sur lui
//   • preventDefault() uniquement dans pointermove { passive:false } → bloque le scroll

// Drag items cross-groupes : un item peut être déposé dans n'importe quel groupe.
function makeItemsSortable(resultsContainer, onReorder) {
    resultsContainer.addEventListener('pointerdown', e => {
        const handle = e.target.closest('.drag-handle--item');
        if (!handle) return;
        const child = handle.closest('.item');
        if (!child) return;

        child.classList.add('dragging');
        document.body.style.userSelect = 'none';

        const ph = document.createElement('li');
        ph.className    = 'drag-placeholder';
        ph.style.height = child.getBoundingClientRect().height + 'px';
        child.after(ph);

        const srcSection = child.closest('.group-section');
        child.setPointerCapture(e.pointerId);

        // Retourne la .items-list du groupe sous le pointeur (Y)
        function getTargetList(y) {
            const sections = [...resultsContainer.querySelectorAll('.group-section:not([hidden])')];
            if (!sections.length) return null;
            for (const sec of sections) {
                if (y < sec.getBoundingClientRect().bottom) {
                    return sec.querySelector('.items-list');
                }
            }
            return sections[sections.length - 1].querySelector('.items-list');
        }

        function onMove(ev) {
            ev.preventDefault();
            const targetList = getTargetList(ev.clientY) || ph.parentElement;
            const siblings = [...targetList.children]
                .filter(c => c !== child && c !== ph && !c.hidden);
            let placed = false;
            for (const sib of siblings) {
                const r = sib.getBoundingClientRect();
                if (ev.clientY < r.top + r.height / 2) {
                    targetList.insertBefore(ph, sib);
                    placed = true;
                    break;
                }
            }
            if (!placed) targetList.appendChild(ph);
        }

        function onUp() {
            ph.replaceWith(child);
            child.classList.remove('dragging');
            document.body.style.userSelect = '';
            child.removeEventListener('pointermove',   onMove);
            child.removeEventListener('pointerup',     onUp);
            child.removeEventListener('pointercancel', onUp);

            // Si l'item a changé de groupe → dissoudre les deux blocs
            const dstSection = child.closest('.group-section');
            if (dstSection && dstSection !== srcSection) {
                _mergeGroupSections(srcSection, dstSection);
            }

            _applyFilterToDOM();
            onReorder();
        }

        child.addEventListener('pointermove',   onMove, { passive: false });
        child.addEventListener('pointerup',     onUp);
        child.addEventListener('pointercancel', onUp);
    });
}

function makeSortable(container, childSel, handleSel, onReorder) {
    container.addEventListener('pointerdown', e => {
        const handle = e.target.closest(handleSel);
        if (!handle) return;
        const child = handle.closest(childSel);
        if (!child || child.parentElement !== container) return;

        child.classList.add('dragging');
        document.body.style.userSelect = 'none';

        const ph = document.createElement(child.tagName === 'LI' ? 'li' : 'div');
        ph.className    = 'drag-placeholder';
        ph.style.height = child.getBoundingClientRect().height + 'px';
        child.after(ph);

        // Capture : tous les pointermove/pointerup suivants arrivent sur child
        child.setPointerCapture(e.pointerId);

        function onMove(ev) {
            ev.preventDefault(); // bloque le scroll pendant le déplacement
            const siblings = [...container.children]
                .filter(c => c !== child && c !== ph && !c.hidden);
            let placed = false;
            for (const sib of siblings) {
                const r = sib.getBoundingClientRect();
                if (ev.clientY < r.top + r.height / 2) {
                    container.insertBefore(ph, sib);
                    placed = true;
                    break;
                }
            }
            if (!placed) container.appendChild(ph);
        }

        function onUp() {
            ph.replaceWith(child);
            child.classList.remove('dragging');
            document.body.style.userSelect = '';
            child.removeEventListener('pointermove',   onMove);
            child.removeEventListener('pointerup',     onUp);
            child.removeEventListener('pointercancel', onUp);
            onReorder();
        }

        child.addEventListener('pointermove',   onMove, { passive: false });
        child.addEventListener('pointerup',     onUp);
        child.addEventListener('pointercancel', onUp);
    });
}
