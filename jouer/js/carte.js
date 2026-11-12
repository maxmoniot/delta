/* Delta — la carte de score à partager (demande de Max du 28/10/2026 : « pouvoir facilement partager ses scores, et
   que ce soit bien visible : nom du jeu et scores obtenus, pour s'en vanter sur les réseaux sociaux »).
   Une image 1080 × 1350 (le 4:5 des fils Instagram, Facebook, WhatsApp), dessinée sur une toile avec les polices du
   jeu et dans sa charte : gris neutres, coins vifs ; les seules couleurs sont celles du jeu (les pastilles).
   En haut, le monde sur son étiquette de papier ; au centre, le score en très grand et le rang ; en bas, les manches.
   Le lien de Delta part dans le texte qui accompagne l'image (un lien dans une image ne se clique pas). */
(function (root) {
  'use strict';
  var CW = 1080, CH = 1350, PAD = 80;
  var INK = '#f0f0f0', INK2 = '#9b9b9b', BG = '#151515', RAISE = '#1f1f1f', LINE = '#333333';
  var PAPER = '#e8e8e8', PINK = '#111111', PINK2 = '#6b6b6b';
  // L'identifiant Play (fr.max.nuancier) ne peut plus changer sans créer une autre appli : le lien partagé passe par
  // la page d'accueil de Delta, qui envoie au Play Store (29/10, Max voulait une adresse qui finisse par « delta »).
  var LINK = 'https://maxmoniot.github.io/delta/';
  var WORLD = {
    eye: { glyph: 'E', kicker: 'Couleur', name: 'L’œil' },
    ear: { glyph: 'f', kicker: 'Fréquence', name: 'L’oreille' },
    trace: { glyph: 'x', kicker: 'Mouvement', name: 'Le tracé' },
    forme: { glyph: '°', kicker: 'Placement', name: 'La forme' },
    melodie: { glyph: '', kicker: 'Mélodie', name: 'La mélodie' }
  };
  var MODE = {
    jour: 'Défi du jour', 'son-jour': 'Défi du jour', partie: 'Partie', son: 'Partie', geste: 'Partie', forme: 'Partie',
    melodie: 'Partie', survie: 'Survie', 'son-survie': 'Survie', 'melodie-survie': 'Survie', accord: 'Accordage'
  };
  var MAXCHIPS = 12;

  function S() { return root.NC.store; }
  function ranker(world) {
    var N = root.NC;
    return world === 'ear' ? N.pitch : world === 'trace' || world === 'forme' ? N.geste : world === 'melodie' ? N.melodie : N.color;
  }
  // moyenne par manche (/100) : la mélodie en survie compte note à note, son rang se juge sur les manches
  function average(game) {
    var n = game.rounds.length;
    if (!n) return 0;
    if (S().isTune(game.mode)) return game.rounds.reduce(function (a, r) { return a + r.score; }, 0) / n;
    return game.total / n;
  }
  function survival(game) { return /survie$/.test(game.mode); }
  function daily(game) { return /jour$/.test(game.mode); }

  /* ---------- outils de dessin ---------- */

  function font(x, weight, size, opt) {
    opt = opt || {};
    x.font = weight + ' ' + size + 'px ' + (opt.mono ? 'Mono, monospace' : 'Archivo, sans-serif');
    if ('fontStretch' in x) x.fontStretch = opt.wide ? 'expanded' : 'normal';
    if ('letterSpacing' in x) x.letterSpacing = (opt.track || 0) + 'px';
  }
  function text(x, s, px, py, color, align) { x.fillStyle = color; x.textAlign = align || 'left'; x.fillText(s, px, py); }
  function mark(x, px, py, k) {          // le logo : deux triangles décalés (comme le titre de l'accueil)
    x.save(); x.translate(px, py); x.scale(k, k);
    x.globalAlpha = 0.38; x.fillStyle = INK; x.fill(new Path2D('M18.5 5.5 31 27H6z'));
    x.globalAlpha = 1; x.strokeStyle = INK; x.lineWidth = 1.8; x.lineJoin = 'miter'; x.stroke(new Path2D('M15 2 28 24.5H2z'));
    x.restore();
  }
  function note(x, px, py, k, color) {   // la croche du monde mélodie (même dessin que l'en-tête)
    x.save(); x.translate(px, py); x.scale(k, k); x.fillStyle = color;
    x.fill(new Path2D('M9.5 1h2.4v21H9.5zM11.9 1 16 5.5v4.2L11.9 6zM1 18h10.9v9H1z')); x.restore();
  }
  function line(x, pts) { x.beginPath(); pts.forEach(function (p, i) { if (i) x.lineTo(p[0], p[1]); else x.moveTo(p[0], p[1]); }); }
  // cadre une liste de points (unités libres) dans une case, sans déformer
  function fitter(groups, bx, by, bw, bh, m) {
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    groups.forEach(function (g) { g.forEach(function (p) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }); });
    var k = Math.min((bw - 2 * m) / Math.max(1e-6, x1 - x0), (bh - 2 * m) / Math.max(1e-6, y1 - y0));
    var ox = bx + (bw - (x1 - x0) * k) / 2, oy = by + (bh - (y1 - y0) * k) / 2;
    return function (p) { return [ox + (p[0] - x0) * k, oy + (p[1] - y0) * k]; };
  }
  function hexOf(c) { var C = root.NC.color; return C.hex(C.hsvToRgb(c.h, c.s, c.v)); }
  function cssOf(c) { var C = root.NC.color; return C.css(C.hsvToRgb(c.h, c.s, c.v)); }

  /* ---------- une manche, en pastille ---------- */

  function chip(x, world, r, px, py, w, h) {
    var lab = Math.round(Math.min(104, Math.max(76, w * 0.58))), top = h - lab, miss = r.kept === false, small = '';
    if (world === 'eye') {
      x.fillStyle = cssOf(r.target); x.fillRect(px, py, w, top / 2);
      x.fillStyle = cssOf(r.pick); x.fillRect(px, py + top / 2, w, top - top / 2);
      small = hexOf(r.target);
    } else {
      x.fillStyle = RAISE; x.fillRect(px, py, w, top);
      x.save(); x.beginPath(); x.rect(px, py, w, top); x.clip();
      x.strokeStyle = INK; x.fillStyle = INK; x.lineCap = 'round'; x.lineJoin = 'round';
      if (world === 'ear') {
        // des ondes lisibles : le nombre d'oscillations suit la hauteur (en octaves), sans jamais devenir un aplat
        var wave = function (c, amp, dash, lw) {
          var cyc = Math.min(w / 34, 1 + 1.2 * Math.log(Math.max(60, c) / 140) / Math.LN2), pts = [];
          for (var i = 0; i <= 120; i++) { var u = i / 120; pts.push([px + u * w, py + top / 2 - amp * Math.sin(2 * Math.PI * cyc * u)]); }
          x.setLineDash(dash); x.lineWidth = lw; line(x, pts); x.stroke(); x.setLineDash([]);
        };
        wave(r.target, top * 0.34, [], 4);
        wave(r.pick, top * 0.27, [9, 8], 2.5);
        small = Math.round(r.target) + ' Hz';
      } else if (world === 'trace' && r.path) {
        var G = root.NC.geste, asp = r.asp || 1, model = [];
        if (r.path.sharp) r.path.pts.forEach(function (q) { model.push([q[0], q[1] * asp]); });
        else for (var k = 0; k <= 80; k++) { var q = G.at(r.path, k / 80); model.push([q[0], q[1] * asp]); }
        var mine = (r.mine || []).map(function (q) { return [q[0], q[1] * asp]; });
        var f = fitter(mine.length ? [model, mine] : [model], px, py, w, top, 16);
        x.lineWidth = 5; x.lineJoin = r.path.sharp ? 'miter' : 'round'; line(x, model.map(f)); x.stroke();
        if (mine.length) { x.lineJoin = 'round'; x.setLineDash([8, 8]); x.lineWidth = 3; x.globalAlpha = 0.85; line(x, mine.map(f)); x.stroke(); x.setLineDash([]); x.globalAlpha = 1; }
        small = root.NC.geste.mm(r.d);
      } else if (world === 'forme') {
        var Gf = root.NC.geste, sh = Gf.SHAPES.filter(function (s) { return s.name === r.shape; })[0] || Gf.SHAPES[0];
        var a = r.asp || 1, M = Math.min(1, a), pose = function (p) { return { x: p.x, y: p.y * a, a: p.a, k: p.k * M }; };
        var T = r.tp ? Gf.place(sh, pose(r.tp)) : Gf.place(sh, { x: 0, y: 0, a: 0, k: 1 });
        var P = r.pp ? Gf.place(sh, pose(r.pp)) : null;
        var ff = fitter(P ? [T, P] : [T], px, py, w, top, 14);
        line(x, T.map(ff)); x.closePath(); x.fill();
        if (P) { x.setLineDash([8, 7]); x.lineWidth = 3; x.lineJoin = 'miter'; line(x, P.map(ff)); x.closePath(); x.stroke(); x.setLineDash([]); }
        small = Gf.mm(r.d);
      } else if (world === 'melodie' && r.target) {
        var n = r.target.length, cw = (w - 20) / n, ch = (top - 24) / 13, bw = Math.min(cw * 0.8, 30), bh = Math.max(7, ch * 0.9);
        var y = function (key) { return py + 12 + (12 - key) * ch + (ch - bh) / 2; };
        r.target.forEach(function (t, j) {
          var cx = px + 10 + j * cw + (cw - bw) / 2;
          x.fillRect(cx, y(t), bw, bh);
          var p = r.picks && r.picks[j];
          if (p !== undefined && p !== t) { x.lineWidth = 2.5; x.strokeRect(cx + 1.5, y(p) + 1.5, bw - 3, bh - 3); }
        });
        small = r.instName || '';
      }
      x.restore();
    }
    // l'étiquette de papier : le score de la manche (barré si la manche a coûté une vie)
    x.fillStyle = PAPER; x.fillRect(px, py + top, w, lab);
    var big = Math.round(Math.min(54, w * 0.34));
    font(x, 800, big, { wide: true, track: -1 });
    var sb = py + top + 10 + big * 0.8;
    text(x, String(r.score), px + 12, sb, miss ? PINK2 : PINK);
    if (miss) { var mw = x.measureText(String(r.score)).width; x.fillStyle = PINK2; x.fillRect(px + 10, sb - big * 0.36, mw + 4, 4); }
    if (small && w >= 118) {
      font(x, 400, 19, { mono: true });
      var s = small;
      while (s.length > 3 && x.measureText(s).width > w - 22) s = s.slice(0, -2) + '…';
      text(x, s, px + 12, py + h - 13, PINK2);
    }
  }

  /* ---------- la carte ---------- */

  function draw(game, res, when) {
    res = res || {};
    var cv = document.createElement('canvas'); cv.width = CW; cv.height = CH;
    var x = cv.getContext('2d'), store = S(), world = store.worldOf(game.mode), W0 = WORLD[world], R = ranker(world);
    x.fillStyle = BG; x.fillRect(0, 0, CW, CH);
    x.textBaseline = 'alphabetic';

    // l'en-tête : le logo et la date
    mark(x, PAD, 70, 2.1);
    font(x, 820, 58, { wide: true, track: -2 });
    text(x, 'Delta', PAD + 86, 124, INK);
    var d = when || new Date();
    font(x, 400, 26, { mono: true });
    text(x, daily(game) ? 'n° ' + store.dayNumber(d) : String(d.getDate()).padStart(2, '0') + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' + d.getFullYear(), CW - PAD, 118, INK2, 'right');

    // le monde, sur son étiquette de papier (comme à l'accueil)
    var by = 190, bh = 176;
    x.fillStyle = PAPER; x.fillRect(PAD, by, CW - 2 * PAD, bh);
    x.save(); x.translate(PAD + 34, by + 46); x.scale(3.1, 3.1); x.fillStyle = PINK; x.fill(new Path2D('M15 1 29 25H1z')); x.restore();
    if (world === 'melodie') note(x, PAD + 138, by + 40, 3.2, PINK);
    else { font(x, 820, 128, { wide: true, track: -6 }); text(x, W0.glyph, PAD + 132, by + 128, PINK); }
    font(x, 700, 24, { track: 4.5 });
    text(x, (W0.kicker + ' · ' + MODE[game.mode]).toUpperCase(), PAD + 280, by + 72, PINK2);
    font(x, 740, 66, { track: -1 });
    text(x, W0.name, PAD + 278, by + 136, PINK);

    // le score, en très grand
    var unit = survival(game) ? 'pts' : '/' + game.rounds.length * 100, total = String(game.total);
    font(x, 400, 46, { mono: true });
    var uw = x.measureText(unit).width, size = 330;
    font(x, 840, size, { wide: true, track: -18 });
    var tw = x.measureText(total).width;
    if (tw + uw + 24 > CW - 2 * PAD) { size = Math.floor(size * (CW - 2 * PAD - uw - 24) / tw); font(x, 840, size, { wide: true, track: -Math.round(size * 0.055) }); tw = x.measureText(total).width; }
    var base = 700;
    text(x, total, PAD - 8, base, INK);
    font(x, 400, 46, { mono: true });
    text(x, unit, PAD + tw + 18, base, INK2);

    // le rang, et ce qui le distingue (record, manches tenues, série)
    var rx = PAD, ry = 800;
    if (res.newBest) {
      font(x, 760, 24, { track: 4.5 });
      var sw = x.measureText('RECORD').width + 28;
      x.fillStyle = INK; x.fillRect(rx, ry - 44, sw, 50);
      text(x, 'RECORD', rx + 14, ry - 10, BG);
      rx += sw + 22;
    }
    font(x, 720, 64, { track: -1.5 });
    var rank = R.rank(average(game));
    while (rank.length > 4 && x.measureText(rank).width > CW - PAD - rx) { font(x, 720, Math.floor(parseFloat(x.font) * 0.92), { track: -1.5 }); }
    text(x, rank, rx, ry, INK);
    var sub = '';
    if (survival(game)) sub = (game.cleared || 0) + ' manche' + (game.cleared > 1 ? 's' : '') + ' tenue' + (game.cleared > 1 ? 's' : '');
    else if (daily(game) && res.streak) sub = 'Série : ' + res.streak + ' jour' + (res.streak > 1 ? 's' : '');
    else if (res.newBest && res.prevBest) sub = 'Ancien record : ' + res.prevBest;
    if (sub) { font(x, 400, 30, { mono: true }); text(x, sub, PAD, ry + 62, INK2); }

    // les manches, en pastilles (les dernières si la survie en compte beaucoup)
    var rounds = game.rounds.slice(-MAXCHIPS), n = rounds.length;
    if (n) {
      var gap = n > 6 ? 8 : 14, cy = sub ? 930 : 884, chH = 1200 - cy, cw = (CW - 2 * PAD - gap * (n - 1)) / n;
      rounds.forEach(function (r, i) { chip(x, world, r, PAD + i * (cw + gap), cy, cw, chH); });
    }

    // le pied : où trouver le jeu, et le défi lancé
    x.fillStyle = LINE; x.fillRect(PAD, 1236, CW - 2 * PAD, 2);
    font(x, 400, 27, { mono: true });
    text(x, 'Delta, jeu de précision · Google Play', PAD, 1290, INK2);
    font(x, 760, 44, { track: -1 });
    text(x, 'Et toi ?', CW - PAD, 1294, INK, 'right');
    return cv;
  }

  /* ---------- le texte qui accompagne l'image ---------- */

  // Le score seul, pas son détail : les manches sont sur l'image (demande de Max du 29/10)
  function message(game) {
    var store = S(), world = store.worldOf(game.mode), W0 = WORLD[world], R = ranker(world), rank = R.rank(average(game));
    var score = survival(game) ? game.total + ' pts' : game.total + '/' + game.rounds.length * 100;
    var what = daily(game) ? 'défi ' + (world === 'ear' ? 'son' : 'couleur') + ' n° ' + store.dayNumber() : W0.name + ', ' + MODE[game.mode].toLowerCase();
    return 'Delta · ' + what + ' : ' + score + ' — ' + rank + '. Qui fait mieux ?\n' + LINK;
  }

  /* ---------- partager ---------- */

  // Les polices de la toile sont celles de la page : on s'assure qu'elles sont chargées avant de dessiner
  function fontsReady() {
    if (!document.fonts || !document.fonts.load) return Promise.resolve();
    return Promise.all(['840 100px Archivo', '400 30px Mono'].map(function (f) { return document.fonts.load(f).catch(function () {}); }));
  }

  var pret = null;   // iPhone : une carte refusée par Safari (geste trop loin) part au toucher suivant, pendant le geste
  function share(game, res) {
    if (pret && pret.res === res && navigator.share) { var d = pret.d; pret = null; navigator.share(d).catch(function () {}); return Promise.resolve('web'); }
    pret = null;
    return fontsReady().then(function () {
      var cv = draw(game, res), txt = message(game), url = cv.toDataURL('image/png'), b64 = url.slice(url.indexOf(',') + 1);
      var B = root.AndroidBridge;
      try {
        if (B && B.shareImage) { B.shareImage(b64, txt); return 'image'; }
        if (B && B.share) { B.share(txt); return 'texte'; }          // ancienne coque, sans partage d'image
      } catch (e) { }
      // navigateur : partage natif avec l'image si possible ; sinon l'image se télécharge et le texte est copié
      return new Promise(function (ok) {
        cv.toBlob(function (blob) {
          try {
            var file = new File([blob], 'delta-score.png', { type: 'image/png' });
            if (navigator.canShare && navigator.canShare({ files: [file] })) { navigator.share({ files: [file], text: txt }).catch(function (e) { if (e && e.name === 'NotAllowedError') { pret = { res: res, d: { files: [file], text: txt } }; root.NC.ui.toast('Touche encore « Partager »'); } }); return ok('web'); }
          } catch (e) { }
          var a = document.createElement('a'); a.href = url; a.download = 'delta-score.png'; document.body.appendChild(a); a.click(); a.remove();
          if (navigator.clipboard) navigator.clipboard.writeText(txt).catch(function () {});
          root.NC.ui.toast('Image enregistrée, texte copié');
          ok('fichier');
        }, 'image/png');
      });
    });
  }

  root.NC = root.NC || {};
  root.NC.carte = { draw: draw, message: message, share: share, LINK: LINK };
})(this);
