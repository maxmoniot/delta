/* Delta — déroulé d'une partie de couleurs.
   Une manche : MÉMORISE (la cible, quelques secondes) → RETROUVE-LA (le nuancier, qui part d'une
   couleur quelconque déjà affichée : pas d'écran noir entre les deux) → révélation (cible et choix
   côte à côte, score, indice).
   Trois modes : défi du jour (même série pour tout le monde), partie libre, survie. */
(function (root) {
  'use strict';
  var C, S, fx, picker;
  var $ = function (id) { return document.getElementById(id); };

  var MEMO_MS = 3000, ROUNDS = 5;
  var g = null;           // partie en cours
  var timers = [];
  var raf = 0;

  function later(fn, ms) { var t = setTimeout(fn, ms); timers.push(t); return t; }
  function clearTimers() { timers.forEach(clearTimeout); timers = []; cancelAnimationFrame(raf); }

  function init() {
    C = root.NC.color; S = root.NC.store; fx = root.NC.fx;
    picker = new root.NC.Picker($('pad'), onPick);
    $('btn-go').addEventListener('click', onGo);
    $('chip').addEventListener('pointerdown', function () { if (g && g.phase === 'memo') endMemo(); });
    $('btn-quit').addEventListener('click', function () { abort(); });
  }

  /* ---------- règles par mode ---------- */
  function memoMs(mode, i) { return mode === 'survie' ? Math.max(1200, MEMO_MS - 150 * i) : MEMO_MS; }
  function threshold(i) { return Math.min(85, 50 + 3 * i); }   // survie : score minimal à tenir

  function start(mode) {
    clearTimers();
    var colors = null;
    if (mode === 'jour') colors = C.series(C.rng(S.daySeed()), ROUNDS);
    else if (mode === 'partie') colors = C.series(C.rng((Math.random() * 4294967296) >>> 0), ROUNDS);
    g = { mode: mode, colors: colors, i: -1, rounds: [], total: 0, lives: 3, cleared: 0, phase: 'idle', last: null };
    $('total').textContent = '0';    // sinon le total de la partie précédente reste affiché
    root.NC.ui.show('play');
    nextRound();
  }

  function newTarget() {
    if (g.colors) return g.colors[g.i];
    // survie : tirage libre, mais jamais deux teintes voisines d'affilée
    var r = Math.random, c, guard = 0;
    do { c = C.randomColor(r); } while (g.last && guard++ < 50 && Math.min(Math.abs(c.h - g.last.h), 360 - Math.abs(c.h - g.last.h)) < 40);
    return c;
  }

  function nextRound() {
    g.i++;
    if (g.colors && g.i >= g.colors.length) return finish();
    if (g.mode === 'survie' && g.lives <= 0) return finish();
    g.target = newTarget(); g.last = g.target;
    g.phase = 'memo';

    picker.locked = true;
    // départ du nuancier : loin de la cible en teinte, pour qu'il n'y ait pas de coup de chance
    picker.reset({ h: (g.target.h + 90 + Math.random() * 180) % 360, s: 0.3 + Math.random() * 0.6, v: 0.45 + Math.random() * 0.45 });
    $('picker').classList.add('locked');

    var rgb = C.hsvToRgb(g.target.h, g.target.s, g.target.v);
    var field = $('field');
    field.className = 'field memo';
    $('h-target').style.background = C.css(rgb);
    $('h-target').style.animation = 'none';
    $('h-pick').style.background = '';
    $('field-msg').textContent = '';

    label({ num: pad2(g.i + 1), unit: '', ttl: 'Mémorise',
      sub: g.mode === 'survie' ? 'Seuil à tenir : ' + threshold(g.i) + ' pts' : 'Touche la couleur quand c’est fait' });
    $('label').classList.add('counting');
    go('Valider', true);
    renderProgress();

    fx.sfx.show();
    fx.haptic('click');

    var ms = memoMs(g.mode, g.i), t0 = performance.now(), beat = Math.ceil(ms / 1000);
    var bar = $('timer-bar'), msg = $('picker-msg');
    msg.textContent = beat;
    (function frame(now) {
      var left = Math.max(0, ms - (now - t0));
      bar.style.transform = 'scaleX(' + (left / ms) + ')';
      var b = Math.ceil(left / 1000);
      if (b < beat) { beat = b; if (b > 0) { fx.sfx.beat(false); } }
      msg.textContent = b > 0 ? b : '';
      if (g.phase !== 'memo') return;
      if (left <= 0) return endMemo();
      raf = requestAnimationFrame(frame);
    })(t0);
  }

  function endMemo() {
    if (!g || g.phase !== 'memo') return;
    cancelAnimationFrame(raf);
    $('label').classList.remove('counting');
    $('picker-msg').textContent = '';
    fx.sfx.hide();
    startPick();
  }

  function startPick() {
    if (!g) return;
    g.phase = 'pick';
    var v = picker.value();
    $('h-pick').style.background = C.css(C.hsvToRgb(v.h, v.s, v.v));
    $('field').className = 'field pick';
    $('field-msg').textContent = '';
    label({ num: pad2(g.i + 1), unit: '', ttl: 'Retrouve-la', sub: code(v) });
    go('Valider', true);     // actif dès le premier réglage
    picker.locked = false;
    $('picker').classList.remove('locked');
  }

  function onPick(v) {
    if (!g || g.phase !== 'pick') return;
    if ($('btn-go').disabled) go('Valider', false);
    $('h-pick').style.background = C.css(C.hsvToRgb(v.h, v.s, v.v));
    $('sub').textContent = code(v);
  }

  function onGo() {
    if (!g) return;
    if (g.phase === 'pick' && picker.touched) return reveal();
    if (g.phase === 'reveal') { fx.sfx.tap(); return nextRound(); }
  }

  function reveal() {
    g.phase = 'reveal';
    picker.locked = true;
    var pick = picker.value(), t = g.target;
    var trgb = C.hsvToRgb(t.h, t.s, t.v), prgb = C.hsvToRgb(pick.h, pick.s, pick.v);
    var dE = C.deltaE2000(C.rgbToLab(trgb), C.rgbToLab(prgb));
    var sc = C.score(dE);
    var round = { target: t, pick: pick, dE: dE, score: sc };
    g.rounds.push(round);
    g.total += sc;

    // survie : tient-on le seuil ?
    var kept = true, need = 0;
    if (g.mode === 'survie') {
      need = threshold(g.i);
      kept = sc >= need;
      if (kept) g.cleared++; else g.lives--;
      round.need = need; round.kept = kept;
    }

    picker.target = t; picker.draw();
    var field = $('field');
    field.className = 'field reveal';
    $('h-target').style.animation = '';
    tag($('tag-target'), 'Cible', trgb);
    tag($('tag-pick'), 'Toi', prgb);

    var last = g.colors ? g.i === g.colors.length - 1 : g.lives <= 0;
    label({ num: '0', unit: '/100', ttl: C.verdict(sc), big: true, sub: '' });
    go(last ? 'Voir le bilan' : 'Suivant', true);
    fx.sfx.validate();
    fx.haptic('click');

    // le score se compte, puis le verdict tombe
    var t0 = performance.now(), dur = 380 + sc * 5, shown = -1;
    (function frame(now) {
      if (!g || g.phase !== 'reveal') return;
      var k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3), n = Math.round(sc * e);
      if (n !== shown) { if (n % 4 === 0 && n) fx.sfx.count(n); shown = n; $('num').textContent = n; }
      if (k < 1) { raf = requestAnimationFrame(frame); return; }
      landed(round, kept, need, last);
    })(t0);
  }

  function landed(round, kept, need, last) {
    var sc = round.score;
    $('total').textContent = g.total;
    var sub = C.hint(round.target, round.pick);
    if (g.mode === 'survie') sub = (kept ? 'Seuil ' + need + ' tenu · ' : 'Sous le seuil de ' + need + ' · vie perdue · ') + sub;
    $('sub').className = 'sub prose';
    $('sub').textContent = sub;
    renderProgress();
    fx.sfx.result(sc);
    if (sc >= 90) { fx.haptic('rise'); root.NC.ui.burst($('field'), round.target, sc >= 97); }
    else if (g.mode === 'survie' && !kept) { fx.haptic('fall'); fx.sfx.lifeLost(); }
    else fx.haptic(sc >= 65 ? 'double' : 'heavy');
    later(function () { if (g && g.phase === 'reveal') go(last ? 'Voir le bilan' : 'Suivant', false); }, 250);
  }

  function finish() {
    clearTimers();
    var game = { mode: g.mode, rounds: g.rounds, total: g.total, cleared: g.cleared };
    var res = S.record(game);
    g = null;
    root.NC.ui.showResult(game, res);
  }

  function abort() {
    clearTimers();
    g = null;
    picker.locked = true;
    root.NC.ui.show('home');
  }

  /* ---------- affichage ---------- */
  function label(o) {
    $('num').textContent = o.num;
    $('num-unit').textContent = o.unit || '';
    var ttl = $('ttl');
    ttl.textContent = o.ttl;
    ttl.className = 'ttl' + (o.big ? ' big' : '');
    var sub = $('sub');
    sub.className = 'sub';
    sub.textContent = o.sub;
  }

  function tag(el, who, rgb) {
    var light = C.luminance(rgb) > 0.36;
    el.className = 'tag ' + (light ? 'on-light' : 'on-dark');
    el.innerHTML = '<em>' + who + '</em>' + esc(C.nameOf(rgb)) + '<small>' + C.hex(rgb) + '</small>';
  }

  function go(txt, disabled) { $('go-txt').textContent = txt; $('btn-go').disabled = !!disabled; }

  function renderProgress() {
    var p = $('progress'), h = '';
    if (g.mode === 'survie') {
      for (var i = 0; i < 3; i++) h += '<i class="' + (i < g.lives ? 'life' : 'lost') + '"></i>';
      h += '<span class="round">manche ' + (g.i + 1) + '</span>';
    } else {
      for (var j = 0; j < g.colors.length; j++) {
        var r = g.rounds[j];
        if (r) h += '<i style="background:' + C.css(C.hsvToRgb(r.target.h, r.target.s, r.target.v)) + ';border-color:transparent"></i>';
        else h += '<i class="' + (j === g.i ? 'now' : '') + '"></i>';
      }
    }
    p.innerHTML = h;
  }

  // Chasse fixe : on cale les valeurs avec des espaces insécables (même largeur qu'un chiffre)
  function code(v) {
    var nb = String.fromCharCode(160);
    function f(k, x) { return k + nb + String(x !== x ? '—' : x).padStart(3, nb); }
    return [f('H', v.h), f('S', Math.round(v.s * 100))].join(nb + '·' + nb);
  }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function esc(s) { return String(s).replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }); }

  root.NC = root.NC || {};
  root.NC.game = {
    init: init, start: start, abort: abort,
    get state() { return g; },
    get picker() { return picker; }
  };
})(this);
