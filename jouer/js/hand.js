/* Delta — le monde « La main » (Δx) : deux jeux sur une toile de papier millimétré (demande de Max, 26/10/2026).
   LE MOUVEMENT : un rond fait un trajet, une seule fois ; on l'attrape et on refait le même trajet, au même
   rythme. Au lever du doigt, les deux trajets sont superposés et rejoués côte à côte.
   LA FORME : une forme posée, trois secondes ; elle est déplacée, tournée, redimensionnée ; on la replace —
   un doigt la déplace, deux doigts la tournent et l'agrandissent (autour du point entre les doigts).
   Noir et blanc, comme l'oreille : ici tout est geste. Les erreurs se disent en millimètres. */
(function (root) {
  'use strict';
  var G, S, fx, C;
  var $ = function (id) { return document.getElementById(id); };

  var ROUNDS = 5, MEMO_MS = 3000, GRAB = 52, DOT = 13;
  var g = null, raf = 0, timers = [];
  var cv = null, W = 0, H = 0;
  var fingers = {}, base = null;           // forme : doigts posés et référence du geste en cours

  function later(fn, ms) { var t = setTimeout(fn, ms); timers.push(t); return t; }
  function clearAll() { timers.forEach(clearTimeout); timers = []; }
  function css(v) { return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); }

  /* ---------- la toile ---------- */

  function fit() {
    var dpr = root.devicePixelRatio || 1, r = cv.getBoundingClientRect();
    var w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    W = r.width; H = r.height;
    var x = cv.getContext('2d');
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    return x;
  }

  // Papier millimétré : un trait fin tous les 2 mm, un trait marqué tous les centimètres
  function paper(x, w, h, ink) {
    x.fillStyle = css('--raise'); x.fillRect(0, 0, w, h);
    x.fillStyle = ink;
    var step = 12.5;
    for (var i = 0, X = 0; X <= w; i++, X = i * step) { x.globalAlpha = i % 5 === 0 ? 0.13 : 0.05; x.fillRect(Math.round(X), 0, 1, h); }
    for (var j = 0, Y = 0; Y <= h; j++, Y = j * step) { x.globalAlpha = j % 5 === 0 ? 0.13 : 0.05; x.fillRect(0, Math.round(Y), w, 1); }
    x.globalAlpha = 1;
  }
  function dot(x, px, py, ink, hollow) {
    x.beginPath(); x.arc(px, py, DOT, 0, Math.PI * 2);
    if (hollow) { x.lineWidth = 3; x.strokeStyle = ink; x.stroke(); }
    else { x.fillStyle = ink; x.fill(); x.lineWidth = 2; x.strokeStyle = css('--raise'); x.stroke(); }
  }
  function poly(x, pts) {
    x.beginPath();
    pts.forEach(function (p, i) { if (i) x.lineTo(p[0], p[1]); else x.moveTo(p[0], p[1]); });
    x.closePath();
  }
  function line(x, pts) {
    x.beginPath();
    pts.forEach(function (p, i) { if (i) x.lineTo(p[0], p[1]); else x.moveTo(p[0], p[1]); });
  }
  function scaled(u) { var q = G.at(g.path, u); return [q[0] * W, q[1] * H]; }

  function draw(now) {
    if (!g || !cv) return;
    var x = fit(), ink = css('--ink');
    paper(x, W, H, ink);
    if (g.mode === 'geste') drawGeste(x, ink, now); else drawForme(x, ink, now);
  }

  function drawGeste(x, ink, now) {
    x.lineCap = 'round'; x.lineJoin = 'round';
    if (g.phase === 'watch') {
      var u = g.t0 ? Math.min(1, (now - g.t0) / (g.path.dur * 1000)) : 0;
      var p = scaled(u);
      g.dot = { x: p[0], y: p[1] };
      if (g.t0) {
        // traîne : les 350 dernières ms du trajet, de plus en plus pâles, en dégradé dans la palette du trajet
        var n = 18, span = 350 / (g.path.dur * 1000);
        for (var k = n; k > 0; k--) {
          var a = scaled(Math.max(0, u - span * k / n)), b = scaled(Math.max(0, u - span * (k - 1) / n));
          x.globalAlpha = (1 - k / n) * 0.8; x.lineWidth = DOT * 1.3 * (1 - k / n) + 1; x.strokeStyle = g.pal.mix(1 - k / n);
          line(x, [a, b]); x.stroke();
        }
        x.globalAlpha = 1;
      }
      var fade = g.fadeAt ? Math.max(0, 1 - (now - g.fadeAt) / 260) : 1;
      x.globalAlpha = fade; dot(x, p[0], p[1], ink); x.globalAlpha = 1;
    } else if (g.phase === 'trace') {
      if (g.trace.length) {
        // ton tracé, dans la même palette (en tronçons qui se chevauchent d'un point : pas de jour entre eux ;
        // opaques, sinon chaque raccord fait un point plus foncé)
        var tr = g.trace, ch = Math.max(2, Math.ceil(tr.length / 12));
        x.globalAlpha = 1; x.lineWidth = 3.5;
        for (var c0 = 0; c0 < tr.length - 1; c0 += ch) {
          x.strokeStyle = g.pal.mix(c0 / Math.max(1, tr.length - 1));
          line(x, tr.slice(c0, c0 + ch + 1).map(function (q) { return [q.x, q.y]; })); x.stroke();
        }
        x.globalAlpha = 1;
        var last = g.trace[g.trace.length - 1];
        dot(x, last.x, last.y, ink);
      } else {
        var s = scaled(0), pulse = 0.5 + 0.5 * Math.sin(now / 260);
        x.globalAlpha = 0.25 + 0.3 * pulse; x.lineWidth = 2; x.strokeStyle = ink;
        x.beginPath(); x.arc(s[0], s[1], DOT + 8 + 5 * pulse, 0, Math.PI * 2); x.stroke(); x.globalAlpha = 1;
        dot(x, s[0], s[1], ink);
        g.dot = { x: s[0], y: s[1] };
      }
    } else if (g.phase === 'reveal') {
      var pts = [];
      if (g.path.sharp) g.path.pts.forEach(function (q) { pts.push([q[0] * W, q[1] * H]); });   // le coin net, tel quel
      else for (var i = 0; i <= 140; i++) pts.push(scaled(i / 140));
      x.lineWidth = 3; x.strokeStyle = ink; x.lineJoin = g.path.sharp ? 'miter' : 'round'; line(x, pts); x.stroke();
      x.lineJoin = 'round';
      x.setLineDash([7, 7]); x.lineWidth = 2.5; x.globalAlpha = 0.8;
      line(x, g.trace.map(function (q) { return [q.x, q.y]; })); x.stroke();
      x.setLineDash([]); x.globalAlpha = 1;
      // les deux rejoués ensemble, chacun à son rythme : plein = le modèle, creux = toi
      // sur le téléphone, l'instant de l'image précède souvent performance.now() : jamais de temps négatif
      var el = g.rt0 ? Math.max(0, now - g.rt0) : 1e9, T = Math.max(1, g.trace[g.trace.length - 1].t - g.trace[0].t);
      var ut = Math.min(1, el / (g.path.dur * 1000)), up = Math.min(1, el / T);
      var mp = scaled(ut), tp = G.resample(g.trace, 2 + Math.round(up * 200)).pop();
      dot(x, mp[0], mp[1], ink);
      dot(x, tp[0], tp[1], ink, true);
    }
  }

  // L'onde quand la forme se pose (demande de Max du 29/10) : son contour se répète en s'élargissant, aux couleurs
  // de la palette de la manche — à l'apparition, puis à la validation, autour de sa vraie place.
  function grow(pts, s) {             // agrandie autour de son centre de gravité (ni son pivot, ni ses sommets)
    var A = 0, cx = 0, cy = 0;
    pts.forEach(function (p, i) {
      var q = pts[(i + 1) % pts.length], cr = p[0] * q[1] - q[0] * p[1];
      A += cr; cx += (p[0] + q[0]) * cr; cy += (p[1] + q[1]) * cr;
    });
    cx /= 3 * A; cy /= 3 * A;
    return pts.map(function (p) { return [cx + (p[0] - cx) * s, cy + (p[1] - cy) * s]; });
  }
  function wave(x, now) {
    var wv = g.wave, e0 = wv ? (now - wv.t0) / 1100 : 1;
    if (!wv || e0 >= 1.4) return;
    var base = G.place(g.shape, wv.pose);
    for (var j = 0; j < 4; j++) {
      var e = e0 - j * 0.12;
      if (e <= 0 || e >= 1) continue;
      poly(x, grow(base, 1 + 0.9 * (1 - Math.pow(1 - e, 3))));
      x.globalAlpha = (1 - e) * 0.9; x.lineWidth = 3 * (1 - e) + 1; x.strokeStyle = g.pal.col(j); x.stroke();
    }
    x.globalAlpha = 1;
  }

  function drawForme(x, ink, now) {
    if (!g.shape) return;
    wave(x, now);
    if (g.phase === 'memo') {
      poly(x, G.place(g.shape, g.target)); x.fillStyle = ink; x.fill();
    } else if (g.phase === 'place') {
      poly(x, G.place(g.shape, g.pose)); x.fillStyle = ink; x.fill();
      x.lineWidth = 1.5; x.strokeStyle = css('--raise'); x.stroke();
      var ids = Object.keys(fingers);
      if (ids.length >= 2) {                  // les deux doigts : le pivot entre eux
        var a = fingers[ids[0]], b = fingers[ids[1]];
        x.globalAlpha = 0.45; x.strokeStyle = ink; x.lineWidth = 1.5; x.setLineDash([4, 5]);
        line(x, [[a.x, a.y], [b.x, b.y]]); x.stroke(); x.setLineDash([]); x.globalAlpha = 1;
      }
    } else if (g.phase === 'reveal') {
      var T = G.place(g.shape, g.target), P = G.place(g.shape, g.pose);
      // l'emplacement visé : contour plein et hachures ; ta forme : en demi-teinte par-dessus
      x.save(); poly(x, T); x.clip();
      x.strokeStyle = ink; x.globalAlpha = 0.35; x.lineWidth = 1.5;
      for (var d = -H; d < W + H; d += 9) { line(x, [[d, 0], [d + H, H]]); x.stroke(); }
      x.restore(); x.globalAlpha = 1;
      poly(x, T); x.lineWidth = 2.5; x.strokeStyle = ink; x.stroke();
      poly(x, P); x.globalAlpha = 0.55; x.fillStyle = ink; x.fill(); x.globalAlpha = 1;
      if (Math.hypot(g.pose.x - g.target.x, g.pose.y - g.target.y) > 3) {
        x.setLineDash([4, 4]); x.lineWidth = 1.5; x.strokeStyle = ink;
        line(x, [[g.target.x, g.target.y], [g.pose.x, g.pose.y]]); x.stroke(); x.setLineDash([]);
      }
    }
  }

  function loop(now) {
    if (root.NC.ui.current() !== 'hand' || !g) { raf = 0; return; }
    // on reprogramme AVANT de dessiner : une image ratée ne doit jamais figer l'écran (bug du 26/10 sur le Pixel 6)
    raf = requestAnimationFrame(loop);
    draw(now);
  }

  /* ---------- les gestes sur la toile ---------- */

  function local(e) { var r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top, t: e.timeStamp || performance.now() }; }

  function onDown(e) {
    if (!g) return;
    e.preventDefault();
    try { cv.setPointerCapture(e.pointerId); } catch (x) {}
    var p = local(e);
    if (g.mode === 'geste') {
      if (g.phase !== 'trace' || g.drawing) return;
      var s = scaled(0);
      if (Math.hypot(p.x - s[0], p.y - s[1]) > GRAB) { root.NC.ui.toast('Pars du rond'); fx.haptic('heavy'); return; }
      g.drawing = e.pointerId; g.trace = [p];
      fx.haptic('tick');
    } else {
      if (g.phase === 'memo') { endMemo(); return; }
      if (g.phase !== 'place') return;
      fingers[e.pointerId] = { x: p.x, y: p.y };
      rebase();
      if (!g.touched) { g.touched = true; go('Valider', false); }
    }
  }
  function onMove(e) {
    if (!g) return;
    if (g.mode === 'geste') {
      if (g.drawing !== e.pointerId) return;
      var evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
      (evs.length ? evs : [e]).forEach(function (ev) { g.trace.push(local(ev)); });
    } else {
      if (!(e.pointerId in fingers) || g.phase !== 'place') return;
      var p = local(e);
      fingers[e.pointerId] = { x: p.x, y: p.y };
      apply();
    }
  }
  function onUp(e) {
    if (!g) return;
    if (g.mode === 'geste') {
      if (g.drawing !== e.pointerId) return;
      g.trace.push(local(e));
      g.drawing = false;
      var T = (g.trace[g.trace.length - 1].t - g.trace[0].t) / 1000, len = 0;
      for (var i = 1; i < g.trace.length; i++) len += Math.hypot(g.trace[i].x - g.trace[i - 1].x, g.trace[i].y - g.trace[i - 1].y);
      if (e.type === 'pointercancel' || T < 0.25 || len < Math.min(W, H) * 0.12) {
        g.trace = [];
        root.NC.ui.toast('Trop court : refais tout le trajet');
        return;
      }
      revealGeste();
    } else {
      if (e.pointerId in fingers && e.type === 'pointerup' && g.phase === 'place') {   // le lever compte aussi
        var q = local(e); fingers[e.pointerId] = { x: q.x, y: q.y }; apply();
      }
      delete fingers[e.pointerId];
      rebase();
    }
  }

  // Forme : on mémorise l'état au moment où le nombre de doigts change, puis on applique l'écart
  function rebase() {
    var ids = Object.keys(fingers);
    base = { pose: { x: g.pose.x, y: g.pose.y, a: g.pose.a, k: g.pose.k }, n: ids.length };
    if (ids.length === 1) base.p = { x: fingers[ids[0]].x, y: fingers[ids[0]].y };
    if (ids.length >= 2) {
      var a = fingers[ids[0]], b = fingers[ids[1]];
      base.mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      base.dist = Math.max(8, Math.hypot(b.x - a.x, b.y - a.y));
      base.ang = Math.atan2(b.y - a.y, b.x - a.x);
    }
    g.lastNotch = notchKey();
  }
  function apply() {
    var ids = Object.keys(fingers), M = Math.min(W, H);
    if (!base || !ids.length) return;
    if (ids.length === 1 && base.p) {
      var f = fingers[ids[0]];
      g.pose.x = base.pose.x + (f.x - base.p.x); g.pose.y = base.pose.y + (f.y - base.p.y);
    } else if (ids.length >= 2 && base.mid) {
      var a = fingers[ids[0]], b = fingers[ids[1]];
      var mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      var da = Math.atan2(b.y - a.y, b.x - a.x) - base.ang;
      var k = Math.max(M * 0.08, Math.min(M * 0.45, base.pose.k * Math.max(8, Math.hypot(b.x - a.x, b.y - a.y)) / base.dist));
      var s = k / base.pose.k, vx = base.pose.x - base.mid.x, vy = base.pose.y - base.mid.y, c = Math.cos(da), sn = Math.sin(da);
      // rotation et échelle autour du point entre les deux doigts : la forme reste « sous les doigts »
      g.pose.x = mid.x + s * (vx * c - vy * sn); g.pose.y = mid.y + s * (vx * sn + vy * c);
      g.pose.a = base.pose.a + da; g.pose.k = k;
    }
    g.pose.x = Math.max(0, Math.min(W, g.pose.x)); g.pose.y = Math.max(0, Math.min(H, g.pose.y));
    var key = notchKey();
    if (key !== g.lastNotch) { g.lastNotch = key; fx.haptic('tick'); }
  }
  // un cran tous les 15° et tous les 10 % de taille
  function notchKey() { return Math.round(g.pose.a * 12 / Math.PI) + ':' + Math.round(Math.log(g.pose.k) / 0.1); }

  /* ---------- déroulé ---------- */

  function init() {
    G = root.NC.geste; S = root.NC.store; fx = root.NC.fx; C = root.NC.color;
    cv = $('board');
    cv.addEventListener('pointerdown', onDown);
    cv.addEventListener('pointermove', onMove);
    cv.addEventListener('pointerup', onUp);
    cv.addEventListener('pointercancel', onUp);
    $('hand-go').addEventListener('click', onGo);
    $('hand-replay').addEventListener('click', function () { if (g && g.mode === 'geste' && g.phase === 'reveal') { g.rt0 = performance.now(); fx.haptic('tick'); } });
    $('hand-quit').addEventListener('click', abort);
  }

  function start(mode) {
    clearAll();
    var rand = C.rng((Math.random() * 4294967296) >>> 0), order = G.SHAPES.slice();
    for (var i = order.length - 1; i > 0; i--) { var j = Math.floor(rand() * (i + 1)), t = order[i]; order[i] = order[j]; order[j] = t; }
    g = { mode: mode, rand: rand, order: order, i: -1, rounds: [], total: 0, phase: 'idle', trace: [] };
    fingers = {}; base = null;
    $('hand-total').textContent = '0';
    root.NC.ui.show('hand');
    fit();
    cancelAnimationFrame(raf); raf = requestAnimationFrame(loop);   // toujours relancée : une boucle morte ne se rattrape pas
    later(nextRound, 200);
  }

  function nextRound() {
    if (!g) return;
    g.i++;
    if (g.i >= ROUNDS) return finish();
    fit();
    g.trace = []; g.drawing = false; g.touched = false; g.t0 = 0; g.fadeAt = 0; g.rt0 = 0; fingers = {}; base = null;
    g.pal = root.NC.palette.tirer(); g.wave = null;   // une palette harmonieuse par manche (demande de Max, 29/10)
    go(g.mode === 'geste' ? 'Refais le trajet' : 'Valider', true);
    $('hand-replay').disabled = true;
    $('hand-replay').hidden = g.mode !== 'geste';
    renderProgress();
    fx.haptic('click');
    if (g.mode === 'geste') {
      g.path = G.path(g.rand, null, W && H ? H / W : 1);   // un seul virage, à sa vraie forme sur la toile
      g.phase = 'watch';
      label(pad2(g.i + 1), '', 'Regarde', 'Retiens son trajet');
      bar(1, true);
      later(function () {                       // un temps d'arrêt au départ, puis le rond s'en va
        if (!g || g.phase !== 'watch') return;
        g.t0 = performance.now();
        var ms = g.path.dur * 1000;
        (function tick(now) {
          if (!g || g.phase !== 'watch') return;
          var left = Math.max(0, ms - (now - g.t0));
          bar(left / ms, true);
          if (left > 0) { requestAnimationFrame(tick); return; }
          g.fadeAt = performance.now();
          later(startTrace, 650);
        })(g.t0);
      }, 650);
    } else {
      g.shape = g.order[g.i % g.order.length];
      g.target = G.randomPose(g.rand, W, H);
      g.phase = 'memo';
      g.wave = { t0: performance.now(), pose: g.target };
      label(pad2(g.i + 1), '', 'Mémorise', 'Sa place, son angle, sa taille');
      var t0 = performance.now();
      (function tick(now) {
        if (!g || g.phase !== 'memo') return;
        var left = Math.max(0, MEMO_MS - (now - t0));
        bar(left / MEMO_MS, true);
        if (left > 0) { requestAnimationFrame(tick); return; }
        endMemo();
      })(t0);
    }
  }

  function startTrace() {
    if (!g || g.phase !== 'watch') return;
    g.phase = 'trace';
    bar(0, false);
    label(pad2(g.i + 1), '', 'À toi · ' + (g.i + 1) + '/' + ROUNDS, 'Attrape le rond, refais-le');
  }

  function endMemo() {
    if (!g || g.phase !== 'memo') return;
    g.phase = 'place';
    g.pose = G.scramble(g.rand, g.target, W, H);
    bar(0, false);
    label(pad2(g.i + 1), '', 'Replace-la · ' + (g.i + 1) + '/' + ROUNDS, 'Un doigt glisse · deux tournent');
  }

  function onGo() {
    if (!g) return;
    if (g.phase === 'place' && g.touched) return revealForme();
    if (g.phase === 'reveal') { fx.haptic('tick'); return nextRound(); }
  }

  function revealGeste() {
    var cmp = G.compareTrace(g.path, g.trace, W, H);
    // ton tracé, réduit à 40 points (en fraction de la toile) : pour la carte de score à partager
    var mine = G.resample(g.trace, 40).map(function (q) { return [+(q[0] / W).toFixed(4), +(q[1] / H).toFixed(4)]; });
    land({ score: cmp.score, E: cmp.E, d: cmp.d, r: cmp.r, path: g.path, mine: mine, asp: H / W }, G.traceHint(cmp));
    g.rt0 = performance.now();
    $('hand-replay').disabled = false;
  }
  function revealForme() {
    fingers = {}; base = null;
    g.wave = { t0: performance.now(), pose: g.target };
    var e = G.shapeError(g.shape, g.target, g.pose, W, H), M = Math.min(W, H);
    // les deux poses (en fraction de la toile) : la carte de score superpose la place visée et la tienne
    var rel = function (q) { return { x: q.x / W, y: q.y / H, a: q.a, k: q.k / M }; };
    land({ score: e.score, E: e.E, d: e.d, shape: g.shape.name, dAng: e.dAng, k: e.kRatio, tp: rel(g.target), pp: rel(g.pose), asp: H / W }, G.shapeHint(e));
  }

  function land(round, hint) {
    g.phase = 'reveal';
    g.rounds.push(round);
    g.total += round.score;
    var last = g.i === ROUNDS - 1, sc = round.score;
    go(last ? 'Voir le bilan' : 'Suivant', true);
    label('0', '/100', C.verdict(sc), '');
    $('hand-ttl').className = 'ttl big';
    fx.haptic('click');
    var t0 = performance.now(), dur = 380 + sc * 5;
    (function frame(now) {
      if (!g || g.phase !== 'reveal') return;
      var k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      $('hand-num').textContent = Math.round(sc * e);
      if (k < 1) { requestAnimationFrame(frame); return; }
      $('hand-total').textContent = g.total;
      $('hand-sub').className = 'sub prose';
      $('hand-sub').textContent = hint;
      renderProgress();
      fx.haptic(sc >= 90 ? 'rise' : sc >= 65 ? 'double' : 'heavy');
      later(function () { if (g && g.phase === 'reveal') go(last ? 'Voir le bilan' : 'Suivant', false); }, 250);
    })(t0);
  }

  function finish() {
    clearAll();
    var game = { mode: g.mode, rounds: g.rounds, total: g.total };
    var res = S.record(game);
    g = null;
    root.NC.ui.showResult(game, res);
  }

  function abort() {
    clearAll();
    g = null; fingers = {}; base = null;
    root.NC.ui.show('home');
  }

  /* ---------- affichage ---------- */

  function label(num, unit, ttl, sub) {
    $('hand-num').textContent = num; $('hand-unit').textContent = unit;
    $('hand-ttl').textContent = ttl; $('hand-ttl').className = 'ttl';
    $('hand-sub').textContent = sub; $('hand-sub').className = 'sub';
  }
  function bar(f, on) {
    $('hand-label').classList.toggle('counting', !!on);
    $('hand-bar').style.transform = 'scaleX(' + f + ')';
  }
  function go(txt, disabled) { $('hand-go-txt').textContent = txt; $('hand-go').disabled = !!disabled; }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function renderProgress() {
    var h = '';
    for (var j = 0; j < ROUNDS; j++) h += '<i class="' + (g.rounds[j] ? 'life' : j === g.i ? 'now' : '') + '"></i>';
    $('hand-progress').innerHTML = h;
  }

  root.NC = root.NC || {};
  root.NC.hand = {
    init: init, start: start, abort: abort,
    get state() { return g; },
    get palette() { return g && g.pal; },
    W: function () { return W; }, H: function () { return H; }, grow: grow
  };
})(this);
