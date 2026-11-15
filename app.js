/* Zaman Cricket Quiz v2 - UI + rooms (Firebase) + Solo. Game rules are in engine.js, questions in questions.js */
(function(){'use strict';
const firebaseConfig = {
  apiKey: "AIzaSyBKQQRIcz1eEsz-V0r8WYsOCXBjAsR6XNQ",
  authDomain: "zaman-6587f.firebaseapp.com",
  databaseURL: "https://zaman-6587f-default-rtdb.firebaseio.com",
  projectId: "zaman-6587f",
  storageBucket: "zaman-6587f.firebasestorage.app",
  messagingSenderId: "985807833692",
  appId: "1:985807833692:web:4d331bd0b2e8db0fcdb499"
};
var E = window.Engine;
var QS = (typeof questionSets !== 'undefined') ? questionSets : {};
var db = null;
try { if (window.firebase) { firebase.initializeApp(firebaseConfig); db = firebase.database(); } } catch (e) { db = null; }

var $ = function (s) { return document.querySelector(s); };
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
var LS = {
  get: function (k, d) { try { var v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  del: function (k) { try { localStorage.removeItem(k); } catch (e) {} }
};
var S = { room: null, me: null, solo: false, ref: null, code: null, offset: 0, shownSeq: null, bannerSeq: null, panelKey: '', tick: null, sentSeq: -1, tSeq: -1, sel: null, homeMode: '', lastPhase: '' };
window.ZCQ = { S: S, E: E };

function deviceId() { var id = LS.get('zcq_pid'); if (!id) { id = 'p' + Math.random().toString(36).slice(2, 10); LS.set('zcq_pid', id); } return id; }
function now() { return Date.now(); }
function serverNow() { return Date.now() + (S.solo ? 0 : S.offset); }
function toast(msg, ok) { var t = $('#toast'); t.textContent = msg; t.className = 'toast' + (ok ? ' ok' : ''); t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(function () { t.hidden = true; }, 2600); }
function nm(pid) { var p = S.room && S.room.players[pid]; return p ? p.name : '—'; }
function teamName(t) { return S.room && S.room.teams[t] ? S.room.teams[t].name : t; }
function speak(text) {
  try {
    if (!('speechSynthesis' in window)) return;
    speechSynthesis.cancel();
    var u = new SpeechSynthesisUtterance(text); u.lang = 'ml-IN'; u.rate = 0.95;
    var v = (speechSynthesis.getVoices() || []).filter(function (x) { return /^ml/i.test(x.lang); })[0]; if (v) u.voice = v;
    speechSynthesis.speak(u);
  } catch (e) {}
}
function fmtT(sec) { sec = Math.max(0, sec); if (sec >= 60) { var m = Math.floor(sec / 60), s = Math.floor(sec % 60); return m + ':' + (s < 10 ? '0' : '') + s; } return String(Math.ceil(sec)); }
function limitTxt(L) { return L >= 60 ? (L / 60) + ' മിനിറ്റ്' : L + ' സെക്കൻഡ്'; }
function oversTxt(b) { return Math.floor(b / 6) + '.' + (b % 6); }

// ------------------------------------------------------------ dispatch
function dispatch(a) {
  a.by = S.solo ? 'solo' : S.me; a.now = serverNow();
  if (S.solo) {
    var r = E.reduce(S.room, a, QS);
    if (r.error) { toast(r.error); return Promise.resolve(false); }
    S.room = r.room; LS.set('zcq_solo', S.room); render(); return Promise.resolve(true);
  }
  if (!S.ref) return Promise.resolve(false);
  var err = null; S.tx = (S.tx || 0) + 1;
  return S.ref.transaction(function (cur) {
    if (cur === null) return cur;
    var r = E.reduce(E.normalize(cur), a, QS);
    if (r.error) { err = r.error; return; }
    err = null; return r.room;
  }).then(function () { S.tx--; if (err) { toast(err); return false; } return true; })
    .catch(function (e) { S.tx--; console.warn('tx', e && e.message); toast('ഇന്റർനെറ്റ് പ്രശ്നം. വീണ്ടും ശ്രമിക്കുക'); return false; });
}

// ------------------------------------------------------------ rooms
function genCode() { var c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', s = ''; for (var i = 0; i < 6; i++) s += c[Math.floor(Math.random() * c.length)]; return s; }
function myName() { var el = $('#nameIn'); var n = (el ? el.value : LS.get('zcq_name', '')).trim().slice(0, 20); if (n) LS.set('zcq_name', n); return n; }

function createRoom() {
  if (!db) return toast('ഇന്റർനെറ്റ് ഇല്ല. സോളോ കളിക്കാം');
  var name = myName(); if (!name) return toast('ആദ്യം നിങ്ങളുടെ പേര് നൽകുക');
  var code = genCode(), pid = deviceId();
  var ref = db.ref('rooms/' + code);
  ref.once('value').then(function (s) {
    if (s.exists()) return createRoom();
    var room = E.newRoom({ code: code, pid: pid, name: name, now: serverNow() });
    var def = firstPlayable(); if (def) room.set = def;
    return ref.set(room).then(function () { connect(code, pid, name); });
  }).catch(function () { toast('റൂം ഉണ്ടാക്കാൻ പറ്റിയില്ല'); });
}
function joinRoom(codeIn, silent) {
  if (!db) return toast('ഇന്റർനെറ്റ് ഇല്ല');
  var code = String(codeIn || ($('#codeIn') ? $('#codeIn').value : '')).trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  var name = myName();
  if (!name) return toast('ആദ്യം നിങ്ങളുടെ പേര് നൽകുക');
  if (code.length < 4) return toast('ശരിയായ റൂം കോഡ് നൽകുക');
  var pid = deviceId();
  db.ref('rooms/' + code).once('value').then(function (s) {
    if (!s.exists()) return toast('ഈ കോഡിൽ റൂം ഇല്ല');
    var room = E.normalize(s.val());
    if (!room.players[pid]) {
      // same name, player offline -> take back that seat (phone changed / data cleared)
      var same = Object.keys(room.players).filter(function (id) { return room.players[id].name === name && !room.players[id].online; })[0];
      if (same) pid = same;
    }
    connect(code, pid, name);
  }).catch(function () { toast('ജോയിൻ ചെയ്യാൻ പറ്റിയില്ല'); });
}
function connect(code, pid, name) {
  disconnect();
  S.solo = false; S.code = code; S.me = pid; S.shownSeq = null; S.bannerSeq = null; S.panelKey = '';
  LS.set('zcq_session', { code: code, pid: pid, name: name, left: false });
  S.ref = db.ref('rooms/' + code);
  var onl = S.ref.child('players/' + pid + '/online'), ref = S.ref, joined = false;
  db.ref('.info/serverTimeOffset').on('value', function (s) { S.offset = s.val() || 0; });
  ref.on('value', function (snap) {
    if (ref !== S.ref) return;
    var v = snap.val();
    if (!v) {
      if (S.tx > 0) return; // optimistic transaction step, not a real delete
      ref.get().then(function (s2) {
        if (s2.exists() || ref !== S.ref) return;
        toast('റൂം ഇല്ലാതായി'); LS.del('zcq_session'); disconnect(); S.room = null; render();
      }).catch(function () {});
      return;
    }
    if (!joined) {
      // local cache is ready now -> join + presence
      joined = true;
      dispatch({ type: 'join', pid: pid, name: name });
      db.ref('.info/connected').on('value', function (s) {
        if (s.val() === true && ref === S.ref) { onl.onDisconnect().set(false); dispatch({ type: 'join', pid: pid, name: name }); }
      });
    }
    if (!v.players || !v.players[pid] || !v.players[pid].name) return; // wait for join
    S.room = E.normalize(v); render();
  });
}
function disconnect() {
  if (S.ref) { S.ref.off(); try { S.ref.child('players/' + S.me + '/online').onDisconnect().cancel(); S.ref.child('players/' + S.me + '/online').set(false); } catch (e) {} }
  if (db) { db.ref('.info/connected').off(); db.ref('.info/serverTimeOffset').off(); }
  S.ref = null;
}
function leave() {
  if (S.solo) { S.room = null; S.solo = false; render(); return; }
  var ses = LS.get('zcq_session'); if (ses) { ses.left = true; LS.set('zcq_session', ses); }
  disconnect(); S.room = null; render();
}
function forget() { LS.del('zcq_session'); render(); }
function forgetSolo() { LS.del('zcq_solo'); render(); }

// ------------------------------------------------------------ solo
function firstPlayable() { var l = E.listSets(QS); for (var i = 0; i < l.length; i++) for (var j = 0; j < l[i].sets.length; j++) if (l[i].sets[j].ok) return l[i].sets[j].name; return null; }
function startSolo() {
  var name = myName() || 'ഞാൻ';
  var nA = ($('#soloA').value || '').trim().slice(0, 24) || 'ടീം A', nB = ($('#soloB').value || '').trim().slice(0, 24) || 'ടീം B';
  var cA = Math.min(11, Math.max(1, +$('#soloNA').value || 2)), cB = Math.min(11, Math.max(1, +$('#soloNB').value || 2));
  var set = S.soloSet || firstPlayable();
  if (!E.setPlayable(QS, set)) return toast('കളിക്കാൻ പറ്റുന്ന സെറ്റ് തിരഞ്ഞെടുക്കുക');
  var t = now();
  var room = E.newRoom({ code: 'SOLO', pid: 'A1', name: name, now: t, solo: true, teamA: nA, teamB: nB, set: set });
  var go = function (a) { var r = E.reduce(room, Object.assign({ by: 'solo', now: t }, a), QS); if (r.error) throw new Error(r.error); room = r.room; };
  go({ type: 'team', pid: 'A1', team: 'A' });
  for (var i = 2; i <= cA; i++) { go({ type: 'join', pid: 'A' + i, name: nA + ' ' + i, now: t + i }); go({ type: 'team', pid: 'A' + i, team: 'A' }); }
  for (var k = 1; k <= cB; k++) { go({ type: 'join', pid: 'B' + k, name: nB + ' ' + k, now: t + 20 + k }); go({ type: 'team', pid: 'B' + k, team: 'B' }); }
  go({ type: 'firstBat', team: S.soloFirst || 'A' });
  go({ type: 'start' });
  room.createdAt = t;
  disconnect(); S.solo = true; S.me = 'solo'; S.code = 'SOLO' + t; S.room = room; S.shownSeq = null; S.bannerSeq = null; S.panelKey = '';
  LS.set('zcq_solo', room); render();
}
function resumeSolo() { var r = LS.get('zcq_solo'); if (!r) return; disconnect(); S.solo = true; S.me = 'solo'; S.code = 'SOLO' + (r.createdAt || 0); S.room = E.normalize(r); S.panelKey = ''; render(); }

// ------------------------------------------------------------ render
function show(id) { ['home', 'lobby', 'game', 'result'].forEach(function (x) { $('#' + x).hidden = x !== id; }); }
function render() {
  var r = S.room;
  renderTop();
  if (!r) { stopTick(); show('home'); renderHome(); return; }
  if (r.status === 'lobby') { stopTick(); show('lobby'); renderLobby(); return; }
  if (r.status === 'playing') { show('game'); renderGame(); return; }
  stopTick(); show('result'); renderResult();
}
function renderTop() {
  var r = S.room, h = '';
  if (r) {
    h += S.solo ? '<span class="chip green">സോളോ</span>' : '<span class="chip">റൂം <b style="color:var(--gold)">' + esc(S.code) + '</b></span>';
    h += '<button class="btn sec sm" data-act="leave">പുറത്ത്</button>';
  }
  $('#topRight').innerHTML = h;
  document.body.classList.toggle('inroom', !!r);
}

function setPicker(selected, canPick, prefix) {
  var h = '';
  E.listSets(QS).forEach(function (grp) {
    h += '<div class="setgrp"><div class="gname">' + esc(grp.type.key) + ' · ' + esc(grp.type.ml) + ' · ഒരു പന്തിന് ' + limitTxt(grp.type.limit) + '</div>';
    if (!grp.sets.length) h += '<div class="setrow off"><b>' + esc(grp.type.key) + ' 1</b><span class="chip">ഉടൻ വരുന്നു</span></div>';
    grp.sets.forEach(function (s) {
      var on = s.name === selected;
      if (!s.ok) { h += '<div class="setrow off"><b>' + esc(s.name) + '</b><span class="chip">ഉടൻ വരുന്നു</span></div>'; return; }
      h += '<div class="setrow' + (on ? ' on' : '') + '"' + (canPick ? ' data-act="' + prefix + '" data-set="' + esc(s.name) + '"' : '') + '><b>' + esc(s.name) + '</b><span class="chip' + (on ? ' green' : '') + '">' + (on ? '✓ തിരഞ്ഞെടുത്തു' : '30 പന്ത്') + '</span></div>';
    });
    h += '</div>';
  });
  return h;
}
function bandsTable(L) {
  var h = '<table class="bands">';
  E.bands(L).forEach(function (b) { h += '<tr><td>' + fmtT(b.from) + ' – ' + fmtT(b.to) + (L >= 60 ? '' : ' സെക്കൻഡ്') + '</td><td>' + b.runs + ' റൺസ്</td></tr>'; });
  h += '<tr><td>' + limitTxt(L) + ' കഴിഞ്ഞാൽ</td><td style="color:var(--red)">ഔട്ട്</td></tr><tr><td>ഉത്തരം തെറ്റിയാൽ</td><td style="color:var(--red)">ക്ലീൻ ബൗൾഡ്</td></tr><tr><td>ബൗളറുടെ ഉത്തരം തെറ്റിയാൽ</td><td style="color:var(--gold)">+1 എക്സ്ട്രാ</td></tr></table>';
  return h;
}

function renderHome() {
  var name = LS.get('zcq_name', ''), ses = LS.get('zcq_session'), solo = LS.get('zcq_solo');
  var params = new URLSearchParams(location.search), linkCode = (params.get('room') || '').toUpperCase();
  var h = '<div class="hero"><h1>ക്രിക്കറ്റ് <span>ക്വിസ്</span></h1><p>ഓരോ ചോദ്യവും ഒരു പന്ത്. വേഗം ശരിയുത്തരം = കൂടുതൽ റൺസ്!</p></div>';
  if (ses && ses.code) h += '<div class="card resume"><h3>റൂം ' + esc(ses.code) + '-ലെ കളി</h3><p class="mut">കോഡ് അടിക്കാതെ തിരികെ കയറാം.</p><button class="btn gold" data-act="rejoin">തിരികെ കളിയിലേക്ക്</button><button class="btn sec" data-act="forget">ഈ റൂം വേണ്ട</button></div>';
  if (solo && solo.status === 'playing') h += '<div class="card resume"><h3>പാതിയിലായ സോളോ കളി</h3><button class="btn gold" data-act="resumeSolo">സോളോ കളി തുടരുക</button><button class="btn sec" data-act="forgetSolo">വേണ്ട</button></div>';
  h += '<div class="card"><label class="lbl" for="nameIn">നിങ്ങളുടെ പേര്</label><input id="nameIn" maxlength="20" placeholder="ഉദാ: അൻവർ" value="' + esc(name) + '">';
  if (S.homeMode !== 'solo') {
    h += '<button class="btn" data-act="create">പുതിയ റൂം ഉണ്ടാക്കുക</button>';
    h += '<div class="or">അല്ലെങ്കിൽ കോഡ് ഉപയോഗിച്ച് ചേരുക</div>';
    h += '<div class="row"><input id="codeIn" maxlength="6" placeholder="റൂം കോഡ്" style="text-transform:uppercase;letter-spacing:3px" value="' + esc(linkCode) + '"><button class="btn sec" style="margin:0;flex:0 0 120px" data-act="join">ചേരുക</button></div>';
    h += '<div class="or">ഒറ്റയ്ക്ക് പരീക്ഷിക്കാൻ</div><button class="btn blue" data-act="soloMode">സോളോ ഗെയിം</button>';
  } else {
    var set = S.soloSet || firstPlayable(); S.soloSet = set;
    h += '<h3 style="margin-top:14px">സോളോ ഗെയിം</h3><p class="mut">എല്ലാ കളിക്കാരുടെയും ഭാഗം (ക്യാപ്റ്റൻ, ബൗളർ, ബാറ്റ്സ്മാൻ) നിങ്ങൾ തന്നെ ചെയ്യും. മൾട്ടിപ്ലെയറിലെ അതേ നിയമങ്ങൾ.</p>';
    h += '<div class="row"><div><label class="lbl">ടീം A പേര്</label><input id="soloA" maxlength="24" value="' + esc(S.soloA || 'ടീം A') + '"></div><div style="flex:0 0 92px"><label class="lbl">ആളുകൾ</label><input id="soloNA" type="number" min="1" max="11" value="' + (S.soloNA || 2) + '"></div></div>';
    h += '<div class="row"><div><label class="lbl">ടീം B പേര്</label><input id="soloB" maxlength="24" value="' + esc(S.soloB || 'ടീം B') + '"></div><div style="flex:0 0 92px"><label class="lbl">ആളുകൾ</label><input id="soloNB" type="number" min="1" max="11" value="' + (S.soloNB || 2) + '"></div></div>';
    h += '<label class="lbl">ആദ്യം ബാറ്റ് ചെയ്യുന്നത്</label><div class="seg"><button data-act="soloFirst" data-t="A" class="' + ((S.soloFirst || 'A') === 'A' ? 'on' : '') + '">ടീം A</button><button data-act="soloFirst" data-t="B" class="' + (S.soloFirst === 'B' ? 'on' : '') + '">ടീം B</button></div>';
    h += '<label class="lbl">ചോദ്യ സെറ്റ്</label>' + setPicker(set, true, 'soloSet');
    h += '<button class="btn blue" data-act="startSolo">സോളോ കളി തുടങ്ങുക</button><button class="btn sec" data-act="homeBack">തിരികെ</button>';
  }
  h += '</div>';
  h += '<div class="card"><details><summary>എങ്ങനെ കളിക്കാം?</summary><ul>' +
    '<li>ഒരു സെറ്റ് = 5 ഓവർ × 6 പന്ത് = 30 ചോദ്യം.</li>' +
    '<li>ബൗളർ ഓവറിലെ 6 ചോദ്യങ്ങളുടെ ബോക്സിൽ നിന്ന് ഒന്ന് എടുക്കും, ആദ്യം സ്വയം ഉത്തരം നൽകും. ശരിയായാൽ മാത്രം ബാറ്റ്സ്മാന് പോകും.</li>' +
    '<li>ബാറ്റ്സ്മാന് ചോദ്യം കിട്ടുമ്പോൾ മുതലാണ് സമയം.</li>' +
    '<li>1, 3 റൺസ് എടുത്താലും ഓവർ കഴിഞ്ഞാലും സ്ട്രൈക്ക് മാറും.</li>' +
    '<li>ഔട്ടായ ആൾ അടുത്ത ബാറ്റ്സ്മാനെ തിരഞ്ഞെടുക്കും. ഓവർ കഴിഞ്ഞ ബൗളർ അടുത്ത ബൗളറെ തിരഞ്ഞെടുക്കും. ക്യാപ്റ്റനും തിരഞ്ഞെടുക്കാം.</li>' +
    '<li>ഓപ്ഷൻ ചോദ്യങ്ങൾക്ക് (10 സെക്കൻഡ്) റൺസ്:</li></ul>' + bandsTable(10) + '</details></div>';
  $('#home').innerHTML = h;
}

function renderLobby() {
  var r = S.room, me = S.me, isHost = r.host === me;
  var ae = document.activeElement;
  if (ae && ae.closest && ae.closest('#lobby') && ae.tagName === 'INPUT') { S.lobbyDirty = true; return; }
  var url = location.origin + location.pathname + '?room=' + S.code;
  var h = '<div class="card codebox"><div class="mut">റൂം കോഡ്</div><div class="code">' + esc(S.code) + '</div>' +
    '<div class="row"><button class="btn sec sm" data-act="copy">കോഡ് കോപ്പി</button><a class="btn sm" style="text-decoration:none" target="_blank" rel="noopener" href="https://wa.me/?text=' + encodeURIComponent('ക്രിക്കറ്റ് ക്വിസ് കളിക്കാൻ വരൂ! റൂം കോഡ്: ' + S.code + '\n' + url) + '">WhatsApp-ൽ അയക്കുക</a></div></div>';
  // set
  h += '<div class="card"><h2>ചോദ്യ സെറ്റ്</h2>';
  if (isHost) h += '<p class="mut">ഹോസ്റ്റ് ആയ നിങ്ങൾ സെറ്റ് തിരഞ്ഞെടുക്കുക.</p>' + setPicker(r.set, true, 'set');
  else h += '<div class="setrow on"><b>' + esc(r.set) + '</b><span class="chip green">ഒരു പന്തിന് ' + limitTxt(E.limitFor(r.set)) + '</span></div><p class="small">ഹോസ്റ്റ് ആണ് സെറ്റ് തിരഞ്ഞെടുക്കുന്നത്.</p>';
  h += '</div>';
  // teams
  h += '<div class="card"><h2>ടീമുകൾ (പരമാവധി 11 പേർ വീതം)</h2>';
  ['A', 'B'].forEach(function (t) {
    var ids = E.teamIds(r, t), canEdit = E.isCaptain(r, me, t), myT = (r.players[me] || {}).team;
    h += '<div class="team ' + t + '"><div class="thead">';
    if (canEdit) h += '<input data-tname="' + t + '" maxlength="24" value="' + esc(r.teams[t].name) + '" style="padding:8px 10px;font-weight:800">';
    else h += '<div class="tname">' + esc(r.teams[t].name) + '</div>';
    h += '<span class="chip">' + ids.length + '/11</span></div>';
    if (!ids.length) h += '<div class="small" style="padding:6px 4px">ആരും ഇല്ല</div>';
    ids.forEach(function (id) {
      var p = r.players[id], isCap = r.teams[t].captain === id;
      h += '<div class="member"><span class="dot' + (p.online ? ' on' : '') + '"></span><span class="nm">' + esc(p.name) + (id === me ? ' <span class="me">ഞാൻ</span>' : '') + (id === r.host ? ' <span class="small">(ഹോസ്റ്റ്)</span>' : '') + '</span>' +
        (isCap ? '<span class="cap">C ക്യാപ്റ്റൻ</span>' : (canEdit ? '<button class="btn sec sm" data-act="cap" data-t="' + t + '" data-p="' + id + '">ക്യാപ്റ്റൻ ആക്കുക</button>' : '')) + '</div>';
    });
    if (myT !== t) h += '<button class="btn sec" data-act="team" data-t="' + t + '"' + (ids.length >= 11 ? ' disabled' : '') + '>' + esc(r.teams[t].name) + '-ൽ ചേരുക</button>';
    h += '</div>';
  });
  var watchers = Object.keys(r.players).filter(function (id) { return !r.players[id].team; });
  h += '<div class="team"><div class="thead"><div class="tname">കാണികൾ</div><span class="chip">' + watchers.length + '</span></div>';
  watchers.forEach(function (id) { var p = r.players[id]; h += '<div class="member"><span class="dot' + (p.online ? ' on' : '') + '"></span><span class="nm">' + esc(p.name) + (id === me ? ' <span class="me">ഞാൻ</span>' : '') + '</span></div>'; });
  if ((r.players[me] || {}).team) h += '<button class="btn sec" data-act="team" data-t="">കാണാൻ മാത്രം (ടീം വിടുക)</button>';
  h += '</div></div>';
  // start
  var A = E.teamIds(r, 'A').length, B = E.teamIds(r, 'B').length;
  if (isHost) {
    h += '<div class="card"><h2>കളി തുടങ്ങാം</h2><label class="lbl">ആദ്യം ബാറ്റ് ചെയ്യുന്നത്</label><div class="seg"><button data-act="first" data-t="A" class="' + (r.firstBat === 'A' ? 'on' : '') + '">' + esc(r.teams.A.name) + '</button><button data-act="first" data-t="B" class="' + (r.firstBat === 'B' ? 'on' : '') + '">' + esc(r.teams.B.name) + '</button></div>';
    h += '<button class="btn gold" data-act="start"' + (A && B ? '' : ' disabled') + '>മാച്ച് തുടങ്ങുക</button>';
    if (!(A && B)) h += '<p class="small" style="margin-top:6px">രണ്ട് ടീമിലും കുറഞ്ഞത് ഒരാൾ വേണം.</p>';
    h += '</div>';
  } else h += '<div class="card wait"><div class="spin"></div><p>ഹോസ്റ്റ് കളി തുടങ്ങുന്നതു വരെ കാത്തിരിക്കുക…</p></div>';
  $('#lobby').innerHTML = h;
  S.lobbyDirty = false;
}

// ------------------------------------------------------------ game
function role(r) {
  var g = r.g, inn = E.cur(g), me = S.me;
  if (S.solo) return 'solo';
  if (me === inn.striker) return 'striker';
  if (me === inn.bowler) return 'bowler';
  if (me === inn.non) return 'non';
  var t = (r.players[me] || {}).team;
  if (t === inn.bat) return 'batTeam';
  if (t === inn.bowl) return 'bowlTeam';
  return 'watch';
}
var ROLE_TXT = { solo: 'സോളോ: എല്ലാ ഭാഗവും നിങ്ങൾ', striker: 'നിങ്ങൾ: ബാറ്റ്സ്മാൻ (സ്ട്രൈക്കർ)', non: 'നിങ്ങൾ: നോൺ-സ്ട്രൈക്കർ', bowler: 'നിങ്ങൾ: ബൗളർ', batTeam: 'നിങ്ങൾ: ബാറ്റിംഗ് ടീം', bowlTeam: 'നിങ്ങൾ: ബൗളിംഗ് ടീം', watch: 'നിങ്ങൾ: കാണി (ലൈവ്)' };

function renderBoard(r) {
  var g = r.g, inn = E.cur(g), h = '';
  var crr = inn.balls ? (inn.runs * 6 / inn.balls).toFixed(2) : '0.00';
  h += '<div class="board"><div class="bt"><span class="tn">' + esc(teamName(inn.bat)) + '</span><span class="chip">' + (g.innings === 1 ? 'ഒന്നാം ഇന്നിംഗ്സ്' : 'രണ്ടാം ഇന്നിംഗ്സ്') + '</span></div>';
  h += '<div class="score"><span class="big" id="sRuns">' + inn.runs + '/' + inn.wkts + '</span><span class="ov">ഓവർ <b id="sOv">' + oversTxt(inn.balls) + '</b> / 5</span></div>';
  h += '<div class="kv"><span>റൺ റേറ്റ് <b>' + crr + '</b></span><span>എക്സ്ട്രാ <b>' + inn.extras + '</b></span><span>വിക്കറ്റ് ബാക്കി <b>' + (g.order[inn.bat].length - inn.wkts) + '</b></span></div>';
  if (g.innings === 2) {
    var need = g.target - inn.runs, left = 30 - inn.balls;
    var rrr = left ? (need * 6 / left).toFixed(2) : '-';
    h += '<div class="need">ലക്ഷ്യം ' + g.target + ' · ജയിക്കാൻ ' + left + ' പന്തിൽ ' + Math.max(0, need) + ' റൺസ് വേണം · RRR ' + rrr + '</div>';
    var i1 = g.inn[0]; h += '<div class="small" style="margin-top:6px;color:#bfe9d3">' + esc(teamName(i1.bat)) + ': ' + i1.runs + '/' + i1.wkts + ' (' + oversTxt(i1.balls) + ')</div>';
  }
  h += '<div class="crease">';
  [inn.striker, inn.non].forEach(function (id, i) {
    if (!id) return; var b = inn.bs[id] || { r: 0, b: 0 };
    h += '<span class="' + (i === 0 ? 'st' : '') + '">' + (i === 0 ? '🏏 ' : '') + esc(nm(id)) + (i === 0 ? ' *' : '') + '</span><span class="r">' + b.r + ' (' + b.b + ')</span>';
  });
  if (inn.bowler) { var w = inn.bw[inn.bowler] || { r: 0, w: 0, b: 0 }; h += '<span>ബൗളർ: ' + esc(nm(inn.bowler)) + '</span><span class="r">' + oversTxt(w.b) + ' – ' + w.r + ' – ' + w.w + '</span>'; }
  h += '</div><div class="overline"><span class="small" style="color:#bfe9d3">ഈ ഓവർ</span>';
  for (var i = 0; i < 6; i++) { var s = inn.overBalls[i]; h += '<span class="ball' + (s ? (s === 'W' || s === 'Ex' ? ' ' + s : ' r' + s) : '') + '">' + (s || '') + '</span>'; }
  h += '</div></div>';
  h += '<div class="role"><span class="chip">' + ROLE_TXT[role(r)] + '</span></div>';
  $('#board').innerHTML = h;
}

function waitBox(text) { return '<div class="card wait"><div class="spin"></div><p>' + text + '</p></div>'; }
function qHtml(q, withSpeak) {
  var h = '';
  if (q.img) h += '<img class="qimg" src="' + esc(q.img) + '" alt="ചോദ്യ ചിത്രം">';
  h += '<div class="qtext">' + esc(q.q) + '</div>';
  if (withSpeak) h += '<button class="btn sec sm" data-act="speak" style="margin-bottom:6px">🔊 വീണ്ടും കേൾക്കുക</button>';
  return h;
}
function optsHtml(q, act, disabled, sel) {
  var h = '', K = ['A', 'B', 'C', 'D', 'E', 'F'];
  q.o.forEach(function (o, i) { h += '<button class="opt' + (sel === i ? ' sel' : '') + '"' + (disabled ? ' disabled' : ' data-act="' + act + '" data-i="' + i + '"') + '><span class="k">' + K[i] + '</span><span>' + esc(o) + '</span></button>'; });
  return h;
}
function ringHtml() {
  return '<div class="timerwrap"><div class="ring"><svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="52" stroke="#26355a" stroke-width="10" fill="none"/><circle id="ringArc" cx="60" cy="60" r="52" stroke="#19b46b" stroke-width="10" fill="none" stroke-linecap="round" stroke-dasharray="326.7" stroke-dashoffset="0"/></svg><div class="num"><span id="ringNum">-</span><small>ബാക്കി</small></div></div>' +
    '<div class="worth"><div class="w1">ഇപ്പോൾ ശരിയുത്തരം നൽകിയാൽ</div><div class="w2" id="ringWorth">6 റൺസ്</div><div class="small" id="ringEl"></div></div></div>';
}

function renderGame() {
  var r = S.room, g = r.g, inn = E.cur(g), me = S.me, rl = role(r), solo = S.solo;
  var q = g.q >= 0 ? (QS[g.set] || [])[g.q] : null;
  renderBoard(r);
  // popups
  if (g.last && S.shownSeq === null) S.shownSeq = g.last.seq;
  if (g.banner && S.bannerSeq === null) S.bannerSeq = g.banner.seq;
  if (S.shownSeq === null) S.shownSeq = -1;
  if (S.bannerSeq === null) S.bannerSeq = -1;
  if (g.last && g.last.seq !== S.shownSeq) { S.shownSeq = g.last.seq; showBallPop(g.last); }
  if (g.banner && g.banner.seq !== S.bannerSeq) { S.bannerSeq = g.banner.seq; setTimeout(function () { showInningsPop(); }, g.last ? 1700 : 0); }

  var key = [g.phase, g.seq, g.innings, inn.balls, inn.striker, inn.non, inn.bowler, rl, g.pending.join(',')].join('|');
  if (key === S.panelKey) return;
  S.panelKey = key; S.sel = null;
  var h = '', capBat = solo || E.isCaptain(r, me, inn.bat), capBowl = solo || E.isCaptain(r, me, inn.bowl);
  var batIds = g.order[inn.bat], bowlIds = g.order[inn.bowl];
  var L = g.limit;

  if (g.phase === 'openers') {
    var needBat = !(inn.striker && (inn.non || batIds.length === 1)), needBowl = !inn.bowler;
    if (g.innings === 2 && inn.balls === 0) h += '<div class="card" style="border-color:var(--grn)"><h3>ഇന്നിംഗ്സ് ബ്രേക്ക്</h3><p>' + esc(teamName(inn.bat)) + '-ന് ജയിക്കാൻ 30 പന്തിൽ <b>' + g.target + '</b> റൺസ് വേണം.</p></div>';
    if (needBat && capBat) {
      h += '<div class="card"><h2>' + esc(teamName(inn.bat)) + ': ഓപ്പണർമാർ</h2><p class="mut">ബാറ്റിംഗ് ക്യാപ്റ്റൻ തിരഞ്ഞെടുക്കുക.</p><label class="lbl">സ്ട്രൈക്കർ (ആദ്യ പന്ത് നേരിടും)</label><select id="opS">' + batIds.map(function (id) { return '<option value="' + id + '">' + esc(nm(id)) + '</option>'; }).join('') + '</select>';
      if (batIds.length > 1) h += '<label class="lbl">നോൺ-സ്ട്രൈക്കർ</label><select id="opN">' + batIds.map(function (id, i) { return '<option value="' + id + '"' + (i === 1 ? ' selected' : '') + '>' + esc(nm(id)) + '</option>'; }).join('') + '</select>';
      h += '<button class="btn" data-act="setBatters">ഉറപ്പിക്കുക</button></div>';
    } else if (needBat) h += waitBox(esc(teamName(inn.bat)) + ' ക്യാപ്റ്റൻ ' + esc(nm(r.teams[inn.bat].captain)) + ' ഓപ്പണർമാരെ തിരഞ്ഞെടുക്കുന്നു…');
    if (needBowl && capBowl) {
      h += '<div class="card"><h2>' + esc(teamName(inn.bowl)) + ': ആദ്യ ബൗളർ</h2><p class="mut">ബൗളിംഗ് ക്യാപ്റ്റൻ തിരഞ്ഞെടുക്കുക.</p><div class="pick">' + bowlIds.map(function (id) { return '<button class="btn sec" data-act="setBowler" data-p="' + id + '">' + esc(nm(id)) + '</button>'; }).join('') + '</div></div>';
    } else if (needBowl) h += waitBox(esc(teamName(inn.bowl)) + ' ക്യാപ്റ്റൻ ' + esc(nm(r.teams[inn.bowl].captain)) + ' ബൗളറെ തിരഞ്ഞെടുക്കുന്നു…');
  }
  else if (g.phase === 'select') {
    if (solo || rl === 'bowler') {
      var over = Math.floor(inn.balls / 6) + 1;
      h += '<div class="card"><h2>' + (solo ? esc(nm(inn.bowler)) + ' · ' : '') + 'ഓവർ ' + over + ': ചോദ്യ ബോക്സ്</h2><p class="mut">ഒരു ചോദ്യം തൊടുക. അത് ഉറക്കെ വായിക്കും. പിന്നെ നിങ്ങൾ തന്നെ ഉത്തരം നൽകണം.</p>';
      E.box(inn).forEach(function (qi, k) {
        var qq = (QS[g.set] || [])[qi]; if (!qq) return; var used = !!inn.used['q' + qi];
        h += '<button class="qbox' + (used ? ' used' : '') + '"' + (used ? ' disabled' : ' data-act="pick" data-q="' + qi + '"') + '><span class="n">' + (k + 1) + '</span><span class="t">' + esc(qq.q) + '</span></button>';
      });
      h += '</div>';
    } else h += waitBox('ബൗളർ ' + esc(nm(inn.bowler)) + ' ചോദ്യം തിരഞ്ഞെടുക്കുന്നു…');
  }
  else if (g.phase === 'bowlerAnswer') {
    if ((solo || rl === 'bowler') && q) {
      h += '<div class="card"><h3 class="mut">' + (solo ? esc(nm(inn.bowler)) + ' (ബൗളർ): ' : '') + 'ആദ്യം നിങ്ങൾ ഉത്തരം നൽകുക</h3>' + qHtml(q, true);
      if (E.isMcq(q)) h += optsHtml(q, 'bsel', false, null) + '<button class="btn gold" data-act="bowlerSubmit" id="bSubmit" disabled>ഉത്തരം ഉറപ്പിക്കുക</button>';
      else h += '<textarea id="bText" placeholder="നിങ്ങളുടെ ഉത്തരം"></textarea><div class="note">മാതൃകാ ഉത്തരം: ' + esc(q.ans || '-') + '</div><div class="row"><button class="btn" data-act="bowlerOk" data-ok="1">എന്റെ ഉത്തരം ശരി</button><button class="btn red" data-act="bowlerOk" data-ok="">തെറ്റി</button></div>';
      h += '<div class="note">ബൗളർക്ക് സമയപരിധി ഇല്ല. ശരിയായാൽ മാത്രം ചോദ്യം ബാറ്റ്സ്മാന് പോകും. തെറ്റിയാൽ ബാറ്റിംഗ് ടീമിന് 1 എക്സ്ട്രാ റൺ.</div></div>';
    } else h += waitBox('ബൗളർ ' + esc(nm(inn.bowler)) + ' ആദ്യം ഉത്തരം പരിശോധിക്കുന്നു…');
  }
  else if (g.phase === 'bat' && q) {
    var mine = solo || rl === 'striker';
    h += '<div class="card">' + ringHtml();
    if (!mine) h += '<p class="mut" style="margin-bottom:6px">ലൈവ്: ' + esc(nm(inn.striker)) + ' ഉത്തരം ആലോചിക്കുന്നു…</p>';
    else if (solo) h += '<p class="mut" style="margin-bottom:6px">' + esc(nm(inn.striker)) + ' (ബാറ്റ്സ്മാൻ)</p>';
    h += qHtml(q, mine);
    if (E.isMcq(q)) h += optsHtml(q, 'bat', !mine, null);
    else if (mine) h += '<textarea id="batText" placeholder="ഉത്തരം ഇവിടെ എഴുതുക"></textarea><button class="btn gold" data-act="batText">ഉത്തരം അയക്കുക</button>';
    h += '</div>';
  }
  else if (g.phase === 'judge') {
    var judge = solo || rl === 'bowler' || capBowl;
    if (judge && q) h += '<div class="card"><h2>ഉത്തരം ശരിയാണോ?</h2>' + qHtml(q, false) + '<div class="note"><b>' + esc(nm(inn.striker)) + ':</b> ' + esc((g.pend || {}).text || '') + '</div><div class="note">മാതൃകാ ഉത്തരം: ' + esc(q.ans || '-') + '</div><div class="row"><button class="btn" data-act="judge" data-ok="1">ശരി</button><button class="btn red" data-act="judge" data-ok="">തെറ്റ്</button></div></div>';
    else h += waitBox('ബൗളർ ഉത്തരം പരിശോധിക്കുന്നു…');
  }
  else if (g.phase === 'nextBatsman') {
    var can = solo || me === g.chooser || E.isCaptain(r, me, inn.bat);
    if (can) h += '<div class="card"><h2>അടുത്ത ബാറ്റ്സ്മാൻ</h2><p class="mut">' + esc(nm(g.chooser)) + ' ഔട്ടായി. അടുത്തതായി ആര് ഇറങ്ങണം?</p><div class="pick">' + E.candidates(g, inn).map(function (id) { return '<button class="btn sec" data-act="nextBat" data-p="' + id + '">' + esc(nm(id)) + '</button>'; }).join('') + '</div></div>';
    else h += waitBox(esc(nm(g.chooser)) + ' അടുത്ത ബാറ്റ്സ്മാനെ തിരഞ്ഞെടുക്കുന്നു…');
  }
  else if (g.phase === 'nextBowler') {
    var can2 = solo || me === inn.prevBowler || E.isCaptain(r, me, inn.bowl);
    var list = bowlIds.filter(function (id) { return id !== inn.prevBowler; });
    if (can2) h += '<div class="card"><h2>ഓവർ കഴിഞ്ഞു! അടുത്ത ബൗളർ</h2><p class="mut">' + esc(nm(inn.prevBowler)) + ' അടുത്ത ഓവർ ആർക്ക് കൊടുക്കണം?</p><div class="pick">' + list.map(function (id) { return '<button class="btn sec" data-act="nextBowl" data-p="' + id + '">' + esc(nm(id)) + '</button>'; }).join('') + '</div></div>';
    else h += waitBox('ഓവർ കഴിഞ്ഞു. ' + esc(nm(inn.prevBowler)) + ' അടുത്ത ബൗളറെ തിരഞ്ഞെടുക്കുന്നു…');
  }
  $('#panel').innerHTML = '<div class="panel">' + h + '</div>';
  if (g.phase === 'bat') startTick(); else stopTick();
}

// ------------------------------------------------------------ timer
function rcvKey(r) { return 'zcq_rcv_' + S.code + '_' + r.g.seq; }
function elapsed(r) {
  var g = r.g, rl = role(r);
  if (S.solo || rl === 'striker') {
    var k = rcvKey(r), t = LS.get(k);
    if (!t) { t = now(); LS.set(k, t); }
    return (now() - t) / 1000;
  }
  return (serverNow() - (g.deliveredAt || serverNow())) / 1000;
}
function startTick() { if (S.tick) return; S.tick = setInterval(tick, 100); tick(); }
function stopTick() { if (S.tick) { clearInterval(S.tick); S.tick = null; } }
function tick() {
  var r = S.room; if (!r || r.status !== 'playing' || r.g.phase !== 'bat') return stopTick();
  var g = r.g, L = g.limit, el = elapsed(r), left = L - el, rl = role(r);
  var arc = $('#ringArc'), num = $('#ringNum'), worth = $('#ringWorth');
  var runs = E.runsFor(el, L);
  if (arc) { arc.setAttribute('stroke-dashoffset', String(326.7 * Math.min(1, el / L))); arc.setAttribute('stroke', runs >= 4 ? '#19b46b' : runs >= 2 ? '#f5b301' : '#e5484d'); }
  if (num) num.textContent = fmtT(left);
  if (worth) { worth.textContent = runs < 0 ? 'ഔട്ട്' : runs + ' റൺസ്'; worth.style.color = runs >= 4 ? '#19b46b' : runs >= 2 ? '#f5b301' : '#e5484d'; }
  if (S.solo || rl === 'striker') {
    if (el > L && S.sentSeq !== g.seq) { S.sentSeq = g.seq; dispatch({ type: 'batAns', choice: -1, time: el, seq: g.seq }); }
  } else if (el > L + 6 && S.tSeq !== g.seq) { S.tSeq = g.seq; dispatch({ type: 'timeout', seq: g.seq }); }
}

// ------------------------------------------------------------ popups
function showPop(cls, big, sub, ms) {
  var p = $('#pop'); p.className = 'pop ' + cls; p.innerHTML = '<div class="in"><div class="big">' + big + '</div>' + (sub ? '<div class="sub">' + sub + '</div>' : '') + '</div>'; p.hidden = false;
  clearTimeout(showPop.t); showPop.t = setTimeout(function () { p.hidden = true; }, ms || 1700);
}
function showBallPop(l) {
  var t = l.time >= 0 ? l.time.toFixed(1) + ' സെക്കൻഡ്' : '';
  var q = null; // correct answer for learning
  if (l.kind === 'runs') showPop(l.runs === 6 ? 'six' : l.runs === 4 ? 'four' : '', l.runs === 6 ? 'സിക്സ്! 6' : l.runs === 4 ? 'ഫോർ! 4' : l.runs + (l.runs === 1 ? ' റൺ' : ' റൺസ്'), esc(nm(l.batter)) + ' · ' + t);
  else if (l.kind === 'bowled') showPop('out', 'ഔട്ട്!', 'ക്ലീൻ ബൗൾഡ് — ഉത്തരം തെറ്റി · ' + esc(nm(l.batter)));
  else if (l.kind === 'timeout') showPop('out', 'ഔട്ട്!', 'സമയം കഴിഞ്ഞു · ' + esc(nm(l.batter)));
  else if (l.kind === 'extra') showPop('ex', '+1 എക്സ്ട്രാ', 'ബൗളർ ' + esc(nm(l.bowler)) + '-ന്റെ ഉത്തരം തെറ്റി');
}
function showInningsPop() {
  var r = S.room; if (!r || !r.g || r.g.innings !== 2 || r.status !== 'playing') return;
  showPop('inn', 'ഇന്നിംഗ്സ് മാറി!', esc(teamName(E.cur(r.g).bat)) + '-ന് ജയിക്കാൻ ' + r.g.target + ' റൺസ്', 2600);
}

// ------------------------------------------------------------ result
function resultText(r) {
  var g = r.g, res = g.result; if (!res) return '';
  var w = esc(teamName(res.winner));
  if (res.by === 'wkts') return w + ' ' + res.margin + ' വിക്കറ്റിന് ജയിച്ചു!';
  if (res.by === 'level') return 'സ്കോർ ഒപ്പം. ലക്ഷ്യം മറികടക്കാത്തതിനാൽ ' + w + ' ജയിച്ചു!';
  return w + ' ' + res.margin + ' റൺസിന് ജയിച്ചു!';
}
function renderResult() {
  var r = S.room, g = r.g;
  if (!g || !g.result) { $('#result').innerHTML = '<div class="card">കളി കഴിഞ്ഞു.</div>'; return; }
  if (g.last && S.shownSeq !== null && g.last.seq !== S.shownSeq) { S.shownSeq = g.last.seq; showBallPop(g.last); }
  var h = '<div class="card trophy"><div class="cup">🏆</div><h2>' + esc(teamName(g.result.winner)) + '</h2><p>' + resultText(r) + '</p></div>';
  var best = { id: '', r: -1 }, bestB = { id: '', w: -1, r: 0 };
  g.inn.forEach(function (inn) {
    h += '<div class="card"><h3>' + esc(teamName(inn.bat)) + ' — ' + inn.runs + '/' + inn.wkts + ' (' + oversTxt(inn.balls) + ' ഓവർ)</h3>';
    h += '<table class="sc"><tr><th>ബാറ്റ്സ്മാൻ</th><th>റൺസ്</th><th>പന്ത്</th><th></th></tr>';
    g.order[inn.bat].forEach(function (id) {
      var b = inn.bs[id]; if (!b && !inn.out[id] && id !== inn.striker && id !== inn.non) return; b = b || { r: 0, b: 0 };
      if (b.r > best.r) best = { id: id, r: b.r };
      h += '<tr><td>' + esc(nm(id)) + '</td><td><b>' + b.r + '</b></td><td>' + b.b + '</td><td class="small">' + (inn.out[id] ? 'ഔട്ട്' : 'നോട്ടൗട്ട്') + '</td></tr>';
    });
    h += '<tr><td class="small">എക്സ്ട്രാ</td><td>' + inn.extras + '</td><td></td><td></td></tr></table>';
    h += '<table class="sc" style="margin-top:10px"><tr><th>ബൗളർ</th><th>ഓവർ</th><th>റൺസ്</th><th>വിക്കറ്റ്</th></tr>';
    Object.keys(inn.bw).forEach(function (id) { var w = inn.bw[id]; if (w.w > bestB.w || (w.w === bestB.w && w.r < bestB.r)) bestB = { id: id, w: w.w, r: w.r }; h += '<tr><td>' + esc(nm(id)) + '</td><td>' + oversTxt(w.b) + '</td><td>' + w.r + '</td><td><b>' + w.w + '</b></td></tr>'; });
    h += '</table></div>';
  });
  h += '<div class="card"><div class="stars"><div class="s"><span class="small">മികച്ച ബാറ്റ്സ്മാൻ</span><b>' + esc(nm(best.id)) + '</b><span class="small">' + Math.max(0, best.r) + ' റൺസ്</span></div><div class="s"><span class="small">മികച്ച ബൗളർ</span><b>' + esc(nm(bestB.id)) + '</b><span class="small">' + Math.max(0, bestB.w) + ' വിക്കറ്റ്</span></div></div>';
  if (S.solo) h += '<button class="btn blue" data-act="soloAgain">വീണ്ടും സോളോ കളിക്കുക</button>';
  else if (r.host === S.me) h += '<button class="btn gold" data-act="rematch">ഇതേ റൂമിൽ വീണ്ടും കളിക്കുക</button>';
  h += '<button class="btn sec" data-act="home">ഹോമിലേക്ക്</button></div>';
  $('#result').innerHTML = h;
}

// ------------------------------------------------------------ events
document.addEventListener('click', function (ev) {
  var el = ev.target.closest('[data-act]'); if (!el || el.disabled) return;
  var act = el.getAttribute('data-act'), r = S.room, d = el.dataset;
  switch (act) {
    case 'create': return createRoom();
    case 'join': return joinRoom();
    case 'rejoin': var s = LS.get('zcq_session'); if (s) { if ($('#nameIn') && !$('#nameIn').value) $('#nameIn').value = s.name; db ? connect(s.code, s.pid, s.name) : toast('ഇന്റർനെറ്റ് ഇല്ല'); } return;
    case 'forget': return forget();
    case 'resumeSolo': return resumeSolo();
    case 'forgetSolo': return forgetSolo();
    case 'soloMode': myName(); S.homeMode = 'solo'; return renderHome();
    case 'homeBack': saveSoloForm(); S.homeMode = ''; return renderHome();
    case 'soloFirst': saveSoloForm(); S.soloFirst = d.t; return renderHome();
    case 'soloSet': saveSoloForm(); S.soloSet = d.set; return renderHome();
    case 'startSolo': saveSoloForm(); return startSolo();
    case 'soloAgain': S.room = null; S.solo = false; LS.del('zcq_solo'); S.homeMode = 'solo'; return render();
    case 'leave': return leave();
    case 'home': if (S.solo) { LS.del('zcq_solo'); } else { LS.del('zcq_session'); disconnect(); } S.room = null; S.solo = false; S.homeMode = ''; return render();
    case 'copy': try { navigator.clipboard.writeText(S.code); toast('കോഡ് കോപ്പി ചെയ്തു', true); } catch (e) {} return;
    case 'set': return dispatch({ type: 'set', name: d.set });
    case 'team': return dispatch({ type: 'team', pid: S.me, team: d.t });
    case 'cap': return dispatch({ type: 'captain', team: d.t, pid: d.p });
    case 'first': return dispatch({ type: 'firstBat', team: d.t });
    case 'start': return dispatch({ type: 'start' });
    case 'rematch': return dispatch({ type: 'rematch' });
    case 'setBatters': return dispatch({ type: 'setBatters', striker: $('#opS').value, non: $('#opN') ? $('#opN').value : '' });
    case 'setBowler': return dispatch({ type: 'setBowler', pid: d.p });
    case 'pick': var qq = (QS[r.g.set] || [])[+d.q]; if (qq) speak(qq.q); el.disabled = true; return dispatch({ type: 'pick', qi: +d.q });
    case 'speak': var cq = (QS[r.g.set] || [])[r.g.q]; if (cq) speak(cq.q); return;
    case 'bsel': S.sel = +d.i; document.querySelectorAll('[data-act="bsel"]').forEach(function (b) { b.classList.toggle('sel', +b.dataset.i === S.sel); }); $('#bSubmit').disabled = false; return;
    case 'bowlerSubmit': if (S.sel == null) return toast('ഉത്തരം തിരഞ്ഞെടുക്കുക'); el.disabled = true; return dispatch({ type: 'bowlerAns', choice: S.sel });
    case 'bowlerOk': return dispatch({ type: 'bowlerAns', ok: !!d.ok });
    case 'bat': {
      var g = r.g; if (S.sentSeq === g.seq) return; var t = elapsed(r); S.sentSeq = g.seq;
      document.querySelectorAll('[data-act="bat"]').forEach(function (b) { b.disabled = true; }); el.classList.add('sel');
      return dispatch({ type: 'batAns', choice: +d.i, time: t, seq: g.seq });
    }
    case 'batText': { var g2 = r.g; if (S.sentSeq === g2.seq) return; var t2 = elapsed(r); var tx = ($('#batText').value || '').trim(); if (!tx) return toast('ഉത്തരം എഴുതുക'); S.sentSeq = g2.seq; return dispatch({ type: 'batAns', text: tx, time: t2, seq: g2.seq }); }
    case 'judge': return dispatch({ type: 'judge', ok: !!d.ok });
    case 'nextBat': return dispatch({ type: 'nextBatsman', pid: d.p });
    case 'nextBowl': return dispatch({ type: 'nextBowler', pid: d.p });
  }
});
document.addEventListener('change', function (ev) {
  var t = ev.target;
  if (t.dataset && t.dataset.tname) { dispatch({ type: 'teamName', team: t.dataset.tname, name: t.value }); }
  if (t.id === 'nameIn') myName();
});
document.addEventListener('focusout', function () { setTimeout(function () { if (S.lobbyDirty && S.room && S.room.status === 'lobby') renderLobby(); }, 50); });
function saveSoloForm() { if (!$('#soloA')) return; S.soloA = $('#soloA').value; S.soloB = $('#soloB').value; S.soloNA = $('#soloNA').value; S.soloNB = $('#soloNB').value; }

// ------------------------------------------------------------ boot
function boot() {
  try { Object.keys(localStorage).forEach(function (k) { if (k.indexOf('zcq_rcv_') === 0 && now() - (+localStorage.getItem(k) || 0) > 864e5) localStorage.removeItem(k); }); } catch (e) {}
  var ses = LS.get('zcq_session');
  if (ses && ses.code && !ses.left && db) {
    // auto rejoin without typing the code
    db.ref('rooms/' + ses.code).once('value').then(function (s) {
      var v = s.val();
      if (v && v.players && v.players[ses.pid] && v.status !== 'finished') connect(ses.code, ses.pid, ses.name);
      else { if (!v) LS.del('zcq_session'); render(); }
    }).catch(function () { render(); });
    $('#home').innerHTML = waitBox('റൂം ' + esc(ses.code) + '-ലേക്ക് തിരികെ കയറുന്നു…');
    return;
  }
  render();
}
window.ZCQ.dispatch = dispatch; window.ZCQ.render = render;
if ('serviceWorker' in navigator) window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () {}); });
boot();
})();
