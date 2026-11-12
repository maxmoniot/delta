/* Delta — les palettes des effets (demandes de Max du 29/10/2026 : de la couleur dans l'oreille, le tracé, la forme et
   la mélodie, « dans une palette qui change aléatoirement », et « quelque chose d'harmonieux à chaque fois »).
   Une palette = une règle d'harmonie du cercle chromatique (camaïeu, analogue, complémentaire, complémentaire divisée,
   triade) autour d'une teinte tirée au hasard. Elle se construit en OKLCH : ses cinq couleurs ont le MÊME chroma et
   des clartés voisines — c'est ce qui les accorde (en HSV, un jaune et un bleu « de même saturation » ne pèsent pas
   pareil à l'œil). Dans les règles à plusieurs teintes, la teinte de départ domine (3 couleurs sur 5) et les autres
   ponctuent. La clarté suit le thème : claire sur le fond sombre, plus soutenue sur le fond clair.
   La couleur reste un effet du jeu, jamais de l'interface : boutons, textes et cadres restent gris.
   Le même fichier est chargé par les tests Node (module.exports en bas). */
(function (root) {
  'use strict';

  // décalages de teinte (degrés) et de clarté des cinq couleurs, dans l'ordre du dégradé
  var REGLES = [
    { nom: 'camaïeu', poids: 0.15, h: [0, 0, 0, 0, 0], l: [-0.07, -0.035, 0, 0.035, 0.07] },
    { nom: 'analogue', poids: 0.3, h: [-40, -20, 0, 20, 40], l: [0, 0, 0, 0, 0] },
    { nom: 'complémentaire', poids: 0.2, h: [0, 0, 0, 180, 180], l: [-0.05, 0, 0.05, -0.02, 0.03] },
    { nom: 'complémentaire divisée', poids: 0.2, h: [150, 0, 0, 0, 210], l: [0, -0.04, 0, 0.04, 0] },
    { nom: 'triade', poids: 0.15, h: [120, 0, 0, 0, 240], l: [0, -0.04, 0, 0.04, 0] }
  ];
  var FOND = { sombre: { l: 0.77, c: 0.16, min: 0.7, max: 0.92, jaune: 0.07 }, clair: { l: 0.6, c: 0.16, min: 0.5, max: 0.78, jaune: 0.12 } };

  // OKLab (Björn Ottosson, 2020) → sRGB linéaire
  function lin(q) {
    var a = q.c * Math.cos(q.h * Math.PI / 180), b = q.c * Math.sin(q.h * Math.PI / 180);
    var l_ = q.l + 0.3963377774 * a + 0.2158037573 * b, m_ = q.l - 0.1055613458 * a - 0.0638541728 * b, s_ = q.l - 0.0894841775 * a - 1.2914855480 * b;
    var l = l_ * l_ * l_, m = m_ * m_ * m_, s = s_ * s_ * s_;
    return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
      -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s];
  }
  function dansEcran(q) { return lin(q).every(function (v) { return v >= -1e-4 && v <= 1 + 1e-4; }); }
  function chromaMax(l, h) {
    var lo = 0, hi = 0.4;
    for (var i = 0; i < 18; i++) { var mid = (lo + hi) / 2; if (dansEcran({ l: l, c: mid, h: h })) lo = mid; else hi = mid; }
    return lo;
  }
  function css(q) {
    var v = lin(q).map(function (x) {
      x = Math.max(0, Math.min(1, x));
      return Math.round(255 * (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055));
    });
    return 'rgb(' + v[0] + ', ' + v[1] + ', ' + v[2] + ')';
  }
  function lab(q) { return [q.l, q.c * Math.cos(q.h * Math.PI / 180), q.c * Math.sin(q.h * Math.PI / 180)]; }
  function fromLab(v) { var h = Math.atan2(v[2], v[1]) * 180 / Math.PI; return { l: v[0], c: Math.sqrt(v[1] * v[1] + v[2] * v[2]), h: h < 0 ? h + 360 : h }; }
  function ecart(a, b) { return Math.abs(((a - b) % 360 + 540) % 360 - 180); }

  // Les cinq couleurs d'une règle pour un fond : clartés bornées (les jaunes un peu plus clairs, sinon ils virent au
  // kaki), puis UN chroma commun, le plus fort que toutes tiennent dans l'écran ; trop faible → on éclaircit moins.
  function build(regle, h0, f) {
    var hs = regle.h.map(function (o) { return ((h0 + o) % 360 + 360) % 360; }), dl = 0, out;
    for (var essai = 0; essai < 6; essai++) {
      var ls = hs.map(function (h, i) {
        var jaune = Math.max(0, 1 - ecart(h, 100) / 40);
        return Math.max(f.min, Math.min(f.max, f.l + regle.l[i] + f.jaune * jaune - dl));
      });
      var c = Math.min.apply(null, [f.c].concat(hs.map(function (h, i) { return chromaMax(ls[i], h); })));
      out = hs.map(function (h, i) { return { l: ls[i], c: c * 0.995, h: h }; });
      if (c >= 0.075) break;
      dl += 0.03;
    }
    return out;
  }

  function tirer(rand) {
    rand = rand || Math.random;
    var x = rand(), regle = REGLES[REGLES.length - 1];
    for (var i = 0; i < REGLES.length; i++) { if (x < REGLES[i].poids) { regle = REGLES[i]; break; } x -= REGLES[i].poids; }
    var h0 = rand() * 360;
    var T = { sombre: build(regle, h0, FOND.sombre), clair: build(regle, h0, FOND.clair) };
    var C = { sombre: T.sombre.map(css), clair: T.clair.map(css) };
    function which(clair) {
      if (clair === undefined) clair = typeof document !== 'undefined' && document.documentElement.classList.contains('theme-light');
      return clair ? 'clair' : 'sombre';
    }
    return {
      regle: regle.nom, h: h0,
      lch: function (clair) { return T[which(clair)]; },
      couleurs: function (clair) { return C[which(clair)]; },
      col: function (i, clair) { return C[which(clair)][((i % 5) + 5) % 5]; },
      // un dégradé qui parcourt la palette dans l'ordre (mélange en OKLab) ; entre deux teintes éloignées, le passage
      // est resserré pour ne pas s'attarder dans le gris du milieu
      mix: function (t, clair) {
        var k = which(clair), pos = Math.max(0, Math.min(1, t)) * 4, i = Math.floor(pos), f = pos - i;
        if (i >= 4) return C[k][4];
        if (f === 0) return C[k][i];
        var a = T[k][i], b = T[k][i + 1];
        if (ecart(a.h, b.h) > 60) { f = f * f * (3 - 2 * f); f = f * f * (3 - 2 * f); }
        var A = lab(a), B = lab(b);
        return css(fromLab([A[0] + (B[0] - A[0]) * f, A[1] + (B[1] - A[1]) * f, A[2] + (B[2] - A[2]) * f]));
      }
    };
  }

  var api = { tirer: tirer, dansEcran: dansEcran, REGLES: REGLES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.NC = root.NC || {}; root.NC.palette = api; }
})(this);
