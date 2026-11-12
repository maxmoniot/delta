/* Delta — le moteur du monde « La mélodie » (demande de Max, 26/10/2026).
   Un clavier d'un octave (13 touches, do à do). Une mélodie de quelques notes est jouée par un instrument
   tiré au hasard ; on la rejoue note à note : on essaie les touches, puis on valide.
   Les instruments sont synthétisés ici, en pur JavaScript (échantillons calculés une fois, puis joués par
   WebAudio) : aucun fichier de son, et les tests Node mesurent la hauteur de chaque note de chaque instrument.
   Même fichier pour la page et pour les tests Node (module.exports en bas). */
(function (root) {
  'use strict';

  /* ---------- le clavier ---------- */

  var KEYS = 13, DO = 261.63;                 // do 4 … do 5
  var BLACK = [1, 3, 6, 8, 10], WHITE = [0, 2, 4, 5, 7, 9, 11, 12], ALL = [];
  for (var k0 = 0; k0 < KEYS; k0++) ALL.push(k0);
  function isBlack(k) { return BLACK.indexOf(k % 12) >= 0; }
  function freq(k) { return DO * Math.pow(2, k / 12); }

  /* ---------- les mélodies ---------- */

  // Des pas surtout conjoints, quelques sauts : une mélodie qu'on peut fredonner.
  // Dans la gamme (touches blanches) le pas se compte en touches blanches ; en chromatique, en demi-tons.
  var STEP_W = [[0, 4], [1, 36], [2, 28], [3, 15], [4, 10], [5, 7]];
  var STEP_C = [[0, 3], [1, 10], [2, 24], [3, 20], [4, 16], [5, 12], [7, 10], [9, 5]];
  function pickStep(rand, table) {
    var tot = 0, i;
    for (i = 0; i < table.length; i++) tot += table[i][1];
    var r = rand() * tot;
    for (i = 0; i < table.length; i++) { r -= table[i][1]; if (r < 0) return table[i][0]; }
    return table[0][0];
  }
  function singable(m, black) {
    var n = m.length, seen = {}, distinct = 0;
    for (var i = 0; i < n; i++) {
      if (i >= 2 && m[i] === m[i - 1] && m[i] === m[i - 2]) return false;
      if (i >= 1 && Math.abs(m[i] - m[i - 1]) > 9) return false;
      if (!seen[m[i]]) { seen[m[i]] = 1; distinct++; }
    }
    if (distinct < Math.min(3, n - 1)) return false;
    if (black && n >= 4 && !m.some(isBlack)) return false;
    return true;
  }
  // n notes ; black : les touches noires entrent dans le jeu
  function melody(rand, n, black) {
    var pool = black ? ALL : WHITE, table = black ? STEP_C : STEP_W, out = [], guard = 0;
    do {
      out = [];
      var i = black ? Math.floor(rand() * pool.length) : [0, 2, 4, 7][Math.floor(rand() * 4)];   // do, mi, sol, do aigu
      out.push(pool[i]);
      for (var j = 1; j < n; j++) {
        var ni = i, tries = 0;
        do {
          var s = pickStep(rand, table);
          if (rand() < 0.5) s = -s;
          ni = i + s;
          if (ni < 0 || ni >= pool.length) ni = i - s;          // rebond sur le bord du clavier
          tries++;
        } while ((ni === i && j >= 2 && out[j - 1] === out[j - 2]) && tries < 20);
        i = Math.max(0, Math.min(pool.length - 1, ni));
        out.push(pool[i]);
      }
    } while (!singable(out, black) && guard++ < 80);
    return out;
  }

  /* ---------- le score ---------- */

  // 20 points la note juste ; une touche à côté en vaut encore un peu ; au-delà, rien
  function noteScore(t, p) {
    var d = Math.abs(t - p);
    return d === 0 ? 20 : Math.round(20 / (1 + Math.pow(d / 0.8, 2.2)));
  }
  // Les notes non jouées (survie interrompue) comptent pour zéro
  function compare(target, picks) {
    var notes = [], score = 0, exact = 0, near = 0;
    for (var i = 0; i < target.length; i++) {
      var p = picks[i], has = p !== undefined && p !== null;
      var s = has ? noteScore(target[i], p) : 0, d = has ? p - target[i] : null;
      if (has && d === 0) exact++;
      if (has && Math.abs(d) === 1) near++;
      notes.push({ t: target[i], p: has ? p : null, d: d, s: s });
      score += s;
    }
    return { notes: notes, score: score, pct: Math.round(score / target.length * 5), exact: exact, near: near, n: target.length, played: picks.length };
  }
  function ordinal(i) { return i === 1 ? '1ʳᵉ' : i + 'ᵉ'; }
  function tuneHint(c) {
    if (c.exact === c.n) return 'Note pour note';
    var wrong = c.notes.filter(function (x) { return x.d !== 0; });
    if (wrong.length === 1 && wrong[0].d !== null) {
      var w = wrong[0], a = Math.abs(w.d);
      return 'Tout juste sauf la ' + ordinal(c.notes.indexOf(w) + 1) + ' : ' + (a === 1 ? 'une touche' : a + ' touches') + ' trop ' + (w.d > 0 ? 'haut' : 'bas');
    }
    return c.exact + ' juste' + (c.exact > 1 ? 's' : '') + ' sur ' + c.n + (c.near ? ' · ' + c.near + ' à une touche près' : '');
  }

  var RANKS = [
    [95, 'Chef d’orchestre'], [86, 'Premier violon'], [74, 'Musicien d’oreille'], [60, 'Mélomane'],
    [45, 'Fredonneur'], [30, 'Siffleur du dimanche'], [0, 'Premières notes']
  ];
  function rank(avg) { for (var i = 0; i < RANKS.length; i++) if (avg >= RANKS[i][0]) return RANKS[i][1]; return ''; }
  function nextRank(avg) {
    for (var i = RANKS.length - 1; i >= 0; i--) if (RANKS[i][0] > avg) return { name: RANKS[i][1], at: RANKS[i][0] };
    return null;
  }

  /* ---------- les instruments ---------- */

  function lcg(seed) { var s = (seed >>> 0) || 1; return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

  // Somme de partiels ; chaque partiel = [rapport, amplitude, décroissance τ (s, 0 = tenu), attaque (s), plancher]
  // o : len (s), vib (profondeur), vibF, vibAt, scoop (note attaquée un peu bas), trem [profondeur, Hz],
  //     noise [amplitude au coup, τ du coup, lissage 0..1, souffle tenu]
  function additive(f, sr, o) {
    var N = Math.round(o.len * sr), out = new Float32Array(N), i, t;
    var mod = null;
    if (o.vib || o.scoop) {
      mod = new Float32Array(N);
      for (i = 0; i < N; i++) {
        t = i / sr;
        var v = 1;
        if (o.vib) v += o.vib * Math.sin(2 * Math.PI * (o.vibF || 5.5) * t) * Math.max(0, Math.min(1, (t - (o.vibAt || 0.15)) / 0.25));
        if (o.scoop) v *= 1 - o.scoop * Math.exp(-t / 0.02);
        mod[i] = v;
      }
    }
    o.parts.forEach(function (p) {
      if (f * p[0] > sr * 0.45) return;
      var w = 2 * Math.PI * f * p[0] / sr, a = p[1], dec = p[2] ? Math.exp(-1 / (p[2] * sr)) : 1;
      var att = (p[3] || 0) * sr, fl = p[4] || 0, g = 1, ph = 0, j, e;
      if (mod) {
        for (j = 0; j < N; j++) {
          e = att && j < att ? j / att : 1;
          out[j] += a * e * (fl + (1 - fl) * g) * Math.sin(ph);
          ph += w * mod[j]; g *= dec;
        }
        return;
      }
      // sans vibrato : oscillateur récursif (sin((n+1)w) = 2 cos w · sin(nw) − sin((n−1)w)), bien plus rapide
      var c2 = 2 * Math.cos(w), s0 = 0, s1 = Math.sin(w), s2;
      for (j = 0; j < N; j++) {
        e = att && j < att ? j / att : 1;
        out[j] += a * e * (fl + (1 - fl) * g) * s0;
        s2 = c2 * s1 - s0; s0 = s1; s1 = s2; g *= dec;
      }
    });
    if (o.trem) for (i = 0; i < N; i++) out[i] *= 1 - o.trem[0] * (0.5 - 0.5 * Math.cos(2 * Math.PI * o.trem[1] * i / sr));
    if (o.noise) noise(out, sr, o.noise, f);
    return out;
  }
  // Le coup (marteau, souffle, attaque de l'archet) : un bruit lissé
  function noise(out, sr, nz, f) {
    var r = lcg(Math.round(f * 100)), lp = 0, dec = Math.exp(-1 / (nz[1] * sr)), g = 1;
    for (var i = 0; i < out.length; i++) {
      lp += (r() * 2 - 1 - lp) * nz[2];
      out[i] += lp * (nz[0] * g + (nz[3] || 0));
      g *= dec;
    }
  }
  // Corde pincée (Karplus-Strong) accordée au centième : délai fractionnaire par un passe-tout
  function pluck(f, sr, o) {
    var N = Math.round(o.len * sr), out = new Float32Array(N);
    var P = sr / f - 0.5, L = Math.floor(P), fr = P - L;
    if (fr < 0.1) { L -= 1; fr += 1; }
    var Cc = (1 - fr) / (1 + fr), buf = new Float32Array(L), r = lcg(Math.round(f * 7)), lp = 0, mean = 0, i;
    for (i = 0; i < L; i++) { lp += (r() * 2 - 1 - lp) * o.bright; buf[i] = lp; mean += lp; }
    mean /= L;
    for (i = 0; i < L; i++) buf[i] -= mean;
    var idx = 0, last = 0, apx = 0, apy = 0;
    for (i = 0; i < N; i++) {
      var x = buf[idx];
      out[i] = x;
      var a = 0.5 * (x + last); last = x;
      var y = Cc * a + apx - Cc * apy; apx = a; apy = y;
      buf[idx] = o.damp * y;
      idx = (idx + 1) % L;
    }
    if (o.body) for (i = 0; i < N; i++) out[i] += o.body * Math.sin(2 * Math.PI * f * i / sr) * Math.exp(-i / (sr * 0.6));
    return out;
  }
  // Fondu d'entrée, relâché (tenu) ou fondu de sortie, puis niveau
  function finish(x, sr, o) {
    var N = x.length, i, A = Math.max(1, Math.round((o.attack || 0.0015) * sr)), F = Math.round((o.fade || 0.25) * sr), peak = 0;
    for (i = 0; i < N; i++) {
      var e = i < A ? 0.5 - 0.5 * Math.cos(Math.PI * i / A) : 1;
      if (i > N - F) e *= 0.5 + 0.5 * Math.cos(Math.PI * (i - (N - F)) / F);
      if (i === N - 1) e = 0;
      x[i] *= e;
      peak = Math.max(peak, Math.abs(x[i]));
    }
    var k = (o.level || 0.8) / (peak || 1);
    for (i = 0; i < N; i++) x[i] *= k;
    return x;
  }

  function sustained(parts, extra) {
    return function (f, sr, hold) {
      var o = { len: hold + (extra.release || 0.1), parts: parts(f) };
      for (var key in extra) o[key] = extra[key];
      o.len = hold + (extra.release || 0.1);
      return finish(additive(f, sr, o), sr, { attack: extra.attack, fade: extra.release || 0.1, level: extra.level });
    };
  }
  function struck(len, parts, extra) {
    extra = extra || {};
    return function (f, sr) {
      var o = { len: len, parts: parts(f) };
      for (var key in extra) o[key] = extra[key];
      return finish(additive(f, sr, o), sr, { attack: extra.attack, fade: extra.fade || 0.3, level: extra.level || 0.85 });
    };
  }
  function plucked(o) {
    return function (f, sr) { return finish(pluck(f, sr, o), sr, { attack: 0.002, fade: 0.3, level: o.level || 0.8 }); };
  }
  function harmonics(n, amp) { var p = []; for (var i = 1; i <= n; i++) p.push(amp(i)); return p; }

  var INSTRUMENTS = [
    { id: 'piano', name: 'Piano', make: struck(1.6, function (f) {
      return harmonics(10, function (n) { return [n * Math.sqrt(1 + 0.0001 * n * n), Math.pow(n, -1.15) * (n === 1 ? 1 : 0.8), (f > 400 ? 1.2 : 1.6) / (1 + 0.45 * (n - 1)), 0.002]; });
    }, { noise: [0.16, 0.01, 0.35, 0] }) },
    { id: 'guitare', name: 'Guitare', make: plucked({ len: 1.5, damp: 0.996, bright: 0.5, body: 0.15 }) },
    { id: 'harpe', name: 'Harpe', make: plucked({ len: 1.8, damp: 0.9985, bright: 0.28, body: 0.25 }) },
    { id: 'clavecin', name: 'Clavecin', make: plucked({ len: 1.3, damp: 0.995, bright: 1, level: 0.75 }) },
    { id: 'basse', name: 'Basse', oct: -1, make: plucked({ len: 1.5, damp: 0.997, bright: 0.22, body: 0.3, level: 0.9 }) },
    { id: 'flute', name: 'Flûte', make: sustained(function () { return [[1, 1, 0, 0], [2, 0.25, 0, 0.02], [3, 0.09, 0, 0.03], [4, 0.03, 0, 0.03]]; },
      { attack: 0.06, release: 0.12, vib: 0.004, vibF: 5, vibAt: 0.18, noise: [0.1, 0.04, 0.6, 0.02], level: 0.6 }) },
    { id: 'clarinette', name: 'Clarinette', make: sustained(function () { return [[1, 1], [3, 0.6], [5, 0.35], [7, 0.18], [9, 0.09], [2, 0.05], [4, 0.04]]; },
      { attack: 0.035, release: 0.08, vib: 0.0015, vibF: 5, level: 0.55 }) },
    { id: 'hautbois', name: 'Hautbois', make: sustained(function () { return [[1, 0.55], [2, 0.9], [3, 1], [4, 0.65], [5, 0.42], [6, 0.28], [7, 0.16], [8, 0.1]]; },
      { attack: 0.03, release: 0.08, vib: 0.003, vibF: 5.2, level: 0.55 }) },
    { id: 'trompette', name: 'Trompette', make: sustained(function () {
      return harmonics(10, function (n) { return [n, Math.pow(n, -0.7), 0, 0.012 * (1 + 0.9 * (n - 1))]; });
    }, { attack: 0.02, release: 0.07, scoop: 0.012, vib: 0.003, vibAt: 0.25, level: 0.55 }) },
    { id: 'violon', name: 'Violon', make: sustained(function (f) {
      return harmonics(14, function (n) { return [n, (1 / n) * (1 + 1.2 * Math.exp(-Math.pow((n * f - 2800) / 1100, 2))), 0, 0.01 * n]; });
    }, { attack: 0.09, release: 0.12, vib: 0.006, vibF: 5.6, vibAt: 0.14, level: 0.55 }) },
    { id: 'orgue', name: 'Orgue', make: sustained(function () { return [[1, 1], [2, 0.8], [3, 0.45], [4, 0.45], [6, 0.22], [8, 0.18]]; },
      { attack: 0.015, release: 0.05, trem: [0.12, 6.4], level: 0.5 }) },
    { id: 'synthe', name: 'Synthé', make: sustained(function () {
      return harmonics(14, function (n) { return [n, 1 / n, 0.5 / Math.sqrt(n), 0, n === 1 ? 1 : 0.12]; });
    }, { attack: 0.004, release: 0.1, level: 0.5 }) },
    { id: 'marimba', name: 'Marimba', make: struck(1.0, function () { return [[1, 1, 0.42, 0.002], [4, 0.3, 0.06, 0.001], [10, 0.06, 0.02, 0.001]]; },
      { noise: [0.06, 0.006, 0.3, 0], fade: 0.25 }) },
    { id: 'xylophone', name: 'Xylophone', oct: 1, make: struck(0.8, function () { return [[1, 1, 0.28, 0.001], [3, 0.35, 0.07, 0.001], [6, 0.1, 0.025, 0.001]]; },
      { fade: 0.2 }) },
    { id: 'vibraphone', name: 'Vibraphone', make: struck(1.9, function () { return [[1, 1, 1.5, 0.002], [4, 0.25, 0.3, 0.002], [10, 0.04, 0.06, 0.001]]; },
      { trem: [0.45, 5.5], fade: 0.4, level: 0.8 }) },
    { id: 'kalimba', name: 'Kalimba', make: struck(1.3, function () { return [[1, 1, 0.8, 0.002], [6, 0.3, 0.1, 0.001], [2, 0.05, 0.3, 0.002]]; },
      { noise: [0.05, 0.005, 0.25, 0] }) },
    { id: 'boite', name: 'Boîte à musique', oct: 1, make: struck(1.1, function () { return [[1, 1, 0.7, 0.001], [4, 0.18, 0.12, 0.001], [2, 0.1, 0.3, 0.001]]; },
      { level: 0.8 }) },
    { id: 'steel', name: 'Steel drum', make: struck(1.2, function () { return [[1, 1, 0.6, 0.003], [2, 0.6, 0.35, 0.003], [3, 0.25, 0.2, 0.003], [4, 0.1, 0.1, 0.003]]; }) },
    { id: 'celesta', name: 'Célesta', oct: 1, make: struck(1.2, function () { return [[1, 1, 0.9, 0.001], [2, 0.3, 0.3, 0.001], [4, 0.15, 0.1, 0.001]]; },
      { level: 0.8 }) }
  ];
  function byId(id) { for (var i = 0; i < INSTRUMENTS.length; i++) if (INSTRUMENTS[i].id === id) return INSTRUMENTS[i]; return INSTRUMENTS[0]; }

  // Les échantillons d'une touche : hold = durée tenue (instruments à souffle, archet, orgue)
  function render(inst, k, sr, hold) {
    return inst.make(freq(k) * Math.pow(2, inst.oct || 0), sr, hold || 0.5);
  }

  var api = {
    KEYS: KEYS, WHITE: WHITE, isBlack: isBlack, freq: freq, melody: melody,
    noteScore: noteScore, compare: compare, tuneHint: tuneHint, ordinal: ordinal,
    INSTRUMENTS: INSTRUMENTS, byId: byId, render: render,
    RANKS: RANKS, rank: rank, nextRank: nextRank
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.NC = root.NC || {}; root.NC.melodie = api; }
})(this);
