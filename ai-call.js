/* ═══════════════════════════════════════════════════════════════════
   STAFF PRO — Module Appel IA
   ═══════════════════════════════════════════════════════════════════
   Un seul fichier à inclure dans admin.html ET employe.html :
     <script src="ai-call.js"></script>   (juste avant </body>)

   Le script détecte automatiquement s'il est chargé sur admin ou sur
   employe, et injecte l'UI + la logique correspondante.

   Utilise le Firebase déjà initialisé par la page hôte.
   Nouveau chemin : wecan/aiCalls/{empId}  &  wecan/aiConfig
   Ne modifie AUCUNE donnée existante.
   ═══════════════════════════════════════════════════════════════════ */

(function() {
  'use strict';

  // ─── Constantes ───────────────────────────────────────────────
  const GEMINI_MODEL = 'models/gemini-3.1-flash-live-preview';
  const INPUT_SR = 16000;
  const OUTPUT_SR = 24000;
  const CALL_PATH = 'wecan/aiCalls';
  const CONFIG_PATH = 'wecan/aiConfig';
  const TEMPLATES_PATH = 'wecan/aiTemplates';
  const CALL_TIMEOUT_MS = 30000;

  // ─── Attendre que Firebase soit prêt ──────────────────────────
  function waitForFirebase(cb, retries) {
    retries = retries || 0;
    if (window.firebase && firebase.database && firebase.apps && firebase.apps.length) {
      cb();
    } else if (retries < 50) {
      setTimeout(function() { waitForFirebase(cb, retries + 1); }, 200);
    } else {
      console.warn('[ai-call] Firebase pas dispo après 10s, abandon');
    }
  }

  // ─── Détecter le mode selon l'URL ─────────────────────────────
  function detectMode() {
    var path = (location.pathname || '').toLowerCase();
    if (path.indexOf('admin') !== -1) return 'admin';
    if (path.indexOf('employe') !== -1 || path.indexOf('employee') !== -1) return 'employe';
    return null;
  }

  waitForFirebase(function() {
    var mode = detectMode();
    if (mode === 'admin')   { initAdmin(); }
    else if (mode === 'employe') { initEmploye(); }
    else { console.log('[ai-call] Mode non détecté (URL ne contient ni admin ni employe)'); }
  });

  // ═════════════════════════════════════════════════════════════
  //  CSS commun (injecté dans <head>)
  // ═════════════════════════════════════════════════════════════
  function injectCSS() {
    if (document.getElementById('ai-call-css')) return;
    var s = document.createElement('style');
    s.id = 'ai-call-css';
    s.textContent = `
      #aiCallFab {
        position: fixed; bottom: 24px; right: 24px; z-index: 9998;
        width: 60px; height: 60px; border-radius: 50%;
        background: linear-gradient(135deg, #C0392B 0%, #E74C3C 100%);
        color: white; border: none; font-size: 26px; cursor: pointer;
        box-shadow: 0 8px 24px rgba(192,57,43,0.4);
        display: flex; align-items: center; justify-content: center;
        transition: transform 0.2s;
      }
      #aiCallFab:hover { transform: scale(1.08); }

      #aiCallModal {
        display: none; position: fixed; top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(0,0,0,0.6); z-index: 9999;
        align-items: center; justify-content: center; padding: 20px;
      }
      #aiCallModal.open { display: flex; }
      .aic-modal-body {
        background: white; border-radius: 16px; max-width: 480px; width: 100%;
        max-height: 90vh; overflow-y: auto; box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      }
      .aic-modal-header {
        background: #C0392B; color: white; padding: 18px 22px;
        border-radius: 16px 16px 0 0; display: flex; justify-content: space-between; align-items: center;
      }
      .aic-modal-header h3 { font-size: 17px; margin: 0; font-weight: 600; }
      .aic-close {
        background: rgba(255,255,255,0.2); border: none; color: white;
        width: 32px; height: 32px; border-radius: 50%; cursor: pointer; font-size: 18px;
      }
      .aic-modal-content { padding: 22px; }
      .aic-field { margin-bottom: 14px; }
      .aic-field label {
        display: block; font-size: 11px; text-transform: uppercase;
        color: #888; margin-bottom: 6px; letter-spacing: 0.5px; font-weight: 600;
      }
      .aic-field input, .aic-field textarea, .aic-field select {
        width: 100%; padding: 11px 13px; border: 1px solid #ddd; border-radius: 9px;
        font-size: 14px; font-family: inherit; outline: none; box-sizing: border-box;
      }
      .aic-field input:focus, .aic-field textarea:focus, .aic-field select:focus { border-color: #C0392B; }
      .aic-field textarea { min-height: 70px; resize: vertical; line-height: 1.4; }
      .aic-hint { font-size: 11px; color: #888; margin-top: 5px; }
      .aic-btn {
        width: 100%; padding: 15px; border: none; border-radius: 10px;
        font-size: 15px; font-weight: 700; cursor: pointer; color: white;
        transition: transform 0.15s;
      }
      .aic-btn.primary { background: linear-gradient(135deg, #27ae60 0%, #2ecc71 100%); }
      .aic-btn.secondary { background: linear-gradient(135deg, #3498db 0%, #5dade2 100%); }
      .aic-btn:hover { transform: translateY(-1px); }
      .aic-btn:disabled { background: #bbb; cursor: not-allowed; transform: none; }
      .aic-status {
        margin-top: 14px; padding: 12px; border-radius: 8px; font-size: 13px;
        text-align: center; display: none;
      }
      .aic-status.on { display: block; }
      .aic-status.ringing { background: #fff8e6; color: #b8860b; }
      .aic-status.accepted { background: #e6f7ec; color: #27ae60; }
      .aic-status.rejected { background: #fceaea; color: #c0392b; }
      .aic-status.completed { background: #e6f0ff; color: #2980b9; }

      .aic-settings-toggle {
        margin-top: 16px; padding: 10px; text-align: center;
        background: #f5f5f7; border-radius: 8px; cursor: pointer;
        font-size: 13px; color: #666; user-select: none;
      }
      .aic-settings { display: none; margin-top: 14px; padding-top: 14px; border-top: 1px solid #eee; }
      .aic-settings.open { display: block; }

      /* ═══ Écran d'appel entrant (employé) ═══ */
      #aiIncoming, #aiInCall {
        display: none; position: fixed; top: 0; left: 0; right: 0; bottom: 0;
        background: linear-gradient(180deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
        z-index: 100000; flex-direction: column; align-items: center;
        justify-content: space-between; padding: 60px 24px 50px;
        color: white; text-align: center;
      }
      #aiIncoming.open, #aiInCall.open { display: flex; animation: aicSlideUp 0.3s ease-out; }
      @keyframes aicSlideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }

      .aic-call-label { font-size: 13px; opacity: 0.7; margin-bottom: 20px; }
      .aic-avatar {
        width: 140px; height: 140px; border-radius: 50%; background: white;
        display: flex; align-items: center; justify-content: center; overflow: hidden;
        margin-bottom: 24px;
        box-shadow: 0 0 0 12px rgba(255,255,255,0.05), 0 0 0 24px rgba(255,255,255,0.03), 0 4px 20px rgba(192,57,43,0.4);
        animation: aicPulse 2s ease-in-out infinite;
      }
      .aic-avatar img { width: 88%; height: 88%; object-fit: contain; }
      @keyframes aicPulse {
        0%, 100% { box-shadow: 0 0 0 12px rgba(255,255,255,0.05), 0 0 0 24px rgba(255,255,255,0.03), 0 4px 20px rgba(192,57,43,0.4); }
        50% { box-shadow: 0 0 0 20px rgba(255,255,255,0.08), 0 0 0 40px rgba(255,255,255,0.04), 0 4px 30px rgba(192,57,43,0.6); }
      }
      .aic-call-name { font-size: 26px; font-weight: 600; margin-bottom: 6px; }
      .aic-call-number { font-size: 14px; opacity: 0.7; letter-spacing: 1px; }
      .aic-call-info { font-size: 13px; opacity: 0.6; margin-top: 6px; }
      .aic-call-reason {
        font-size: 12px; opacity: 0.55; margin-top: 14px;
        padding: 8px 14px; background: rgba(255,255,255,0.08); border-radius: 18px;
        max-width: 320px;
      }
      .aic-actions { display: flex; gap: 60px; margin-top: 20px; }
      .aic-action-btn {
        width: 66px; height: 66px; border-radius: 50%; border: none;
        color: white; font-size: 28px; cursor: pointer;
      }
      .aic-action-btn.reject { background: #e74c3c; }
      .aic-action-btn.accept { background: #2ecc71; animation: aicShake 1.5s ease-in-out infinite; }
      @keyframes aicShake {
        0%, 100% { transform: rotate(0deg); }
        25% { transform: rotate(-10deg); }
        75% { transform: rotate(10deg); }
      }
      .aic-action-label { font-size: 11px; opacity: 0.7; margin-top: 6px; }

      .aic-status-badge {
        font-size: 13px; opacity: 0.7; padding: 6px 14px;
        background: rgba(255,255,255,0.1); border-radius: 20px; margin-bottom: 30px;
      }
      .aic-status-badge.speaking { background: #3498db; opacity: 1; }
      .aic-status-badge.listening { background: #27ae60; opacity: 1; }
      .aic-timer { font-size: 15px; opacity: 0.5; margin-top: 8px; }

      .aic-in-actions { display: flex; gap: 30px; align-items: center; }
      .aic-in-btn {
        width: 58px; height: 58px; border-radius: 50%;
        background: rgba(255,255,255,0.15); border: none; color: white;
        font-size: 22px; cursor: pointer;
      }
      .aic-in-btn.hangup { background: #e74c3c; width: 68px; height: 68px; font-size: 26px; }
      .aic-in-btn.muted { background: white; color: #333; }
      /* Bouton speaker : le mode 'earpiece' est l'état passif, les 2 autres sont visuellement actifs */
      .aic-in-btn.speaker.speaker-speaker   { background: white; color: #333; }
      .aic-in-btn.speaker.speaker-bluetooth { background: #3498db; color: white; }

      .aic-toast {
        position: fixed; bottom: 30px; left: 50%; transform: translateX(-50%);
        background: rgba(0,0,0,0.9); color: white; padding: 12px 22px;
        border-radius: 8px; font-size: 13px; z-index: 200000;
        opacity: 0; transition: opacity 0.3s; pointer-events: none;
      }
      .aic-toast.on { opacity: 1; }
    `;
    document.head.appendChild(s);
  }

  // ═════════════════════════════════════════════════════════════
  //  Logo WECAN SERVICES (SVG intégré, remplaçable par ./wecan-logo.png)
  // ═════════════════════════════════════════════════════════════
  function logoHTML() {
    return '' +
      '<img src="./wecan-logo.png" alt="WeCan" ' +
      'onerror="this.style.display=\'none\'; this.nextElementSibling.style.display=\'flex\'" />' +
      '<div style="display:none; width:100%; height:100%; align-items:center; justify-content:center;">' +
        '<svg viewBox="0 0 200 200" style="width:88%; height:88%;">' +
          '<path d="M 40 75 L 155 45 L 100 105 L 75 95 L 40 75 Z" fill="#2c2c2c" stroke="#2c2c2c" stroke-width="1" stroke-linejoin="round"/>' +
          '<path d="M 100 105 L 90 135 L 75 95 Z" fill="#c0392b"/>' +
          '<text x="100" y="140" text-anchor="middle" font-family="Arial Black, sans-serif" font-size="34" font-weight="900" fill="#2c2c2c" letter-spacing="-1">WECAN</text>' +
          '<text x="100" y="162" text-anchor="middle" font-family="Arial, sans-serif" font-size="14" font-weight="700" fill="#2c2c2c" letter-spacing="4">SERVICES</text>' +
          '<path d="M 20 175 Q 100 195 180 155" fill="none" stroke="#c0392b" stroke-width="6" stroke-linecap="round"/>' +
        '</svg>' +
      '</div>';
  }

  // ═════════════════════════════════════════════════════════════
  //  Toast partagé
  // ═════════════════════════════════════════════════════════════
  var _toastEl = null;
  function toast(msg, ms) {
    ms = ms || 3000;
    if (!_toastEl) {
      _toastEl = document.createElement('div');
      _toastEl.className = 'aic-toast';
      document.body.appendChild(_toastEl);
    }
    _toastEl.textContent = msg;
    _toastEl.classList.add('on');
    clearTimeout(_toastEl._to);
    _toastEl._to = setTimeout(function() { _toastEl.classList.remove('on'); }, ms);
  }

  // ═════════════════════════════════════════════════════════════
  //  ADMIN MODE : bouton flottant + modal
  // ═════════════════════════════════════════════════════════════
  // Cache config admin (rechargée à l'ouverture de la modale)
  var _aicCfg = { enabled: null, geminiKey: '', voice: 'Algieba', globalContext: '' };
  var _aicTemplates = [];

  function initAdmin() {
    console.log('[ai-call] Mode ADMIN — attente config wecan/aiConfig.enabled');
    injectCSS();

    // Décide affichage du FAB à partir du flag Firebase (Paramètres → Appel IA)
    firebase.database().ref(CONFIG_PATH).on('value', function(snap) {
      var cfg = snap.val() || {};
      _aicCfg.enabled       = cfg.enabled !== false; // activé par défaut
      _aicCfg.geminiKey     = cfg.geminiKey || '';
      _aicCfg.voice         = cfg.voice || 'Algieba';
      _aicCfg.globalContext = cfg.globalContext || '';
      applyAdminEnabled();
    });

    // Modal (créée une fois, réutilisée) — les paramètres sont sur la page Paramètres
    var modal = document.createElement('div');
    modal.id = 'aiCallModal';
    modal.innerHTML =
      '<div class="aic-modal-body">' +
        '<div class="aic-modal-header">' +
          '<h3>📞 Appel IA — Nouvel appel</h3>' +
          '<button class="aic-close" onclick="document.getElementById(\'aiCallModal\').classList.remove(\'open\')">×</button>' +
        '</div>' +
        '<div class="aic-modal-content">' +
          '<div class="aic-field">' +
            '<label>Employé à appeler</label>' +
            '<select id="aicEmpSelect" onchange="window._aicOnEmpChange()">' +
              '<option value="">— Sélectionne un employé —</option>' +
            '</select>' +
            '<div class="aic-hint">Liste chargée depuis tes employés STAFF PRO.</div>' +
          '</div>' +
          '<div class="aic-field" style="display:none;">' +
            '<input type="hidden" id="aicEmpId" />' +
            '<input type="hidden" id="aicEmpName" />' +
          '</div>' +
          '<div class="aic-field">' +
            '<label>Template d\'appel</label>' +
            '<select id="aicTplSelect" onchange="window._aicOnTplChange()">' +
              '<option value="">— Aucun (motif libre) —</option>' +
            '</select>' +
            '<div class="aic-hint">Depuis Paramètres → Appel IA. Le contexte du template + la base globale sont envoyés à l\'IA.</div>' +
          '</div>' +
          '<div class="aic-field">' +
            '<label>Motif / Contexte additionnel</label>' +
            '<textarea id="aicMotif" placeholder="Ajoute une précision (ex : « retard de 22 min ce matin »). Facultatif si un template est choisi."></textarea>' +
          '</div>' +
          '<button class="aic-btn primary" id="aicCallBtn" onclick="window._aicTriggerCall()">📞 Déclencher l\'appel IA</button>' +
          '<div class="aic-status" id="aicStatus"></div>' +
          '<div class="aic-settings-toggle" onclick="location.hash=\'\';document.querySelectorAll(\'.appro-tab\').forEach(function(b){if(b.textContent.indexOf(\'Appel IA\')!==-1)b.click();});document.getElementById(\'aiCallModal\').classList.remove(\'open\');">' +
            '⚙️ Ouvrir Paramètres → Appel IA' +
          '</div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(modal);

    // Handlers globaux
    window._aicTriggerCall = adminTriggerCall;
    window._aicOnEmpChange = adminOnEmpChange;
    window._aicOnTplChange = adminOnTplChange;
    window._aicOpenModal   = openAdminModal;
  }

  function applyAdminEnabled() {
    var fab = document.getElementById('aiCallFab');
    if (_aicCfg.enabled === false) {
      if (fab) fab.remove();
      // Ne pas fermer la modale si l'admin l'a ouverte via Paramètres pour tester
      return;
    }
    // Enabled : injecter le FAB si absent
    if (!fab) {
      var b = document.createElement('button');
      b.id = 'aiCallFab';
      b.title = 'Appel IA';
      b.innerHTML = '📞';
      b.onclick = openAdminModal;
      document.body.appendChild(b);
    }
  }

  function openAdminModal() {
    document.getElementById('aiCallModal').classList.add('open');
    // Rafraîchir la config (au cas où l'admin vient de la modifier dans Paramètres)
    firebase.database().ref(CONFIG_PATH).once('value').then(function(snap) {
      var cfg = snap.val() || {};
      _aicCfg.enabled       = cfg.enabled !== false;
      _aicCfg.geminiKey     = cfg.geminiKey || '';
      _aicCfg.voice         = cfg.voice || 'Algieba';
      _aicCfg.globalContext = cfg.globalContext || '';
    }).catch(function(){});
    populateEmpSelect();
    populateTemplateSelect();
  }

  function populateTemplateSelect() {
    var sel = document.getElementById('aicTplSelect');
    if (!sel) return;
    firebase.database().ref(TEMPLATES_PATH).once('value').then(function(snap) {
      var data = snap.val() || {};
      _aicTemplates = Object.keys(data).map(function(k){ var t = data[k]||{}; t.id = k; return t; });
      _aicTemplates.sort(function(a,b){ return (a.name||'').localeCompare(b.name||''); });
      sel.innerHTML = '<option value="">— Aucun (motif libre) —</option>';
      _aicTemplates.forEach(function(t) {
        var opt = document.createElement('option');
        opt.value = t.id;
        opt.textContent = (t.icon || '📞') + ' ' + (t.name || 'Sans nom');
        sel.appendChild(opt);
      });
    }).catch(function(e){ console.warn('[ai-call] templates load failed:', e); });
  }

  function adminOnTplChange() {
    var sel = document.getElementById('aicTplSelect');
    var t = _aicTemplates.find(function(x){ return x.id === sel.value; });
    var motifEl = document.getElementById('aicMotif');
    if (t && motifEl && !motifEl.value.trim()) {
      motifEl.value = t.motif || '';
    }
  }

  function populateEmpSelect() {
    var sel = document.getElementById('aicEmpSelect');
    if (!sel) return;
    var emps = [];
    try {
      var raw = localStorage.getItem('wecan_employees');
      if (raw) {
        var parsed = JSON.parse(raw);
        emps = Array.isArray(parsed) ? parsed : Object.values(parsed || {});
      }
    } catch(e) {}
    // Charger aussi les IDs actuellement connectés depuis Firebase pour badge ✅
    firebase.database().ref(CALL_PATH).once('value').then(function(snap) {
      var activeCalls = snap.val() || {};
      sel.innerHTML = '<option value="">— Sélectionne un employé —</option>';
      // Trier par prénom+nom
      emps.sort(function(a, b) {
        var na = ((a.prenom||'') + ' ' + (a.nom||'')).trim().toLowerCase();
        var nb = ((b.prenom||'') + ' ' + (b.nom||'')).trim().toLowerCase();
        return na.localeCompare(nb);
      });
      emps.forEach(function(e) {
        if (!e || e.id === undefined || e.id === null) return;
        var id = String(e.id);
        var name = ((e.prenom||'') + ' ' + (e.nom||'')).trim() || ('Employé ' + id);
        var poste = e.poste ? ' — ' + e.poste : '';
        var opt = document.createElement('option');
        opt.value = id;
        opt.setAttribute('data-name', name);
        opt.textContent = '#' + id + ' — ' + name + poste;
        sel.appendChild(opt);
      });
    }).catch(function(e) {
      console.warn('[ai-call] Firebase check failed:', e);
    });
  }

  function adminOnEmpChange() {
    var sel = document.getElementById('aicEmpSelect');
    var opt = sel.options[sel.selectedIndex];
    document.getElementById('aicEmpId').value = sel.value;
    document.getElementById('aicEmpName').value = opt ? (opt.getAttribute('data-name') || '') : '';
  }

  function adminTriggerCall() {
    var empId = document.getElementById('aicEmpId').value.trim();
    var empNom = document.getElementById('aicEmpName').value.trim() || 'Employé ' + empId;
    var motif = document.getElementById('aicMotif').value.trim();
    var tplId = document.getElementById('aicTplSelect').value;
    var tpl = _aicTemplates.find(function(x){ return x.id === tplId; }) || null;

    var key   = _aicCfg.geminiKey;
    var voice = _aicCfg.voice || 'Algieba';
    var globalContext = _aicCfg.globalContext || '';
    var tplContext = tpl ? (tpl.context || '') : '';

    if (!empId) { toast('❌ Sélectionne un employé'); return; }
    if (!motif && !tplContext) { toast('❌ Choisis un template ou saisis un motif'); return; }
    if (!key) { toast('❌ Configure la clé Gemini dans Paramètres → Appel IA'); return; }

    var status = document.getElementById('aicStatus');
    var btn = document.getElementById('aicCallBtn');
    btn.disabled = true;
    btn.textContent = '⏳ Envoi...';

    var call = {
      status: 'ringing',
      empId: empId,
      empNom: empNom,
      motif: motif,
      templateId: tpl ? tpl.id : '',
      templateName: tpl ? (tpl.name || '') : '',
      templateContext: tplContext,
      globalContext: globalContext,
      geminiKey: key,
      voice: voice,
      from: 'admin',
      ts: firebase.database.ServerValue.TIMESTAMP,
      id: Math.random().toString(36).slice(2, 10)
    };

    firebase.database().ref(CALL_PATH + '/' + empId).set(call).then(function() {
      status.className = 'aic-status on ringing';
      status.innerHTML = '📞 Sonnerie en cours vers ' + empNom + '...';
      btn.textContent = '🔄 Nouvel appel';
      btn.disabled = false;

      var ref = firebase.database().ref(CALL_PATH + '/' + empId);
      var handler = ref.on('value', function(snap) {
        var c = snap.val();
        if (!c || c.id !== call.id) return;
        if (c.status === 'accepted') {
          status.className = 'aic-status on accepted';
          status.innerHTML = '✅ ' + empNom + ' a répondu — conversation en cours';
        } else if (c.status === 'rejected') {
          status.className = 'aic-status on rejected';
          status.innerHTML = '❌ Appel refusé par ' + empNom;
          ref.off('value', handler);
        } else if (c.status === 'completed') {
          status.className = 'aic-status on completed';
          status.innerHTML = '☎️ Appel terminé (' + (c.duration || '?') + 's)';
          ref.off('value', handler);
        } else if (c.status === 'missed') {
          status.className = 'aic-status on rejected';
          status.innerHTML = '📵 Appel manqué — pas de réponse';
          ref.off('value', handler);
        }
      });
    }).catch(function(e) {
      toast('❌ ' + e.message);
      btn.disabled = false;
      btn.textContent = '📞 Déclencher l\'appel IA';
    });
  }

  // ═════════════════════════════════════════════════════════════
  //  EMPLOYE MODE : listener + UI d'appel entrant + Gemini Live
  // ═════════════════════════════════════════════════════════════

  var employe = {
    empId: null,
    listenerRef: null,
    currentCall: null,
    ws: null,
    audioCtx: null,
    outCtx: null,
    stream: null,
    processor: null,
    source: null,
    nextPlay: 0,
    isPlaying: false,
    isMuted: false,
    ringTimer: null,
    ringCtx: null,
    vibrateTimer: null,
    startTs: null,
    timerInt: null,
    autoMissTimeout: null,
    // ─── Speaker / audio-routing state ────────────────────────
    // 'earpiece' (défaut, écouteur d'oreille) | 'speaker' (haut-parleur mains libres) | 'bluetooth'
    speakerMode: 'earpiece',
    sinkAvailable: false,       // setSinkId supporté par ce navigateur ?
    audioSink: null,            // HTMLAudioElement caché pour setSinkId
    audioSinkDest: null,        // MediaStreamAudioDestinationNode connecté à l'élément
    audioDevices: null,         // { earpiece: id|null, speaker: id|null, bluetooth: id|null }
    nativeRouterOk: false       // plugin natif Capacitor AudioRouter détecté ?
  };

  // Cycle des modes speaker (order = cycle du bouton)
  var SPEAKER_MODES = ['earpiece', 'speaker', 'bluetooth'];
  var SPEAKER_ICONS = { earpiece: '🎧', speaker: '🔊', bluetooth: '🔵' };
  var SPEAKER_LABELS = {
    earpiece:  '🎧 Écouteur',
    speaker:   '🔊 Haut-parleur',
    bluetooth: '🔵 Bluetooth'
  };

  function initEmploye() {
    // Empêcher double init si le script est chargé plusieurs fois
    if (window._aiCallEmployeInit) {
      console.log('[ai-call] Mode EMPLOYE déjà initialisé, skip');
      return;
    }
    window._aiCallEmployeInit = true;

    console.log('[ai-call] Mode EMPLOYE activé — attente identification');
    injectCSS();
    buildEmployeScreens();

    // Suivre le flag d'activation. Si désactivé → détacher le listener.
    var moduleEnabled = true;
    firebase.database().ref(CONFIG_PATH + '/enabled').on('value', function(snap) {
      moduleEnabled = snap.val() !== false;
      if (!moduleEnabled && employe.listenerRef) {
        try { employe.listenerRef.off(); } catch(e){}
        employe.listenerRef = null;
        console.log('[ai-call] Module désactivé par admin — listener détaché');
      } else if (moduleEnabled && employe.empId && !employe.listenerRef) {
        startEmployeListener();
      }
    });

    // Attend que l'employé se connecte (peut prendre du temps si login)
    var tries = 0;
    var chk = setInterval(function() {
      tries++;
      var empId = getLoggedEmpId();
      if (empId && empId !== employe.empId && moduleEnabled) {
        employe.empId = empId;
        startEmployeListener();
        // APK Capacitor : démarre le listener natif (foreground service) pour
        // recevoir les appels IA même téléphone verrouillé. No-op côté web.
        try {
          var ics = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.IncomingCallService;
          if (ics && ics.startListening) ics.startListening({ empId: String(empId) });
        } catch (e) { /* silent */ }
      }
      // Ré-attache si l'employé change (re-login)
      if (tries > 600) clearInterval(chk);   // stop après 10 min
    }, 1000);

    // Handlers globaux pour les boutons
    window._aicAccept = employeAccept;
    window._aicReject = employeReject;
    window._aicHangup = employeHangup;
    window._aicToggleMute = employeToggleMute;
    window._aicToggleSpeaker = employeToggleSpeaker;
  }

  function getLoggedEmpId() {
    try {
      if (window.currentEmp && window.currentEmp.id) return String(window.currentEmp.id);
      var v = localStorage.getItem('wecan_logged_id');
      if (v) return String(v);
    } catch (e) {}
    return null;
  }

  function buildEmployeScreens() {
    // Écran d'appel entrant
    var inc = document.createElement('div');
    inc.id = 'aiIncoming';
    inc.innerHTML =
      '<div style="display:flex; flex-direction:column; align-items:center;">' +
        '<div class="aic-call-label">📞 Appel entrant</div>' +
        '<div class="aic-avatar">' + logoHTML() + '</div>' +
        '<div class="aic-call-name">WECAN SERVICES</div>' +
        '<div class="aic-call-number">+213 770 45 00 55</div>' +
        '<div class="aic-call-info">mobile</div>' +
        '<div class="aic-call-reason" id="aicReason"></div>' +
      '</div>' +
      '<div class="aic-actions">' +
        '<div style="text-align:center;">' +
          '<button class="aic-action-btn reject" onclick="window._aicReject()">📵</button>' +
          '<div class="aic-action-label">Refuser</div>' +
        '</div>' +
        '<div style="text-align:center;">' +
          '<button class="aic-action-btn accept" onclick="window._aicAccept()">📞</button>' +
          '<div class="aic-action-label">Accepter</div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(inc);

    // Écran en communication
    var inCall = document.createElement('div');
    inCall.id = 'aiInCall';
    inCall.innerHTML =
      '<div style="display:flex; flex-direction:column; align-items:center;">' +
        '<div class="aic-status-badge" id="aicCallStatus">🎙️ Connexion...</div>' +
        '<div class="aic-avatar">' + logoHTML() + '</div>' +
        '<div class="aic-call-name">WECAN SERVICES</div>' +
        '<div class="aic-call-number">+213 770 45 00 55</div>' +
        '<div class="aic-timer" id="aicTimer">00:00</div>' +
      '</div>' +
      '<div class="aic-in-actions">' +
        '<button class="aic-in-btn" id="aicMuteBtn" onclick="window._aicToggleMute()">🎤</button>' +
        '<button class="aic-in-btn hangup" onclick="window._aicHangup()">📵</button>' +
        '<button class="aic-in-btn speaker speaker-earpiece" id="aicSpeakerBtn" onclick="window._aicToggleSpeaker()" title="Basculer écouteur / haut-parleur / bluetooth">🎧</button>' +
      '</div>';
    document.body.appendChild(inCall);
  }

  function startEmployeListener() {
    console.log('[ai-call] Écoute Firebase pour empId =', employe.empId);
    if (employe.listenerRef) employe.listenerRef.off();
    var ref = firebase.database().ref(CALL_PATH + '/' + employe.empId);
    employe.listenerRef = ref;
    ref.on('value', function(snap) {
      var call = snap.val();
      if (!call) return;
      if (call.status === 'ringing' && (!employe.currentCall || employe.currentCall.id !== call.id)) {
        employe.currentCall = call;
        showIncomingCall(call);
      }
    });
  }

  function showIncomingCall(call) {
    document.getElementById('aicReason').textContent = call.motif
      ? call.motif.slice(0, 90) + (call.motif.length > 90 ? '...' : '')
      : '';
    document.getElementById('aiIncoming').classList.add('open');
    startRing();

    // Auto-manqué au bout de 30s
    employe.autoMissTimeout = setTimeout(function() {
      if (employe.currentCall && employe.currentCall.id === call.id) {
        firebase.database().ref(CALL_PATH + '/' + call.empId + '/status').set('missed');
        hideIncomingCall();
        employe.currentCall = null;
      }
    }, CALL_TIMEOUT_MS);
  }

  function hideIncomingCall() {
    document.getElementById('aiIncoming').classList.remove('open');
    stopRing();
    if (employe.autoMissTimeout) { clearTimeout(employe.autoMissTimeout); employe.autoMissTimeout = null; }
  }

  function employeReject() {
    if (!employe.currentCall) return;
    firebase.database().ref(CALL_PATH + '/' + employe.currentCall.empId + '/status').set('rejected');
    hideIncomingCall();
    employe.currentCall = null;
  }

  function employeAccept() {
    if (!employe.currentCall) return;
    var call = employe.currentCall;
    hideIncomingCall();

    firebase.database().ref(CALL_PATH + '/' + call.empId + '/status').set('accepted');

    document.getElementById('aiInCall').classList.add('open');
    document.getElementById('aicCallStatus').textContent = '🎙️ Connexion...';
    document.getElementById('aicCallStatus').className = 'aic-status-badge';

    employe.startTs = Date.now();
    employe.timerInt = setInterval(updateTimer, 1000);

    if (!call.geminiKey) {
      toast('❌ Clé Gemini manquante dans l\'appel');
      employeHangup();
      return;
    }
    startGemini(call.geminiKey, call.voice || 'Algieba', call.motif, call.globalContext, call.templateContext, call.templateName);
  }

  function updateTimer() {
    if (!employe.startTs) return;
    var s = Math.floor((Date.now() - employe.startTs) / 1000);
    var mm = String(Math.floor(s / 60)).padStart(2, '0');
    var ss = String(s % 60).padStart(2, '0');
    var el = document.getElementById('aicTimer');
    if (el) el.textContent = mm + ':' + ss;
  }

  function employeHangup() {
    var duration = employe.startTs ? Math.floor((Date.now() - employe.startTs) / 1000) : 0;
    if (employe.currentCall) {
      firebase.database().ref(CALL_PATH + '/' + employe.currentCall.empId).update({
        status: 'completed',
        duration: duration,
        endTs: firebase.database.ServerValue.TIMESTAMP
      }).catch(function(){});
    }
    stopGemini();
    document.getElementById('aiInCall').classList.remove('open');
    if (employe.timerInt) { clearInterval(employe.timerInt); employe.timerInt = null; }
    employe.startTs = null;
    employe.currentCall = null;
  }

  function employeToggleMute() {
    employe.isMuted = !employe.isMuted;
    var btn = document.getElementById('aicMuteBtn');
    btn.textContent = employe.isMuted ? '🔇' : '🎤';
    btn.classList.toggle('muted', employe.isMuted);
    toast(employe.isMuted ? '🔇 Micro coupé' : '🎤 Micro activé', 1500);
  }

  // ─── Speaker routing (écouteur / haut-parleur / bluetooth) ───
  //
  // Stratégie hybride (voir doc en bas du fichier) :
  //  1. Si plugin natif Capacitor AudioRouter dispo → délègue à Android AudioManager
  //     (setMode(MODE_IN_COMMUNICATION) + setSpeakerphoneOn / startBluetoothSco).
  //     C'est la seule vraie solution "façon WhatsApp" sur téléphone Android.
  //  2. Sinon (navigateur desktop, ou APK sans plugin) → tente setSinkId sur un
  //     <audio> caché branché à un MediaStreamAudioDestinationNode. Marche sur
  //     Chrome desktop récent, no-op silencieux ailleurs.
  //  3. Dans tous les cas le bouton cycle correctement (icône, toast, état visuel)
  //     pour que l'UX reste cohérente en attendant le plugin natif.
  //
  // TODO_NATIVE : créer un plugin Capacitor `AudioRouter` avec :
  //   - setMode({ mode: 'earpiece'|'speaker'|'bluetooth' }) → AudioManager
  //   - getAvailableDevices() → liste réelle (permet d'afficher "🔵 Bluetooth" grisé si absent)
  //   - isBluetoothConnected() → boolean
  //   Enregistrer via registerPlugin(AudioRouterPlugin.class) dans MainActivity.
  //   Permissions à ajouter : MODIFY_AUDIO_SETTINGS + BLUETOOTH_CONNECT.

  function setupAudioSink() {
    // Crée le pipeline MediaStreamDestination -> <audio> (une seule fois par appel).
    // Retourne le AudioNode où connecter les buffers TTS, ou null si non dispo.
    if (employe.audioSinkDest) return employe.audioSinkDest;
    if (!employe.outCtx) return null;
    try {
      var dest = employe.outCtx.createMediaStreamDestination();
      var audio = document.createElement('audio');
      audio.autoplay = true;
      audio.playsInline = true;
      audio.setAttribute('playsinline', '');
      audio.style.display = 'none';
      audio.srcObject = dest.stream;
      document.body.appendChild(audio);
      var p = audio.play();
      if (p && typeof p.catch === 'function') p.catch(function(){});
      employe.audioSink = audio;
      employe.audioSinkDest = dest;
      employe.sinkAvailable = typeof audio.setSinkId === 'function';
      return dest;
    } catch (e) {
      console.warn('[ai-call] setupAudioSink failed:', e);
      return null;
    }
  }

  function enumerateOutputDevices() {
    // Récupère la map earpiece/speaker/bluetooth depuis enumerateDevices().
    // ATTENTION : sur Android WebView, cette API renvoie souvent une liste vide
    // ou sans labels (permissions), d'où le fallback natif recommandé.
    if (employe.audioDevices) return Promise.resolve(employe.audioDevices);
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
      employe.audioDevices = { earpiece: null, speaker: null, bluetooth: null };
      return Promise.resolve(employe.audioDevices);
    }
    return navigator.mediaDevices.enumerateDevices().then(function(list) {
      var outs = list.filter(function(d) { return d.kind === 'audiooutput'; });
      var map = { earpiece: null, speaker: null, bluetooth: null };
      outs.forEach(function(d) {
        var l = (d.label || '').toLowerCase();
        if (l.indexOf('bluetooth') !== -1 || l.indexOf('bt ') !== -1 || l.indexOf('a2dp') !== -1 || l.indexOf('sco') !== -1) {
          if (!map.bluetooth) map.bluetooth = d.deviceId;
        } else if (l.indexOf('earpiece') !== -1 || l.indexOf('receiver') !== -1 || l.indexOf('handset') !== -1) {
          if (!map.earpiece) map.earpiece = d.deviceId;
        } else if (l.indexOf('speaker') !== -1 || l.indexOf('haut-parleur') !== -1) {
          if (!map.speaker) map.speaker = d.deviceId;
        } else {
          // device sans label utile → prend le premier comme fallback speaker
          if (!map.speaker) map.speaker = d.deviceId;
        }
      });
      employe.audioDevices = map;
      return map;
    }).catch(function() {
      employe.audioDevices = { earpiece: null, speaker: null, bluetooth: null };
      return employe.audioDevices;
    });
  }

  function applyWebSink(mode) {
    // Tente setSinkId sur l'élément audio caché. Marche sur Chrome desktop récent.
    // Sur Android WebView : silencieux (setSinkId absent) → le mode change visuellement
    // mais le routing réel reste dépendant du plugin natif.
    if (!employe.audioSink) setupAudioSink();
    if (!employe.audioSink || typeof employe.audioSink.setSinkId !== 'function') {
      return Promise.resolve(false);
    }
    return enumerateOutputDevices().then(function(map) {
      var deviceId = map[mode];
      // Mode earpiece = default output (vide "") pour laisser l'OS décider
      if (mode === 'earpiece') deviceId = '';
      // Si bluetooth demandé mais aucun device détecté → refuse (le caller gère le toast)
      if (mode === 'bluetooth' && !deviceId) return false;
      return employe.audioSink.setSinkId(deviceId || '').then(function() { return true; }).catch(function(e) {
        console.warn('[ai-call] setSinkId(' + mode + ') failed:', e);
        return false;
      });
    });
  }

  function tryNativeRouter(mode) {
    // Approche B (native plugin) — pas encore livrée. Voir TODO_NATIVE ci-dessus.
    try {
      var ar = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.AudioRouter;
      if (ar && typeof ar.setMode === 'function') {
        return Promise.resolve(ar.setMode({ mode: mode })).then(function() {
          employe.nativeRouterOk = true;
          return true;
        }).catch(function(e) {
          console.warn('[ai-call] native AudioRouter.setMode failed:', e);
          return false;
        });
      }
    } catch (e) { /* silent */ }
    return Promise.resolve(false);
  }

  function updateSpeakerBtn() {
    var btn = document.getElementById('aicSpeakerBtn');
    if (!btn) return;
    btn.textContent = SPEAKER_ICONS[employe.speakerMode] || '🔊';
    btn.classList.remove('speaker-earpiece', 'speaker-speaker', 'speaker-bluetooth');
    btn.classList.add('speaker-' + employe.speakerMode);
    btn.style.opacity = '1';
  }

  function employeToggleSpeaker() {
    // Cycle : earpiece → speaker → bluetooth → earpiece
    var idx = SPEAKER_MODES.indexOf(employe.speakerMode || 'earpiece');
    var nextMode = SPEAKER_MODES[(idx + 1) % SPEAKER_MODES.length];

    // 1) Essaie le plugin natif d'abord (vrai routing OS)
    tryNativeRouter(nextMode).then(function(nativeOk) {
      if (nativeOk) {
        employe.speakerMode = nextMode;
        updateSpeakerBtn();
        toast(SPEAKER_LABELS[nextMode] + ' activé (natif)', 1500);
        return;
      }
      // 2) Fallback web setSinkId (Chrome desktop)
      return applyWebSink(nextMode).then(function(webOk) {
        if (nextMode === 'bluetooth' && !webOk && !employe.nativeRouterOk) {
          // Aucun device BT détecté ET pas de plugin natif → skip vers earpiece
          toast('🔵 Bluetooth indisponible', 1500);
          employe.speakerMode = 'earpiece';
          updateSpeakerBtn();
          // reroute vers earpiece proprement
          applyWebSink('earpiece');
          return;
        }
        employe.speakerMode = nextMode;
        updateSpeakerBtn();
        // Sur APK sans plugin natif : le bouton cycle mais le son ne bouge pas.
        // On informe l'utilisateur pour éviter la confusion.
        var suffix = (webOk || employe.sinkAvailable) ? '' : ' (visuel — routing natif requis)';
        toast(SPEAKER_LABELS[nextMode] + ' activé' + suffix, 1500);
      });
    });
  }

  // ─── Sonnerie ────────────────────────────────────────────────
  // Fichier MP3 loopable (10s, mono 96kbps ~118KB) servi à la racine
  // du site (poussé par push_github.command). GRIFFA 3ASSIMIA - USMA.
  var RING_SRC = 'ringtone.mp3';
  function startRing() {
    try {
      var a = new Audio(RING_SRC);
      a.loop = true;
      a.volume = 0.7;
      a.preload = 'auto';
      employe.ringAudio = a;
      var p = a.play();
      if (p && typeof p.catch === 'function') p.catch(function(){});
    } catch (e) {}
    if (navigator.vibrate) {
      try {
        navigator.vibrate([500, 500, 500, 500]);
        employe.vibrateTimer = setInterval(function() { navigator.vibrate([500, 500]); }, 1000);
      } catch (e) {}
    }
  }
  function stopRing() {
    if (employe.ringAudio) {
      try { employe.ringAudio.pause(); employe.ringAudio.currentTime = 0; } catch(e){}
      employe.ringAudio = null;
    }
    if (employe.vibrateTimer) { clearInterval(employe.vibrateTimer); employe.vibrateTimer = null; }
    if (navigator.vibrate) { try { navigator.vibrate(0); } catch(e){} }
  }

  // ─── Gemini Live ─────────────────────────────────────────────
  function startGemini(apiKey, voice, motifContext, globalContext, templateContext, templateName) {
    navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1, sampleRate: INPUT_SR,
        echoCancellation: true, noiseSuppression: true, autoGainControl: true
      }
    }).then(function(stream) {
      employe.stream = stream;
      document.getElementById('aicCallStatus').textContent = '🎙️ Écoute...';
      document.getElementById('aicCallStatus').className = 'aic-status-badge listening';

      var wsUrl = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=' + encodeURIComponent(apiKey);
      employe.ws = new WebSocket(wsUrl);

      employe.ws.onopen = function() {
        // Prompt système = [base globale] + [contexte template] + [motif libre] + règles de conduite
        var parts = [];
        parts.push("Tu es un assistant RH vocal qui appelle un employé au téléphone. Parle français (avec un peu d'arabe algérien si l'employé bascule). Sois poli mais professionnel. Réponses très courtes (1-2 phrases max).");
        if (globalContext && globalContext.trim()) {
          parts.push("=== BASE DE DONNÉES GLOBALE (toujours vraie) ===\n" + globalContext.trim());
        }
        if (templateContext && templateContext.trim()) {
          parts.push("=== TEMPLATE ACTIF" + (templateName ? " : " + templateName : "") + " ===\n" + templateContext.trim());
        }
        if (motifContext && motifContext.trim()) {
          parts.push("=== PRÉCISION DE CET APPEL ===\n" + motifContext.trim());
        }
        parts.push("Ouvre en te présentant brièvement, puis pose ta question directement. Ne répète pas les instructions au téléphone.");
        var systemPrompt = parts.join("\n\n");

        employe.ws.send(JSON.stringify({
          setup: {
            model: GEMINI_MODEL,
            generationConfig: {
              responseModalities: ['AUDIO'],
              speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } }
            },
            systemInstruction: { parts: [{ text: systemPrompt }] }
          }
        }));
      };

      employe.ws.onmessage = handleGemini;
      employe.ws.onerror = function() { toast('❌ Erreur Gemini'); };
      employe.ws.onclose = function() {
        if (employe.startTs) {
          var el = document.getElementById('aicCallStatus');
          if (el) el.textContent = '⚠️ Déconnecté';
        }
      };
    }).catch(function(e) {
      toast('❌ Micro refusé : ' + e.message);
      employeHangup();
    });
  }

  function handleGemini(event) {
    var handler = function(text) {
      var data;
      try { data = JSON.parse(text); } catch(e) { return; }

      if (data.setupComplete) { startCapture(); return; }
      if (data.serverContent) {
        if (data.serverContent.modelTurn && data.serverContent.modelTurn.parts) {
          data.serverContent.modelTurn.parts.forEach(function(p) {
            if (p.inlineData && p.inlineData.data) queueAudio(p.inlineData.data);
          });
        }
        if (data.serverContent.interrupted) employe.nextPlay = 0;
      }
    };
    if (event.data instanceof Blob) event.data.text().then(handler);
    else handler(event.data);
  }

  function startCapture() {
    employe.audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: INPUT_SR });
    employe.source = employe.audioCtx.createMediaStreamSource(employe.stream);
    employe.processor = employe.audioCtx.createScriptProcessor(4096, 1, 1);
    employe.processor.onaudioprocess = function(e) {
      if (!employe.ws || employe.ws.readyState !== WebSocket.OPEN || employe.isMuted) return;
      var input = e.inputBuffer.getChannelData(0);
      var int16 = new Int16Array(input.length);
      for (var i = 0; i < input.length; i++) {
        var s = Math.max(-1, Math.min(1, input[i]));
        int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
      }
      var bytes = new Uint8Array(int16.buffer);
      var binary = '';
      for (var j = 0; j < bytes.length; j++) binary += String.fromCharCode(bytes[j]);
      employe.ws.send(JSON.stringify({
        realtimeInput: { audio: { mimeType: 'audio/pcm;rate=' + INPUT_SR, data: btoa(binary) } }
      }));
    };
    employe.source.connect(employe.processor);
    employe.processor.connect(employe.audioCtx.destination);
  }

  function queueAudio(b64) {
    if (!employe.outCtx) {
      employe.outCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: OUTPUT_SR });
      employe.nextPlay = employe.outCtx.currentTime;
    }
    var binary = atob(b64);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    var int16 = new Int16Array(bytes.buffer, bytes.byteOffset, bytes.length / 2);
    var f32 = new Float32Array(int16.length);
    for (var k = 0; k < int16.length; k++) f32[k] = int16[k] / 0x8000;
    var buf = employe.outCtx.createBuffer(1, f32.length, OUTPUT_SR);
    buf.getChannelData(0).set(f32);
    var src = employe.outCtx.createBufferSource();
    src.buffer = buf;
    // Routing : si un mode speaker/bluetooth est actif ET le sink est prêt,
    // on route via MediaStreamDestination (contrôlé par setSinkId). Sinon
    // sortie par défaut de l'OS = comportement historique = écouteur/défaut.
    var outNode = employe.outCtx.destination;
    if (employe.speakerMode && employe.speakerMode !== 'earpiece') {
      var sink = employe.audioSinkDest || setupAudioSink();
      if (sink) outNode = sink;
    }
    src.connect(outNode);
    var now = employe.outCtx.currentTime;
    if (employe.nextPlay < now) employe.nextPlay = now;
    src.start(employe.nextPlay);
    employe.nextPlay += buf.duration;
    if (!employe.isPlaying) {
      employe.isPlaying = true;
      var el = document.getElementById('aicCallStatus');
      if (el) { el.textContent = '🔊 Assistant parle...'; el.className = 'aic-status-badge speaking'; }
    }
    src.onended = function() {
      if (employe.outCtx && employe.nextPlay <= employe.outCtx.currentTime + 0.05) {
        employe.isPlaying = false;
        var e2 = document.getElementById('aicCallStatus');
        if (e2) { e2.textContent = '🎙️ Écoute...'; e2.className = 'aic-status-badge listening'; }
      }
    };
  }

  function stopGemini() {
    if (employe.processor) { employe.processor.disconnect(); employe.processor.onaudioprocess = null; employe.processor = null; }
    if (employe.source) { employe.source.disconnect(); employe.source = null; }
    if (employe.stream) { employe.stream.getTracks().forEach(function(t){ t.stop(); }); employe.stream = null; }
    // Nettoyage du sink audio (routing speaker/BT)
    if (employe.audioSink) {
      try { employe.audioSink.pause(); employe.audioSink.srcObject = null; employe.audioSink.remove(); } catch(e){}
      employe.audioSink = null;
    }
    employe.audioSinkDest = null;
    employe.audioDevices = null;
    // Reset natif si dispo, pour rendre la main à l'OS (mode normal, plus in-call)
    try {
      var ar = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.AudioRouter;
      if (ar && typeof ar.setMode === 'function') { ar.setMode({ mode: 'earpiece' }); }
    } catch(e) {}
    if (employe.audioCtx) { try{ employe.audioCtx.close(); }catch(e){} employe.audioCtx = null; }
    if (employe.outCtx) { try{ employe.outCtx.close(); }catch(e){} employe.outCtx = null; }
    if (employe.ws) { try{ employe.ws.close(); }catch(e){} employe.ws = null; }
    employe.nextPlay = 0;
    employe.isPlaying = false;
    employe.isMuted = false;
    // Reset UI speaker pour le prochain appel
    employe.speakerMode = 'earpiece';
    employe.nativeRouterOk = false;
    updateSpeakerBtn();
  }

})();
