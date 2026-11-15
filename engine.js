/* Zaman Cricket Quiz - game engine (v2)
 * Pure rules shared by Solo and Multiplayer. Solo applies these actions to a
 * local copy; multiplayer applies the SAME actions inside a Firebase
 * transaction. So if Solo plays correctly, multiplayer follows the same rules.
 */
(function (root) {
  'use strict';
  var BALLS_PER_OVER = 6, OVERS = 5, SET_SIZE = 30, MAX_TEAM = 11;

  // Set types. limit = seconds per ball. Run bands are the same fractions of
  // the limit as the 10-second OPTIONAL set (2/4/6/8/10 s).
  var SET_TYPES = [
    { key: 'OPTIONAL QUESTIONS', ml: 'ഓപ്ഷൻ ചോദ്യങ്ങൾ', limit: 10, re: /^OPTIONAL/ },
    { key: 'ONE WORD QUESTIONS', ml: 'ഒറ്റവാക്ക് ഉത്തരം', limit: 60, re: /^ONE\s*WORD/ },
    { key: 'MINIMUM 3 SENTENCES', ml: 'കുറഞ്ഞത് 3 വാക്യം', limit: 180, re: /^MINIMUM\s*3/ },
    { key: 'MINIMUM 5 SENTENCES', ml: 'കുറഞ്ഞത് 5 വാക്യം', limit: 300, re: /^MINIMUM\s*5/ },
    { key: 'PICTURE IDENTIFYING', ml: 'ചിത്രം തിരിച്ചറിയൽ', limit: 300, re: /^PICTURE/ }
  ];
  var BANDS = [[0.2, 6], [0.4, 4], [0.6, 3], [0.8, 2], [1.0, 1]];

  function setType(name) {
    var n = String(name || '').toUpperCase().replace(/\s+/g, ' ').trim();
    for (var i = 0; i < SET_TYPES.length; i++) if (SET_TYPES[i].re.test(n)) return SET_TYPES[i];
    return null;
  }
  function limitFor(setName) { var t = setType(setName); return t ? t.limit : 10; }
  // runs for an answer time; -1 = out (time over)
  function runsFor(t, limit) {
    if (!(t <= limit)) return -1;
    for (var i = 0; i < BANDS.length; i++) if (t <= BANDS[i][0] * limit + 1e-9) return BANDS[i][1];
    return 1;
  }
  function bands(limit) {
    var prev = 0;
    return BANDS.map(function (b) { var r = { from: prev, to: b[0] * limit, runs: b[1] }; prev = r.to; return r; });
  }
  function isMcq(q) { return !!q && Array.isArray(q.o) && q.o.length > 0; }
  function setNumber(name) { var m = String(name).match(/(\d+)\s*$/); return m ? +m[1] : 0; }

  // All five types, each with its sets (sorted by number). A set is playable
  // only when it has 30 questions.
  function listSets(qs) {
    qs = qs || {};
    return SET_TYPES.map(function (t) {
      var sets = Object.keys(qs).filter(function (k) { var st = setType(k); return st && st.key === t.key; })
        .sort(function (a, b) { return setNumber(a) - setNumber(b); })
        .map(function (k) { var n = (qs[k] || []).length; return { name: k, count: n, ok: n >= SET_SIZE }; });
      return { type: t, sets: sets };
    });
  }
  function setPlayable(qs, name) { return !!(qs && qs[name] && qs[name].length >= SET_SIZE && setType(name)); }

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function teamIds(room, team) {
    return Object.keys(room.players || {}).filter(function (id) { return room.players[id].team === team; })
      .sort(function (a, b) { return (room.players[a].joinedAt || 0) - (room.players[b].joinedAt || 0) || (a < b ? -1 : 1); });
  }
  function other(t) { return t === 'A' ? 'B' : 'A'; }

  function newRoom(o) {
    var r = {
      v: 2, code: o.code, host: o.pid, createdAt: o.now || 0, solo: !!o.solo,
      status: 'lobby', set: o.set || 'OPTIONAL QUESTIONS 1', firstBat: 'A', toss: null,
      teams: { A: { name: o.teamA || 'ടീം A', captain: '' }, B: { name: o.teamB || 'ടീം B', captain: '' } },
      players: {}
    };
    r.players[o.pid] = { name: o.name, team: '', online: true, joinedAt: o.now || 0 };
    if (o.th) r.players[o.pid].th = o.th;
    return r;
  }

  function newInnings(bat, bowl, maxBalls, maxWk, so) {
    return { bat: bat, bowl: bowl, runs: 0, wkts: 0, extras: 0, balls: 0, striker: '', non: '', bowler: '', prevBowler: '',
      used: {}, out: {}, bs: {}, bw: {}, overBalls: [], log: [], miss: [], maxBalls: maxBalls || OVERS * BALLS_PER_OVER, maxWk: maxWk || 0, so: so || 0 };
  }

  function normalize(room) {
    if (!room) return room;
    room.players = room.players || {};
    room.teams = room.teams || {};
    ['A', 'B'].forEach(function (t) {
      room.teams[t] = room.teams[t] || {};
      if (room.teams[t].name == null) room.teams[t].name = 'ടീം ' + t;
      if (room.teams[t].captain == null) room.teams[t].captain = '';
    });
    Object.keys(room.players).forEach(function (id) { var p = room.players[id]; if (p.team == null) p.team = ''; });
    var g = room.g;
    if (g) {
      g.order = g.order || {}; g.order.A = g.order.A || []; g.order.B = g.order.B || [];
      g.inn = g.inn || [];
      g.inn.forEach(function (x) {
        ['used', 'out', 'bs', 'bw'].forEach(function (k) { x[k] = x[k] || {}; });
        x.overBalls = x.overBalls || []; x.log = x.log || []; x.miss = x.miss || [];
        if (!x.maxBalls) x.maxBalls = OVERS * BALLS_PER_OVER;
        if (!x.maxWk) x.maxWk = (g.order[x.bat] || []).length || 1;
        x.so = x.so || 0;
        ['striker', 'non', 'bowler', 'prevBowler'].forEach(function (k) { if (x[k] == null) x[k] = ''; });
        ['runs', 'wkts', 'extras', 'balls'].forEach(function (k) { x[k] = x[k] || 0; });
      });
      g.pending = g.pending || [];
      if (g.q == null) g.q = -1;
      g.seq = g.seq || 0; g.evt = g.evt || 0; g.tries = g.tries || 0; g.wrongTried = g.wrongTried || [];
      if (g.chooser == null) g.chooser = '';
    }
    return room;
  }

  function cur(g) { return g.inn[g.innings - 1]; }
  function box(inn) {
    if (inn.boxQ && inn.boxQ.length) return inn.boxQ.slice();
    var over = Math.floor(inn.balls / BALLS_PER_OVER), out = [];
    for (var i = over * BALLS_PER_OVER; i < over * BALLS_PER_OVER + BALLS_PER_OVER; i++) out.push(i);
    return out;
  }
  function candidates(g, inn) {
    return g.order[inn.bat].filter(function (id) { return !inn.out[id] && id !== inn.striker && id !== inn.non; });
  }
  var ADMIN = function (room, by) { return by === 'solo' || by === room.host; };
  function nameOf(room, id) { return (room.players[id] || {}).name || ''; }
  function isCaptain(room, by, team) { return ADMIN(room, by) || room.teams[team].captain === by; }

  function startInnings(room) {
    var g = room.g, inn = cur(g);
    var batIds = g.order[inn.bat], bowlIds = g.order[inn.bowl];
    if (batIds.length === 1) { inn.striker = batIds[0]; inn.non = ''; }
    if (bowlIds.length === 1) inn.bowler = bowlIds[0];
    g.phase = 'openers'; g.q = -1; g.pending = []; g.chooser = '';
    checkOpeners(room);
  }
  function checkOpeners(room) {
    var g = room.g, inn = cur(g);
    var batSize = g.order[inn.bat].length;
    if (g.phase === 'openers' && inn.striker && (inn.non || batSize === 1) && inn.bowler) g.phase = 'select';
  }
  function advance(room) {
    var g = room.g;
    g.phase = g.pending.length ? g.pending[0] : 'select';
    var inn = cur(g);
    g.chooser = g.phase === 'nextBowler' ? inn.prevBowler : (g.phase === 'nextBatsman' ? g.chooserBat || '' : '');
  }

  var MAX_SUPER = 3;
  // Super over boxes: questions least used so far in this match (unused first).
  function superBoxes(room) {
    var g = room.g, n = SET_SIZE, cnt = [];
    for (var i = 0; i < n; i++) cnt.push({ i: i, c: 0 });
    g.inn.forEach(function (x) { Object.keys(x.used).forEach(function (k) { var qi = +k.slice(1); if (cnt[qi]) cnt[qi].c++; }); });
    cnt.sort(function (a, b) { return a.c - b.c || a.i - b.i; });
    var ids = cnt.map(function (x) { return x.i; });
    return [ids.slice(0, 6), ids.slice(6, 12)];
  }
  function endInnings(room) {
    var g = room.g, inn = cur(g);
    g.pending = []; g.q = -1; g.tries = 0; g.wrongTried = [];
    if (g.innings % 2 === 1) {
      // first innings of a pair (main match or super over)
      g.target = inn.runs + 1;
      g.innings++;
      var nx = inn.so ? newInnings(inn.bowl, inn.bat, BALLS_PER_OVER, Math.min(2, g.order[inn.bowl].length), inn.so)
                      : newInnings(inn.bowl, inn.bat, OVERS * BALLS_PER_OVER, g.order[inn.bowl].length, 0);
      if (inn.so) nx.boxQ = g.soBoxes[1];
      g.inn.push(nx);
      g.banner = { seq: g.evt, kind: inn.so ? 'so2' : 'innings' };
      startInnings(room);
      return;
    }
    var first = g.inn[g.innings - 2], second = inn, res;
    if (second.runs >= g.target) {
      res = { winner: second.bat, by: second.so ? 'super' : 'wkts', margin: second.maxWk - second.wkts };
    } else if (second.runs === g.target - 1) {
      var soNo = (second.so || 0) + 1;
      if (soNo <= MAX_SUPER) {
        // TIE -> super over. Team that batted second bats first in the super over.
        var bx = superBoxes(room);
        g.soBoxes = bx;
        var s1 = newInnings(second.bat, second.bowl, BALLS_PER_OVER, Math.min(2, g.order[second.bat].length), soNo);
        s1.boxQ = bx[0];
        g.inn.push(s1); g.innings++; g.target = 0;
        g.banner = { seq: g.evt, kind: 'super', n: soNo };
        startInnings(room);
        return;
      }
      res = { winner: '', by: 'tie', margin: 0 };
    } else {
      res = { winner: first.bat, by: first.so ? 'super' : 'runs', margin: g.target - 1 - second.runs };
    }
    g.result = res;
    g.phase = 'done';
    room.status = 'finished';
  }
  function inningsOver(g, inn) {
    return inn.wkts >= inn.maxWk || inn.balls >= inn.maxBalls || (g.innings % 2 === 0 && inn.runs >= g.target);
  }

  // kind: 'runs' | 'bowled' (wrong answer) | 'timeout' | 'extra' (bowler wrong)
  function finishBall(room, kind, runs, time, choice) {
    var g = room.g, inn = cur(g), st = inn.striker, bwId = inn.bowler;
    var wicket = kind === 'bowled' || kind === 'timeout';
    if (wicket) inn.miss.push({ q: g.q, who: st, kind: kind, ch: choice == null ? -1 : choice });
    inn.used['q' + g.q] = true;
    inn.balls++;
    var bs = inn.bs[st] = inn.bs[st] || { r: 0, b: 0 };
    var bw = inn.bw[bwId] = inn.bw[bwId] || { r: 0, w: 0, b: 0 };
    bw.b++;
    var sym;
    if (!wicket) { inn.runs += runs; bs.r += runs; bs.b++; bw.r += runs; sym = String(runs); }
    else { inn.wkts++; inn.out[st] = true; bs.b++; bw.w++; sym = 'W'; runs = 0; }
    inn.overBalls.push(sym); inn.log.push(sym);
    g.evt++;
    g.last = { id: g.evt, seq: g.seq, kind: kind, runs: runs, time: time == null ? -1 : Math.round(time * 100) / 100,
      batter: st, bowler: bwId, innings: g.innings, ball: inn.balls };
    g.q = -1; g.pend = null; g.tries = 0; g.wrongTried = [];

    var batSize = g.order[inn.bat].length;
    if (inningsOver(g, inn)) { endInnings(room); return; }
    var overEnd = inn.balls % BALLS_PER_OVER === 0;
    if (overEnd) inn.overBalls = [];
    g.pending = [];
    if (wicket) inn.striker = '';
    if (kind === 'runs' && (runs === 1 || runs === 3) && inn.non) { var t = inn.striker; inn.striker = inn.non; inn.non = t; }
    if (overEnd && inn.non) { var t2 = inn.striker; inn.striker = inn.non; inn.non = t2; }
    if (!inn.striker || (!inn.non && batSize > 1 && wicket)) {
      var c = candidates(g, inn);
      if (c.length === 0) {
        // last batsman bats alone
        if (!inn.striker) { inn.striker = inn.non; inn.non = ''; }
      } else if (c.length === 1) {
        if (!inn.striker) inn.striker = c[0]; else inn.non = c[0];
      } else {
        g.pending.push('nextBatsman'); g.chooserBat = st;
      }
    }
    if (overEnd) {
      inn.prevBowler = bwId;
      if (g.order[inn.bowl].length > 1) { inn.bowler = ''; g.pending.push('nextBowler'); }
    }
    advance(room);
  }

  // Bowler answered wrong: +1 extra, ball NOT counted, same question again.
  function bowlerExtra(room, choice) {
    var g = room.g, inn = cur(g), bwId = inn.bowler;
    var bw = inn.bw[bwId] = inn.bw[bwId] || { r: 0, w: 0, b: 0 };
    inn.runs += 1; inn.extras += 1; bw.r += 1;
    inn.overBalls.push('Ex'); inn.log.push('Ex');
    g.tries++;
    if (choice != null && choice >= 0 && g.wrongTried.indexOf(choice) < 0) g.wrongTried.push(choice);
    var m = null;
    for (var i = 0; i < inn.miss.length; i++) if (inn.miss[i].kind === 'extra' && inn.miss[i].q === g.q && inn.miss[i].who === bwId) m = inn.miss[i];
    if (m) m.n = (m.n || 1) + 1; else inn.miss.push({ q: g.q, who: bwId, kind: 'extra', ch: choice == null ? -1 : choice, n: 1 });
    g.evt++;
    g.last = { id: g.evt, seq: g.seq, kind: 'extra', runs: 1, time: -1, batter: inn.striker, bowler: bwId, innings: g.innings, ball: inn.balls, tries: g.tries };
    if (g.innings % 2 === 0 && inn.runs >= g.target) endInnings(room);
  }
  function isOnline(room, id) { var p = room.players[id]; return !!(p && p.online); }

  function reduce(roomIn, a, qs) {
    var room = normalize(clone(roomIn));
    var by = a.by, g = room.g, P = room.players;
    function err(m) { return { error: m }; }
    switch (a.type) {
      case 'join': {
        if (P[a.pid]) { P[a.pid].online = true; if (a.name) P[a.pid].name = a.name; if (a.th && !P[a.pid].th) P[a.pid].th = a.th; }
        else { P[a.pid] = { name: a.name || 'കളിക്കാരൻ', team: '', online: true, joinedAt: a.now || 0 }; if (a.th) P[a.pid].th = a.th; }
        return { room: room };
      }
      case 'team': {
        if (room.status !== 'lobby') return err('കളി തുടങ്ങിക്കഴിഞ്ഞു');
        var pid = a.pid || by;
        if (!P[pid]) return err('കളിക്കാരനെ കണ്ടില്ല');
        if (pid !== by && !ADMIN(room, by)) return err('അനുവാദമില്ല');
        var t = a.team === 'A' || a.team === 'B' ? a.team : '';
        if (t && P[pid].team !== t && teamIds(room, t).length >= MAX_TEAM) return err('ഈ ടീമിൽ 11 പേർ ആയി');
        var old = P[pid].team;
        P[pid].team = t;
        if (old && room.teams[old].captain === pid) { var rest = teamIds(room, old); room.teams[old].captain = rest[0] || ''; }
        if (t && !room.teams[t].captain) room.teams[t].captain = pid;
        return { room: room };
      }
      case 'captain': {
        if (!isCaptain(room, by, a.team)) return err('ക്യാപ്റ്റനോ ഹോസ്റ്റിനോ മാത്രം');
        if (!P[a.pid] || P[a.pid].team !== a.team) return err('ആ ടീമിലെ ആളല്ല');
        room.teams[a.team].captain = a.pid; return { room: room };
      }
      case 'teamName': {
        if (room.status !== 'lobby') return err('കളി തുടങ്ങിക്കഴിഞ്ഞു');
        if (!isCaptain(room, by, a.team)) return err('ക്യാപ്റ്റനോ ഹോസ്റ്റിനോ മാത്രം');
        var nm = String(a.name || '').trim().slice(0, 24);
        if (!nm) return err('പേര് നൽകുക');
        room.teams[a.team].name = nm; return { room: room };
      }
      case 'set': {
        if (!ADMIN(room, by)) return err('ഹോസ്റ്റിന് മാത്രം');
        if (room.status !== 'lobby') return err('കളി തുടങ്ങിക്കഴിഞ്ഞു');
        if (!setPlayable(qs, a.name)) return err('ഈ സെറ്റ് ഉടൻ വരുന്നു');
        room.set = a.name; return { room: room };
      }
      case 'firstBat': {
        if (!ADMIN(room, by)) return err('ഹോസ്റ്റിന് മാത്രം');
        room.firstBat = a.team === 'B' ? 'B' : 'A'; return { room: room };
      }
      case 'toss': {
        if (!ADMIN(room, by)) return err('ഹോസ്റ്റിന് മാത്രം');
        if (room.status !== 'lobby') return err('കളി തുടങ്ങിക്കഴിഞ്ഞു');
        if (!teamIds(room, 'A').length || !teamIds(room, 'B').length) return err('രണ്ട് ടീമിലും കുറഞ്ഞത് ഒരാൾ വേണം');
        if (room.toss && room.toss.winner && !room.toss.choice) return err('ടോസ് കഴിഞ്ഞു, തീരുമാനം കാത്തിരിക്കുന്നു');
        var heads = (+a.coin || 0) < 0.5;
        room.toss = { id: ((room.toss && room.toss.id) || 0) + 1, face: heads ? 'H' : 'T', winner: heads ? 'A' : 'B', choice: '' };
        return { room: room };
      }
      case 'tossChoice': {
        var ts = room.toss;
        if (!ts || !ts.winner || ts.choice) return err('ആദ്യം ടോസ് ചെയ്യുക');
        var cap = room.teams[ts.winner].captain;
        if (!(by === 'solo' || by === cap || (by === room.host && !isOnline(room, cap)))) return err('ടോസ് ജയിച്ച ക്യാപ്റ്റന് മാത്രം');
        if (a.choice !== 'bat' && a.choice !== 'bowl') return err('ബാറ്റ് / ബൗൾ തിരഞ്ഞെടുക്കുക');
        ts.choice = a.choice; room.firstBat = a.choice === 'bat' ? ts.winner : other(ts.winner);
        return { room: room };
      }
      case 'start': {
        if (!ADMIN(room, by)) return err('ഹോസ്റ്റിന് മാത്രം');
        if (room.status !== 'lobby') return err('കളി തുടങ്ങിക്കഴിഞ്ഞു');
        if (!setPlayable(qs, room.set)) return err('സെറ്റ് തിരഞ്ഞെടുക്കുക');
        var A = teamIds(room, 'A'), B = teamIds(room, 'B');
        if (!A.length || !B.length) return err('രണ്ട് ടീമിലും കുറഞ്ഞത് ഒരാൾ വേണം');
        ['A', 'B'].forEach(function (t) { if (!room.teams[t].captain || P[room.teams[t].captain].team !== t) room.teams[t].captain = teamIds(room, t)[0]; });
        if (!(room.toss && room.toss.choice)) return err('ആദ്യം ടോസ് നടത്തുക');
        var fb = room.firstBat || 'A', ord = { A: A, B: B };
        room.g = { innings: 1, order: ord, inn: [newInnings(fb, other(fb), OVERS * BALLS_PER_OVER, ord[fb].length, 0)], target: 0, seq: 0, evt: 0, tries: 0, wrongTried: [], q: -1, pending: [], chooser: '', set: room.set, limit: limitFor(room.set) };
        room.status = 'playing';
        startInnings(room);
        return { room: room };
      }
      case 'rematch': {
        if (!ADMIN(room, by)) return err('ഹോസ്റ്റിന് മാത്രം');
        room.status = 'lobby'; room.g = null; room.toss = null; return { room: room };
      }
    }
    // ---- in-game actions ----
    if (!g || room.status !== 'playing') return err('കളി നടക്കുന്നില്ല');
    var inn = cur(g), q = g.q >= 0 ? (qs[g.set] || [])[g.q] : null, L = g.limit || limitFor(g.set);
    switch (a.type) {
      case 'setBatters': {
        if (g.phase !== 'openers') return err('ഇപ്പോൾ പറ്റില്ല');
        if (!isCaptain(room, by, inn.bat)) return err('ബാറ്റിംഗ് ക്യാപ്റ്റന് മാത്രം');
        var ids = g.order[inn.bat];
        if (ids.indexOf(a.striker) < 0) return err('സ്ട്രൈക്കറെ തിരഞ്ഞെടുക്കുക');
        if (ids.length > 1 && (ids.indexOf(a.non) < 0 || a.non === a.striker)) return err('രണ്ടാമത്തെ ബാറ്റ്സ്മാനെ തിരഞ്ഞെടുക്കുക');
        inn.striker = a.striker; inn.non = ids.length > 1 ? a.non : '';
        checkOpeners(room); return { room: room };
      }
      case 'setBowler': {
        if (g.phase !== 'openers') return err('ഇപ്പോൾ പറ്റില്ല');
        if (!isCaptain(room, by, inn.bowl)) return err('ബൗളിംഗ് ക്യാപ്റ്റന് മാത്രം');
        if (g.order[inn.bowl].indexOf(a.pid) < 0) return err('ബൗളറെ തിരഞ്ഞെടുക്കുക');
        inn.bowler = a.pid; checkOpeners(room); return { room: room };
      }
      case 'pick': {
        if (g.phase !== 'select') return err('ഇപ്പോൾ ചോദ്യം എടുക്കാൻ പറ്റില്ല');
        if (by !== 'solo' && by !== inn.bowler) return err('ബൗളർക്ക് മാത്രം');
        var qi = +a.qi;
        if (box(inn).indexOf(qi) < 0 || inn.used['q' + qi]) return err('ഈ ചോദ്യം എടുക്കാൻ പറ്റില്ല');
        if (!(qs[g.set] || [])[qi]) return err('ചോദ്യം കണ്ടില്ല');
        g.q = qi; g.seq++; g.phase = 'bowlerAnswer'; return { room: room };
      }
      case 'bowlerAns': {
        if (g.phase !== 'bowlerAnswer') return err('ഇപ്പോൾ പറ്റില്ല');
        if (by !== 'solo' && by !== inn.bowler) return err('ബൗളർക്ക് മാത്രം');
        var ok = isMcq(q) ? (+a.choice === q.a) : !!a.ok;
        if (ok) { g.phase = 'bat'; g.deliveredAt = a.now || 0; return { room: room }; }
        bowlerExtra(room, isMcq(q) ? +a.choice : null); return { room: room };
      }
      case 'batAns': {
        if (g.phase !== 'bat') return err('ഇപ്പോൾ പറ്റില്ല');
        if (a.seq != null && a.seq !== g.seq) return err('ഈ പന്ത് കഴിഞ്ഞു');
        if (by !== 'solo' && by !== inn.striker) return err('സ്ട്രൈക്കർക്ക് മാത്രം');
        var tm = Math.max(0, +a.time || 0);
        if (!(tm <= L)) { finishBall(room, 'timeout', 0, tm); return { room: room }; }
        if (isMcq(q)) {
          if (+a.choice === q.a) finishBall(room, 'runs', runsFor(tm, L), tm);
          else finishBall(room, 'bowled', 0, tm, +a.choice);
        } else {
          g.pend = { text: String(a.text || '').slice(0, 2000), time: tm }; g.phase = 'judge';
        }
        return { room: room };
      }
      case 'timeout': {
        if (g.phase !== 'bat' || a.seq !== g.seq) return err('ഈ പന്ത് കഴിഞ്ഞു');
        finishBall(room, 'timeout', 0, L + 0.01); return { room: room };
      }
      case 'judge': {
        if (g.phase !== 'judge') return err('ഇപ്പോൾ പറ്റില്ല');
        if (by !== inn.bowler && !isCaptain(room, by, inn.bowl)) return err('ബൗളർക്ക് മാത്രം');
        var t3 = (g.pend && g.pend.time) || 0;
        if (a.ok) { var r = runsFor(t3, L); if (r < 0) finishBall(room, 'timeout', 0, t3); else finishBall(room, 'runs', r, t3); }
        else finishBall(room, 'bowled', 0, t3);
        return { room: room };
      }
      case 'nextBatsman': {
        if (g.phase !== 'nextBatsman') return err('ഇപ്പോൾ പറ്റില്ല');
        if (by !== g.chooser && !isCaptain(room, by, inn.bat)) return err('ഔട്ടായ ബാറ്റ്സ്മാനോ ക്യാപ്റ്റനോ മാത്രം');
        if (candidates(g, inn).indexOf(a.pid) < 0) return err('ആളെ തിരഞ്ഞെടുക്കുക');
        if (!inn.striker) inn.striker = a.pid; else inn.non = a.pid;
        g.pending.shift(); advance(room); return { room: room };
      }
      case 'replace': {
        // captain/host replaces an OFFLINE bowler or batsman
        var slot = a.slot, curId = slot === 'bowler' ? inn.bowler : slot === 'striker' ? inn.striker : slot === 'non' ? inn.non : null;
        if (!curId) return err('ആരും ഇല്ല');
        var team = slot === 'bowler' ? inn.bowl : inn.bat;
        if (!isCaptain(room, by, team)) return err('ക്യാപ്റ്റനോ ഹോസ്റ്റിനോ മാത്രം');
        if (by !== 'solo' && isOnline(room, curId)) return err(nameOf(room, curId) + ' ഓൺലൈൻ ആണ്');
        if (slot === 'bowler') {
          if (['select', 'bowlerAnswer', 'judge'].indexOf(g.phase) < 0) return err('ഇപ്പോൾ പറ്റില്ല');
          if (g.order[inn.bowl].indexOf(a.pid) < 0 || a.pid === curId) return err('ബൗളറെ തിരഞ്ഞെടുക്കുക');
          inn.bowler = a.pid;
        } else {
          if (['select', 'bowlerAnswer', 'openers'].indexOf(g.phase) < 0) return err('ഈ പന്ത് കഴിഞ്ഞ ശേഷം മാറ്റാം');
          if (candidates(g, inn).indexOf(a.pid) < 0) return err('ആളെ തിരഞ്ഞെടുക്കുക');
          inn[slot] = a.pid;
        }
        return { room: room };
      }
      case 'nextBowler': {
        if (g.phase !== 'nextBowler') return err('ഇപ്പോൾ പറ്റില്ല');
        if (by !== inn.prevBowler && !isCaptain(room, by, inn.bowl)) return err('കഴിഞ്ഞ ബൗളറോ ക്യാപ്റ്റനോ മാത്രം');
        var bids = g.order[inn.bowl];
        if (bids.indexOf(a.pid) < 0) return err('ബൗളറെ തിരഞ്ഞെടുക്കുക');
        if (bids.length > 1 && a.pid === inn.prevBowler) return err('തുടർച്ചയായി രണ്ട് ഓവർ പറ്റില്ല');
        inn.bowler = a.pid; g.pending.shift(); advance(room); return { room: room };
      }
    }
    return err('അറിയാത്ത നടപടി');
  }

  var Engine = { BALLS_PER_OVER: BALLS_PER_OVER, OVERS: OVERS, SET_SIZE: SET_SIZE, MAX_TEAM: MAX_TEAM, SET_TYPES: SET_TYPES,
    setType: setType, limitFor: limitFor, runsFor: runsFor, bands: bands, isMcq: isMcq, listSets: listSets,
    setPlayable: setPlayable, newRoom: newRoom, normalize: normalize, reduce: reduce, teamIds: teamIds, box: box,
    candidates: candidates, cur: cur, other: other, isCaptain: isCaptain, MAX_SUPER: MAX_SUPER };
  if (typeof module !== 'undefined' && module.exports) module.exports = Engine; else root.Engine = Engine;
})(this);
