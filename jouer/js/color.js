/* Nuancier — science de la couleur : conversions, écart perceptif CIEDE2000, score, noms.
   Pas de module ES (le jeu doit tourner aussi en file://) : tout est rangé sous NC.color.
   Le même fichier est chargé par les tests Node (module.exports en bas). */
(function (root) {
  'use strict';

  /* ---------- conversions ---------- */

  // h 0..360, s 0..1, v 0..1  ->  [r, g, b] 0..255 (sRGB, entiers)
  function hsvToRgb(h, s, v) {
    h = ((h % 360) + 360) % 360;
    var c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c, r, g, b;
    if (h < 60) { r = c; g = x; b = 0; }
    else if (h < 120) { r = x; g = c; b = 0; }
    else if (h < 180) { r = 0; g = c; b = x; }
    else if (h < 240) { r = 0; g = x; b = c; }
    else if (h < 300) { r = x; g = 0; b = c; }
    else { r = c; g = 0; b = x; }
    return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
  }

  function rgbToHsv(rgb) {
    var r = rgb[0] / 255, g = rgb[1] / 255, b = rgb[2] / 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min, h = 0;
    if (d) {
      if (max === r) h = 60 * (((g - b) / d) % 6);
      else if (max === g) h = 60 * ((b - r) / d + 2);
      else h = 60 * ((r - g) / d + 4);
    }
    if (h < 0) h += 360;
    return [h, max ? d / max : 0, max];
  }

  function hex(rgb) {
    return '#' + rgb.map(function (c) { return (c < 16 ? '0' : '') + c.toString(16); }).join('').toUpperCase();
  }
  function hexToRgb(h) {
    h = h.replace('#', '');
    return [parseInt(h.substr(0, 2), 16), parseInt(h.substr(2, 2), 16), parseInt(h.substr(4, 2), 16)];
  }
  function css(rgb) { return 'rgb(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ')'; }

  function lin(c) { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }

  // sRGB (D65) -> CIELAB
  function rgbToLab(rgb) {
    var r = lin(rgb[0]), g = lin(rgb[1]), b = lin(rgb[2]);
    var x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047;
    var y = (0.2126729 * r + 0.7151522 * g + 0.0721750 * b);
    var z = (0.0193339 * r + 0.1191920 * g + 0.9503041 * b) / 1.08883;
    function f(t) { return t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116; }
    var fx = f(x), fy = f(y), fz = f(z);
    return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
  }

  // Luminance relative (WCAG) : sert à choisir un texte noir ou blanc sur une couleur
  function luminance(rgb) { return 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]); }

  /* ---------- CIEDE2000 (Sharma, Wu, Dalal 2005) ---------- */

  function deltaE2000(l1, l2) {
    var rad = Math.PI / 180, deg = 180 / Math.PI;
    var L1 = l1[0], a1 = l1[1], b1 = l1[2], L2 = l2[0], a2 = l2[1], b2 = l2[2];
    var C1 = Math.sqrt(a1 * a1 + b1 * b1), C2 = Math.sqrt(a2 * a2 + b2 * b2);
    var Cm = (C1 + C2) / 2, Cm7 = Math.pow(Cm, 7);
    var G = 0.5 * (1 - Math.sqrt(Cm7 / (Cm7 + 6103515625))); // 25^7
    var a1p = (1 + G) * a1, a2p = (1 + G) * a2;
    var C1p = Math.sqrt(a1p * a1p + b1 * b1), C2p = Math.sqrt(a2p * a2p + b2 * b2);
    function hp(b, ap) { if (b === 0 && ap === 0) return 0; var h = Math.atan2(b, ap) * deg; return h < 0 ? h + 360 : h; }
    var h1p = hp(b1, a1p), h2p = hp(b2, a2p);
    var dLp = L2 - L1, dCp = C2p - C1p, dhp;
    if (C1p * C2p === 0) dhp = 0;
    else if (Math.abs(h2p - h1p) <= 180) dhp = h2p - h1p;
    else if (h2p - h1p > 180) dhp = h2p - h1p - 360;
    else dhp = h2p - h1p + 360;
    var dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(dhp / 2 * rad);
    var Lpm = (L1 + L2) / 2, Cpm = (C1p + C2p) / 2, hpm;
    if (C1p * C2p === 0) hpm = h1p + h2p;
    else if (Math.abs(h1p - h2p) <= 180) hpm = (h1p + h2p) / 2;
    else if (h1p + h2p < 360) hpm = (h1p + h2p + 360) / 2;
    else hpm = (h1p + h2p - 360) / 2;
    var T = 1 - 0.17 * Math.cos((hpm - 30) * rad) + 0.24 * Math.cos(2 * hpm * rad) +
      0.32 * Math.cos((3 * hpm + 6) * rad) - 0.20 * Math.cos((4 * hpm - 63) * rad);
    var dTheta = 30 * Math.exp(-Math.pow((hpm - 275) / 25, 2));
    var Cpm7 = Math.pow(Cpm, 7);
    var Rc = 2 * Math.sqrt(Cpm7 / (Cpm7 + 6103515625));
    var Sl = 1 + 0.015 * Math.pow(Lpm - 50, 2) / Math.sqrt(20 + Math.pow(Lpm - 50, 2));
    var Sc = 1 + 0.045 * Cpm, Sh = 1 + 0.015 * Cpm * T;
    var Rt = -Math.sin(2 * dTheta * rad) * Rc;
    var tl = dLp / Sl, tc = dCp / Sc, th = dHp / Sh;
    return Math.sqrt(tl * tl + tc * tc + th * th + Rt * tc * th);
  }

  /* ---------- score ---------- */

  // 100 points pour un écart invisible, 50 points à ΔE 10, ~18 à ΔE 20.
  // Courbe douce : chaque unité gagnée près du but rapporte, sans jamais tomber à 0 brutalement.
  var K = 10, P = 2.2;
  function score(dE) { return Math.round(100 / (1 + Math.pow(dE / K, P))); }

  var VERDICTS = [
    [97, 'Parfait'], [90, 'Bluffant'], [80, 'Très proche'], [65, 'Pas mal'],
    [45, 'Approximatif'], [25, 'À côté'], [0, 'Rien à voir']
  ];
  function verdict(s) { for (var i = 0; i < VERDICTS.length; i++) if (s >= VERDICTS[i][0]) return VERDICTS[i][1]; return ''; }

  // Rang d'une moyenne par couleur (0..100)
  var RANKS = [
    [95, 'Spectrophotomètre'], [88, 'Œil de coloriste'], [78, 'Œil de lynx'], [66, 'Bon œil'],
    [52, 'Œil curieux'], [38, 'Œil distrait'], [0, 'Œil fatigué']
  ];
  function rank(avg) { for (var i = 0; i < RANKS.length; i++) if (avg >= RANKS[i][0]) return RANKS[i][1]; return ''; }
  // Le rang suivant et la moyenne à atteindre (null au sommet)
  function nextRank(avg) {
    for (var i = RANKS.length - 1; i >= 0; i--) if (RANKS[i][0] > avg) return { name: RANKS[i][1], at: RANKS[i][0] };
    return null;
  }

  /* ---------- l'indice : qu'est-ce qui cloche le plus ? ---------- */

  function hueName(h) {
    h = ((h % 360) + 360) % 360;
    if (h < 15 || h >= 345) return 'rouge';
    if (h < 45) return 'orange';
    if (h < 70) return 'jaune';
    if (h < 160) return 'vert';
    if (h < 200) return 'cyan';
    if (h < 255) return 'bleu';
    if (h < 290) return 'violet';
    return 'rose';
  }
  function vers(n) { return /^[aeiouy]/.test(n) ? "vers l'" + n : 'vers le ' + n; }

  // target / pick : {h,s,v}. Renvoie une phrase courte sur le défaut dominant.
  function hint(target, pick) {
    var lt = rgbToLab(hsvToRgb(target.h, target.s, target.v));
    var lp = rgbToLab(hsvToRgb(pick.h, pick.s, pick.v));
    var Ct = Math.hypot(lt[1], lt[2]), Cp = Math.hypot(lp[1], lp[2]);
    var dL = lp[0] - lt[0], dC = Cp - Ct;
    var ht = Math.atan2(lt[2], lt[1]), hp = Math.atan2(lp[2], lp[1]);
    var dh = hp - ht; while (dh > Math.PI) dh -= 2 * Math.PI; while (dh < -Math.PI) dh += 2 * Math.PI;
    var dH = 2 * Math.sqrt(Ct * Cp) * Math.sin(Math.abs(dh) / 2);
    var m = Math.max(Math.abs(dL), Math.abs(dC), dH);
    if (m < 2.5) return 'Rien à redire';
    if (Math.abs(target.v - pick.v) < 1e-9) {
      // même luminosité : seules la teinte et la saturation se règlent — on parle avec ces deux mots-là
      if (dH >= Math.sqrt(dL * dL + dC * dC)) {
        var dd = ((pick.h - target.h + 540) % 360) - 180, nn = hueName(pick.h);
        if (nn === hueName(target.h)) nn = hueName(target.h + (dd > 0 ? 40 : -40));
        return 'Teinte trop tirée ' + vers(nn);
      }
      return pick.s < target.s ? 'Trop pâle' : 'Trop vif';
    }
    if (m === dH) {
      // sens de l'erreur mesuré sur la roue HSV, plus parlante que l'angle Lab
      // on nomme la famille où la teinte choisie a glissé ; si elle n'en a pas changé,
      // la famille voisine dans le sens de l'erreur
      var d = ((pick.h - target.h + 540) % 360) - 180, n = hueName(pick.h);
      if (n === hueName(target.h)) n = hueName(target.h + (d > 0 ? 40 : -40));
      return 'Teinte trop tirée ' + vers(n);
    }
    if (m === Math.abs(dL)) return dL > 0 ? 'Trop clair' : 'Trop sombre';
    return dC > 0 ? 'Trop vif' : 'Trop terne';
  }

  /* ---------- noms de couleurs (nuancier français) ---------- */

  var NAMES = [
    ['Blanc', 'FFFFFF'], ['Ivoire', 'FFFFF0'], ['Lin', 'FAF0E6'], ['Coquille d’œuf', 'FDE9E0'],
    ['Gris perle', 'CECECE'], ['Gris souris', '9E9E9E'], ['Gris tourterelle', 'BBACAC'], ['Ardoise', '5A5E6B'],
    ['Anthracite', '303030'], ['Noir', '000000'], ['Taupe', '463F32'], ['Grège', 'BBAE98'],
    ['Sable', 'E0CDA9'], ['Beige', 'C8AD7F'], ['Chamois', 'D0C07A'], ['Vanille', 'E1CE9A'],
    ['Écarlate', 'ED0000'], ['Coquelicot', 'C60800'], ['Vermillon', 'DB1702'], ['Rouge tomate', 'DE2916'],
    ['Rouge cerise', 'BB0B0B'], ['Groseille', 'CF0A1D'], ['Carmin', '960018'], ['Grenat', '6E0B14'],
    ['Bordeaux', '6D071A'], ['Lie de vin', 'AC1E44'], ['Amarante', '91283B'], ['Framboise', 'C72C48'],
    ['Rubis', 'E0115F'], ['Nacarat', 'FC5D5D'], ['Incarnat', 'FF6F7D'], ['Rose thé', 'FF866A'],
    ['Pêche', 'FDBFB7'], ['Vieux rose', 'C08081'], ['Rose pâle', 'FEE7F0'], ['Rose bonbon', 'F9429E'],
    ['Fuchsia', 'FD3F92'], ['Magenta', 'FF00FF'], ['Pourpre', '9E0E40'], ['Prune', '811453'],
    ['Aubergine', '370028'], ['Zinzolin', '6C0277'], ['Violet', '660099'], ['Améthyste', '884DA7'],
    ['Orchidée', 'DA70D6'], ['Mauve', 'D473D4'], ['Lilas', 'B666D2'], ['Parme', 'CFA0E9'],
    ['Glycine', 'C9A0DC'], ['Héliotrope', 'DF73FF'], ['Lavande', '9683EC'], ['Pervenche', 'CCCCFF'],
    ['Indigo', '4B0082'], ['Bleu Majorelle', '6050DC'], ['Bleu outremer', '1B019B'], ['Bleu Klein', '002FA7'],
    ['Bleu nuit', '0F056B'], ['Bleu marine', '03224C'], ['Bleu cobalt', '22427C'], ['Bleu de Prusse', '24445C'],
    ['Bleu turquin', '425B8A'], ['Bleu barbeau', '5472AE'], ['Bleu charrette', '8EA2C6'], ['Bleu horizon', '7F8FA6'],
    ['Bleu roi', '318CE7'], ['Bleu électrique', '2C75FF'], ['Bleu azur', '007FFF'], ['Bleu ciel', '77B5FE'],
    ['Bleu acier', '3A8EBA'], ['Bleu céleste', '26C4EC'], ['Bleu dragée', 'DFF2FF'], ['Bleu canard', '048B9A'],
    ['Sarcelle', '008080'], ['Cyan', '00FFFF'], ['Turquoise', '40E0D0'], ['Aigue-marine', '79F8F8'],
    ['Vert d’eau', 'B0F2B6'], ['Céladon', '83A697'], ['Vert de gris', '95A595'], ['Vert jade', '87E990'],
    ['Vert printemps', '00FF7F'], ['Vert menthe', '16B84E'], ['Vert émeraude', '01D758'], ['Vert prairie', '57D53B'],
    ['Vert pomme', '34C924'], ['Vert lichen', '85C17E'], ['Vert amande', '82C46C'], ['Vert anis', '9FE855'],
    ['Citron vert', '9EFD38'], ['Chartreuse', '7FFF00'], ['Vert sapin', '095228'], ['Vert bouteille', '096A09'],
    ['Vert impérial', '00561B'], ['Vert épinard', '175732'], ['Vert olive', '708D23'], ['Kaki', '94812B'],
    ['Jaune citron', 'F7FF3C'], ['Jaune canari', 'E7F00D'], ['Jaune mimosa', 'FEF86C'], ['Beurre frais', 'FFF48D'],
    ['Jaune paille', 'FEE347'], ['Bouton d’or', 'FCDC12'], ['Jaune poussin', 'F7E269'], ['Safran', 'F3D617'],
    ['Or', 'FFD700'], ['Ambre', 'F0C300'], ['Moutarde', 'C7CF00'], ['Blé', 'E8D630'],
    ['Ocre jaune', 'DFAF2C'], ['Mandarine', 'FEA347'], ['Abricot', 'E67E30'], ['Orange', 'ED7F10'],
    ['Carotte', 'F4661B'], ['Citrouille', 'DF6D14'], ['Orange brûlée', 'CC5500'], ['Saumon', 'F88E55'],
    ['Corail', 'FF7F50'], ['Ocre rouge', 'DD985C'], ['Cuivre', 'B36700'], ['Rouille', '985717'],
    ['Tabac', '9F551E'], ['Terre de Sienne', '8E5434'], ['Acajou', '88421D'], ['Brique', '842E1B'],
    ['Caramel', '7E3300'], ['Marron', '582900'], ['Chocolat', '5A3A22']
  ];
  var NAME_LAB = NAMES.map(function (n) { return [n[0], rgbToLab(hexToRgb(n[1]))]; });

  function nameOf(rgb) {
    var lab = rgbToLab(rgb), best = '', bd = Infinity;
    for (var i = 0; i < NAME_LAB.length; i++) {
      var d = deltaE2000(lab, NAME_LAB[i][1]);
      if (d < bd) { bd = d; best = NAME_LAB[i][0]; }
    }
    return best;
  }

  /* ---------- hasard (graine fixe pour le défi du jour) ---------- */

  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Une couleur à mémoriser : ni quasi-noire, ni quasi-grise (ennuyeuses et injustes),
  // mais des pastels et des sombres restent possibles.
  // Luminosité unique de tout le jeu des couleurs (demande de Max, 26/10/2026) : on ne retrouve plus que
  // la teinte et la saturation, sur le disque. Pleine luminosité : le disque tel qu'il est peint.
  var V = 1;
  function randomColor(rand) {
    return { h: Math.floor(rand() * 360), s: 0.22 + rand() * 0.78, v: V };
  }

  // Une série : les couleurs d'une même partie s'écartent d'au moins 40° de teinte,
  // sinon deux manches d'affilée se ressemblent et la seconde devient gratuite.
  function series(rand, n) {
    var out = [], guard = 0;
    while (out.length < n && guard++ < 500) {
      var c = randomColor(rand), ok = true;
      for (var i = 0; i < out.length; i++) {
        var d = Math.abs(out[i].h - c.h); d = Math.min(d, 360 - d);
        if (d < 40) { ok = false; break; }
      }
      if (ok) out.push(c);
    }
    return out;
  }

  var api = {
    hsvToRgb: hsvToRgb, rgbToHsv: rgbToHsv, hex: hex, hexToRgb: hexToRgb, css: css,
    rgbToLab: rgbToLab, luminance: luminance, deltaE2000: deltaE2000,
    score: score, verdict: verdict, rank: rank, nextRank: nextRank, hint: hint, hueName: hueName,
    nameOf: nameOf, rng: rng, randomColor: randomColor, series: series, NAMES: NAMES, RANKS: RANKS, V: V
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.NC = root.NC || {}; root.NC.color = api; }
})(this);
