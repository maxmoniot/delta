/* Delta — le monde « La mélodie » (demande de Max, 26/10/2026) : écouter quelques notes, les rejouer sur un
   clavier d'un octave.
   ÉCOUTE : la mélodie, jouée par un instrument tiré au hasard ; à chaque note, la scène s'anime (une case
   s'allume, un cadre s'ouvre, des éclats jaillissent) sans jamais trahir la hauteur. UNE SEULE écoute : aucun
   bouton pour la réécouter (demande de Max du 04/11/2026, « sinon c'est trop facile »).
   À TOI : on essaie les touches autant qu'on veut — chaque appui sonne et jaillit à l'écran —, puis on valide
   la note ; la suivante, etc. Juste ou fausse, une note validée a le même air : rien ne se trahit avant la
   dernière (demande de Max du 27/10/2026).
   RÉVÉLATION : la partition (la vraie mélodie pleine, la tienne en creux), puis la vraie est rejouée, suivie de
   la tienne, un peu plus vite que l'écoute (demande de Max du 27/10/2026).
   PARTIE : 5 mélodies de 5 notes. SURVIE : 3 notes, une de plus à chaque manche ; une fausse note = une vie,
   comptée à la révélation.
   Noir et blanc, comme l'oreille. */
(function (root) {
  'use strict';
  var M, S, fx, C;
  var $ = function (id) { return document.getElementById(id); };

  var ROUNDS = 5, HOLD = 0.45, LEAD = 700, FAST = 0.75;   // FAST : tempo de la révélation (écart × 0,75)
  var g = null, raf = 0, timers = [];
  var stage = null, kb = null, SW = 0, SH = 0, KW = 0, KH = 0;
  var anim = [], press = {}, sources = [], cache = {}, cacheInst = '';

  function later(fn, ms) { var t = setTimeout(fn, ms); timers.push(t); return t; }
  function clearAll() { timers.forEach(clearTimeout); timers = []; stopAll(); }
  function css(v) { return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); }
  function gapOf(n) { return Math.max(0.36, 0.52 - 0.02 * Math.max(0, n - 5)); }   // la survie accélère un peu

  /* ---------- le son : des échantillons calculés une fois par instrument ---------- */

  function ac() { return fx.ctx(); }
  function buffer(k) {
    var a = ac(); if (!a || !g) return null;
    if (cacheInst !== g.inst.id) { cache = {}; cacheInst = g.inst.id; }
    if (!cache[k]) {
      var x = M.render(g.inst, k, a.sampleRate, HOLD), b = a.createBuffer(1, x.length, a.sampleRate);
      b.getChannelData(0).set(x);
      cache[k] = b;
    }
    return cache[k];
  }
  function play(k, at) {
    var a = ac(), b = buffer(k); if (!a || !b) return;
    var s = a.createBufferSource(), gn = a.createGain();
    s.buffer = b; gn.gain.value = 0.9;
    s.connect(gn); gn.connect(a.destination);
    s.start(a.currentTime + (at || 0));
    var v = { s: s, g: gn };
    sources.push(v);
    s.onended = function () { var i = sources.indexOf(v); if (i >= 0) sources.splice(i, 1); };
  }
  function stopAll() {
    var a = fx.ctx && ac(); if (!a) { sources = []; return; }
    sources.forEach(function (v) {
      try { v.g.gain.setTargetAtTime(0, a.currentTime, 0.02); v.s.stop(a.currentTime + 0.12); } catch (e) {}
    });
    sources = [];
  }
  // le reste du clavier se calcule en tâche de fond, une touche à la fois
  function warm() {
    if (!g) return;
    for (var k = 0; k < M.KEYS; k++) if (!cache[k] || cacheInst !== g.inst.id) { buffer(k); later(warm, 40); return; }
  }

  // Une suite de notes calée sur l'horloge audio ; l'image suit au même rythme. who : 'target' ou 'picks'
  function playSeq(notes, then, quiet, who) {
    if (!g) return;
    g.busy = true; g.who = who || 'target';
    var gap = gapOf(g.target.length) * (g.phase === 'reveal' ? FAST : 1), t0 = 0.12;
    notes.forEach(function (k) { buffer(k); });
    notes.forEach(function (k, i) {
      play(k, t0 + i * gap);
      later(function () { if (g) noteFx(i, k, quiet); }, (t0 + i * gap) * 1000);
    });
    later(function () {
      if (!g) return;
      g.busy = false; g.playing = -1;
      if (then) then();
    }, (t0 + notes.length * gap) * 1000 + 300);
  }

  /* ---------- la scène ---------- */

  function fitC(cv) {
    var dpr = root.devicePixelRatio || 1, r = cv.getBoundingClientRect();
    var w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    var x = cv.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { x: x, w: r.width, h: r.height };
  }

  // La rangée de cases (une par note), en bas de la scène
  function slotGeo(n) {
    var s = Math.max(14, Math.min(32, (SW - 40) / n - 8)), gap = Math.min(10, s * 0.35), tw = n * s + (n - 1) * gap;
    return { s: s, gap: gap, x0: (SW - tw) / 2, y: Math.round(SH * 0.56 - s / 2) };
  }
  function slotCenter(i) { var q = slotGeo(g.target.length); return [q.x0 + i * (q.s + q.gap) + q.s / 2, q.y + q.s / 2]; }

  // À chaque note de la mélodie : sa case s'allume, un cadre s'ouvre, des éclats jaillissent (rien sur la hauteur)
  function noteFx(i, k, quiet) {
    var now = performance.now();
    g.playing = i; g.pop[i] = now;
    if (quiet) press[k] = now;                       // révélation : la touche s'enfonce, la hauteur peut se voir
    var c = g.phase === 'reveal' ? rollAt(i, k) : slotCenter(i), col = g.pal.col(i);   // la couleur suit le rang de la note, jamais sa hauteur
    anim.push({ ring: 1, x: c[0], y: c[1], t0: now, max: Math.max(SW, SH) * (g.phase === 'reveal' ? 0.35 : 0.9), col: col });
    for (var j = 0; j < 26; j++) {
      var a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2, sp = 2 + Math.random() * 5;
      anim.push({ x: c[0], y: c[1], vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1, d: 0.012 + Math.random() * 0.018, s: 2 + Math.random() * 4,
        col: Math.random() < 0.7 ? col : g.pal.col(i + 1) });
    }
  }
  // À chaque essai : la touche s'enfonce et une colonne d'éclats monte de la touche
  function keyFx(k) {
    var now = performance.now(), r = keyRect(k), cx = r.x + r.w / 2, col = g.pal.mix(k / 12);
    press[k] = now;
    for (var j = 0; j < 18; j++) {
      anim.push({ x: cx + (Math.random() - 0.5) * r.w * 0.7, y: SH + 2, vx: (Math.random() - 0.5) * 1.2, vy: -(3 + Math.random() * 6), life: 1, d: 0.014 + Math.random() * 0.016, s: 2 + Math.random() * 4.5, col: col });
    }
    anim.push({ ring: 1, x: cx, y: SH - 1, t0: now, max: Math.min(SW, SH) * 0.6, col: col });
  }

  function drawStage(now) {
    var f = fitC(stage), x = f.x, ink = css('--ink');
    SW = f.w; SH = f.h;
    x.fillStyle = css('--raise'); x.fillRect(0, 0, SW, SH);
    if (g.phase === 'reveal') drawRoll(x, ink, now); else drawSlots(x, ink, now);
    drawAnim(x, ink, now);
  }
  function drawSlots(x, ink, now) {
    var n = g.target.length, q = slotGeo(n), idx = g.picks.length;
    for (var i = 0; i < n; i++) {
      var X = q.x0 + i * (q.s + q.gap), pop = g.pop[i] ? Math.max(0, 1 - (now - g.pop[i]) / 420) : 0;
      var s = q.s * (1 + 0.35 * pop), Xc = X + q.s / 2, Yc = q.y + q.s / 2;
      x.lineWidth = 1.5; x.strokeStyle = ink; x.fillStyle = ink;
      if (i < idx) {                                   // note validée : pleine, juste ou fausse (verdict à la fin)
        x.globalAlpha = 1; x.fillRect(Xc - s / 2, Yc - s / 2, s, s);
      } else if (g.phase === 'pick' && i === idx && !g.busy) {   // la note à trouver
        var pulse = 0.5 + 0.5 * Math.sin(now / 240);
        x.globalAlpha = 0.6 + 0.4 * pulse; x.lineWidth = 2; x.strokeRect(Xc - s / 2 + 1, Yc - s / 2 + 1, s - 2, s - 2);
        if (g.cand !== null) { x.globalAlpha = 0.55; x.fillRect(Xc - s / 4, Yc - s / 4, s / 2, s / 2); }
      } else {
        x.globalAlpha = pop ? 0.35 + 0.65 * pop : 0.3;
        if (pop) x.fillRect(Xc - s / 2, Yc - s / 2, s, s); else x.strokeRect(Xc - s / 2 + 0.75, Yc - s / 2 + 0.75, s - 1.5, s - 1.5);
      }
    }
    x.globalAlpha = 1;
  }
  // La partition : 13 lignes (une par touche, les noires sur fond grisé), une colonne par note
  function rollGeo() {
    var n = g.target.length, top = 40, bot = 34, rows = M.KEYS, cw = Math.min(46, (SW - 40) / n);
    return { n: n, top: top, rows: rows, cw: cw, ch: (SH - top - bot) / rows, x0: (SW - cw * n) / 2 };
  }
  function rollAt(i, k) { var q = rollGeo(); return [q.x0 + i * q.cw + q.cw / 2, q.top + (q.rows - 1 - k) * q.ch + q.ch / 2]; }
  function drawRoll(x, ink, now) {
    var q = rollGeo(), n = q.n, top = q.top, rows = q.rows, cw = q.cw, ch = q.ch, x0 = q.x0;
    var cy = function (k) { return top + (rows - 1 - k) * ch + ch / 2; }, cx = function (i) { return x0 + i * cw + cw / 2; };
    x.fillStyle = ink;
    for (var k = 0; k < rows; k++) if (M.isBlack(k)) { x.globalAlpha = 0.06; x.fillRect(x0 - 8, cy(k) - ch / 2, cw * n + 16, ch); }
    if (g.playing >= 0) { x.globalAlpha = 0.1; x.fillRect(x0 + g.playing * cw, top, cw, rows * ch); }
    x.globalAlpha = 0.4; x.strokeStyle = ink; x.lineWidth = 1.5;
    x.beginPath(); g.target.forEach(function (t, i) { if (i) x.lineTo(cx(i), cy(t)); else x.moveTo(cx(i), cy(t)); }); x.stroke();
    var bw = Math.min(cw * 0.62, 26), bh = Math.max(5, Math.min(ch * 0.82, 16));
    g.target.forEach(function (t, i) {
      x.globalAlpha = 1; x.fillStyle = ink; x.fillRect(cx(i) - bw / 2, cy(t) - bh / 2, bw, bh);
      var p = g.picks[i];
      if (p === undefined) return;
      if (p === t) { x.strokeStyle = css('--raise'); x.lineWidth = 1.5; x.strokeRect(cx(i) - bw / 2 + 3, cy(t) - bh / 2 + 3, bw - 6, bh - 6); }
      else { x.strokeStyle = ink; x.lineWidth = 2; x.strokeRect(cx(i) - bw / 2 + 1, cy(p) - bh / 2 + 1, bw - 2, bh - 2); }
    });
    x.globalAlpha = 1;
    x.font = '400 10px Mono, monospace'; x.fillStyle = css('--ink-2'); x.textBaseline = 'bottom'; x.textAlign = 'center';
    x.fillText(!g.busy || g.playing < 0 ? 'PLEIN : LA MÉLODIE · CREUX : TOI' : g.who === 'picks' ? 'ON ÉCOUTE : TOI (CREUX)' : 'ON ÉCOUTE : LA MÉLODIE (PLEIN)', SW / 2, SH - 10);
    x.textAlign = 'left';
  }
  function drawAnim(x, ink, now) {
    for (var i = anim.length - 1; i >= 0; i--) {
      var q = anim[i];
      x.fillStyle = x.strokeStyle = q.col || ink;
      if (q.ring) {
        var e = (now - q.t0) / 900;
        if (e >= 1) { anim.splice(i, 1); continue; }
        var s = 10 + q.max * (1 - Math.pow(1 - e, 3));
        x.globalAlpha = (1 - e) * 0.7; x.lineWidth = 2 * (1 - e) + 0.5;
        x.strokeRect(q.x - s / 2, q.y - s / 2, s, s);
        continue;
      }
      q.vx *= 0.97; q.vy = q.vy * 0.97 + 0.03; q.x += q.vx; q.y += q.vy; q.life -= q.d;
      if (q.life <= 0) { anim.splice(i, 1); continue; }
      x.globalAlpha = Math.min(1, q.life * 1.3);
      var sz = q.s * (0.5 + q.life * 0.5);
      x.fillRect(q.x - sz / 2, q.y - sz / 2, sz, sz);
    }
    x.globalAlpha = 1;
  }

  /* ---------- le clavier ---------- */

  function keyGeo() {
    var ww = KW / 8, bw = ww * 0.58, bh = KH * 0.6;
    return { ww: ww, bw: bw, bh: bh };
  }
  // Rectangle d'une touche dans le repère du clavier
  function keyRect(k) {
    var q = keyGeo(), j;
    if (!M.isBlack(k)) { j = M.WHITE.indexOf(k); return { x: j * q.ww + 1, y: 0, w: q.ww - 2, h: KH }; }
    j = M.WHITE.indexOf(k - 1);
    return { x: (j + 1) * q.ww - q.bw / 2, y: 0, w: q.bw, h: q.bh };
  }
  function keyAt(px, py) {
    if (px < 0 || px > KW || py < 0 || py > KH) return null;
    for (var b = 0; b < 5; b++) {
      var k = [1, 3, 6, 8, 10][b], r = keyRect(k);
      if (px >= r.x && px <= r.x + r.w && py <= r.h) return k;
    }
    return M.WHITE[Math.max(0, Math.min(7, Math.floor(px / keyGeo().ww)))];
  }
  function drawKeys(now) {
    var f = fitC(kb), x = f.x;
    KW = f.w; KH = f.h;
    x.clearRect(0, 0, KW, KH);
    var paper = css('--paper'), pink = css('--paper-ink'), ink = css('--ink');
    function one(k) {
      var r = keyRect(k), black = M.isBlack(k), dn = press[k] ? Math.max(0, 1 - (now - press[k]) / 260) : 0;
      var off = dn * 3;
      x.fillStyle = black ? (dn ? '#3d3d3d' : pink) : (dn ? '#bdbdbd' : paper);
      x.fillRect(r.x, r.y + off, r.w, r.h - off);
      if (!black) { x.fillStyle = 'rgba(0,0,0,.12)'; x.fillRect(r.x, r.h - 6, r.w, 6); }
      if (g.phase === 'pick' && g.cand === k) {         // la note retenue, prête à valider
        var m = Math.min(14, r.w * 0.45);
        x.fillStyle = black ? paper : pink;
        x.fillRect(r.x + r.w / 2 - m / 2, r.h - m - (black ? 8 : 14), m, m);
      }
    }
    M.WHITE.forEach(one);
    [1, 3, 6, 8, 10].forEach(one);
    if (g.phase === 'listen' || g.phase === 'idle' || (g.phase === 'pick' && g.busy)) { x.fillStyle = css('--bg'); x.globalAlpha = 0.45; x.fillRect(0, 0, KW, KH); x.globalAlpha = 1; }
    x.strokeStyle = ink; x.globalAlpha = 0.25; x.lineWidth = 1; x.strokeRect(0.5, 0.5, KW - 1, KH - 1); x.globalAlpha = 1;
  }

  function loop(now) {
    if (root.NC.ui.current() !== 'tune' || !g) { raf = 0; return; }
    // on reprogramme AVANT de dessiner : une image ratée ne doit jamais figer l'écran (bug du 26/10 sur le Pixel 6)
    raf = requestAnimationFrame(loop);
    drawStage(now); drawKeys(now);
  }

  /* ---------- les gestes ---------- */

  function onKey(e) {
    if (!g) return;
    e.preventDefault();
    var r = kb.getBoundingClientRect(), k = keyAt(e.clientX - r.left, e.clientY - r.top);
    if (k !== null) pressKey(k);
  }
  // Essayer une note : elle sonne, la touche jaillit, elle devient la note retenue
  function pressKey(k) {
    if (!g || g.busy) return;
    if (g.phase === 'reveal') { play(k); keyFx(k); fx.haptic('tick'); return; }
    if (g.phase !== 'pick') return;
    play(k);
    keyFx(k);
    fx.haptic('tick');
    g.cand = k;
    go('Valider la note', false);
    $('tune-sub').textContent = 'Essaie encore, ou valide';
  }

  function onGo() {
    if (!g) return;
    if (g.phase === 'pick' && !g.busy && g.cand !== null) return validate();
    if (g.phase === 'reveal') { fx.haptic('tick'); clearAll(); g.busy = false; return nextRound(); }   // coupe aussi la révélation en cours
  }
  // Révélation : la mélodie demandée, puis la tienne, au tempo FAST (busy tenu pendant la pause entre les deux)
  function replayBoth() {
    playSeq(g.target, function () {
      if (!g || g.phase !== 'reveal') return;
      g.busy = true;
      later(function () { if (g && g.phase === 'reveal') playSeq(g.picks, null, true, 'picks'); }, 300);
    }, true, 'target');
  }

  // Valider : juste ou fausse, la note a la même case, la même vibration ; le verdict attend la révélation
  function validate() {
    var i = g.picks.length;
    g.picks.push(g.cand); g.cand = null;
    g.pop[i] = performance.now();
    fx.haptic('double');
    go('Valider la note', true);
    if (g.picks.length >= g.target.length) { later(reveal, 380); return; }
    pickLabel();
  }

  /* ---------- déroulé ---------- */

  function init() {
    M = root.NC.melodie; S = root.NC.store; fx = root.NC.fx; C = root.NC.color;
    stage = $('stage'); kb = $('clavier');
    kb.addEventListener('pointerdown', onKey);
    $('tune-go').addEventListener('click', onGo);
    $('tune-quit').addEventListener('click', abort);
  }

  function start(mode) {
    clearAll();
    var rand = C.rng((Math.random() * 4294967296) >>> 0), order = M.INSTRUMENTS.slice();
    for (var i = order.length - 1; i > 0; i--) { var j = Math.floor(rand() * (i + 1)), t = order[i]; order[i] = order[j]; order[j] = t; }
    g = { mode: mode, rand: rand, order: order, i: -1, rounds: [], total: 0, lives: 3, cleared: 0, phase: 'idle', target: [], picks: [], pop: {}, cand: null, busy: false, playing: -1, who: 'target' };
    anim = []; press = {};
    $('tune-total').textContent = '0';
    root.NC.ui.show('tune');
    cancelAnimationFrame(raf); raf = requestAnimationFrame(loop);
    later(nextRound, 150);
  }

  function nextRound() {
    if (!g) return;
    var surv = g.mode === 'melodie-survie';
    if (surv ? g.lives <= 0 : g.i + 1 >= ROUNDS) return finish();
    g.i++;
    var n = surv ? 3 + g.i : 5;
    g.target = M.melody(g.rand, n, g.i >= 3);
    g.inst = g.order[g.i % g.order.length];
    g.picks = []; g.pop = {}; g.cand = null; g.playing = -1; g.phase = 'listen';
    g.pal = root.NC.palette.tirer();      // une palette harmonieuse par mélodie (demande de Max, 29/10)
    anim = []; press = {};
    $('tune-inst').textContent = g.inst.name;
    label(pad2(g.i + 1), '', 'Écoute', g.inst.name + ' · ' + n + ' notes');
    go('Valider la note', true);
    renderProgress();
    fx.haptic('click');
    g.busy = true;
    later(function () {
      if (!g || g.phase !== 'listen') return;
      playSeq(g.target, function () {
        if (!g || g.phase !== 'listen') return;
        g.phase = 'pick';
        pickLabel();
        warm();
      }, false);
    }, LEAD);
  }

  function pickLabel() {
    var i = g.picks.length, n = g.target.length;
    label(String(i + 1), '/' + n, 'À toi · note ' + (i + 1), 'Touche pour essayer, puis valide');
  }

  function reveal() {
    if (!g || g.phase === 'reveal') return;
    var surv = g.mode === 'melodie-survie', cmp = M.compare(g.target, g.picks);
    if (surv && cmp.exact < cmp.n) {                 // survie : une vie par fausse note, comptée maintenant
      g.lives = Math.max(0, g.lives - (cmp.n - cmp.exact));
      fx.sfx.lifeLost(); fx.haptic('fall');
      renderProgress();
    }
    var kept = !surv || g.lives > 0;
    if (surv && kept) g.cleared++;
    var round = { target: g.target.slice(), picks: g.picks.slice(), inst: g.inst.id, instName: g.inst.name, score: cmp.pct, pts: cmp.score, n: cmp.n, exact: cmp.exact, kept: kept };
    g.rounds.push(round);
    g.total += cmp.score;
    g.phase = 'reveal'; g.cand = null; g.playing = -1;
    var last = surv ? g.lives <= 0 : g.i === ROUNDS - 1, sc = round.score;
    go(last ? 'Voir le bilan' : 'Suivant', true);
    label('0', '/100', C.verdict(sc), '');
    $('tune-ttl').className = 'ttl big';
    var t0 = performance.now(), dur = 380 + sc * 5;
    (function frame(now) {
      if (!g || g.phase !== 'reveal') return;
      var k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      $('tune-num').textContent = Math.round(sc * e);
      if (k < 1) { requestAnimationFrame(frame); return; }
      $('tune-total').textContent = g.total;
      $('tune-sub').className = 'sub prose';
      $('tune-sub').textContent = (surv ? (kept ? 'Manche tenue · ' : 'Plus de vie · ') : '') + M.tuneHint(cmp);
      renderProgress();
      fx.haptic(sc >= 90 ? 'rise' : sc >= 60 ? 'double' : 'heavy');
      later(function () { if (g && g.phase === 'reveal') go(last ? 'Voir le bilan' : 'Suivant', false); }, 250);
      later(function () { if (g && g.phase === 'reveal' && !g.busy) replayBoth(); }, 450);   // la vraie, puis la tienne
    })(t0);
  }

  function finish() {
    clearAll();
    var game = { mode: g.mode, rounds: g.rounds, total: g.total, cleared: g.cleared };
    var res = S.record(game);
    g = null;
    root.NC.ui.showResult(game, res);
  }

  function abort() {
    clearAll();
    g = null; anim = []; press = {};
    root.NC.ui.show('home');
  }

  /* ---------- affichage ---------- */

  function label(num, unit, ttl, sub) {
    $('tune-num').textContent = num; $('tune-unit').textContent = unit;
    $('tune-ttl').textContent = ttl; $('tune-ttl').className = 'ttl';
    $('tune-sub').textContent = sub; $('tune-sub').className = 'sub';
  }
  function go(txt, disabled) { $('tune-go-txt').textContent = txt; $('tune-go').disabled = !!disabled; }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function renderProgress() {
    var h = '';
    if (g.mode === 'melodie-survie') {
      for (var i = 0; i < 3; i++) h += '<i class="' + (i < g.lives ? 'life' : 'lost') + '"></i>';
      h += '<span class="round">manche ' + (g.i + 1) + '</span>';
    } else for (var j = 0; j < ROUNDS; j++) h += '<i class="' + (g.rounds[j] ? 'life' : j === g.i ? 'now' : '') + '"></i>';
    $('tune-progress').innerHTML = h;
  }

  root.NC = root.NC || {};
  root.NC.tune = {
    init: init, start: start, abort: abort, press: pressKey,
    keyRect: keyRect, keyAt: keyAt, anim: function () { return anim; },
    get state() { return g; },
    get palette() { return g && g.pal; }
  };
})(this);
