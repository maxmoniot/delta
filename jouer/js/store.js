/* Delta — mémoire locale (localStorage). Aucune donnée ne quitte l'appareil.
   Changer la forme des données = incrémenter KEY et reprendre l'ancienne.
   Deux mondes : l'œil (modes jour, partie, survie) et l'oreille (son-jour, son, son-survie, accord). */
(function (root) {
  'use strict';
  var KEY = 'nuancier.v1';
  var EPOCH = new Date(2026, 9, 4); // défi n° 1 = 4 octobre 2026

  function blankDaily() { return { last: '', streak: 0, bestStreak: 0, results: {} }; }
  function blank() {
    return {
      v: 1,
      settings: { theme: 'dark', sound: true, haptics: true, world: 'eye' },
      games: [],                       // 200 dernières parties
      best: { partie: 0, survie: 0, survieManches: 0, son: 0, sonSurvie: 0, sonSurvieManches: 0, accord: 0, geste: 0, forme: 0, melodie: 0, melodieSurvie: 0, melodieSurvieManches: 0 },
      daily: blankDaily(),             // défi du jour des couleurs
      dailySon: blankDaily(),          // défi du jour du son
      stats: { played: 0, rounds: 0, perfects: 0 }
    };
  }

  var data = blank(), memOnly = false;
  try {
    var raw = localStorage.getItem(KEY);
    if (raw) {
      var d = JSON.parse(raw), b = blank();
      data = Object.assign(b, d);
      data.settings = Object.assign(blank().settings, d.settings || {});
      data.best = Object.assign(blank().best, d.best || {});
      data.daily = Object.assign(blankDaily(), d.daily || {});
      data.dailySon = Object.assign(blankDaily(), d.dailySon || {});
      data.stats = Object.assign(blank().stats, d.stats || {});
    }
  } catch (e) { memOnly = true; }

  function save() {
    if (memOnly) return;
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { memOnly = true; }
  }

  function isSound(mode) { return /^(son|accord)/.test(mode); }
  function isHand(mode) { return /^(geste|forme)/.test(mode); }
  function isTune(mode) { return /^melodie/.test(mode); }
  // Cinq mondes : l'œil (couleurs), l'oreille (sons), le tracé (mouvement), la forme, la mélodie
  function worldOf(mode) { return isSound(mode) ? 'ear' : mode === 'geste' ? 'trace' : mode === 'forme' ? 'forme' : isTune(mode) ? 'melodie' : 'eye'; }

  function dayKey(d) {
    d = d || new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function dayNumber(d) {
    d = d || new Date();
    var a = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
    var b = Date.UTC(EPOCH.getFullYear(), EPOCH.getMonth(), EPOCH.getDate());
    return Math.round((a - b) / 86400000) + 1;
  }
  function daySeed(d) { d = d || new Date(); return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate(); }
  function yesterday() { var d = new Date(); d.setDate(d.getDate() - 1); return dayKey(d); }
  function dly(world) { return world === 'son' ? data.dailySon : data.daily; }

  // Série de jours : vivante si le dernier défi date d'aujourd'hui ou d'hier
  function streak(world) {
    var D = dly(world), l = D.last;
    return (l === dayKey() || l === yesterday()) ? D.streak : 0;
  }
  function dailyResult(world) { return dly(world).results[dayKey()] || null; }

  function best(key, total) {
    var prev = data.best[key] || 0;
    if (total > prev) data.best[key] = total;
    return { prevBest: prev, newBest: total > prev && prev > 0 };
  }

  /* Enregistre une partie terminée. Renvoie ce qui a changé (records, série) pour l'écran de fin. */
  function record(game) {
    var out = { newBest: false, prevBest: 0 };
    data.stats.played++;
    data.stats.rounds += game.rounds.length;
    game.rounds.forEach(function (r) { if (r.score >= 97) data.stats.perfects++; });

    if (game.mode === 'partie') out = best('partie', game.total);
    else if (game.mode === 'son') out = best('son', game.total);
    else if (game.mode === 'accord') out = best('accord', game.total);
    else if (game.mode === 'geste') out = best('geste', game.total);
    else if (game.mode === 'forme') out = best('forme', game.total);
    else if (game.mode === 'melodie') out = best('melodie', game.total);
    else if (game.mode === 'melodie-survie') {
      out = best('melodieSurvie', game.total);
      data.best.melodieSurvieManches = Math.max(data.best.melodieSurvieManches, game.cleared || 0);
    }
    else if (game.mode === 'survie') {
      out = best('survie', game.total);
      data.best.survieManches = Math.max(data.best.survieManches, game.cleared || 0);
    } else if (game.mode === 'son-survie') {
      out = best('sonSurvie', game.total);
      data.best.sonSurvieManches = Math.max(data.best.sonSurvieManches, game.cleared || 0);
    } else if (game.mode === 'jour' || game.mode === 'son-jour') {
      var D = dly(game.mode === 'jour' ? 'couleur' : 'son'), k = dayKey();
      if (!D.results[k]) {
        D.streak = (D.last === yesterday()) ? D.streak + 1 : 1;
        D.last = k;
        D.bestStreak = Math.max(D.bestStreak, D.streak);
        D.results[k] = { total: game.total, scores: game.rounds.map(function (r) { return r.score; }), n: dayNumber() };
        var keys = Object.keys(D.results).sort();
        while (keys.length > 60) delete D.results[keys.shift()];
      }
      out.streak = D.streak;
    }

    data.games.push({
      mode: game.mode, at: Date.now(), total: game.total, cleared: game.cleared || 0,
      rounds: game.rounds.map(function (r) {
        if (isSound(game.mode)) return { t: Math.round(r.target * 10) / 10, p: Math.round(r.pick * 10) / 10, s: r.score };   // en Hz
        if (isHand(game.mode)) return { e: Math.round(r.E * 100) / 100, s: r.score };                                      // écart en % de la toile
        if (isTune(game.mode)) return { t: r.target, p: r.picks, i: r.inst, s: r.score };                                  // touches 0..12
        return { t: [r.target.h, +r.target.s.toFixed(3), +r.target.v.toFixed(3)], p: [r.pick.h, +r.pick.s.toFixed(3), +r.pick.v.toFixed(3)], s: r.score };
      })
    });
    if (data.games.length > 200) data.games.splice(0, data.games.length - 200);
    save();
    return out;
  }

  // Moyenne par manche sur les N dernières : « ton œil » (couleurs) ou « ton oreille » (son)
  function level(n, world) {
    n = n || 50;
    var scores = [];
    for (var i = data.games.length - 1; i >= 0 && scores.length < n; i--) {
      if (worldOf(data.games[i].mode) !== world) continue;
      var g = data.games[i].rounds;
      for (var j = g.length - 1; j >= 0 && scores.length < n; j--) scores.push(g[j].s);
    }
    if (!scores.length) return null;
    return { avg: scores.reduce(function (a, b) { return a + b; }, 0) / scores.length, n: scores.length };
  }
  function eye(n) { return level(n, 'eye'); }
  function ear(n) { return level(n, 'ear'); }


  // Les dernières couleurs cibles (pour l'éventail de l'accueil)
  function recentTargets(n) {
    var out = [];
    for (var i = data.games.length - 1; i >= 0 && out.length < n; i--) {
      if (worldOf(data.games[i].mode) !== 'eye') continue;
      var g = data.games[i].rounds;
      for (var j = g.length - 1; j >= 0 && out.length < n; j--) out.push({ h: g[j].t[0], s: g[j].t[1], v: g[j].t[2], score: g[j].s });
    }
    return out;
  }


  function setSetting(k, v) { data.settings[k] = v; save(); }
  function reset() { var s = data.settings; data = blank(); data.settings = s; save(); }

  root.NC = root.NC || {};
  root.NC.store = {
    get data() { return data; },
    get settings() { return data.settings; },
    dayKey: dayKey, dayNumber: dayNumber, daySeed: daySeed, streak: streak, dailyResult: dailyResult,
    record: record, eye: eye, ear: ear, level: level, isSound: isSound, isHand: isHand, isTune: isTune, worldOf: worldOf,
    recentTargets: recentTargets, setSetting: setSetting, reset: reset
  };
})(this);
