/* Delta — écrans : accueil (cinq mondes en carrousel : l'œil, l'oreille, le tracé, la forme, la mélodie), bilan,
   réglages, petites annonces. */
(function (root) {
  'use strict';
  var C, S, fx;
  var $ = function (id) { return document.getElementById(id); };
  var lastGame = null, lastRes = null;

  // Éventail du premier lancement : une couleur par grande famille
  var DEFAULT_FAN = [
    { h: 4, s: 0.95, v: 0.86 }, { h: 28, s: 0.82, v: 0.98 }, { h: 50, s: 0.93, v: 0.99 }, { h: 104, s: 0.72, v: 0.78 },
    { h: 186, s: 0.97, v: 0.6 }, { h: 223, s: 1, v: 0.65 }, { h: 281, s: 0.55, v: 0.66 }
  ];

  function init() {
    C = root.NC.color; S = root.NC.store; fx = root.NC.fx;
    $('btn-daily').addEventListener('click', function () {
      if (S.dailyResult()) { toast('Défi fait. Le prochain arrive demain.'); fx.haptic('heavy'); return; }
      fx.sfx.tap(); root.NC.game.start('jour');
    });
    $('btn-play').addEventListener('click', function () { fx.sfx.tap(); root.NC.game.start('partie'); });
    $('btn-survival').addEventListener('click', function () { fx.sfx.tap(); root.NC.game.start('survie'); });
    $('btn-ear').addEventListener('click', function () { fx.haptic('click'); root.NC.ear.start('son'); });
    $('btn-ear-survival').addEventListener('click', function () { fx.haptic('click'); root.NC.ear.start('son-survie'); });
    $('btn-accord').addEventListener('click', function () { fx.haptic('click'); root.NC.ear.start('accord'); });
    $('btn-ear-daily').addEventListener('click', function () {
      if (S.dailyResult('son')) { toast('Défi fait. Le prochain arrive demain.'); fx.haptic('heavy'); return; }
      fx.haptic('click'); root.NC.ear.start('son-jour');
    });
    $('wh-eye').addEventListener('click', function () { pickWorld('eye'); });
    $('wh-ear').addEventListener('click', function () { pickWorld('ear'); });
    $('wh-trace').addEventListener('click', function () { pickWorld('trace'); });
    $('wh-forme').addEventListener('click', function () { pickWorld('forme'); });
    $('formhero-wrap').addEventListener('click', function () { formhero.next = 0; fx.haptic('tick'); });
    $('btn-geste').addEventListener('click', function () { fx.haptic('click'); root.NC.hand.start('geste'); });
    $('btn-forme').addEventListener('click', function () { fx.haptic('click'); root.NC.hand.start('forme'); });
    $('wh-melodie').addEventListener('click', function () { pickWorld('melodie'); });
    $('btn-melodie').addEventListener('click', function () { fx.haptic('click'); root.NC.tune.start('melodie'); });
    $('btn-melodie-survie').addEventListener('click', function () { fx.haptic('click'); root.NC.tune.start('melodie-survie'); });
    $('keyshero-wrap').addEventListener('click', keysTap);
    $('scribe-wrap').addEventListener('click', scribeTap);
    $('cloud-wrap').addEventListener('click', cloudTap);      // un clic, pas un appui : un glissé ne fait pas sonner
    bindSwipe();
    root.addEventListener('resize', function () { if (current() === 'home' && !busy) layoutWorlds(); });
    $('btn-home').addEventListener('click', function () { fx.sfx.tap(); show('home'); });
    $('btn-again').addEventListener('click', onAgain);
    $('btn-share').addEventListener('click', function () { fx.haptic('click'); if (lastGame) root.NC.carte.share(lastGame, lastRes); });
    $('fan-wrap').addEventListener('click', function () { refan(); });

    $('btn-settings').addEventListener('click', openSheet);
    $('btn-lb').addEventListener('click', function () { fx.haptic('click'); root.NC.classement.ouvrir(''); });
    $('res-lb').addEventListener('click', function () { fx.haptic('click'); if (lastGame) root.NC.classement.ouvrir(lastGame.mode); });
    $('btn-lb').hidden = !root.NC.classement.dispo();
    $('btn-close').addEventListener('click', closeSheet);
    $('sheet').addEventListener('click', function (e) { if (e.target === $('sheet')) closeSheet(); });
    $('set-theme').addEventListener('click', function () {
      var t = S.settings.theme === 'dark' ? 'light' : 'dark';
      S.setSetting('theme', t); root.NC.app.applyTheme(); renderSheet(); renderFan(false);
    });
    $('set-sound').addEventListener('click', function () { S.setSetting('sound', !S.settings.sound); renderSheet(); fx.sfx.tap(); });
    $('set-haptics').addEventListener('click', function () { S.setSetting('haptics', !S.settings.haptics); renderSheet(); fx.haptic('click'); });
    var armed = 0;
    $('set-reset').addEventListener('click', function () {
      var row = $('set-reset');
      if (Date.now() - armed < 3000) {
        S.reset(); armed = 0; row.classList.remove('armed');
        row.firstChild.textContent = 'Effacer records et historique';
        closeSheet(); refresh(); toast('Tout est effacé');
        return;
      }
      armed = Date.now(); row.classList.add('armed');
      row.firstChild.textContent = 'Toucher encore pour effacer';
      setTimeout(function () { if (Date.now() - armed >= 3000) { row.classList.remove('armed'); row.firstChild.textContent = 'Effacer records et historique'; } }, 3100);
    });
    var ro = root.ResizeObserver ? new ResizeObserver(function () { if (current() === 'home') renderFan(false); }) : null;
    if (ro) ro.observe($('fan-wrap'));
  }

  function current() { return $('app').dataset.screen; }
  function show(name) {
    $('app').dataset.screen = name;
    if (name === 'home') { layoutWorlds(); refresh(); }
  }

  /* ---------- les mondes : un carrousel vertical qui boucle ---------- */

  // Le monde ouvert occupe le haut ; le SUIVANT attend en bas, dont on ne voit que l'étiquette ; les autres
  // sont rangés plus bas, hors de vue. Tous les mondes ont la même hauteur : l'étiquette du bas n'est que le
  // haut du monde suivant, le reste dépassant sous le bord (caché). Changer de monde = tourner d'un cran :
  //  - vers le haut : le suivant monte et s'ouvre, le monde ouvert sort par le haut, et le suivant du suivant
  //    arrive en bas comme nouvelle étiquette ;
  //  - vers le bas : le précédent arrive par le haut, le monde ouvert descend devenir l'étiquette, l'ancienne
  //    étiquette sort par le bas.
  // S'il n'y a que deux mondes, celui qui « fait le tour » doit être à deux endroits à la fois : une copie
  // inerte de son étiquette (le fantôme) joue l'un des deux rôles. À trois ou plus, chaque rôle a son vrai monde.
  var WORLDS = ['eye', 'ear', 'trace', 'forme', 'melodie'];
  var geo = { head: 84, big: 0, step: 0 }, busy = false, cloudOn = false, scribeOn = false, formOn = false, keysOn = false;
  var GAP = 10, DUR = 520;

  function world() { var w = S.settings.world; return WORLDS.indexOf(w) >= 0 ? w : 'eye'; }
  function next(w) { return WORLDS[(WORLDS.indexOf(w) + 1) % WORLDS.length]; }
  function prev(w) { return WORLDS[(WORLDS.indexOf(w) + WORLDS.length - 1) % WORLDS.length]; }

  function measure() {
    var H = $('worlds').clientHeight;
    geo.head = $('wh-eye').offsetHeight || geo.head;
    geo.big = H - geo.head - GAP;
    geo.step = geo.big + GAP;
  }
  function place(el, y, anim) {
    el.classList.toggle('anim', !!anim);
    el.style.transform = 'translateY(' + Math.round(y) + 'px)';
  }
  function setOpen(w, open) {
    $('w-' + w).classList.toggle('on', open);
    $('wb-' + w).inert = !open;
    $('wh-' + w).setAttribute('aria-expanded', open ? 'true' : 'false');
  }
  // ce qui doit vivre à l'écran : le nuage (oreille), le rond (tracé), la forme, le petit clavier (mélodie)
  function animsFor(ws) {
    cloudOn = ws.indexOf('ear') >= 0; scribeOn = ws.indexOf('trace') >= 0; formOn = ws.indexOf('forme') >= 0; keysOn = ws.indexOf('melodie') >= 0;
    if (cloudOn) startCloud(); else stopCloud();
    if (scribeOn) startScribe(); else stopScribe();
    if (formOn) startForm(); else stopForm();
    if (keysOn) startKeys(); else stopKeys();
  }

  // Position de repos : le monde ouvert à 0, le suivant un cran plus bas (seule son étiquette dépasse)
  function layoutWorlds() {
    measure();
    if (geo.big < 50) return;
    var on = world(), nx = next(on);
    WORLDS.forEach(function (w) {
      var el = $('w-' + w);
      el.style.height = geo.big + 'px';
      $('wb-' + w).style.height = (geo.big - geo.head) + 'px';
      setOpen(w, w === on);
      el.classList.toggle('next', w === nx);
      place(el, w === on ? 0 : w === nx ? geo.step : 2 * geo.step, false);
    });
    animsFor([on]);
    markPlace(false);
  }

  // Sa place parmi les cinq (demandes de Max du 29/10) : une seule colonne de cases, fixe au bord droit de
  // l'en-tête ouvert — elle ne tourne pas avec la bande ; la case noire glisse jusqu'au jeu choisi.
  var PLACE = 10;                               // une case (7 px) et son écart (3 px)
  function markPlace(anim) {
    var i = WORLDS.indexOf(world()), m = $('places-mark');
    m.classList.toggle('anim', !!anim);
    m.style.transform = 'translateY(' + i * PLACE + 'px)';
    $('places').setAttribute('aria-label', 'Jeu ' + (i + 1) + ' sur ' + WORLDS.length);
  }

  // Copie inerte d'une étiquette, en tenue « repliée »
  function ghostOf(w) {
    var g = document.createElement('div');
    g.className = 'world ghost';
    g.setAttribute('aria-hidden', 'true');
    g.style.height = geo.head + 'px';
    var h = $('wh-' + w).cloneNode(true);
    h.removeAttribute('id');
    Array.prototype.forEach.call(h.querySelectorAll('[id]'), function (n) { n.removeAttribute('id'); });
    g.appendChild(h);
    $('worlds').appendChild(g);
    return g;
  }

  // Prépare un tour de carrousel : la liste de ce qui bouge, avec sa position de départ
  function prepare(dir) {
    measure();
    var from = world(), s = geo.step, d = { dir: dir, from: from };
    if (dir === 'up') {
      var to = next(from), after = next(to);
      d.to = to; d.sign = -1;
      d.movers = [[$('w-' + from), 0], [$('w-' + to), s], [after === from ? ghostOf(from) : $('w-' + after), 2 * s]];
    } else {
      var back = prev(from), band = next(from);
      d.to = back; d.sign = 1;
      d.movers = [[$('w-' + back), -s], [$('w-' + from), 0], [band === back ? ghostOf(band) : $('w-' + band), s]];
      setOpen(back, true);                      // le monde qui arrive par le haut est déjà « ouvert »
    }
    d.ghost = null;
    d.movers.forEach(function (m) { if (m[0].classList.contains('ghost')) d.ghost = m[0]; place(m[0], m[1]); });
    animsFor([from, d.to]);                     // le nuage et le tracé vivent pendant le passage
    if (d.to === 'eye') renderFan(true);        // l'éventail s'ouvre en arrivant
    return d;
  }
  function track(d, off) {
    var k = d.sign * off;
    d.movers.forEach(function (m) { place(m[0], m[1] + k); });
  }
  // Fin du geste : on va au cran suivant (commit) ou on revient
  function settle(d, commit) {
    busy = true;
    var k = commit ? d.sign * geo.step : 0;
    d.movers[0][0].offsetHeight;   // pose la position courante avant de lancer la transition
    d.movers.forEach(function (m) { place(m[0], m[1] + k, true); });
    if (commit) {
      S.setSetting('world', d.to);
      markPlace(true);
      setOpen(d.from, false); setOpen(d.to, true);
      fx.haptic('click');
      if (d.to === 'ear') fx.sfx.show(); else fx.sfx.hide();
    } else if (d.dir === 'down') setOpen(d.to, false);
    setTimeout(function () {
      if (d.ghost) d.ghost.remove();
      layoutWorlds();
      busy = false;
    }, DUR + 40);
  }
  // Toucher l'étiquette du bas = un tour vers le haut (le précédent, lui, vient par le bas)
  function pickWorld(w) {
    if (busy || world() === w) return;
    settle(prepare(w === next(world()) ? 'up' : 'down'), true);
  }

  // Le geste : le carrousel suit le doigt, puis bascule (assez loin ou assez vite) ou revient
  function bindSwipe() {
    var box = $('worlds'), id = null, x0 = 0, y0 = 0, d = null, moved = false, last = [];
    box.addEventListener('pointerdown', function (e) {
      if (busy) return;
      id = e.pointerId; x0 = e.clientX; y0 = e.clientY; d = null; moved = false;
      last = [[performance.now(), y0]];
    });
    box.addEventListener('pointermove', function (e) {
      if (e.pointerId !== id || busy) return;
      var dy = e.clientY - y0, dx = e.clientX - x0;
      last.push([performance.now(), e.clientY]); if (last.length > 6) last.shift();
      if (!d) {
        if (Math.abs(dy) < 10 || Math.abs(dy) < Math.abs(dx) * 1.2) return;
        moved = true;
        try { box.setPointerCapture(id); } catch (x) {}
        d = prepare(dy < 0 ? 'up' : 'down');
      }
      track(d, Math.max(0, Math.min(geo.step, d.sign * dy)));
    });
    function end(e) {
      if (e.pointerId !== id) return;
      id = null;
      if (!d) return;
      var a = last[0], b = last[last.length - 1];
      var vel = b[0] > a[0] ? (b[1] - a[1]) / (b[0] - a[0]) : 0;          // px/ms, positif vers le bas
      var off = d.sign * (e.clientY - y0);
      settle(d, e.type !== 'pointercancel' && (off > geo.step * 0.22 || d.sign * vel > 0.45));
      d = null;
    }
    box.addEventListener('pointerup', end);
    box.addEventListener('pointercancel', end);
    // un glissé ne doit jamais finir en « clic » sur le bouton où il a commencé
    box.addEventListener('click', function (e) {
      if (moved || busy) { e.stopPropagation(); e.preventDefault(); }
      moved = false;
    }, true);
  }

  /* ---------- les toiles du tracé et de la forme (accueil) ---------- */

  function paperBg(x, w, h, cs, ink) {
    x.fillStyle = cs.getPropertyValue('--raise').trim(); x.fillRect(0, 0, w, h);
    x.fillStyle = ink;
    for (var i = 0, X = 0; X <= w; i++, X = i * 12.5) { x.globalAlpha = i % 5 === 0 ? 0.13 : 0.05; x.fillRect(Math.round(X), 0, 1, h); }
    for (var j = 0, Y = 0; Y <= h; j++, Y = j * 12.5) { x.globalAlpha = j % 5 === 0 ? 0.13 : 0.05; x.fillRect(0, Math.round(Y), w, 1); }
    x.globalAlpha = 1;
  }
  function fitCanvas(cv) {
    var dpr = root.devicePixelRatio || 1, r = cv.getBoundingClientRect();
    var Wd = Math.max(1, Math.round(r.width * dpr)), Hd = Math.max(1, Math.round(r.height * dpr));
    if (cv.width !== Wd || cv.height !== Hd) { cv.width = Wd; cv.height = Hd; }
    var x = cv.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { x: x, w: r.width, h: r.height };
  }

  // La forme : elle glisse, tourne et change de taille d'une pose à l'autre ; la pose suivante est
  // annoncée en pointillé. Toucher la toile la relance.
  var formhero = { raf: 0, from: null, to: null, t0: 0, next: 0, shape: 0, pal: null, wave: 0 };
  function startForm() { if (!formhero.raf) formhero.raf = requestAnimationFrame(formFrame); }
  function stopForm() { cancelAnimationFrame(formhero.raf); formhero.raf = 0; }
  function formFrame(now) {
    if (current() !== 'home' || !formOn) { formhero.raf = 0; return; }
    formhero.raf = requestAnimationFrame(formFrame);   // reprogrammée d'abord : une image ratée ne fige rien
    var Gm = root.NC.geste, f = fitCanvas($('formhero')), x = f.x, w = f.w, h = f.h, cs = getComputedStyle(document.documentElement);
    var ink = cs.getPropertyValue('--ink').trim();
    paperBg(x, w, h, cs, ink);
    if (!formhero.to || now > formhero.next) {
      formhero.from = formhero.to || Gm.randomPose(Math.random, w, h);
      formhero.to = Gm.randomPose(Math.random, w, h);
      if (Math.random() < 0.4) formhero.shape = (formhero.shape + 1) % Gm.SHAPES.length;
      formhero.t0 = now; formhero.next = now + 3400;
    }
    var k = Math.min(1, (now - formhero.t0) / 2200), e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
    var A = formhero.from, B = formhero.to, sh = Gm.SHAPES[formhero.shape];
    var da = ((B.a - A.a) % (2 * Math.PI) + 3 * Math.PI) % (2 * Math.PI) - Math.PI;
    var pose = { x: A.x + (B.x - A.x) * e, y: A.y + (B.y - A.y) * e, a: A.a + da * e, k: A.k + (B.k - A.k) * e };
    var tp = Gm.place(sh, B);
    x.setLineDash([5, 5]); x.lineWidth = 1.5; x.strokeStyle = ink; x.globalAlpha = 0.5;
    x.beginPath(); tp.forEach(function (q, n) { if (n) x.lineTo(q[0], q[1]); else x.moveTo(q[0], q[1]); }); x.closePath(); x.stroke();
    x.setLineDash([]); x.globalAlpha = 1;
    // posée : une onde aux couleurs d'une palette tirée pour l'occasion (comme dans le jeu)
    if (k >= 1 && formhero.wave < formhero.t0) { formhero.wave = now; formhero.pal = root.NC.palette.tirer(); }
    var ew = formhero.wave >= formhero.t0 ? (now - formhero.wave) / 1100 : 9;
    for (var j = 0; j < 4 && ew < 1.4; j++) {
      var ej = ew - j * 0.12;
      if (ej <= 0 || ej >= 1) continue;
      var rp = root.NC.hand.grow(tp, 1 + 0.9 * (1 - Math.pow(1 - ej, 3)));
      x.beginPath(); rp.forEach(function (q, n) { if (n) x.lineTo(q[0], q[1]); else x.moveTo(q[0], q[1]); }); x.closePath();
      x.globalAlpha = (1 - ej) * 0.9; x.lineWidth = 3 * (1 - ej) + 1; x.strokeStyle = formhero.pal.col(j); x.stroke();
    }
    x.globalAlpha = 1;
    var pp = Gm.place(sh, pose);
    x.beginPath(); pp.forEach(function (q, n) { if (n) x.lineTo(q[0], q[1]); else x.moveTo(q[0], q[1]); }); x.closePath();
    x.fillStyle = ink; x.fill();
  }

  // Le tracé : un rond fait des trajets au hasard en laissant une traîne. Toucher la toile relance un trajet.
  var scribe = { raf: 0, path: null, t0: 0, pal: null };
  function startScribe() { if (!scribe.raf) scribe.raf = requestAnimationFrame(scribeFrame); }
  function stopScribe() { cancelAnimationFrame(scribe.raf); scribe.raf = 0; }
  function scribeTap() { scribe.path = null; fx.haptic('tick'); }
  function scribeFrame(now) {
    if (current() !== 'home' || !scribeOn) { scribe.raf = 0; return; }
    scribe.raf = requestAnimationFrame(scribeFrame);   // reprogrammée d'abord : une image ratée ne fige rien
    var Gm = root.NC.geste, cv = $('scribe'), dpr = root.devicePixelRatio || 1, r = cv.getBoundingClientRect();
    var Wd = Math.max(1, Math.round(r.width * dpr)), Hd = Math.max(1, Math.round(r.height * dpr));
    if (cv.width !== Wd || cv.height !== Hd) { cv.width = Wd; cv.height = Hd; }
    var x = cv.getContext('2d'), w = r.width, h = r.height, cs = getComputedStyle(document.documentElement);
    var ink = cs.getPropertyValue('--ink').trim();
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    x.fillStyle = cs.getPropertyValue('--raise').trim(); x.fillRect(0, 0, w, h);
    x.fillStyle = ink;
    for (var i = 0, X = 0; X <= w; i++, X = i * 12.5) { x.globalAlpha = i % 5 === 0 ? 0.13 : 0.05; x.fillRect(Math.round(X), 0, 1, h); }
    for (var j = 0, Y = 0; Y <= h; j++, Y = j * 12.5) { x.globalAlpha = j % 5 === 0 ? 0.13 : 0.05; x.fillRect(0, Math.round(Y), w, 1); }
    x.globalAlpha = 1;
    // le rond et sa traîne
    if (!scribe.path || now - scribe.t0 > scribe.path.dur * 1000 + 900) { scribe.path = Gm.path(Math.random, null, h / w); scribe.t0 = now; scribe.pal = root.NC.palette.tirer(); }
    var dur = scribe.path.dur * 1000, u = Math.min(1, (now - scribe.t0) / dur), at = function (v) { var q = Gm.at(scribe.path, v); return [q[0] * w, q[1] * h]; };
    x.lineCap = 'round';
    for (var n = 24; n > 0; n--) {
      var a1 = at(Math.max(0, u - 0.5 * n / 24 * 1000 / dur)), b1 = at(Math.max(0, u - 0.5 * (n - 1) / 24 * 1000 / dur));
      x.globalAlpha = (1 - n / 24) * 0.85; x.lineWidth = 11 * (1 - n / 24) + 1; x.strokeStyle = scribe.pal.mix(1 - n / 24);
      x.beginPath(); x.moveTo(a1[0], a1[1]); x.lineTo(b1[0], b1[1]); x.stroke();
    }
    var dp = at(u);
    x.globalAlpha = u < 1 ? 1 : Math.max(0, 1 - (now - scribe.t0 - dur) / 500);
    x.beginPath(); x.arc(dp[0], dp[1], 10, 0, Math.PI * 2); x.fillStyle = ink; x.fill();
    x.globalAlpha = 1;
  }

  /* ---------- le petit clavier de la mélodie (accueil) ---------- */

  // Il joue tout seul, sans bruit : une touche s'enfonce, des éclats en montent. Toucher une touche la fait
  // sonner (avec l'instrument affiché) ; toucher au-dessus du clavier change d'instrument.
  var keyshero = { raf: 0, parts: [], press: {}, next: 0, seq: [], i: 0, inst: 0, quiet: 0, bufs: {}, pal: null };
  function startKeys() { if (!keyshero.raf) keyshero.raf = requestAnimationFrame(keysFrame); }
  function stopKeys() { cancelAnimationFrame(keyshero.raf); keyshero.raf = 0; }
  function heroGeo(w, h) { var kh = Math.min(h * 0.46, 120), ww = w / 8; return { top: h - kh, kh: kh, ww: ww, bw: ww * 0.58, bh: kh * 0.6 }; }
  function heroRect(q, k) {
    var Mm = root.NC.melodie, j;
    if (!Mm.isBlack(k)) { j = Mm.WHITE.indexOf(k); return { x: j * q.ww + 1, y: q.top, w: q.ww - 2, h: q.kh }; }
    j = Mm.WHITE.indexOf(k - 1);
    return { x: (j + 1) * q.ww - q.bw / 2, y: q.top, w: q.bw, h: q.bh };
  }
  function heroAt(q, px, py) {
    var Mm = root.NC.melodie;
    if (py < q.top) return null;
    for (var b = 0; b < 5; b++) { var k = [1, 3, 6, 8, 10][b], r = heroRect(q, k); if (px >= r.x && px <= r.x + r.w && py <= r.y + r.h) return k; }
    return Mm.WHITE[Math.max(0, Math.min(7, Math.floor(px / q.ww)))];
  }
  function heroPress(q, k) {
    var r = heroRect(q, k);
    if (!keyshero.pal) keyshero.pal = root.NC.palette.tirer();
    keyshero.press[k] = performance.now();
    var col = keyshero.pal.mix(k / 12);
    for (var j = 0; j < 12; j++) keyshero.parts.push({ x: r.x + r.w / 2 + (Math.random() - 0.5) * r.w * 0.6, y: q.top, vx: (Math.random() - 0.5) * 1.1, vy: -(2 + Math.random() * 4.5), life: 1, d: 0.012 + Math.random() * 0.014, s: 2 + Math.random() * 3.5, col: col });
  }
  function keysTap(e) {
    var Mm = root.NC.melodie, r = $('keyshero-wrap').getBoundingClientRect(), q = heroGeo(r.width, r.height);
    var k = heroAt(q, e.clientX - r.left, e.clientY - r.top), inst = Mm.INSTRUMENTS[keyshero.inst];
    keyshero.quiet = performance.now();
    fx.haptic('tick');
    if (k === null) {                                   // au-dessus du clavier : l'instrument suivant
      keyshero.inst = (keyshero.inst + 1) % Mm.INSTRUMENTS.length;
      $('keyshero-hint').textContent = 'Touche le clavier · ' + Mm.INSTRUMENTS[keyshero.inst].name;
      return;
    }
    heroPress(q, k);
    try {
      var a = fx.ctx(); if (!a) return;
      var id = inst.id + ':' + k;
      if (!keyshero.bufs[id]) { var x = Mm.render(inst, k, a.sampleRate, 0.4), b = a.createBuffer(1, x.length, a.sampleRate); b.getChannelData(0).set(x); keyshero.bufs[id] = b; }
      var s = a.createBufferSource(); s.buffer = keyshero.bufs[id]; s.connect(a.destination); s.start();
    } catch (x) {}
  }
  function keysFrame(now) {
    if (current() !== 'home' || !keysOn) { keyshero.raf = 0; return; }
    keyshero.raf = requestAnimationFrame(keysFrame);   // reprogrammée d'abord : une image ratée ne fige rien
    var Mm = root.NC.melodie, f = fitCanvas($('keyshero')), x = f.x, w = f.w, h = f.h, cs = getComputedStyle(document.documentElement);
    var ink = cs.getPropertyValue('--ink').trim(), q = heroGeo(w, h);
    x.fillStyle = cs.getPropertyValue('--raise').trim(); x.fillRect(0, 0, w, h);
    // il joue tout seul quand on ne le touche pas
    if (now > keyshero.next && now - keyshero.quiet > 2500) {
      if (keyshero.i >= keyshero.seq.length) { keyshero.seq = Mm.melody(Math.random, 8, Math.random() < 0.3); keyshero.i = 0; keyshero.pal = root.NC.palette.tirer(); }
      heroPress(q, keyshero.seq[keyshero.i++]);
      keyshero.next = now + (keyshero.i >= keyshero.seq.length ? 1300 : 300 + Math.random() * 260);
    }
    for (var i = keyshero.parts.length - 1; i >= 0; i--) {
      var p = keyshero.parts[i];
      p.vx *= 0.97; p.vy = p.vy * 0.97 + 0.025; p.x += p.vx; p.y += p.vy; p.life -= p.d;
      if (p.life <= 0 || p.y > q.top) { keyshero.parts.splice(i, 1); continue; }
      x.globalAlpha = Math.min(1, p.life * 1.3); x.fillStyle = p.col || ink;
      var sz = p.s * (0.5 + p.life * 0.5); x.fillRect(p.x - sz / 2, p.y - sz / 2, sz, sz);
    }
    x.globalAlpha = 1;
    var paper = cs.getPropertyValue('--paper').trim(), pink = cs.getPropertyValue('--paper-ink').trim();
    function one(k) {
      var r = heroRect(q, k), black = Mm.isBlack(k), dn = keyshero.press[k] ? Math.max(0, 1 - (now - keyshero.press[k]) / 280) : 0;
      x.fillStyle = black ? (dn ? '#3d3d3d' : pink) : (dn ? '#bdbdbd' : paper);
      x.fillRect(r.x, r.y + dn * 3, r.w, r.h - dn * 3);
    }
    Mm.WHITE.forEach(one); [1, 3, 6, 8, 10].forEach(one);
  }

  /* ---------- le nuage de l'oreille (accueil) ---------- */

  // Un nuage de petits carrés qui respire au repos ; le toucher fait sonner une fréquence au hasard
  // et le nuage éclate. En bas, une règle en hertz qui défile lentement : l'instrument du jeu.
  var cloud = { parts: [], raf: 0, pulse: 0, last: 0, fx: 0.5, fy: 0.45, pal: null };
  function startCloud() { if (!cloud.raf) cloud.raf = requestAnimationFrame(cloudFrame); }
  function stopCloud() { cancelAnimationFrame(cloud.raf); cloud.raf = 0; }
  function cloudTap(e) {
    var r = $('cloud-wrap').getBoundingClientRect();
    cloud.fx = (e.clientX - r.left) / r.width; cloud.fy = (e.clientY - r.top) / r.height;
    cloud.pulse = 1; cloud.pal = root.NC.palette.tirer();   // un autre son, une autre palette
    fx.haptic('tick');
    try {
      var a = fx.ctx(); if (!a) return;
      var f = 150 * Math.exp(Math.random() * Math.log(6)), o = a.createOscillator(), g = a.createGain(), t = a.currentTime;
      o.frequency.value = f; o.type = 'sine';
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.18, t + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
      o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + 0.75);
    } catch (x) {}
  }
  function cloudFrame(now) {
    if (current() !== 'home' || !cloudOn) { cloud.raf = 0; return; }
    cloud.raf = requestAnimationFrame(cloudFrame);   // reprogrammée d'abord : une image ratée ne fige rien
    var cv = $('cloud'), dpr = root.devicePixelRatio || 1, r = cv.getBoundingClientRect();
    var W = Math.max(1, Math.round(r.width * dpr)), Hh = Math.max(1, Math.round(r.height * dpr));
    if (cv.width !== W || cv.height !== Hh) { cv.width = W; cv.height = Hh; }
    var x = cv.getContext('2d'), w = r.width, h = r.height, rule = 30, fh = h - rule;
    x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, w, h);
    var dt = Math.min(50, cloud.last ? now - cloud.last : 16), k = dt / 16; cloud.last = now;
    // respiration lente (deux sinus incommensurables) + éclat au toucher qui retombe
    var lv = 0.34 + 0.16 * Math.sin(now / 900) * Math.sin(now / 1370) + cloud.pulse * 0.9;
    cloud.pulse *= Math.pow(0.94, k);
    var cx = cloud.fx * w, cy = Math.min(fh - 10, cloud.fy * h);
    var born = (0.3 + lv * 7) * k;
    if (!cloud.pal) cloud.pal = root.NC.palette.tirer();
    while (born > 0 && cloud.parts.length < 420) {
      if (born < 1 && Math.random() > born) break;
      born -= 1;
      var a = Math.random() * Math.PI * 2, sp = (0.2 + lv * (1 + Math.random() * 2.6)) * (0.5 + Math.random()), r0 = Math.random() * (4 + lv * 22);
      cloud.parts.push({ x: cx + Math.cos(a) * r0, y: cy + Math.sin(a) * r0, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1, d: 0.005 + Math.random() * 0.009, s: 1.2 + Math.random() * (1.4 + lv * 3.5), col: cloud.pal.col(Math.floor(Math.random() * 5)) });
    }
    var ink = getComputedStyle(document.documentElement).getPropertyValue('--ink').trim();
    x.fillStyle = ink;
    for (var i = cloud.parts.length - 1; i >= 0; i--) {
      var q = cloud.parts[i], dx = q.x - cx, dy = q.y - cy, dd = Math.sqrt(dx * dx + dy * dy) + 1;
      q.vx += (-dy / dd) * 0.018 * k; q.vy += (dx / dd) * 0.018 * k;
      q.vx *= Math.pow(0.985, k); q.vy *= Math.pow(0.985, k);
      q.x += q.vx * k; q.y += q.vy * k; q.life -= q.d * k;
      if (q.life <= 0 || q.y > fh || q.y < -8 || q.x < -8 || q.x > w + 8) { cloud.parts.splice(i, 1); continue; }
      x.globalAlpha = Math.min(1, q.life * 1.4) * (0.6 + Math.min(1, lv) * 0.4); x.fillStyle = q.col || ink;
      var sz = q.s * (0.6 + q.life * 0.6);
      x.fillRect(q.x - sz / 2, q.y - sz / 2, sz, sz);
    }
    x.globalAlpha = 1;
    // la règle en hertz, sur papier, qui défile
    x.fillStyle = '#ececec'; x.fillRect(0, fh, w, rule);
    var off = (now / 40) % 400, base = 150 - off, kpx = w / 400;
    x.fillStyle = '#111'; x.textBaseline = 'top'; x.textAlign = 'left'; x.font = '400 9.5px Mono, monospace';
    for (var f = Math.ceil(base / 10) * 10; f <= base + 420; f += 10) {
      var X = Math.round((f - base) * kpx) - 0.5, big = f % 50 === 0;
      x.globalAlpha = big ? 0.9 : 0.4;
      x.fillRect(X, fh, 1, big ? 11 : 6);
      if (big && f > 0) x.fillText(String(f), X + 3, fh + 15);
    }
    x.globalAlpha = 1;
  }

  /* ---------- accueil ---------- */

  function refresh() {
    if (world() === 'eye') renderFan(true); else renderFan(false);
    var eye = S.eye(50), ear = S.ear(50), P = root.NC.pitch;
    $('ws-eye').innerHTML = eye ? C.rank(eye.avg) + '<br>' + Math.round(eye.avg) + '/100' : 'Premier<br>coup d’œil';
    $('ws-ear').innerHTML = ear ? P.rank(ear.avg) + '<br>' + Math.round(ear.avg) + '/100' : 'Première<br>écoute';
    var Gm = root.NC.geste, lt = S.level(50, 'trace'), lf = S.level(50, 'forme');
    $('ws-trace').innerHTML = lt ? Gm.rank(lt.avg) + '<br>' + Math.round(lt.avg) + '/100' : 'Premier<br>tracé';
    $('ws-forme').innerHTML = lf ? Gm.rank(lf.avg) + '<br>' + Math.round(lf.avg) + '/100' : 'Première<br>forme';
    var Mm = root.NC.melodie, lm = S.level(50, 'melodie');
    $('ws-melodie').innerHTML = lm ? Mm.rank(lm.avg) + '<br>' + Math.round(lm.avg) + '/100' : 'Premières<br>notes';

    var dr = S.dailyResult(), n = S.dayNumber(), st = S.streak();
    var daily = $('btn-daily'), sw = '';
    var cols = C.series(C.rng(S.daySeed()), 5);
    for (var i = 0; i < 5; i++) {
      sw += dr ? '<i style="background:' + C.css(C.hsvToRgb(cols[i].h, cols[i].s, cols[i].v)) + '"></i>' : '<i></i>';
    }
    $('daily-sw').innerHTML = sw;
    $('daily-sub').textContent = dr ? 'n° ' + n + ' · fait : ' + dr.total + '/500' : 'n° ' + n + ' · 5 couleurs · un essai';
    $('daily-streak').innerHTML = st ? st + '<small>' + (st > 1 ? 'jours' : 'jour') + '</small>' : '';
    daily.classList.toggle('todo', !dr);
    $('btn-play').classList.toggle('ghost', !dr);

    var b = S.data.best;
    $('records').innerHTML =
      cell('Partie', b.partie ? b.partie + '<small>/500</small>' : '—') +
      cell('Survie', b.survieManches ? b.survieManches + '<small>manches</small>' : '—') +
      cell('Série', st ? st + '<small>j</small>' : '—');

    // défi du jour du son : avant, une trame ; après, les 5 fréquences en barres (hauteur = aigu)
    var dsr = S.dailyResult('son'), sst = S.streak('son'), fr = P.series(C.rng(S.daySeed() * 7 + 3), 5), bars = '';
    for (var j = 0; j < 5; j++) {
      var hgt = Math.round(20 + 80 * Math.log(fr[j] / P.LOW) / Math.log(P.HIGH / P.LOW));
      bars += dsr ? '<i class="bar" style="--h:' + hgt + '%"></i>' : '<i></i>';
    }
    $('ear-daily-sw').innerHTML = bars;
    $('ear-daily-sub').textContent = dsr ? 'n° ' + n + ' · fait : ' + dsr.total + '/500' : 'n° ' + n + ' · 5 fréquences · un essai';
    $('ear-daily-streak').innerHTML = sst ? sst + '<small>' + (sst > 1 ? 'jours' : 'jour') + '</small>' : '';
    $('btn-ear-daily').classList.toggle('todo', !dsr);
    $('btn-ear').classList.toggle('ghost', !dsr);
    $('records-ear').innerHTML =
      cell('Partie', b.son ? b.son + '<small>/500</small>' : '—') +
      cell('Survie', b.sonSurvieManches ? b.sonSurvieManches + '<small>manches</small>' : '—') +
      cell('Accordage', b.accord ? b.accord + '<small>/500</small>' : '—');
    var count = function (m) { return S.data.games.filter(function (x) { return x.mode === m; }).length; };
    var nt = count('geste'), nf = count('forme');
    $('records-trace').innerHTML =
      cell('Record', b.geste ? b.geste + '<small>/500</small>' : '—') +
      cell('Niveau', lt ? Math.round(lt.avg) + '<small>/100</small>' : '—') +
      cell('Parties', nt || '—');
    $('records-forme').innerHTML =
      cell('Record', b.forme ? b.forme + '<small>/500</small>' : '—') +
      cell('Niveau', lf ? Math.round(lf.avg) + '<small>/100</small>' : '—') +
      cell('Parties', nf || '—');
    $('records-melodie').innerHTML =
      cell('Partie', b.melodie ? b.melodie + '<small>/500</small>' : '—') +
      cell('Survie', b.melodieSurvieManches ? b.melodieSurvieManches + '<small>manches</small>' : '—') +
      cell('Niveau', lm ? Math.round(lm.avg) + '<small>/100</small>' : '—');
  }
  function cell(k, v) { return '<div><span>' + k + '</span><b>' + v + '</b></div>'; }

  // Fabrique une lame de nuancier : étiquette, trois tons de la même couleur, pied percé
  function strip(c) {
    var el = document.createElement('div');
    el.className = 'strip';
    el.innerHTML = '<div class="s-lab"><b></b><small></small></div><div class="s-sw"></div>' +
      '<div class="s-sw" style="flex-grow:1.6"></div><div class="s-sw"></div><div class="s-foot"></div>';
    paint(el, c);
    return el;
  }
  function paint(el, c) {
    var base = C.hsvToRgb(c.h, c.s, c.v);
    var light = C.hsvToRgb(c.h, c.s * 0.42, Math.min(1, c.v * 0.35 + 0.65));
    var dark = C.hsvToRgb(c.h, Math.min(1, c.s * 1.05), c.v * 0.62);
    el.querySelector('b').textContent = C.nameOf(base);
    el.querySelector('small').textContent = C.hex(base);
    var sw = el.querySelectorAll('.s-sw');
    sw[0].style.background = C.css(light); sw[1].style.background = C.css(base); sw[2].style.background = C.css(dark);
  }

  function fanColors(n) {
    var r = S.recentTargets(n);
    if (r.length < n) r = r.concat(DEFAULT_FAN.slice(0, n - r.length));
    return r.slice(0, n).reverse();
  }

  // L'éventail : lames qui pivotent autour d'un seul rivet. Géométrie calculée pour tenir dans la place.
  // Contrainte qui commande tout : chaque lame recouvre le bord droit de la précédente, donc la partie
  // visible d'une étiquette vaut (rayon × pas angulaire). Elle doit loger le mot le plus large du
  // nuancier (« Chartreuse »), mesuré en vrai avec le style de l'étiquette.
  var LAB = 46, wordW = 0;
  function widestWord() {
    if (wordW) return wordW;
    var w = 0, sp = document.createElement('b');
    var host = document.createElement('div');
    host.className = 'strip'; host.style.cssText = 'visibility:hidden;left:-999px;top:0';
    var lab = document.createElement('div'); lab.className = 's-lab';
    lab.appendChild(sp); host.appendChild(lab); document.body.appendChild(host);
    sp.style.whiteSpace = 'nowrap'; sp.style.maxWidth = 'none';
    C.NAMES.forEach(function (n) {
      n[0].split(/[\s-]+/).forEach(function (m) { sp.textContent = m; w = Math.max(w, sp.getBoundingClientRect().width); });
    });
    host.remove();
    // on ne garde la mesure qu'une fois la police chargée (sinon c'est celle de la police de secours)
    if (!document.fonts || document.fonts.status === 'loaded') wordW = w;
    return w;
  }
  function renderFan(animate) {
    var wrap = $('fan-wrap'), fan = $('fan');
    var W = wrap.clientWidth, H = wrap.clientHeight;
    if (W < 10 || H < 10) return;
    var sw = Math.round(Math.min(80, W * 0.19));
    var rv = 18;                                 // rivet à 18 px du bas de la lame
    // demi-ouverture maximale pour que le coin haut de la dernière lame reste dans l'écran
    function opening(L) {
      for (var a = 60; a >= 8; a--) {
        var r = a * Math.PI / 180;
        if (Math.sin(r) * (L - rv) + Math.cos(r) * sw / 2 <= W / 2 - 4) return a;
      }
      return 8;
    }
    function visible(L, half, n) { return (L - rv - LAB) * (2 * half * Math.PI / 180) / (n - 1) - 8; }
    var WORD = widestWord() + 3;
    // on cherche les lames les plus longues possible, avec une vraie ouverture d'éventail (≥ 27°)
    var n, L, half, found = false, Lmax = Math.round(Math.min(H - 40, 440));
    for (L = Lmax; L >= 170 && !found; L -= 10) {
      half = opening(L);
      for (n = 6; n >= 5; n--) if (half >= 27 && visible(L, half, n) >= WORD) { found = true; break; }
    }
    if (found) L += 10;
    else {
      for (n = 5, L = Lmax; L >= 120; L -= 10) { half = opening(L); if (visible(L, half, n) >= WORD) break; }
      L = Math.max(L, 120); half = opening(L);
    }
    var cols = fanColors(n);
    // centré verticalement ; sous le rivet dépassent le pied et les coins des lames inclinées
    var below = rv + Math.sin(half * Math.PI / 180) * sw / 2 + 6;
    var top = Math.max(0, (H - (L - rv) - below) / 2);
    var px = W / 2, py = top + L - rv;           // position du rivet
    fan.innerHTML = '';
    cols.forEach(function (c, i) {
      var el = strip(c);
      el.style.width = sw + 'px';
      el.style.height = L + 'px';
      el.style.left = (px - sw / 2) + 'px';
      el.style.top = (py + rv - L) + 'px';
      el.style.setProperty('--rv', rv + 'px');
      el.style.zIndex = i + 1;
      var ang = -half + (2 * half) * i / (n - 1);
      el.dataset.a = ang;
      if (animate) { el.style.transitionDelay = (i * 45) + 'ms'; el.style.transform = 'rotate(0deg)'; }
      else el.style.transform = 'rotate(' + ang + 'deg)';
      fan.appendChild(el);
    });
    var rivet = document.createElement('div');
    rivet.className = 'rivet';
    rivet.style.left = px + 'px'; rivet.style.top = py + 'px';
    fan.appendChild(rivet);
    if (animate) {
      fan.offsetWidth; // force le premier état avant d'ouvrir
      requestAnimationFrame(function () {
        Array.prototype.forEach.call(fan.querySelectorAll('.strip'), function (el) { el.style.transform = 'rotate(' + el.dataset.a + 'deg)'; });
      });
    }
  }

  // Toucher l'éventail le referme, puis il se rouvre sur d'autres couleurs
  var refanning = false;
  function refan() {
    if (refanning) return;
    refanning = true;
    var els = $('fan').querySelectorAll('.strip');
    fx.sfx.hide(); fx.haptic('tick');
    Array.prototype.forEach.call(els, function (el, i) {
      el.style.transitionDelay = ((els.length - i) * 25) + 'ms';
      el.style.transform = 'rotate(0deg)';
    });
    setTimeout(function () {
      var cols = C.series(C.rng((Math.random() * 4294967296) >>> 0), els.length);
      Array.prototype.forEach.call(els, function (el, i) { paint(el, cols[i] || C.randomColor(Math.random)); });
      setTimeout(function () { refanning = false; }, 700);
      fx.sfx.show();
      Array.prototype.forEach.call(els, function (el, i) {
        el.style.transitionDelay = (i * 45) + 'ms';
        el.style.transform = 'rotate(' + el.dataset.a + 'deg)';
      });
    }, 520);
  }

  /* ---------- bilan ---------- */

  var KICKER = {
    jour: 'Défi du jour · couleur', partie: 'L’œil · partie', survie: 'L’œil · survie',
    'son-jour': 'Défi du jour · son', son: 'L’oreille · partie', 'son-survie': 'L’oreille · survie', accord: 'L’oreille · accordage',
    geste: 'Le tracé · partie', forme: 'La forme · partie', melodie: 'La mélodie · partie', 'melodie-survie': 'La mélodie · survie'
  };
  function showResult(game, res) {
    lastGame = game; lastRes = res;
    root.NC.classement.envoyer(game);                 // le score part sur le classement Google Play Jeux du mode
    $('res-lb').hidden = !root.NC.classement.dispo(game.mode);
    var n = game.rounds.length, avg = n ? game.total / n : 0;
    // la mélodie en survie compte ses points note à note : son rang se juge sur la moyenne des manches (/100)
    if (S.isTune(game.mode) && n) avg = game.rounds.reduce(function (a, r) { return a + r.score; }, 0) / n;
    var wd = S.worldOf(game.mode), son = wd === 'ear', hand = wd === 'trace' || wd === 'forme', tune = wd === 'melodie';
    var R = son ? root.NC.pitch : hand ? root.NC.geste : tune ? root.NC.melodie : C;
    var survival = /survie$/.test(game.mode), daily = /jour$/.test(game.mode);
    $('res-kicker').textContent = KICKER[game.mode] + (daily ? ' · n° ' + S.dayNumber() : '');
    $('res-max').textContent = survival ? 'pts' : '/' + n * 100;
    $('res-rank').textContent = R.rank(avg);

    var note = '';
    if (res.newBest) note = '<span class="stamp">Record</span>ancien : ' + res.prevBest;
    else if (survival) note = '<b>' + game.cleared + '</b> manche' + (game.cleared > 1 ? 's' : '') + ' tenue' + (game.cleared > 1 ? 's' : '') + (res.prevBest ? ' · record ' + Math.max(res.prevBest, game.total) + ' pts' : '');
    else if (daily) note = res.streak ? 'Série : <b>' + res.streak + ' jour' + (res.streak > 1 ? 's' : '') + '</b> · revenez demain' : '';
    else if (res.prevBest) note = 'Record : ' + Math.max(res.prevBest, game.total);
    else if (!daily) note = 'Premier score posé. À battre.';
    $('res-note').innerHTML = note;

    // Le niveau à long terme et la marche suivante : la raison de rejouer
    var eye = S.level(50, wd), goal = $('goal'), fill = $('goal-fill');
    fill.style.transition = 'none'; fill.style.width = '0';
    if (eye) {
      var nx = R.nextRank(eye.avg), floor = 0;
      R.RANKS.forEach(function (r) { if (r[0] <= eye.avg && r[0] > floor) floor = r[0]; });
      $('goal-a').innerHTML = 'Niveau : <b>' + R.rank(eye.avg) + '</b>' + (nx ? ' → ' + nx.name : '');
      $('goal-b').textContent = nx ? Math.round(eye.avg) + ' / ' + nx.at : 'sommet';
      var ratio = nx ? (eye.avg - floor) / (nx.at - floor) : 1;
      goal.hidden = false;
      fill.offsetWidth;
      fill.style.transition = '';
      setTimeout(function () { fill.style.width = Math.max(2, Math.min(100, ratio * 100)) + '%'; }, 30);
    } else goal.hidden = true;

    var h = '';
    game.rounds.forEach(function (r, i) {
      if (son) { h += earChip(r, i); return; }
      if (hand) { h += handChip(r, i); return; }
      if (tune) { h += tuneChip(r, i); return; }
      var t = C.hsvToRgb(r.target.h, r.target.s, r.target.v), p = C.hsvToRgb(r.pick.h, r.pick.s, r.pick.v);
      var miss = survival && r.kept === false;
      h += '<div class="rc' + (miss ? ' miss' : '') + '" style="animation-delay:' + (i * 70) + 'ms">' +
        '<div class="rc-t" style="background:' + C.css(t) + '"></div>' +
        '<div class="rc-p" style="background:' + C.css(p) + '"></div>' +
        '<div class="rc-l"><b>' + r.score + '</b><small>' + C.hex(t) + '</small></div></div>';
    });
    $('res-chips').innerHTML = h;
    $('res-chips').style.gridAutoColumns = n > 6 ? '52px' : '1fr';

    $('btn-again').hidden = daily;          // un seul essai par défi : on partage ou on rentre
    show('result');

    // le total se compte
    var el = $('res-total'), t0 = performance.now(), dur = 900;
    (function frame(now) {
      var k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      el.textContent = Math.round(game.total * e);
      if (k < 1) requestAnimationFrame(frame);
    })(t0);
    if (res.newBest) setTimeout(function () { fx.sfx.record(); fx.haptic('rise'); }, 500);
  }

  // Une manche à l'oreille : les deux ondes (cible pleine, toi en pointillé), le score, la fréquence visée
  function earChip(r, i) {
    var P = root.NC.pitch;
    function path(c, amp) {
      var cyc = c / 110, d = '';
      for (var x = 0; x <= 60; x += 0.75) d += (x ? 'L' : 'M') + x.toFixed(2) + ' ' + (20 - amp * Math.sin(2 * Math.PI * cyc * x / 60)).toFixed(2);
      return d;
    }
    return '<div class="rc' + (r.kept === false ? ' miss' : '') + '" style="animation-delay:' + (i * 70) + 'ms">' +
      '<div class="rc-w"><svg viewBox="0 0 60 40" preserveAspectRatio="none"><path d="' + path(r.target, 14) + '"/><path class="p" d="' + path(r.pick, 11) + '"/></svg></div>' +
      '<div class="rc-l"><b>' + r.score + '</b><small>' + Math.round(r.target) + '\u00A0Hz</small></div></div>';
  }

  // Une manche de la main : le trajet du modèle (mouvement) ou la forme (forme), le score, l'écart en mm
  function handChip(r, i) {
    var Gm = root.NC.geste, svg = '';
    if (r.path) {
      var d = '';
      for (var k = 0; k <= 40; k++) { var q = Gm.at(r.path, k / 40); d += (k ? 'L' : 'M') + (q[0] * 60).toFixed(1) + ' ' + (q[1] * 60).toFixed(1); }
      svg = '<path d="' + d + '"/>';
    } else {
      var sh = Gm.SHAPES.filter(function (x) { return x.name === r.shape; })[0] || Gm.SHAPES[0];
      svg = '<path class="f" d="' + Gm.place(sh, { x: 30, y: 30, a: 0, k: 22 }).map(function (q, k) { return (k ? 'L' : 'M') + q[0].toFixed(1) + ' ' + q[1].toFixed(1); }).join('') + 'Z"/>';
    }
    return '<div class="rc" style="animation-delay:' + (i * 70) + 'ms">' +
      '<div class="rc-w rc-h"><svg viewBox="0 0 60 60" preserveAspectRatio="xMidYMid meet">' + svg + '</svg></div>' +
      '<div class="rc-l"><b>' + r.score + '</b><small>' + Gm.mm(r.d) + '</small></div></div>';
  }

  // Une mélodie : la mini-partition (la vraie pleine, tes notes fausses en creux), le score, l'instrument
  function tuneChip(r, i) {
    var n = r.target.length, cw = 36 / n, ch = 96 / 13, bw = Math.min(cw * 0.72, 6), bh = 4, svg = '';
    var y = function (k) { return 8 + (12 - k) * ch + ch / 2 - bh / 2; };
    r.target.forEach(function (t, j) {
      var x = 2 + j * cw + cw / 2 - bw / 2;
      svg += '<rect class="t" x="' + x.toFixed(1) + '" y="' + y(t).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + bh + '"/>';
      var p = r.picks[j];
      if (p !== undefined && p !== t) svg += '<rect class="p" x="' + (x + 0.5).toFixed(1) + '" y="' + (y(p) + 0.5).toFixed(1) + '" width="' + (bw - 1).toFixed(1) + '" height="' + (bh - 1) + '"/>';
    });
    return '<div class="rc' + (r.kept === false ? ' miss' : '') + '" style="animation-delay:' + (i * 70) + 'ms">' +
      '<div class="rc-w rc-m"><svg viewBox="0 0 40 112" preserveAspectRatio="xMidYMid meet">' + svg + '</svg></div>' +
      '<div class="rc-l"><b>' + r.score + '</b><small>' + esc(r.instName || '') + '</small></div></div>';
  }

  function onAgain() {
    fx.sfx.tap();
    if (!lastGame) return root.NC.game.start('partie');
    if (/jour$/.test(lastGame.mode)) return show('home');
    if (S.isSound(lastGame.mode)) return root.NC.ear.start(lastGame.mode);
    if (S.isHand(lastGame.mode)) return root.NC.hand.start(lastGame.mode);
    if (S.isTune(lastGame.mode)) return root.NC.tune.start(lastGame.mode);
    root.NC.game.start(lastGame.mode);
  }

  /* ---------- célébration : un éventail de tons sort du rivet ---------- */

  function burst(field, c, perfect) {
    var r = field.getBoundingClientRect(), host = $('app');
    var b = document.createElement('div');
    b.className = 'burst';
    b.style.left = (r.left + r.width / 2) + 'px';
    b.style.top = (r.bottom) + 'px';
    var n = perfect ? 11 : 7, span = perfect ? 150 : 110, len = Math.min(r.height * 0.95, perfect ? 230 : 180);
    for (var i = 0; i < n; i++) {
      var k = i / (n - 1), el = document.createElement('i');
      var tone = C.hsvToRgb(c.h, Math.max(0, Math.min(1, c.s * (0.35 + k * 0.9))), Math.max(0.15, Math.min(1, c.v * (1.25 - k * 0.6))));
      el.style.background = C.css(tone);
      el.style.height = len + 'px';
      el.style.transition = 'transform .5s cubic-bezier(.2,.9,.15,1) ' + (i * 18) + 'ms, opacity .35s ease ' + (520 + i * 10) + 'ms';
      el.dataset.a = (-span / 2 + span * k);
      b.appendChild(el);
    }
    host.appendChild(b);
    b.offsetWidth;
    requestAnimationFrame(function () {
      Array.prototype.forEach.call(b.children, function (el) { el.style.transform = 'rotate(' + el.dataset.a + 'deg)'; el.style.opacity = '0'; });
    });
    setTimeout(function () { b.remove(); }, 1300);
  }

  /* ---------- réglages ---------- */

  function openSheet() { renderSheet(); $('sheet').hidden = false; fx.sfx.tap(); }
  function closeSheet() { $('sheet').hidden = true; }
  function sheetOpen() { return !$('sheet').hidden; }
  function renderSheet() {
    $('v-theme').textContent = S.settings.theme === 'dark' ? 'Sombre' : 'Clair';
    $('v-sound').textContent = S.settings.sound ? 'Oui' : 'Non';
    $('v-haptics').textContent = S.settings.haptics ? 'Oui' : 'Non';
  }

  var toastT = 0;
  function toast(msg) {
    var t = $('toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('show'); }, 2200);
  }

  function esc(s) { return String(s).replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }); }

  root.NC = root.NC || {};
  root.NC.ui = {
    init: init, show: show, refresh: refresh, showResult: showResult, burst: burst, toast: toast,
    current: current, closeSheet: closeSheet, sheetOpen: sheetOpen,
    palettes: function () { return { cloud: cloud.pal, scribe: scribe.pal, form: formhero.pal, keys: keyshero.pal }; }
  };
})(this);
