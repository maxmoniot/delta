/* Delta — science du son pour le mode « À l'oreille ».
   On joue et on règle des fréquences en hertz. Le score, lui, compte l'écart en PROPORTION
   (en cents : 1200 × log2 du rapport) parce que l'oreille entend des rapports : 10 Hz d'écart
   s'entendent bien plus à 200 Hz (≈ 86 cents) qu'à 800 Hz (≈ 22 cents). */
(function (root) {
  'use strict';

  function cents(f, ref) { return 1200 * Math.log(f / ref) / Math.LN2; }
  function shift(f, c) { return f * Math.pow(2, c / 1200); }

  // « 452,3 Hz » sous 1000 Hz, « 1 204 Hz » au-delà
  function hz(f, unit) {
    var s = f < 1000 ? f.toFixed(1).replace('.', ',') : String(Math.round(f)).replace(/\B(?=(\d{3})+$)/, ' ');
    return unit === false ? s : s + ' Hz';
  }

  // 100 points pour une fréquence juste, 50 points à 70 cents d'écart (≈ 4 %), ~31 à un demi-ton (≈ 6 %)
  var K = 70, P = 2.2;
  // k : sévérité (cents pour 50 points) — 70 à l'écoute de mémoire, 15 en accordage où l'on entend les deux
  function score(target, pick, k) { return Math.round(100 / (1 + Math.pow(Math.abs(cents(pick, target)) / (k || K), P))); }

  function hint(target, pick) {
    var c = cents(pick, target), d = pick - target, a = Math.abs(d);
    if (Math.abs(c) < 6) return 'Juste, à l’oreille près';
    var n = a < 10 ? a.toFixed(1).replace('.', ',') : String(Math.round(a));
    return (d > 0 ? 'Trop aigu de ' : 'Trop grave de ') + n + ' Hz';
  }

  var RANKS = [
    [95, 'Diapason vivant'], [88, 'Oreille absolue'], [78, 'Oreille d’accordeur'], [66, 'Bonne oreille'],
    [52, 'Oreille curieuse'], [38, 'Oreille distraite'], [0, 'Oreille fatiguée']
  ];
  function rank(avg) { for (var i = 0; i < RANKS.length; i++) if (avg >= RANKS[i][0]) return RANKS[i][1]; return ''; }
  function nextRank(avg) {
    for (var i = RANKS.length - 1; i >= 0; i--) if (RANKS[i][0] > avg) return { name: RANKS[i][1], at: RANKS[i][0] };
    return null;
  }

  // Fréquences jouées : 150 à 900 Hz, tirées au hasard en proportion (autant de graves que d'aigus).
  // Le ruban va plus loin des deux côtés pour qu'on puisse se tromper franchement.
  var LOW = 150, HIGH = 900, MIN = 50, MAX = 1500;

  // Une série : deux sons d'affilée à au moins 20 % l'un de l'autre
  function series(rand, n) {
    var out = [], guard = 0, span = Math.log(HIGH / LOW);
    while (out.length < n && guard++ < 500) {
      var f = LOW * Math.exp(rand() * span);
      if (out.length && Math.abs(cents(f, out[out.length - 1])) < 316) continue;
      out.push(Math.round(f * 10) / 10);
    }
    return out;
  }

  var api = {
    cents: cents, shift: shift, hz: hz, score: score, hint: hint,
    rank: rank, nextRank: nextRank, RANKS: RANKS, series: series,
    LOW: LOW, HIGH: HIGH, MIN: MIN, MAX: MAX
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.NC = root.NC || {}; root.NC.pitch = api; }
})(this);
