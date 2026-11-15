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
try { if (window.firebase) { firebase.initializeApp(firebaseConfig); db = firebase.database(); var emu = null; try { emu = JSON.parse(localStorage.getItem('zcq_emu') || 'null'); } catch (e) {} if (emu && emu.h) db.useEmulator(emu.h, emu.p); } } catch (e) { db = null; }  // zcq_emu: local rules testing only

var $ = function (s) { return document.querySelector(s); };
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
var LS = {
  get: function (k, d) { try { var v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  del: function (k) { try { localStorage.removeItem(k); } catch (e) {} }
};
var S = { chat: [], chatUnread: 0, chatOpen: false, tossSeen: null, room: null, me: null, solo: false, ref: null, code: null, offset: 0, shownSeq: null, bannerSeq: null, panelKey: '', tick: null, sentSeq: -1, tSeq: -1, sel: null, homeMode: '', lastPhase: '' };
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

function randTok() { var a = new Uint8Array(16); crypto.getRandomValues(a); return Array.prototype.map.call(a, function (b) { return ('0' + b.toString(16)).slice(-2); }).join(''); }
function sha(t) { return crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)).then(function (b) { return Array.prototype.map.call(new Uint8Array(b), function (x) { return ('0' + x.toString(16)).slice(-2); }).join(''); }); }
function rejoinUrl() { var s = LS.get('zcq_session'); if (!s || !s.tok || S.solo) return ''; return location.origin + location.pathname + '?r=' + s.code + '&p=' + s.pid + '&k=' + s.tok; }

function createRoom() {
  if (!db) return toast('ഇന്റർനെറ്റ് ഇല്ല. സോളോ കളിക്കാം');
  var name = myName(); if (!name) return toast('ആദ്യം നിങ്ങളുടെ പേര് നൽകുക');
  var code = genCode(), pid = deviceId(), tok = randTok();
  var ref = db.ref('rooms/' + code);
  Promise.all([ref.once('value'), sha(tok)]).then(function (res) {
    if (res[0].exists()) return createRoom();
    var room = E.newRoom({ code: code, pid: pid, name: name, now: serverNow(), th: res[1] });
    var def = firstPlayable(); if (def) room.set = def;
    return ref.set(room).then(function () { connect(code, pid, name, tok); });
  }).catch(function (e) { console.warn(e); toast('റൂം ഉണ്ടാക്കാൻ പറ്റിയില്ല'); });
}
function joinRoom(codeIn) {
  if (!db) return toast('ഇന്റർനെറ്റ് ഇല്ല');
  var code = String(codeIn || ($('#codeIn') ? $('#codeIn').value : '')).trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  var name = myName();
  if (!name) return toast('ആദ്യം നിങ്ങളുടെ പേര് നൽകുക');
  if (code.length < 4) return toast('ശരിയായ റൂം കോഡ് നൽകുക');
  var pid = deviceId();
  db.ref('rooms/' + code).once('value').then(function (s) {
    if (!s.exists()) return toast('ഈ കോഡിൽ റൂം ഇല്ല');
    var ses = LS.get('zcq_session');
    var tok = (ses && ses.code === code && ses.pid === pid && ses.tok) ? ses.tok : randTok();
    connect(code, pid, name, tok);
  }).catch(function () { toast('ജോയിൻ ചെയ്യാൻ പറ്റിയില്ല'); });
}
// personal rejoin link: ?r=CODE&p=PID&k=SECRET  (room stores only sha256 of the secret)
function useRejoinLink(code, pid, k) {
  return Promise.all([db.ref('rooms/' + code).once('value'), sha(k)]).then(function (res) {
    var v = res[0].val(), p = v && v.players && v.players[pid];
    if (!p || !p.th || p.th !== res[1]) { toast('ഈ ലിങ്ക് ശരിയല്ല / റൂം ഇല്ല'); render(); return; }
    connect(code, pid, p.name, k);
  }).catch(function () { toast('ലിങ്ക് തുറക്കാൻ പറ്റിയില്ല'); render(); });
}
function connect(code, pid, name, tok) {
  disconnect();
  if (!tok) { var old = LS.get('zcq_session'); tok = (old && old.code === code && old.pid === pid && old.tok) || randTok(); }
  S.solo = false; S.code = code; S.me = pid; S.shownSeq = null; S.bannerSeq = null; S.tossSeen = null; S.panelKey = '';
  LS.set('zcq_session', { code: code, pid: pid, name: name, left: false, tok: tok });
  S.ref = db.ref('rooms/' + code);
  var onl = S.ref.child('players/' + pid + '/online'), ref = S.ref, joined = false, th = null;
  sha(tok).then(function (h) { th = h; tryJoin(); });
  db.ref('.info/serverTimeOffset').on('value', function (s) { S.offset = s.val() || 0; });
  var first = false;
  function tryJoin() {
    if (joined || !first || !th || ref !== S.ref) return;
    joined = true;
    dispatch({ type: 'join', pid: pid, name: name, th: th });
    db.ref('.info/connected').on('value', function (s) {
      if (s.val() === true && ref === S.ref) { onl.onDisconnect().set(false); dispatch({ type: 'join', pid: pid, name: name, th: th }); }
    });
  }
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
    if (!first) { first = true; tryJoin(); }
    if (!v.players || !v.players[pid] || !v.players[pid].name) return; // wait for join
    S.room = E.normalize(v); render();
  });
  chatStart(code);
}
function disconnect() {
  if (S.ref) { S.ref.off(); try { S.ref.child('players/' + S.me + '/online').onDisconnect().cancel(); S.ref.child('players/' + S.me + '/online').set(false); } catch (e) {} }
  if (db) { db.ref('.info/connected').off(); db.ref('.info/serverTimeOffset').off(); }
  chatStop();
  S.ref = null;
}
function leave() {
  if (S.solo) { S.room = null; S.solo = false; render(); return; }
  var ses = LS.get('zcq_session'); if (ses) { ses.left = true; LS.set('zcq_session', ses); }
  disconnect(); S.room = null; render();
}
function forget() { LS.del('zcq_session'); render(); }
function forgetSolo() { LS.del('zcq_solo'); render(); }

// delete rooms (and their chat) older than 24 hours. Rooms without createdAt are from the old version.
function cleanupOld() {
  if (!db) return;
  db.ref('.info/serverTimeOffset').once('value').then(function (s) {
    var cutoff = Date.now() + (s.val() || 0) - 864e5 - 120000;
    return db.ref('rooms').orderByChild('createdAt').endAt(cutoff).limitToFirst(25).once('value');
  }).then(function (snap) {
    snap.forEach(function (c) {
      if (c.key === S.code) return;
      c.ref.remove().then(function () { return db.ref('chat/' + c.key).remove(); }).catch(function () {});
    });
  }).catch(function (e) { console.warn('cleanup', e && e.message); });
}

// ------------------------------------------------------------ chat (free text, Firebase)
function chatStart(code) {
  chatStop();
  S.chat = []; S.chatUnread = 0; S.chatSeen = LS.get('zcq_chatseen_' + code, 0);
  S.chatRef = db.ref('chat/' + code);
  S.chatQ = S.chatRef.limitToLast(100);
  S.chatQ.on('child_added', function (s) {
    var m = s.val(); if (!m || typeof m.text !== 'string') return;
    m.key = s.key; S.chat.push(m); if (S.chat.length > 100) S.chat.shift();
    if (S.chatOpen) { S.chatSeen = Math.max(S.chatSeen, m.ts || 0); LS.set('zcq_chatseen_' + code, S.chatSeen); }
    else if (m.pid !== S.me && (m.ts || 0) > S.chatSeen) S.chatUnread++;
    renderChat(true);
  });
  S.chatQ.on('child_removed', function (s) { S.chat = S.chat.filter(function (m) { return m.key !== s.key; }); renderChat(true); });
}
function chatStop() { if (S.chatQ) S.chatQ.off(); S.chatQ = null; S.chatRef = null; S.chat = []; S.chatUnread = 0; S.chatOpen = false; }
function chatSend() {
  var el = $('#chatIn'); if (!el || !S.chatRef || !S.room) return;
  var text = el.value.replace(/\s+/g, ' ').trim().slice(0, 300); if (!text) return;
  if (S.chatBusy) return; S.chatBusy = true; setTimeout(function () { S.chatBusy = false; }, 800);
  var p = S.room.players[S.me] || {}, tm = p.team ? teamName(p.team) : 'കാണി';
  el.value = ''; updateChatCount();
  var ref = S.chatRef;
  ref.push({ pid: S.me, name: String(p.name || '').slice(0, 24), tm: String(tm).slice(0, 30), text: text, ts: firebase.database.ServerValue.TIMESTAMP }).then(function () {
    // keep only the last 100 messages
    if (S.chat.length >= 100) {
      var oldest = S.chat[0].key;
      ref.orderByKey().endAt(oldest).once('value').then(function (s) { s.forEach(function (c) { if (c.key !== oldest) c.ref.remove(); }); });
    }
  }).catch(function () { toast('മെസേജ് അയക്കാൻ പറ്റിയില്ല'); });
}
function updateChatCount() { var el = $('#chatIn'), c = $('#chatCount'); if (el && c) c.textContent = el.value.length + '/300'; }
function renderChat(fromData) {
  var box = $('#chat'), btn = $('#chatBtn');
  var inRoom = !!(S.room && !S.solo && S.chatRef);
  if (btn) { btn.hidden = !inRoom; var b = $('#chatBadge'); if (b) { b.textContent = S.chatUnread > 9 ? '9+' : String(S.chatUnread); b.hidden = !S.chatUnread || S.chatOpen; } }
  if (!box) return;
  if (!inRoom || !S.chatOpen) { box.hidden = true; return; }
  box.hidden = false;
  var list = $('#chatList');
  if (!list) {
    box.innerHTML = '<div class="chathead"><b>💬 റൂം ചാറ്റ്</b><span class="small">എല്ലാവർക്കും കാണാം</span><button class="btn sec sm" data-act="chatToggle">അടയ്ക്കുക</button></div>' +
      '<div id="chatList" class="chatlist"></div><div class="chatform"><input id="chatIn" maxlength="300" placeholder="മെസേജ് എഴുതുക…" autocomplete="off"><button class="btn sm" data-act="chatSend">അയക്കുക</button></div><div class="small" id="chatCount" style="text-align:right">0/300</div>';
    list = $('#chatList');
  }
  var atBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 40;
  list.innerHTML = S.chat.length ? S.chat.map(function (m) {
    var mine = m.pid === S.me;
    return '<div class="msg' + (mine ? ' mine' : '') + '"><div class="who">' + esc(m.name) + ' <span>· ' + esc(m.tm || '') + '</span></div><div class="tx">' + esc(m.text) + '</div></div>';
  }).join('') : '<div class="small" style="text-align:center;padding:10px">ഇതുവരെ മെസേജ് ഇല്ല</div>';
  if (atBottom || !fromData) list.scrollTop = list.scrollHeight;
}
function chatToggle() {
  S.chatOpen = !S.chatOpen;
  if (S.chatOpen) { S.chatUnread = 0; S.chat.forEach(function (m) { S.chatSeen = Math.max(S.chatSeen, m.ts || 0); }); LS.set('zcq_chatseen_' + S.code, S.chatSeen); }
  else $('#chat').innerHTML = '';
  renderChat(false);
}

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
  room.createdAt = t;
  disconnect(); S.solo = true; S.me = 'solo'; S.code = 'SOLO' + t; S.room = room; S.shownSeq = null; S.bannerSeq = null; S.tossSeen = null; S.panelKey = '';
  LS.set('zcq_solo', room); render(); // -> toss screen
}
function resumeSolo() { var r = LS.get('zcq_solo'); if (!r) return; disconnect(); S.solo = true; S.me = 'solo'; S.code = 'SOLO' + (r.createdAt || 0); S.room = E.normalize(r); S.panelKey = ''; S.tossSeen = null; render(); }

// ------------------------------------------------------------ render
function show(id) { ['home', 'lobby', 'game', 'result'].forEach(function (x) { $('#' + x).hidden = x !== id; }); }
function render() {
  var r = S.room;
  renderTop();
  if (!r) { stopTick(); show('home'); renderHome(); renderChat(true); return; }
  if (r.status === 'lobby') { stopTick(); show('lobby'); renderLobby(); }
  else if (r.status === 'playing') { show('game'); renderGame(); }
  else { stopTick(); show('result'); renderResult(); }
  renderChat(true);
}
function renderTop() {
  var r = S.room, h = '';
  if (r) {
    h += S.solo ? '<span class="chip green">സോളോ</span>' : '<span class="chip">റൂം <b style="color:var(--gold)">' + esc(S.code) + '</b></span>';
    if (!S.solo) h += '<button class="btn sec sm icon" data-act="linkSheet" title="തിരിച്ചുവരാനുള്ള ലിങ്ക്">🔗</button><button class="btn sec sm icon" id="chatBtn" data-act="chatToggle" title="ചാറ്റ്">💬<span id="chatBadge" class="badge" hidden>0</span></button>';
    h += '<button class="btn sec sm" data-act="leave">പുറത്ത്</button>';
  }
  $('#topRight').innerHTML = h;
  document.body.classList.toggle('inroom', !!r);
}
function openLinkSheet() {
  var url = rejoinUrl(); if (!url) return toast('ലിങ്ക് ലഭ്യമല്ല');
  var sh = $('#sheet');
  sh.innerHTML = '<div class="sheetin"><h3>🔗 തിരിച്ചുവരാനുള്ള ലിങ്ക്</h3><p class="mut">ഈ ലിങ്ക് തുറന്നാൽ ഏത് ഫോണിൽ നിന്നും കോഡ് അടിക്കാതെ ഇതേ റൂമിൽ, ഇതേ സ്ഥാനത്ത് തിരികെ എത്താം. ഇത് നിങ്ങളുടേത് മാത്രം — <b>മറ്റാർക്കും അയക്കരുത്</b>.</p>' +
    '<input id="linkIn" readonly value="' + esc(url) + '"><div class="row" style="margin-top:8px"><button class="btn" data-act="linkCopy">ലിങ്ക് കോപ്പി</button><a class="btn sec" style="text-decoration:none" target="_blank" rel="noopener" href="https://wa.me/?text=' + encodeURIComponent('എന്റെ ക്രിക്കറ്റ് ക്വിസ് റൂമിലേക്ക് തിരിച്ചുവരാനുള്ള ലിങ്ക് (റൂം ' + S.code + '):\n' + url) + '">WhatsApp-ൽ സേവ് ചെയ്യുക</a></div><button class="btn sec" data-act="sheetClose">അടയ്ക്കുക</button></div>';
  sh.hidden = false;
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
    h += '<label class="lbl">ചോദ്യ സെറ്റ്</label>' + setPicker(set, true, 'soloSet');
    h += '<button class="btn blue" data-act="startSolo">അടുത്തത്: ടോസ്</button><button class="btn sec" data-act="homeBack">തിരികെ</button>';
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

function tossCard(r) {
  var me = S.me, isHost = S.solo || r.host === me, ts = r.toss, A = E.teamIds(r, 'A').length, B = E.teamIds(r, 'B').length;
  var h = '<div class="card"><h2>🪙 ടോസ്</h2><p class="small">തല (Heads) = ' + esc(r.teams.A.name) + ' · വാൽ (Tails) = ' + esc(r.teams.B.name) + '</p>';
  if (!ts || !ts.winner) {
    if (isHost) h += '<button class="btn gold" data-act="toss"' + (A && B ? '' : ' disabled') + '>ടോസ് ഇടുക</button>' + (A && B ? '' : '<p class="small" style="margin-top:6px">രണ്ട് ടീമിലും കുറഞ്ഞത് ഒരാൾ വേണം.</p>');
    else h += '<p class="mut">ഹോസ്റ്റ് ടോസ് ഇടുന്നത് കാത്തിരിക്കുക…</p>';
  } else {
    var wcap = r.teams[ts.winner].captain;
    h += '<div class="coinres"><span class="coin">' + (ts.face === 'H' ? 'തല' : 'വാൽ') + '</span><div><b>' + esc(teamName(ts.winner)) + '</b> ടോസ് ജയിച്ചു!</div></div>';
    if (!ts.choice) {
      var can = S.solo || me === wcap || (r.host === me && !(r.players[wcap] || {}).online);
      if (can) h += '<p class="mut">' + (S.solo ? esc(nm(wcap)) + ' (ക്യാപ്റ്റൻ): ' : '') + 'ബാറ്റ് ചെയ്യണോ ബൗൾ ചെയ്യണോ?</p><div class="row"><button class="btn" data-act="tossChoice" data-c="bat">🏏 ബാറ്റിംഗ്</button><button class="btn blue" data-act="tossChoice" data-c="bowl">⚾ ബൗളിംഗ്</button></div>';
      else h += '<p class="mut">ക്യാപ്റ്റൻ ' + esc(nm(wcap)) + ' തീരുമാനിക്കുന്നു…</p>';
    } else {
      h += '<p>' + esc(teamName(ts.winner)) + ' ' + (ts.choice === 'bat' ? 'ബാറ്റിംഗ്' : 'ബൗളിംഗ്') + ' തിരഞ്ഞെടുത്തു. ആദ്യം ബാറ്റ്: <b>' + esc(teamName(r.firstBat)) + '</b></p>';
      if (isHost) h += '<button class="btn gold" data-act="start">മാച്ച് തുടങ്ങുക</button>';
      else h += '<p class="mut" style="margin-top:6px">ഹോസ്റ്റ് മാച്ച് തുടങ്ങുന്നത് കാത്തിരിക്കുക…</p>';
    }
  }
  return h + '</div>';
}
function tossAnim(r) {
  var ts = r.toss; if (!ts || !ts.winner) { if (S.tossSeen === null || S.tossSeen === undefined) S.tossSeen = 0; return; }
  if (S.tossSeen === null || S.tossSeen === undefined) { S.tossSeen = ts.id; return; }
  if (S.tossSeen === ts.id) return; S.tossSeen = ts.id;
  showPop('toss', '<span class="coin spin3">🪙</span>', (ts.face === 'H' ? 'തല' : 'വാൽ') + ' — ' + esc(teamName(ts.winner)) + ' ടോസ് ജയിച്ചു', 2200);
}
function renderLobby() {
  var r = S.room, me = S.me, isHost = r.host === me;
  var ae = document.activeElement;
  if (ae && ae.closest && ae.closest('#lobby') && ae.tagName === 'INPUT') { S.lobbyDirty = true; return; }
  if (S.tossSeen === undefined) S.tossSeen = null;
  tossAnim(r);
  var h = '';
  if (S.solo) {
    h += '<div class="card"><h2>സോളോ: ' + esc(r.teams.A.name) + ' vs ' + esc(r.teams.B.name) + '</h2><p class="mut">സെറ്റ്: ' + esc(r.set) + ' · ' + E.teamIds(r, 'A').length + ' vs ' + E.teamIds(r, 'B').length + ' കളിക്കാർ</p></div>';
    h += tossCard(r);
    $('#lobby').innerHTML = h; return;
  }
  var url = location.origin + location.pathname + '?room=' + S.code;
  h += '<div class="card codebox"><div class="mut">റൂം കോഡ്</div><div class="code">' + esc(S.code) + '</div>' +
    '<div class="row"><button class="btn sec sm" data-act="copy">കോഡ് കോപ്പി</button><a class="btn sm" style="text-decoration:none" target="_blank" rel="noopener" href="https://wa.me/?text=' + encodeURIComponent('ക്രിക്കറ്റ് ക്വിസ് കളിക്കാൻ വരൂ! റൂം കോഡ്: ' + S.code + '\n' + url) + '">WhatsApp-ൽ അയക്കുക</a></div></div>';
  h += '<div class="card linkcard"><div><b>🔗 നിങ്ങളുടെ തിരിച്ചുവരാനുള്ള ലിങ്ക്</b><div class="small">പുറത്തു പോയാൽ ഏത് ഫോണിൽ നിന്നും കോഡ് ഇല്ലാതെ തിരികെ വരാം.</div></div><button class="btn sm" data-act="linkSheet">ലിങ്ക്</button></div>';
  h += '<div class="card"><h2>ചോദ്യ സെറ്റ്</h2>';
  if (isHost) h += '<p class="mut">ഹോസ്റ്റ് ആയ നിങ്ങൾ സെറ്റ് തിരഞ്ഞെടുക്കുക.</p>' + setPicker(r.set, true, 'set');
  else h += '<div class="setrow on"><b>' + esc(r.set) + '</b><span class="chip green">ഒരു പന്തിന് ' + limitTxt(E.limitFor(r.set)) + '</span></div><p class="small">ഹോസ്റ്റ് ആണ് സെറ്റ് തിരഞ്ഞെടുക്കുന്നത്.</p>';
  h += '</div>';
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
  h += tossCard(r);
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
function online(id) { if (S.solo) return true; var p = S.room.players[id]; return !!(p && p.online); }
function offTag(id) { return online(id) ? '' : ' <span class="off">ഓഫ്‌ലൈൻ</span>'; }
function innLabel(inn, g) { return inn.so ? 'സൂപ്പർ ഓവർ' + (inn.so > 1 ? ' ' + inn.so : '') : (g.inn.indexOf(inn) === 0 ? 'ഒന്നാം ഇന്നിംഗ്സ്' : 'രണ്ടാം ഇന്നിംഗ്സ്'); }

function renderBoard(r) {
  var g = r.g, inn = E.cur(g), h = '';
  var crr = inn.balls ? (inn.runs * 6 / inn.balls).toFixed(2) : '0.00';
  h += '<div class="board' + (inn.so ? ' so' : '') + '"><div class="bt"><span class="tn">' + esc(teamName(inn.bat)) + '</span><span class="chip' + (inn.so ? ' gold' : '') + '">' + innLabel(inn, g) + '</span></div>';
  h += '<div class="score"><span class="big" id="sRuns">' + inn.runs + '/' + inn.wkts + '</span><span class="ov">ഓവർ <b id="sOv">' + oversTxt(inn.balls) + '</b> / ' + (inn.maxBalls / 6) + '</span></div>';
  h += '<div class="kv"><span>റൺ റേറ്റ് <b>' + crr + '</b></span><span>എക്സ്ട്രാ <b id="sEx">' + inn.extras + '</b></span><span>വിക്കറ്റ് ബാക്കി <b>' + (inn.maxWk - inn.wkts) + '</b></span></div>';
  if (g.innings % 2 === 0) {
    var need = g.target - inn.runs, left = inn.maxBalls - inn.balls;
    var rrr = left ? (need * 6 / left).toFixed(2) : '-';
    h += '<div class="need">ലക്ഷ്യം ' + g.target + ' · ജയിക്കാൻ ' + left + ' പന്തിൽ ' + Math.max(0, need) + ' റൺസ് വേണം · RRR ' + rrr + '</div>';
    var i1 = g.inn[g.innings - 2]; h += '<div class="small" style="margin-top:6px;color:#bfe9d3">' + esc(teamName(i1.bat)) + ': ' + i1.runs + '/' + i1.wkts + ' (' + oversTxt(i1.balls) + ')</div>';
  } else if (inn.so) {
    h += '<div class="need">സ്കോർ ഒപ്പമായി! സൂപ്പർ ഓവർ: ഓരോ ടീമിനും 1 ഓവർ, പരമാവധി 2 വിക്കറ്റ്</div>';
  }
  h += '<div class="crease">';
  [inn.striker, inn.non].forEach(function (id, i) {
    if (!id) return; var b = inn.bs[id] || { r: 0, b: 0 };
    h += '<span class="' + (i === 0 ? 'st' : '') + '">' + (i === 0 ? '🏏 ' : '') + esc(nm(id)) + (i === 0 ? ' *' : '') + offTag(id) + '</span><span class="r">' + b.r + ' (' + b.b + ')</span>';
  });
  if (inn.bowler) { var w = inn.bw[inn.bowler] || { r: 0, w: 0, b: 0 }; h += '<span>ബൗളർ: ' + esc(nm(inn.bowler)) + offTag(inn.bowler) + '</span><span class="r">' + oversTxt(w.b) + ' – ' + w.r + ' – ' + w.w + '</span>'; }
  h += '</div><div class="overline"><span class="small" style="color:#bfe9d3">ഈ ഓവർ</span>';
  inn.overBalls.forEach(function (s) { h += '<span class="ball' + (s === 'W' || s === 'Ex' ? ' ' + s : ' r' + s) + '">' + s + '</span>'; });
  for (var i = inn.balls % 6; i < 6; i++) h += '<span class="ball"></span>';
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
function optsHtml(q, act, disabled, sel, bad) {
  var h = '', K = ['A', 'B', 'C', 'D', 'E', 'F'];
  bad = bad || [];
  q.o.forEach(function (o, i) {
    var isBad = bad.indexOf(i) >= 0, dis = disabled || isBad;
    h += '<button class="opt' + (sel === i ? ' sel' : '') + (isBad ? ' bad' : '') + '"' + (dis ? ' disabled' : ' data-act="' + act + '" data-i="' + i + '"') + '><span class="k">' + (isBad ? '✗' : K[i]) + '</span><span>' + esc(o) + '</span></button>';
  });
  return h;
}
function ringHtml() {
  return '<div class="timerwrap"><div class="ring"><svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="52" stroke="#26355a" stroke-width="10" fill="none"/><circle id="ringArc" cx="60" cy="60" r="52" stroke="#19b46b" stroke-width="10" fill="none" stroke-linecap="round" stroke-dasharray="326.7" stroke-dashoffset="0"/></svg><div class="num"><span id="ringNum">-</span><small>ബാക്കി</small></div></div>' +
    '<div class="worth"><div class="w1">ഇപ്പോൾ ശരിയുത്തരം നൽകിയാൽ</div><div class="w2" id="ringWorth">6 റൺസ്</div><div class="small" id="ringEl"></div></div></div>';
}
// captain/host: replace an offline bowler or batsman
function replaceCard(r) {
  if (S.solo) return '';
  var g = r.g, inn = E.cur(g), me = S.me, h = '';
  var slots = [['bowler', inn.bowl, ['select', 'bowlerAnswer', 'judge']], ['striker', inn.bat, ['select', 'bowlerAnswer', 'openers']], ['non', inn.bat, ['select', 'bowlerAnswer', 'openers']]];
  slots.forEach(function (s) {
    var id = inn[s[0]]; if (!id || online(id) || s[2].indexOf(g.phase) < 0 || !E.isCaptain(r, me, s[1])) return;
    var opts = s[0] === 'bowler' ? g.order[inn.bowl].filter(function (x) { return x !== id; }) : E.candidates(g, inn);
    h += '<div class="card warn"><b>⚠ ' + esc(nm(id)) + ' (' + (s[0] === 'bowler' ? 'ബൗളർ' : 'ബാറ്റ്സ്മാൻ') + ') ഓഫ്‌ലൈൻ ആണ്.</b><p class="mut">ക്യാപ്റ്റൻ എന്ന നിലയിൽ പകരം ആളെ ഇറക്കാം:</p><div class="pick">' +
      (opts.length ? opts.map(function (x) { return '<button class="btn sec" data-act="replace" data-s="' + s[0] + '" data-p="' + x + '">' + esc(nm(x)) + (online(x) ? '' : ' (ഓഫ്‌ലൈൻ)') + '</button>'; }).join('') : '<span class="small">പകരം ആരും ഇല്ല</span>') + '</div></div>';
  });
  return h;
}

function renderGame() {
  var r = S.room, g = r.g, inn = E.cur(g), me = S.me, rl = role(r), solo = S.solo;
  var q = g.q >= 0 ? (QS[g.set] || [])[g.q] : null;
  renderBoard(r);
  if (S.shownSeq === null) S.shownSeq = g.last ? g.last.id : -1;
  if (S.bannerSeq === null) S.bannerSeq = g.banner ? g.banner.seq + ':' + g.banner.kind : '';
  if (g.last && g.last.id !== S.shownSeq) { S.shownSeq = g.last.id; showBallPop(g.last); }
  var bk = g.banner ? g.banner.seq + ':' + g.banner.kind : '';
  if (bk && bk !== S.bannerSeq) { S.bannerSeq = bk; var bn = g.banner; setTimeout(function () { showInningsPop(bn); }, g.last ? 1700 : 0); }

  var on = [inn.striker, inn.non, inn.bowler].map(function (x) { return x && online(x) ? 1 : 0; }).join('');
  var key = [g.phase, g.seq, g.innings, inn.balls, inn.striker, inn.non, inn.bowler, rl, g.pending.join(','), g.tries, on].join('|');
  if (key === S.panelKey) return;
  S.panelKey = key; S.sel = null;
  var h = replaceCard(r), capBat = solo || E.isCaptain(r, me, inn.bat), capBowl = solo || E.isCaptain(r, me, inn.bowl);
  var batIds = g.order[inn.bat], bowlIds = g.order[inn.bowl];

  if (g.phase === 'openers') {
    var needBat = !(inn.striker && (inn.non || batIds.length === 1)), needBowl = !inn.bowler;
    if (g.innings % 2 === 0 && inn.balls === 0) h += '<div class="card" style="border-color:var(--grn)"><h3>' + (inn.so ? 'സൂപ്പർ ഓവർ: രണ്ടാം ഭാഗം' : 'ഇന്നിംഗ്സ് ബ്രേക്ക്') + '</h3><p>' + esc(teamName(inn.bat)) + '-ന് ജയിക്കാൻ ' + inn.maxBalls + ' പന്തിൽ <b>' + g.target + '</b> റൺസ് വേണം.</p></div>';
    else if (inn.so) h += '<div class="card" style="border-color:var(--gold)"><h3>⚡ സ്കോർ ഒപ്പം — സൂപ്പർ ഓവർ!</h3><p>ഓരോ ടീമിനും 1 ഓവർ (6 പന്ത്), പരമാവധി 2 വിക്കറ്റ്. ഈ മാച്ചിൽ ഇതുവരെ വരാത്ത ചോദ്യങ്ങൾ. ആദ്യം ബാറ്റ്: <b>' + esc(teamName(inn.bat)) + '</b></p></div>';
    if (needBat && capBat) {
      h += '<div class="card"><h2>' + esc(teamName(inn.bat)) + ': ഓപ്പണർമാർ</h2><p class="mut">ബാറ്റിംഗ് ക്യാപ്റ്റൻ തിരഞ്ഞെടുക്കുക.</p><label class="lbl">സ്ട്രൈക്കർ (ആദ്യ പന്ത് നേരിടും)</label><select id="opS">' + batIds.map(function (id) { return '<option value="' + id + '">' + esc(nm(id)) + '</option>'; }).join('') + '</select>';
      if (batIds.length > 1) h += '<label class="lbl">നോൺ-സ്ട്രൈക്കർ</label><select id="opN">' + batIds.map(function (id, i) { return '<option value="' + id + '"' + (i === 1 ? ' selected' : '') + '>' + esc(nm(id)) + '</option>'; }).join('') + '</select>';
      h += '<button class="btn" data-act="setBatters">ഉറപ്പിക്കുക</button></div>';
    } else if (needBat) h += waitBox(esc(teamName(inn.bat)) + ' ക്യാപ്റ്റൻ ' + esc(nm(r.teams[inn.bat].captain)) + ' ഓപ്പണർമാരെ തിരഞ്ഞെടുക്കുന്നു…');
    if (needBowl && capBowl) {
      h += '<div class="card"><h2>' + esc(teamName(inn.bowl)) + ': ' + (inn.so ? 'സൂപ്പർ ഓവർ ബൗളർ' : 'ആദ്യ ബൗളർ') + '</h2><p class="mut">ബൗളിംഗ് ക്യാപ്റ്റൻ തിരഞ്ഞെടുക്കുക.</p><div class="pick">' + bowlIds.map(function (id) { return '<button class="btn sec" data-act="setBowler" data-p="' + id + '">' + esc(nm(id)) + '</button>'; }).join('') + '</div></div>';
    } else if (needBowl) h += waitBox(esc(teamName(inn.bowl)) + ' ക്യാപ്റ്റൻ ' + esc(nm(r.teams[inn.bowl].captain)) + ' ബൗളറെ തിരഞ്ഞെടുക്കുന്നു…');
  }
  else if (g.phase === 'select') {
    if (solo || rl === 'bowler') {
      var over = Math.floor(inn.balls / 6) + 1;
      h += '<div class="card"><h2>' + (solo ? esc(nm(inn.bowler)) + ' · ' : '') + (inn.so ? 'സൂപ്പർ ഓവർ' : 'ഓവർ ' + over) + ': ചോദ്യ ബോക്സ്</h2><p class="mut">ഒരു ചോദ്യം തൊടുക. അത് ഉറക്കെ വായിക്കും. പിന്നെ നിങ്ങൾ തന്നെ ഉത്തരം നൽകണം. ശരിയാകുന്നത് വരെ ചോദ്യം മാറ്റാൻ പറ്റില്ല.</p>';
      E.box(inn).forEach(function (qi, k) {
        var qq = (QS[g.set] || [])[qi]; if (!qq) return; var used = !!inn.used['q' + qi];
        h += '<button class="qbox' + (used ? ' used' : '') + '"' + (used ? ' disabled' : ' data-act="pick" data-q="' + qi + '"') + '><span class="n">' + (k + 1) + '</span><span class="t">' + esc(qq.q) + '</span></button>';
      });
      h += '</div>';
    } else h += waitBox('ബൗളർ ' + esc(nm(inn.bowler)) + ' ചോദ്യം തിരഞ്ഞെടുക്കുന്നു…');
  }
  else if (g.phase === 'bowlerAnswer') {
    if ((solo || rl === 'bowler') && q) {
      h += '<div class="card"><h3 class="mut">' + (solo ? esc(nm(inn.bowler)) + ' (ബൗളർ): ' : '') + 'ആദ്യം നിങ്ങൾ ഉത്തരം നൽകുക</h3>';
      var bx = E.box(inn);
      h += '<div class="lockrow">' + bx.map(function (qi, k) { var cls = qi === g.q ? 'cur' : (inn.used['q' + qi] ? 'used' : 'lock'); return '<span class="lk ' + cls + '">' + (qi === g.q ? '▶ ' : (cls === 'lock' ? '🔒' : '')) + (k + 1) + '</span>'; }).join('') + '<span class="small">ചോദ്യം ലോക്ക് ചെയ്തു</span></div>';
      if (g.tries > 0) h += '<div class="alert">❌ ഉത്തരം തെറ്റി! ബാറ്റിംഗ് ടീമിന് <b>+1 എക്സ്ട്രാ</b> (ഈ ചോദ്യത്തിൽ ആകെ ' + g.tries + '). ഈ പന്ത് എണ്ണില്ല — <b>ഇതേ ചോദ്യത്തിന് വീണ്ടും ശ്രമിക്കുക.</b></div>';
      h += qHtml(q, true);
      if (E.isMcq(q)) h += optsHtml(q, 'bsel', false, null, g.wrongTried) + '<button class="btn gold" data-act="bowlerSubmit" id="bSubmit" disabled>ഉത്തരം ഉറപ്പിക്കുക</button>';
      else h += '<textarea id="bText" placeholder="നിങ്ങളുടെ ഉത്തരം"></textarea><div class="note">മാതൃകാ ഉത്തരം: ' + esc(q.ans || '-') + '</div><div class="row"><button class="btn" data-act="bowlerOk" data-ok="1">എന്റെ ഉത്തരം ശരി</button><button class="btn red" data-act="bowlerOk" data-ok="">തെറ്റി</button></div>';
      h += '<div class="note">ബൗളർക്ക് സമയപരിധി ഇല്ല. ശരിയായാൽ മാത്രം ചോദ്യം ബാറ്റ്സ്മാന് പോകും. ഓരോ തെറ്റിനും ബാറ്റിംഗ് ടീമിന് +1 എക്സ്ട്രാ; പന്ത് എണ്ണില്ല.</div></div>';
    } else h += waitBox('ബൗളർ ' + esc(nm(inn.bowler)) + ' ആദ്യം ഉത്തരം നൽകുന്നു…' + (g.tries ? '<br><span class="exline">തെറ്റിയ ശ്രമം: ' + g.tries + ' · +' + g.tries + ' എക്സ്ട്രാ (പന്ത് എണ്ണിയിട്ടില്ല)</span>' : ''));
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
    if (can) h += '<div class="card"><h2>അടുത്ത ബാറ്റ്സ്മാൻ</h2><p class="mut">' + esc(nm(g.chooser)) + ' ഔട്ടായി. അടുത്തതായി ആര് ഇറങ്ങണം?</p><div class="pick">' + E.candidates(g, inn).map(function (id) { return '<button class="btn sec" data-act="nextBat" data-p="' + id + '">' + esc(nm(id)) + offTag(id) + '</button>'; }).join('') + '</div></div>';
    else h += waitBox(esc(nm(g.chooser)) + ' അടുത്ത ബാറ്റ്സ്മാനെ തിരഞ്ഞെടുക്കുന്നു…');
  }
  else if (g.phase === 'nextBowler') {
    var can2 = solo || me === inn.prevBowler || E.isCaptain(r, me, inn.bowl);
    var list = bowlIds.filter(function (id) { return id !== inn.prevBowler; });
    if (can2) h += '<div class="card"><h2>ഓവർ കഴിഞ്ഞു! അടുത്ത ബൗളർ</h2><p class="mut">' + esc(nm(inn.prevBowler)) + ' അടുത്ത ഓവർ ആർക്ക് കൊടുക്കണം?</p><div class="pick">' + list.map(function (id) { return '<button class="btn sec" data-act="nextBowl" data-p="' + id + '">' + esc(nm(id)) + offTag(id) + '</button>'; }).join('') + '</div></div>';
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
  if (l.kind === 'runs') showPop(l.runs === 6 ? 'six' : l.runs === 4 ? 'four' : '', l.runs === 6 ? 'സിക്സ്! 6' : l.runs === 4 ? 'ഫോർ! 4' : l.runs + (l.runs === 1 ? ' റൺ' : ' റൺസ്'), esc(nm(l.batter)) + ' · ' + t);
  else if (l.kind === 'bowled') showPop('out', 'ഔട്ട്!', 'ക്ലീൻ ബൗൾഡ് — ഉത്തരം തെറ്റി · ' + esc(nm(l.batter)));
  else if (l.kind === 'timeout') showPop('out', 'ഔട്ട്!', 'സമയം കഴിഞ്ഞു · ' + esc(nm(l.batter)));
  else if (l.kind === 'extra') showPop('ex', '+1 എക്സ്ട്രാ', 'ബൗളർ ' + esc(nm(l.bowler)) + '-ന്റെ ഉത്തരം തെറ്റി — പന്ത് എണ്ണില്ല, ഇതേ ചോദ്യം വീണ്ടും');
}
function showInningsPop(bn) {
  var r = S.room; if (!r || !r.g || r.status !== 'playing') return;
  var inn = E.cur(r.g);
  if (bn && bn.kind === 'super') return showPop('inn', '⚡ സൂപ്പർ ഓവർ!', 'സ്കോർ ഒപ്പം. ' + esc(teamName(inn.bat)) + ' ആദ്യം ബാറ്റ് ചെയ്യും', 2600);
  showPop('inn', 'ഇന്നിംഗ്സ് മാറി!', esc(teamName(inn.bat)) + '-ന് ജയിക്കാൻ ' + r.g.target + ' റൺസ്', 2600);
}

// ------------------------------------------------------------ result
function resultText(r) {
  var g = r.g, res = g.result; if (!res) return '';
  if (res.by === 'tie') return 'സൂപ്പർ ഓവറുകളിലും ഒപ്പം — മത്സരം സമനില!';
  var w = esc(teamName(res.winner));
  if (res.by === 'super') return w + ' സൂപ്പർ ഓവറിൽ ജയിച്ചു!';
  if (res.by === 'wkts') return w + ' ' + res.margin + ' വിക്കറ്റിന് ജയിച്ചു!';
  return w + ' ' + res.margin + ' റൺസിന് ജയിച്ചു!';
}
function reviewHtml(r) {
  var g = r.g, list = [], qs = QS[g.set] || [], K = ['A', 'B', 'C', 'D', 'E', 'F'];
  g.inn.forEach(function (inn) { (inn.miss || []).forEach(function (m) { list.push(m); }); });
  if (!list.length) return '<div class="card"><h3>📘 തെറ്റിയ ചോദ്യങ്ങൾ</h3><p class="mut">ഒരു ചോദ്യവും തെറ്റിയില്ല. അഭിനന്ദനങ്ങൾ!</p></div>';
  var h = '<div class="card"><h3>📘 തെറ്റിയ ചോദ്യങ്ങളും ശരിയുത്തരവും (' + list.length + ')</h3>';
  list.forEach(function (m) {
    var q = qs[m.q]; if (!q) return;
    var kind = m.kind === 'timeout' ? 'സമയം കഴിഞ്ഞു' : m.kind === 'extra' ? 'ബൗളർ തെറ്റി' + (m.n > 1 ? ' ×' + m.n : '') : 'ഉത്തരം തെറ്റി';
    var right = E.isMcq(q) ? K[q.a] + '. ' + q.o[q.a] : (q.ans || '-');
    h += '<div class="rev"><div class="rq">' + esc(q.q) + '</div><div class="small">' + esc(nm(m.who)) + ' · <span style="color:var(--red)">' + kind + '</span></div>';
    if (E.isMcq(q) && m.ch >= 0 && q.o[m.ch] != null) h += '<div class="ra bad">നൽകിയത്: ' + esc(K[m.ch] + '. ' + q.o[m.ch]) + '</div>';
    h += '<div class="ra ok">ശരിയുത്തരം: ' + esc(right) + '</div></div>';
  });
  return h + '</div>';
}
function renderResult() {
  var r = S.room, g = r.g;
  if (!g || !g.result) { $('#result').innerHTML = '<div class="card">കളി കഴിഞ്ഞു.</div>'; return; }
  if (g.last && S.shownSeq !== null && g.last.id !== S.shownSeq) { S.shownSeq = g.last.id; showBallPop(g.last); }
  var tie = g.result.by === 'tie';
  var h = '<div class="card trophy"><div class="cup">🏆</div><h2>' + (tie ? 'സമനില' : esc(teamName(g.result.winner))) + '</h2><p>' + resultText(r) + '</p></div>';
  var best = { id: '', r: -1 }, bestB = { id: '', w: -1, r: 0 };
  g.inn.forEach(function (inn) {
    h += '<div class="card"><div class="small">' + innLabel(inn, g) + '</div><h3>' + esc(teamName(inn.bat)) + ' — ' + inn.runs + '/' + inn.wkts + ' (' + oversTxt(inn.balls) + ' ഓവർ)</h3>';
    h += '<table class="sc"><tr><th>ബാറ്റ്സ്മാൻ</th><th>റൺസ്</th><th>പന്ത്</th><th></th></tr>';
    g.order[inn.bat].forEach(function (id) {
      var b = inn.bs[id]; if (!b && !inn.out[id] && id !== inn.striker && id !== inn.non) return; b = b || { r: 0, b: 0 };
      if (b.r > best.r) best = { id: id, r: b.r };
      h += '<tr><td>' + esc(nm(id)) + '</td><td><b>' + b.r + '</b></td><td>' + b.b + '</td><td class="small">' + (inn.out[id] ? 'ഔട്ട്' : 'നോട്ടൗട്ട്') + '</td></tr>';
    });
    h += '<tr><td class="small">എക്സ്ട്രാ (ബൗളർ തെറ്റി)</td><td><b>' + inn.extras + '</b></td><td></td><td></td></tr></table>';
    h += '<table class="sc" style="margin-top:10px"><tr><th>ബൗളർ</th><th>ഓവർ</th><th>റൺസ്</th><th>വിക്കറ്റ്</th></tr>';
    Object.keys(inn.bw).forEach(function (id) { var w = inn.bw[id]; if (w.w > bestB.w || (w.w === bestB.w && w.r < bestB.r)) bestB = { id: id, w: w.w, r: w.r }; h += '<tr><td>' + esc(nm(id)) + '</td><td>' + oversTxt(w.b) + '</td><td>' + w.r + '</td><td><b>' + w.w + '</b></td></tr>'; });
    h += '</table></div>';
  });
  h += '<div class="card"><div class="stars"><div class="s"><span class="small">മികച്ച ബാറ്റ്സ്മാൻ</span><b>' + esc(nm(best.id)) + '</b><span class="small">' + Math.max(0, best.r) + ' റൺസ്</span></div><div class="s"><span class="small">മികച്ച ബൗളർ</span><b>' + esc(nm(bestB.id)) + '</b><span class="small">' + Math.max(0, bestB.w) + ' വിക്കറ്റ്</span></div></div></div>';
  h += reviewHtml(r);
  h += '<div class="card">';
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
    case 'rejoin': var s = LS.get('zcq_session'); if (s) { db ? connect(s.code, s.pid, s.name, s.tok) : toast('ഇന്റർനെറ്റ് ഇല്ല'); } return;
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
    case 'toss': return dispatch({ type: 'toss', coin: Math.random() });
    case 'tossChoice': return dispatch({ type: 'tossChoice', choice: d.c });
    case 'replace': return dispatch({ type: 'replace', slot: d.s, pid: d.p });
    case 'linkSheet': return openLinkSheet();
    case 'linkCopy': try { navigator.clipboard.writeText(rejoinUrl()); toast('ലിങ്ക് കോപ്പി ചെയ്തു', true); } catch (e) { var li = $('#linkIn'); if (li) { li.select(); document.execCommand('copy'); } } return;
    case 'sheetClose': $('#sheet').hidden = true; return;
    case 'chatToggle': return chatToggle();
    case 'chatSend': return chatSend();
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
document.addEventListener('keydown', function (ev) { if (ev.target && ev.target.id === 'chatIn' && ev.key === 'Enter') { ev.preventDefault(); chatSend(); } });
document.addEventListener('input', function (ev) { if (ev.target && ev.target.id === 'chatIn') updateChatCount(); });
document.addEventListener('focusout', function () { setTimeout(function () { if (S.lobbyDirty && S.room && S.room.status === 'lobby') renderLobby(); }, 50); });
function saveSoloForm() { if (!$('#soloA')) return; S.soloA = $('#soloA').value; S.soloB = $('#soloB').value; S.soloNA = $('#soloNA').value; S.soloNB = $('#soloNB').value; }

// ------------------------------------------------------------ boot
function boot() {
  try { Object.keys(localStorage).forEach(function (k) { if (k.indexOf('zcq_rcv_') === 0 && now() - (+localStorage.getItem(k) || 0) > 864e5) localStorage.removeItem(k); }); } catch (e) {}
  setTimeout(cleanupOld, 4000);
  var prm = new URLSearchParams(location.search), lr = prm.get('r'), lp = prm.get('p'), lk = prm.get('k');
  if (lr && lp && lk && db) {
    // personal rejoin link -> remove secret from the address bar, then rejoin
    try { history.replaceState(null, '', location.pathname); } catch (e) {}
    $('#home').innerHTML = waitBox('റൂം ' + esc(lr) + '-ലേക്ക് തിരികെ കയറുന്നു…');
    useRejoinLink(lr.toUpperCase(), lp, lk);
    return;
  }
  var ses = LS.get('zcq_session');
  if (ses && ses.code && !ses.left && db) {
    // auto rejoin without typing the code
    db.ref('rooms/' + ses.code).once('value').then(function (s) {
      var v = s.val();
      if (v && v.players && v.players[ses.pid] && v.status !== 'finished') connect(ses.code, ses.pid, ses.name, ses.tok);
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
