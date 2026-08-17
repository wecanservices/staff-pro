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
  const CALL_TIMEOUT_MS = 30000;
  const DEFAULT_COUNTRY_CODE = '213';   // Algérie

  // Normalise un numéro : enlève espaces / marks / caractères spéciaux, ajoute +213 si local
  function normalizePhone(p) {
    if (!p) return '';
    p = String(p)
      .replace(/[‎‏‪‫‬‭‮]/g, '')  // bidi marks
      .replace(/\s+/g, '')
      .replace(/[-().]/g, '');
    if (p.indexOf('00') === 0) p = '+' + p.slice(2);
    if (p.indexOf('0') === 0 && p.length === 10) p = '+' + DEFAULT_COUNTRY_CODE + p.slice(1);
    if (p.indexOf('+') !== 0 && p.length >= 8 && p.length <= 14) p = '+' + p;
    return p;
  }

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
  function initAdmin() {
    console.log('[ai-call] Mode ADMIN activé');
    injectCSS();

    // Bouton flottant
    var fab = document.createElement('button');
    fab.id = 'aiCallFab';
    fab.title = 'Appel IA';
    fab.innerHTML = '📞';
    fab.onclick = openAdminModal;
    document.body.appendChild(fab);

    // Modal
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
          '<div class="aic-field">' +
            '<label>Numéro à composer <span id="aicPhoneMode" style="font-size:10px; color:#888;"></span></label>' +
            '<input type="text" id="aicEmpPhone" placeholder="+213 770 12 34 56" />' +
            '<div class="aic-hint">Auto-rempli depuis l\'employé. Modifie si besoin. Le mode GSM utilisera ce numéro.</div>' +
          '</div>' +
          '<div class="aic-field" style="display:none;">' +
            '<input type="hidden" id="aicEmpId" />' +
            '<input type="hidden" id="aicEmpName" />' +
          '</div>' +
          '<div class="aic-field">' +
            '<label>Motif / Contexte pour l\'IA</label>' +
            '<textarea id="aicMotif">Tu appelles cet employé qui est en retard de 15 minutes ce matin. Demande-lui poliment mais fermement la raison de son retard. Sois compréhensif si c\'est justifié. Reste court : 2-3 échanges maximum.</textarea>' +
          '</div>' +
          '<button class="aic-btn primary" id="aicCallBtn" onclick="window._aicTriggerCall()">📞 Déclencher l\'appel IA</button>' +
          '<div class="aic-status" id="aicStatus"></div>' +
          '<div class="aic-settings-toggle" onclick="document.getElementById(\'aicSettings\').classList.toggle(\'open\')">' +
            '⚙️ Paramètres (clé API + voix)' +
          '</div>' +
          '<div class="aic-settings" id="aicSettings">' +
            '<div class="aic-field">' +
              '<label>Mode d\'appel</label>' +
              '<select id="aicMode" onchange="window._aicOnModeChange()">' +
                '<option value="inapp" selected>📱 In-app (sonnerie dans l\'app STAFF PRO)</option>' +
                '<option value="gsm">☎️ GSM (webhook vers Call App + modem GSM)</option>' +
              '</select>' +
              '<div class="aic-hint">GSM = vrai appel téléphonique sur le numéro de l\'employé.</div>' +
            '</div>' +
            '<div class="aic-field aic-gsm-only" style="display:none;">' +
              '<label>URL du tunnel Call App (base, sans /dial)</label>' +
              '<input type="url" id="aicWebhookUrl" placeholder="https://xxx.trycloudflare.com" />' +
              '<div class="aic-hint">URL Cloudflare/ngrok qui route vers <code>localhost:8767</code>. Le module ajoute automatiquement <code>/dial?number=…</code>.</div>' +
            '</div>' +
            '<div class="aic-field aic-gsm-only" style="display:none;">' +
              '<label>Bearer token (optionnel, si tunnel protégé)</label>' +
              '<input type="password" id="aicWebhookToken" placeholder="laisser vide si pas d\'auth" />' +
              '<div class="aic-hint">Envoyé en header <code>Authorization: Bearer &lt;token&gt;</code> si rempli.</div>' +
            '</div>' +
            '<div class="aic-field">' +
              '<label>Clé API Google Gemini</label>' +
              '<input type="password" id="aicKey" placeholder="AIza..." />' +
              '<div class="aic-hint">Sauvegardée dans Firebase, envoyée à la Call App pour chaque appel.</div>' +
            '</div>' +
            '<div class="aic-field">' +
              '<label>Voix de l\'assistant</label>' +
              '<select id="aicVoice">' +
                '<optgroup label="⭐ Recommandées">' +
                  '<option value="Algieba" selected>Algieba — naturelle</option>' +
                  '<option value="Despina">Despina — lisse jeune</option>' +
                  '<option value="Sulafat">Sulafat — chaleureuse</option>' +
                '</optgroup>' +
                '<optgroup label="Fermes">' +
                  '<option value="Alnilam">Alnilam — ferme</option>' +
                  '<option value="Kore">Kore — ferme</option>' +
                  '<option value="Gacrux">Gacrux — mature</option>' +
                '</optgroup>' +
                '<optgroup label="Douces">' +
                  '<option value="Achernar">Achernar — douce</option>' +
                  '<option value="Vindemiatrix">Vindemiatrix — douce</option>' +
                  '<option value="Achird">Achird — amicale</option>' +
                '</optgroup>' +
              '</select>' +
            '</div>' +
            '<button class="aic-btn secondary" id="aicSaveBtn" onclick="window._aicSaveConfig()">💾 Sauvegarder</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(modal);

    // Handlers globaux
    window._aicSaveConfig = adminSaveConfig;
    window._aicTriggerCall = adminTriggerCall;
    window._aicOnEmpChange = adminOnEmpChange;
    window._aicOnModeChange = adminOnModeChange;
  }

  function adminOnModeChange() {
    var mode = document.getElementById('aicMode').value;
    var isGsm = (mode === 'gsm');
    document.querySelectorAll('.aic-gsm-only').forEach(function(el) {
      el.style.display = isGsm ? '' : 'none';
    });
    var btn = document.getElementById('aicCallBtn');
    if (btn) btn.textContent = isGsm ? '☎️ Appeler via GSM (webhook)' : '📞 Déclencher l\'appel IA';
    var phoneMode = document.getElementById('aicPhoneMode');
    if (phoneMode) phoneMode.textContent = isGsm ? '(utilisé par le modem GSM)' : '(non utilisé en mode in-app)';
  }

  function openAdminModal() {
    document.getElementById('aiCallModal').classList.add('open');
    // Charger la config depuis Firebase pour préremplir
    firebase.database().ref(CONFIG_PATH).once('value').then(function(snap) {
      var cfg = snap.val() || {};
      if (cfg.geminiKey && !document.getElementById('aicKey').value) {
        document.getElementById('aicKey').value = cfg.geminiKey;
      }
      if (cfg.voice) document.getElementById('aicVoice').value = cfg.voice;
      if (cfg.mode) document.getElementById('aicMode').value = cfg.mode;
      if (cfg.webhookUrl) document.getElementById('aicWebhookUrl').value = cfg.webhookUrl;
      if (cfg.webhookToken) document.getElementById('aicWebhookToken').value = cfg.webhookToken;
      adminOnModeChange();  // Applique l'affichage selon le mode
    }).catch(function(){});
    // Remplir la liste des employés depuis STAFF PRO (localStorage wecan_employees)
    populateEmpSelect();
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
        var phone = normalizePhone(e.tel || e.telephone || e.phone || '');
        var opt = document.createElement('option');
        opt.value = id;
        opt.setAttribute('data-name', name);
        opt.setAttribute('data-phone', phone);
        opt.textContent = '#' + id + ' — ' + name + poste + (phone ? ' 📞' : '');
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
    var phone = opt ? (opt.getAttribute('data-phone') || '') : '';
    document.getElementById('aicEmpPhone').value = phone;
  }

  function adminSaveConfig() {
    var key = document.getElementById('aicKey').value.trim();
    var voice = document.getElementById('aicVoice').value;
    var mode = document.getElementById('aicMode').value;
    var webhookUrl = document.getElementById('aicWebhookUrl').value.trim();
    var webhookToken = document.getElementById('aicWebhookToken').value.trim();

    if (!key) { toast('❌ Colle une clé API Gemini'); return; }
    if (mode === 'gsm' && !webhookUrl) { toast('❌ URL webhook requise en mode GSM'); return; }

    var btn = document.getElementById('aicSaveBtn');
    btn.disabled = true;
    btn.textContent = '⏳ Sauvegarde...';

    firebase.database().ref(CONFIG_PATH).set({
      geminiKey: key,
      voice: voice,
      mode: mode,
      webhookUrl: webhookUrl,
      webhookToken: webhookToken,
      updatedAt: firebase.database.ServerValue.TIMESTAMP
    }).then(function() {
      btn.textContent = '✅ Sauvegardé';
      setTimeout(function() {
        btn.textContent = '💾 Sauvegarder';
        btn.disabled = false;
      }, 2000);
      toast('✅ Config sauvegardée (mode ' + mode + ')');
    }).catch(function(e) {
      toast('❌ ' + e.message);
      btn.disabled = false;
      btn.textContent = '💾 Sauvegarder';
    });
  }

  function adminTriggerCall() {
    var empId = document.getElementById('aicEmpId').value.trim();
    var empNom = document.getElementById('aicEmpName').value.trim() || 'Employé ' + empId;
    var empPhone = normalizePhone(document.getElementById('aicEmpPhone').value.trim());
    var motif = document.getElementById('aicMotif').value.trim();
    var key = document.getElementById('aicKey').value.trim();
    var voice = document.getElementById('aicVoice').value;
    var mode = document.getElementById('aicMode').value;
    var webhookUrl = document.getElementById('aicWebhookUrl').value.trim();
    var webhookToken = document.getElementById('aicWebhookToken').value.trim();

    if (!empId) { toast('❌ Sélectionne un employé'); return; }
    if (!motif) { toast('❌ Saisis un motif'); return; }
    if (!key) { toast('❌ Configure d\'abord la clé Gemini (⚙️ Paramètres)'); return; }

    if (mode === 'gsm') {
      if (!webhookUrl) { toast('❌ URL webhook non configurée (⚙️ Paramètres)'); return; }
      if (!empPhone) { toast('❌ Numéro de téléphone requis en mode GSM'); return; }
      triggerGsmCall(empId, empNom, empPhone, motif, key, voice, webhookUrl, webhookToken);
    } else {
      triggerInAppCall(empId, empNom, motif, key, voice);
    }
  }

  function triggerInAppCall(empId, empNom, motif, key, voice) {
    var status = document.getElementById('aicStatus');
    var btn = document.getElementById('aicCallBtn');
    btn.disabled = true;
    btn.textContent = '⏳ Envoi...';

    var call = {
      status: 'ringing',
      empId: empId,
      empNom: empNom,
      motif: motif,
      geminiKey: key,
      voice: voice,
      from: 'admin',
      ts: firebase.database.ServerValue.TIMESTAMP,
      id: Math.random().toString(36).slice(2, 10)
    };

    firebase.database().ref(CALL_PATH + '/' + empId).set(call).then(function() {
      status.className = 'aic-status on ringing';
      status.innerHTML = '📞 Sonnerie in-app vers ' + empNom + '...';
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

  function triggerGsmCall(empId, empNom, empPhone, motif, key, voice, webhookUrl, webhookToken) {
    var status = document.getElementById('aicStatus');
    var btn = document.getElementById('aicCallBtn');
    btn.disabled = true;
    btn.textContent = '⏳ Envoi au tunnel...';

    var callId = Math.random().toString(36).slice(2, 10);

    // Nettoie l'URL : enlève trailing slash + /dial si l'user l'a inclus
    var baseUrl = webhookUrl.replace(/\/+$/, '').replace(/\/dial$/, '');
    var dialUrl = baseUrl + '/dial?number=' + encodeURIComponent(empPhone);

    // Log dans Firebase pour l'historique + status updates
    firebase.database().ref(CALL_PATH + '/' + empId).set({
      status: 'dispatching',
      empId: empId,
      empNom: empNom,
      empPhone: empPhone,
      motif: motif,
      voice: voice,
      mode: 'gsm',
      from: 'admin',
      ts: firebase.database.ServerValue.TIMESTAMP,
      id: callId
    }).catch(function(){});

    var headers = {};
    if (webhookToken) headers['Authorization'] = 'Bearer ' + webhookToken;

    fetch(dialUrl, { method: 'GET', headers: headers, mode: 'cors' })
      .then(function(res) {
        if (!res.ok && res.status !== 0) throw new Error('HTTP ' + res.status + ' ' + res.statusText);
        return res.text().then(function(t) { try { return JSON.parse(t); } catch(e) { return { raw: t.slice(0,120) }; } });
      })
      .then(function(data) {
      status.className = 'aic-status on ringing';
      status.innerHTML = '☎️ <b>Ordre envoyé à la Call App</b><br>' +
                        'Dial vers ' + empPhone + ' (' + empNom + ')<br>' +
                        '<span style="font-size:10px;">Réponse: ' + (data.status || data.raw || 'OK') + '</span>';
      btn.textContent = '🔄 Nouvel appel';
      btn.disabled = false;
      firebase.database().ref(CALL_PATH + '/' + empId + '/status').set('ringing').catch(function(){});

      // Listener pour les updates de statut (la Call App écrira dans Firebase)
      var ref = firebase.database().ref(CALL_PATH + '/' + empId);
      var handler = ref.on('value', function(snap) {
        var c = snap.val();
        if (!c || c.id !== callId) return;
        if (c.status === 'accepted') {
          status.className = 'aic-status on accepted';
          status.innerHTML = '✅ Décroché — Gemini parle avec ' + empNom;
        } else if (c.status === 'completed') {
          status.className = 'aic-status on completed';
          status.innerHTML = '☎️ Terminé (' + (c.duration || '?') + 's)';
          ref.off('value', handler);
        } else if (c.status === 'no_answer' || c.status === 'missed') {
          status.className = 'aic-status on rejected';
          status.innerHTML = '📵 Pas de réponse';
          ref.off('value', handler);
        } else if (c.status === 'busy') {
          status.className = 'aic-status on rejected';
          status.innerHTML = '📵 Ligne occupée';
          ref.off('value', handler);
        } else if (c.status === 'failed') {
          status.className = 'aic-status on rejected';
          status.innerHTML = '❌ Échec appel: ' + (c.error || 'raison inconnue');
          ref.off('value', handler);
        }
      });
    }).catch(function(e) {
      status.className = 'aic-status on rejected';
      status.innerHTML = '❌ Tunnel/Call App a échoué : ' + e.message + '<br>' +
                        '<span style="font-size:10px;">Vérifie : Call App tourne, cloudflared/ngrok actif, URL correcte.</span>';
      btn.disabled = false;
      btn.textContent = '☎️ Appeler via GSM (webhook)';
      firebase.database().ref(CALL_PATH + '/' + empId + '/status').set('failed').catch(function(){});
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
    autoMissTimeout: null
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

    // Attend que l'employé se connecte (peut prendre du temps si login)
    var tries = 0;
    var chk = setInterval(function() {
      tries++;
      var empId = getLoggedEmpId();
      if (empId && empId !== employe.empId) {
        employe.empId = empId;
        startEmployeListener();
      }
      // Ré-attache si l'employé change (re-login)
      if (tries > 600) clearInterval(chk);   // stop après 10 min
    }, 1000);

    // Handlers globaux pour les boutons
    window._aicAccept = employeAccept;
    window._aicReject = employeReject;
    window._aicHangup = employeHangup;
    window._aicToggleMute = employeToggleMute;
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
        '<button class="aic-in-btn" style="opacity:0.3;">🔊</button>' +
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
    startGemini(call.geminiKey, call.voice || 'Algieba', call.motif);
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

  // ─── Sonnerie ────────────────────────────────────────────────
  function startRing() {
    try {
      var ctx = new (window.AudioContext || window.webkitAudioContext)();
      employe.ringCtx = ctx;
      function playBeep() {
        [800, 1000].forEach(function(freq, i) {
          var osc = ctx.createOscillator();
          var g = ctx.createGain();
          osc.frequency.value = freq;
          var t0 = ctx.currentTime + i * 0.5;
          g.gain.setValueAtTime(0, t0);
          g.gain.linearRampToValueAtTime(0.3, t0 + 0.05);
          g.gain.linearRampToValueAtTime(0, t0 + 0.4);
          osc.connect(g).connect(ctx.destination);
          osc.start(t0);
          osc.stop(t0 + 0.4);
        });
      }
      playBeep();
      employe.ringTimer = setInterval(playBeep, 1500);
    } catch (e) {}
    if (navigator.vibrate) {
      try {
        navigator.vibrate([500, 500, 500, 500]);
        employe.vibrateTimer = setInterval(function() { navigator.vibrate([500, 500]); }, 1000);
      } catch (e) {}
    }
  }
  function stopRing() {
    if (employe.ringTimer) { clearInterval(employe.ringTimer); employe.ringTimer = null; }
    if (employe.vibrateTimer) { clearInterval(employe.vibrateTimer); employe.vibrateTimer = null; }
    if (employe.ringCtx) { try { employe.ringCtx.close(); } catch(e){} employe.ringCtx = null; }
    if (navigator.vibrate) { try { navigator.vibrate(0); } catch(e){} }
  }

  // ─── Gemini Live ─────────────────────────────────────────────
  function startGemini(apiKey, voice, motifContext) {
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
        var systemPrompt =
          "Tu es un assistant RH vocal de WeCan Services (livraison en Algérie). " +
          "Tu appelles un employé au téléphone. Parle français, sois poli mais professionnel. " +
          "Contexte de l'appel : " + motifContext + " " +
          "Ouvre en te présentant : 'Bonjour, ici l'assistant RH de WeCan Services'. " +
          "Puis pose ta question directement. Réponses très courtes (1-2 phrases max).";

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
    src.connect(employe.outCtx.destination);
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
    if (employe.audioCtx) { try{ employe.audioCtx.close(); }catch(e){} employe.audioCtx = null; }
    if (employe.outCtx) { try{ employe.outCtx.close(); }catch(e){} employe.outCtx = null; }
    if (employe.ws) { try{ employe.ws.close(); }catch(e){} employe.ws = null; }
    employe.nextPlay = 0;
    employe.isPlaying = false;
    employe.isMuted = false;
  }

})();
