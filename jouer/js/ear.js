/* Delta — mode « À l'oreille » : retrouver une fréquence.
   Une manche : ÉCOUTE (un son, une seule fois, 2 s) → RETROUVE-LA (un ruban gradué en hertz qu'on fait
   défiler sous un repère fixe, plus à droite = plus aigu ; le son suit le doigt et la fréquence s'affiche
   en grand) → révélation (les deux ondes superposées, et les deux sons joués l'un après l'autre puis
   ensemble : l'écart s'entend comme un battement).
   Le mode reste en noir et blanc : ici rien n'est à voir, tout est à entendre. */
(function (root) {
  'use strict';
  var P, S, fx, C, dial;
  var $ = function (id) { return document.getElementById(id); };

  var LISTEN_MS = 2000, ROUNDS = 5, SPAN = 400;     // le ruban montre 400 Hz à la fois
  var g = null, raf = 0, sraf = 0, timers = [];
  var live = null, voices = [], wave = null;
  var scope = { mode: 'idle' };

  function later(fn, ms) { var t = setTimeout(fn, ms); timers.push(t); return t; }
  function clearAll() { timers.forEach(clearTimeout); timers = []; cancelAnimationFrame(raf); stopAll(); }

  /* ---------- le son ---------- */

  function ac() { return fx.ctx(); }
  var bus = null, meter = null, buf = null;
  function out(a) {
    if (!bus) {
      bus = a.createGain(); meter = a.createAnalyser(); meter.fftSize = 512;
      buf = new Float32Array(meter.fftSize);
      bus.connect(meter); meter.connect(a.destination);
    }
    return bus;
  }
  // Niveau sonore efficace (0..~0,5) : seule information que reçoivent les particules
  function level() {
    if (!meter) return 0;
    meter.getFloatTimeDomainData(buf);
    var sum = 0;
    for (var i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
    return Math.sqrt(sum / buf.length);
  }
  // Timbre doux (fondamentale + 3 harmoniques décroissantes) : la hauteur perçue est celle de la
  // fondamentale, mais le son reste audible sur le petit haut-parleur d'un téléphone, qui rend mal les graves.
  function timbre(a) {
    if (!wave) wave = a.createPeriodicWave(new Float32Array([0, 0, 0, 0, 0]), new Float32Array([0, 1, 0.42, 0.18, 0.07]));
    return wave;
  }
  function voice(f, at, dur, vol) {
    var a = ac(); if (!a) return null;
    vol = vol || 0.3;
    var o = a.createOscillator(), gn = a.createGain(), t = a.currentTime + (at || 0);
    o.setPeriodicWave(timbre(a));
    o.frequency.value = f;
    gn.gain.setValueAtTime(0.0001, t);
    gn.gain.exponentialRampToValueAtTime(vol, t + 0.04);
    o.connect(gn); gn.connect(out(a));
    o.start(t);                       // start avant stop : l'inverse lève une exception
    if (dur) {
      gn.gain.setValueAtTime(vol, t + Math.max(0.05, dur - 0.2));
      gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.stop(t + dur + 0.05);
    }
    var v = { o: o, g: gn };
    voices.push(v);
    o.onended = function () { var i = voices.indexOf(v); if (i >= 0) voices.splice(i, 1); };
    return v;
  }
  function fade(v, ms) {
    var a = ac(); if (!a || !v) return;
    var t = a.currentTime;
    try {
      v.g.gain.cancelScheduledValues(t);
      v.g.gain.setValueAtTime(Math.max(0.0001, v.g.gain.value), t);
      v.g.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000);
      v.o.stop(t + ms / 1000 + 0.03);
    } catch (e) {}
  }
  function stopAll() { voices.slice().forEach(function (v) { fade(v, 60); }); voices = []; live = null; }
  function liveStart(f, vol) { if (!live) live = voice(f, 0, 0, vol || 0.3); }
  function liveSet(f) { var a = ac(); if (live && a) live.o.frequency.setTargetAtTime(f, a.currentTime, 0.012); }
  function liveStop() { if (live) { fade(live, 260); live = null; } }

  /* ---------- l'écran du son : un nuage de particules ---------- */

  // Pendant qu'on écoute (et qu'on cherche), pas d'onde : une forme d'onde trahirait la fréquence.
  // Un nuage de petits carrés (les coins vifs de la charte) jaillit d'un foyer tiré au hasard à chaque
  // manche ; son débit, sa vitesse et sa taille suivent le VOLUME mesuré à la sortie, rien d'autre.
  // Ses carrés prennent les couleurs d'une palette harmonieuse, tirée à nouveau à chaque son (demande de Max, 29/10).
  var parts = [], focus = { x: 0.5, y: 0.5 }, spin = 1, lastT = 0, pal = null;
  function newFocus() {
    focus = { x: 0.3 + Math.random() * 0.4, y: 0.3 + Math.random() * 0.4 };
    spin = Math.random() < 0.5 ? -1 : 1;
  }
  function particles(x, w, h, now, ink) {
    var dt = Math.min(50, lastT ? now - lastT : 16); lastT = now;
    var lv = Math.min(1, level() * 4.5);                 // 0 silence … 1 plein son
    var cx = focus.x * w, cy = focus.y * h;
    // naissances : quelques-unes au repos (le nuage respire), une gerbe quand ça sonne
    var born = (0.25 + lv * 9) * dt / 16;
    while (born > 0 && parts.length < 520) {
      if (born < 1 && Math.random() > born) break;
      born -= 1;
      var a = Math.random() * Math.PI * 2, sp = (0.15 + lv * (1.2 + Math.random() * 2.4)) * (0.5 + Math.random());
      var r0 = Math.random() * (6 + lv * 26);
      parts.push({ x: cx + Math.cos(a) * r0, y: cy + Math.sin(a) * r0, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: 1, decay: 0.004 + Math.random() * 0.008, s: 1.2 + Math.random() * (1.5 + lv * 4),
        col: pal ? pal.col(Math.floor(Math.random() * 5)) : ink });
    }
    for (var i = parts.length - 1; i >= 0; i--) {
      var q = parts[i], k = dt / 16;
      // tourbillon léger autour du foyer + frottement
      var dx = q.x - cx, dy = q.y - cy, d = Math.sqrt(dx * dx + dy * dy) + 1;
      q.vx += (-dy / d) * 0.02 * spin * k; q.vy += (dx / d) * 0.02 * spin * k;
      q.vx *= Math.pow(0.985, k); q.vy *= Math.pow(0.985, k);
      q.x += q.vx * k * (1 + lv * 1.5); q.y += q.vy * k * (1 + lv * 1.5);
      q.life -= q.decay * k;
      if (q.life <= 0 || q.x < -10 || q.x > w + 10 || q.y < -10 || q.y > h + 10) { parts.splice(i, 1); continue; }
      x.globalAlpha = Math.min(1, q.life * 1.4) * (0.35 + lv * 0.65);
      x.fillStyle = q.col;
      var sz = q.s * (0.6 + q.life * 0.6);
      x.fillRect(q.x - sz / 2, q.y - sz / 2, sz, sz);
    }
    x.globalAlpha = 1;
  }

  function cycles(f) { return f / 40; }      // révélation : 440 Hz = 11 périodes dans la pastille
  function css(v) { return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); }

  function drawScope(now) {
    var cv = $('scope'), dpr = root.devicePixelRatio || 1, r = cv.getBoundingClientRect();
    var W = Math.max(1, Math.round(r.width * dpr)), H = Math.max(1, Math.round(r.height * dpr));
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    var x = cv.getContext('2d'), w = r.width, h = r.height, ink = css('--ink'), ink3 = css('--ink-3');
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    x.clearRect(0, 0, w, h);
    var A = h * 0.3, s = scope;
    if (s.mode !== 'reveal') {
      particles(x, w, h, now, ink);
    } else {
      x.fillStyle = ink3; x.globalAlpha = 0.35; x.fillRect(0, Math.round(h / 2), w, 1); x.globalAlpha = 1;
      sine(x, w, h, cycles(s.t), 0, A, ink, 2.5);
      x.setLineDash([5, 5]);
      sine(x, w, h, cycles(s.p), 0, A * 0.82, ink, 1.6);
      x.setLineDash([]);
    }
  }
  function sine(x, w, h, cyc, ph, amp, col, lw) {
    x.strokeStyle = col; x.lineWidth = lw; x.lineJoin = 'round';
    x.beginPath();
    for (var i = 0; i <= w; i += 1.5) {
      var y = h / 2 - amp * Math.sin(2 * Math.PI * (cyc * i / w + ph));
      if (i) x.lineTo(i, y); else x.moveTo(i, y);
    }
    x.stroke();
  }
  function scopeLoop(now) {
    if (root.NC.ui.current() !== 'ear') { sraf = 0; return; }
    // on reprogramme AVANT de dessiner : une image ratée ne doit jamais figer l'écran (bug du 26/10 sur le Pixel 6)
    sraf = requestAnimationFrame(scopeLoop);
    drawScope(now);
  }

  /* ---------- le ruban de fréquences ---------- */

  // Un ruban de papier gradué en hertz (règle d'un générateur de signaux). Sous la graduation, une onde
  // dont la période se resserre vers la droite : on VOIT que la droite est plus aiguë. Elle est attachée
  // au ruban (sa phase dépend de la fréquence absolue), donc elle défile avec lui.
  // Période de 20 px à 440 Hz : en cycles par pixel, la fréquence locale vaut F / 8800.
  // Phase (en cycles) = k · F² / 17600, avec k = pixels par hertz.
  function renderRuler(x, w, h, d) {
    var left = d.v - SPAN / 2, k = w / SPAN;
    x.fillStyle = '#ececec'; x.fillRect(0, 0, w, h);
    // hors de l'étendue : le ruban se grise (dessiné dessous, la graduation reste nette)
    if (left < P.MIN) { x.fillStyle = '#bdbdbd'; x.fillRect(0, 0, (P.MIN - left) * k, h); }
    if (left + SPAN > P.MAX) { var xm = (P.MAX - left) * k; x.fillStyle = '#bdbdbd'; x.fillRect(xm, 0, w - xm, h); }
    // l'onde, dans le tiers bas
    var cy = h * 0.74, amp = h * 0.11;
    x.strokeStyle = '#9a9a9a'; x.lineWidth = 1.4; x.beginPath();
    for (var px = 0; px <= w; px += 1) {
      var F = left + px / k, y = cy - amp * Math.sin(2 * Math.PI * k * F * F / 17600);
      if (px) x.lineTo(px, y); else x.moveTo(px, y);
    }
    x.stroke();
    // graduation : 5 Hz, 10 Hz, 50 Hz (chiffrée), 100 Hz (chiffrée en gras)
    x.textAlign = 'center'; x.textBaseline = 'top';
    for (var f = Math.ceil(left / 5) * 5; f <= left + SPAN; f += 5) {
      if (f < 0) continue;
      var X = Math.round((f - left) * k) - 0.5, big = f % 50 === 0, mid = f % 10 === 0, cent = f % 100 === 0;
      var L = big ? h * 0.3 : mid ? h * 0.17 : h * 0.09;
      x.fillStyle = f < P.MIN || f > P.MAX ? 'rgba(0,0,0,.15)' : big ? '#111' : 'rgba(0,0,0,.45)';
      x.fillRect(X, 0, big ? 1.5 : 1, L);
      if (big && f >= P.MIN && f <= P.MAX) {
        x.fillStyle = cent ? '#111' : '#555';
        x.font = (cent ? '500 ' : '400 ') + '12px Mono, monospace';
        x.fillText(String(f), X, h * 0.3 + 6);
      }
    }
    if (g && g.phase === 'reveal') root.NC.Dial.mark(x, d.xOf(g.target, w), w, h);
    root.NC.Dial.needle(x, w, h, 5, [h * 0.3 + 2, h * 0.3 + 24]);   // fenêtre sur la ligne des chiffres
  }

  /* ---------- déroulé ---------- */

  // Quatre modes : son (partie de 5), son-jour (défi du jour, même série pour tous),
  // son-survie (l'écoute raccourcit, le seuil monte, 3 vies) et accord (accordage : la cible sonne
  // en continu avec ta fréquence, il faut faire taire le battement en 8 s — score plus sévère).
  var ACCORD_MS = 8000, ACCORD_K = 15;
  function listenMs(i) { return g.mode === 'son-survie' ? Math.max(800, LISTEN_MS - 100 * i) : LISTEN_MS; }
  function threshold(i) { return Math.min(85, 50 + 3 * i); }
  function isAccord() { return !!g && g.mode === 'accord'; }
  function isSurvival() { return !!g && g.mode === 'son-survie'; }
  function scoreOf(t, p) { return isAccord() ? P.score(t, p, ACCORD_K) : P.score(t, p); }
  function of() { return isSurvival() ? 'manche ' + (g.i + 1) : (g.i + 1) + '/' + g.targets.length; }

  function init() {
    P = root.NC.pitch; S = root.NC.store; fx = root.NC.fx; C = root.NC.color;
    dial = new root.NC.Dial($('keys'), {
      value: 440, min: P.MIN, max: P.MAX, span: SPAN, step: 10,
      render: renderRuler,
      onStart: function (v) { if (g && g.phase === 'pick' && !isAccord()) liveStart(v); },
      onChange: function (v) {
        if (!g || g.phase !== 'pick') return;
        g.touched = true;
        if ($('ear-go').disabled) go('Valider', false);
        if (!live) liveStart(v);
        liveSet(v);
        scope.f = v;
        readout(v);
      },
      onEnd: function () { if (!isAccord()) liveStop(); }
    });
    dial.locked = true;
    $('ear-go').addEventListener('click', onGo);
    $('ear-play').addEventListener('click', onPlay);
    $('ear-quit').addEventListener('click', abort);
  }

  function start(mode) {
    mode = mode || 'son';
    clearAll();
    ac();   // crée le contexte audio pendant le geste de l'utilisateur
    var seed = mode === 'son-jour' ? S.daySeed() * 7 + 3 : (Math.random() * 4294967296) >>> 0;
    g = { mode: mode, targets: mode === 'son-survie' ? [] : P.series(C.rng(seed), ROUNDS),
      i: -1, rounds: [], total: 0, lives: 3, cleared: 0, phase: 'idle' };
    $('ear-total').textContent = '0';
    root.NC.ui.show('ear');
    try {
      if (root.AndroidBridge && root.AndroidBridge.volume && root.AndroidBridge.volume() < 0.2) root.NC.ui.toast('Monte le volume : ici tout se joue à l’oreille');
    } catch (e) {}
    cancelAnimationFrame(sraf); sraf = requestAnimationFrame(scopeLoop);
    later(nextRound, 250);
  }

  // Survie : tirage au fil de l'eau, jamais deux fréquences proches d'affilée
  function newTarget() {
    if (!isSurvival()) return g.targets[g.i];
    var last = g.targets[g.i - 1], f, guard = 0;
    do { f = P.LOW * Math.exp(Math.random() * Math.log(P.HIGH / P.LOW)); }
    while (last && guard++ < 60 && Math.abs(P.cents(f, last)) < 316);
    f = Math.round(f * 10) / 10;
    g.targets.push(f);
    return f;
  }

  function nextRound() {
    if (!g) return;
    g.i++;
    if (isSurvival() ? g.lives <= 0 : g.i >= g.targets.length) return finish();
    g.target = newTarget();
    g.phase = 'listen'; g.touched = false;
    stopAll();

    // départ du ruban : loin de la cible (25 à 60 %), ou tout près en accordage (1 à 3 demi-tons)
    var c = isAccord() ? 100 + Math.random() * 200 : 400 + Math.random() * 400, sgn = Math.random() < 0.5 ? -1 : 1;
    var st = P.shift(g.target, sgn * c);
    if (st < P.MIN + 20 || st > P.MAX - 20) st = P.shift(g.target, -sgn * c);
    dial.locked = true;
    dial.lastStep = null;
    dial.set(Math.round(st));
    $('keys-wrap').classList.add('locked');

    scope = { mode: 'idle' };
    parts = []; newFocus(); pal = root.NC.palette.tirer();   // nouveau nuage, nouveau foyer, nouvelle palette, à chaque son
    $('ear-field').classList.remove('reveal');
    $('ear-bar').style.transform = 'scaleX(1)';
    go('Valider', true);
    $('ear-play').disabled = true;
    renderProgress();
    fx.haptic('click');
    var msg = $('ear-msg');
    msg.textContent = '';

    if (isAccord()) {
      // pas d'écoute préalable : la cible sonnera pendant tout le réglage
      label(pad2(g.i + 1), '', 'Accordage', 'La cible va sonner en continu');
      $('ear-label').classList.remove('counting');
      later(startPick, 700);
      return;
    }

    label(pad2(g.i + 1), '', 'Écoute', isSurvival() ? 'Seuil à tenir : ' + threshold(g.i) + ' pts' : 'Une seule écoute');
    $('ear-label').classList.add('counting');
    var ms = listenMs(g.i);
    later(function () {
      if (!g || g.phase !== 'listen') return;
      voice(g.target, 0, ms / 1000, 0.32);
      scope = { mode: 'listen', t0: performance.now() };
      var t0 = performance.now();
      (function frame(now) {
        if (!g || g.phase !== 'listen') return;
        var left = Math.max(0, ms - (now - t0));
        $('ear-bar').style.transform = 'scaleX(' + (left / ms) + ')';
        msg.textContent = left > 0 ? Math.ceil(left / 1000) : '';
        if (left <= 0) return later(startPick, 200);
        raf = requestAnimationFrame(frame);
      })(t0);
    }, 450);
  }

  function startPick() {
    if (!g) return;
    g.phase = 'pick';
    $('ear-msg').textContent = '';
    $('keys-wrap').classList.remove('locked');
    dial.locked = false;
    scope = { mode: 'pick', f: dial.v };
    readout(dial.v);
    $('ear-play').setAttribute('aria-label', 'Écouter ma fréquence');

    if (isAccord()) {
      // les deux sons tenus ensemble : tant qu'ils diffèrent, le mélange bat (et le nuage pulse)
      voice(g.target, 0, 0, 0.22);
      liveStart(dial.v, 0.22);
      $('ear-play').disabled = true;
      g.touched = true;
      go('Valider', false);
      $('ear-ttl').textContent = 'Accorde-toi · ' + of(); $('ear-ttl').className = 'ttl';
      $('ear-sub').textContent = 'Fais taire le battement'; $('ear-sub').className = 'sub';
      $('ear-label').classList.add('counting');
      var t0 = performance.now();
      (function frame(now) {
        if (!g || g.phase !== 'pick') return;
        var left = Math.max(0, ACCORD_MS - (now - t0));
        $('ear-bar').style.transform = 'scaleX(' + (left / ACCORD_MS) + ')';
        if (left <= 0) return reveal();
        raf = requestAnimationFrame(frame);
      })(t0);
      return;
    }

    $('ear-label').classList.remove('counting');
    $('ear-ttl').textContent = 'Retrouve-la · ' + of(); $('ear-ttl').className = 'ttl';
    $('ear-sub').textContent = 'Plus à droite, plus aigu'; $('ear-sub').className = 'sub';
    $('ear-play').disabled = false;
  }

  // Pendant le réglage, le grand chiffre de l'étiquette EST la fréquence
  function readout(f) {
    $('ear-num').textContent = f < 1000 ? Math.round(f) : P.hz(f, false).replace(/,\d$/, '');
    $('ear-unit').textContent = 'Hz';
  }

  function onPlay() {
    if (!g) return;
    fx.haptic('tick');
    if (g.phase === 'pick' && !isAccord()) { liveStop(); voice(dial.v, 0, 1.0, 0.3); }
    else if (g.phase === 'reveal') playBoth();
  }

  // La cible, puis ta fréquence, puis les deux ensemble : l'écart devient un battement
  function playBoth() {
    stopAll();
    var r = g.rounds[g.rounds.length - 1];
    voice(r.target, 0.1, 0.8, 0.3);
    voice(r.pick, 1.0, 0.8, 0.3);
    voice(r.target, 1.9, 1.6, 0.24);
    voice(r.pick, 1.9, 1.6, 0.24);
  }

  function onGo() {
    if (!g) return;
    if (g.phase === 'pick' && g.touched) return reveal();
    if (g.phase === 'reveal') { fx.haptic('tick'); return nextRound(); }
  }

  function reveal() {
    if (!g || g.phase !== 'pick') return;
    g.phase = 'reveal';
    cancelAnimationFrame(raf);
    $('ear-label').classList.remove('counting');
    dial.locked = true;
    liveStop();
    var pick = Math.round(dial.v * 10) / 10, sc = scoreOf(g.target, pick);
    var round = { target: g.target, pick: pick, dc: P.cents(pick, g.target), score: sc };
    var kept = true, need = 0;
    if (isSurvival()) {
      need = threshold(g.i); kept = sc >= need;
      if (kept) g.cleared++; else g.lives--;
      round.need = need; round.kept = kept;
    }
    g.rounds.push(round);
    g.total += sc;
    dial.draw();
    scope = { mode: 'reveal', t: g.target, p: pick };
    tag($('ear-tag-t'), 'Cible', g.target, false);
    tag($('ear-tag-p'), 'Toi', pick, true);
    $('ear-field').classList.add('reveal');

    var last = isSurvival() ? g.lives <= 0 : g.i === g.targets.length - 1;
    go(last ? 'Voir le bilan' : 'Suivant', true);
    $('ear-play').disabled = false;
    $('ear-play').setAttribute('aria-label', 'Réécouter les deux');
    fx.haptic('click');
    playBoth();

    label('0', '/100', C.verdict(sc), '');
    $('ear-ttl').className = 'ttl big';
    var t0 = performance.now(), dur = 380 + sc * 5;
    (function frame(now) {
      if (!g || g.phase !== 'reveal') return;
      var k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      $('ear-num').textContent = Math.round(sc * e);
      if (k < 1) { raf = requestAnimationFrame(frame); return; }
      $('ear-total').textContent = g.total;
      var sub = P.hint(g.target, pick);
      if (isSurvival()) sub = (kept ? 'Seuil ' + need + ' tenu · ' : 'Sous le seuil de ' + need + ' · vie perdue · ') + sub;
      $('ear-sub').className = 'sub prose';
      $('ear-sub').textContent = sub;
      renderProgress();
      if (isSurvival() && !kept) fx.haptic('fall');
      else fx.haptic(sc >= 90 ? 'rise' : sc >= 65 ? 'double' : 'heavy');
      later(function () { if (g && g.phase === 'reveal') go(last ? 'Voir le bilan' : 'Suivant', false); }, 250);
    })(t0);
  }

  function finish() {
    clearAll();
    var game = { mode: g.mode, rounds: g.rounds, total: g.total, cleared: g.cleared };
    var res = S.record(game);
    g = null;
    scope = { mode: 'idle' };
    root.NC.ui.showResult(game, res);
  }

  function abort() {
    clearAll();
    g = null;
    dial.locked = true;
    scope = { mode: 'idle' };
    root.NC.ui.show('home');
  }

  /* ---------- affichage ---------- */

  function label(num, unit, ttl, sub) {
    $('ear-num').textContent = num;
    $('ear-unit').textContent = unit;
    $('ear-ttl').textContent = ttl; $('ear-ttl').className = 'ttl';
    $('ear-sub').textContent = sub; $('ear-sub').className = 'sub';
  }
  function tag(el, who, f, dashed) {
    el.innerHTML = '<em><i class="' + (dashed ? 'dash' : 'solid') + '"></i>' + who + '</em>' + P.hz(f);
  }
  function go(txt, disabled) { $('ear-go-txt').textContent = txt; $('ear-go').disabled = !!disabled; }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function renderProgress() {
    var h = '';
    if (isSurvival()) {
      for (var i = 0; i < 3; i++) h += '<i class="' + (i < g.lives ? 'life' : 'lost') + '"></i>';
      h += '<span class="round">manche ' + (g.i + 1) + '</span>';
    } else {
      for (var j = 0; j < g.targets.length; j++) h += '<i class="' + (g.rounds[j] ? 'life' : j === g.i ? 'now' : '') + '"></i>';
    }
    $('ear-progress').innerHTML = h;
  }

  root.NC = root.NC || {};
  root.NC.ear = {
    init: init, start: start, abort: abort,
    get state() { return g; },
    get dial() { return dial; },
    get palette() { return pal; }
  };
})(this);
