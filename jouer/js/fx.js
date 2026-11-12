/* Delta — sons (WebAudio, aucun fichier) et retour tactile.
   Sur Android, la coque expose window.AndroidBridge : vibrations « prédéfinies » du système,
   bien plus fines que navigator.vibrate (qui ne sait faire qu'un bourdonnement). */
(function (root) {
  'use strict';
  var ctx = null, master = null;

  function settings() { return root.NC.store.settings; }

  // force : le mode « À l'oreille » joue ses notes même si les bruitages sont coupés
  function audio(force) {
    if (!force && !settings().sound) return null;
    if (!ctx) {
      var AC = root.AudioContext || root.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  // Une note brève : oscillateur + enveloppe percussive
  function tone(freq, dur, opts) {
    var a = audio(); if (!a) return;
    opts = opts || {};
    var t = a.currentTime + (opts.delay || 0);
    var o = a.createOscillator(), g = a.createGain();
    o.type = opts.type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (opts.to) o.frequency.exponentialRampToValueAtTime(opts.to, t + dur);
    var vol = opts.vol == null ? 0.25 : opts.vol;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  // Souffle filtré : la pastille qui glisse
  function swish(dur, from, to, vol) {
    var a = audio(); if (!a) return;
    var t = a.currentTime, n = Math.floor(a.sampleRate * dur);
    var buf = a.createBuffer(1, n, a.sampleRate), d = buf.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    var s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
    s.buffer = buf; f.type = 'bandpass'; f.Q.value = 1.4;
    f.frequency.setValueAtTime(from, t); f.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.value = vol || 0.18;
    s.connect(f); f.connect(g); g.connect(master);
    s.start(t);
  }

  var sfx = {
    unlock: function () { audio(); },
    tap: function () { tone(1400, 0.035, { type: 'triangle', vol: 0.12 }); },
    tick: function () { tone(2200, 0.018, { type: 'square', vol: 0.035 }); },
    count: function (i) { tone(420 + i * 9, 0.03, { type: 'triangle', vol: 0.08 }); },
    beat: function (last) { tone(last ? 880 : 660, 0.07, { type: 'sine', vol: 0.18 }); },
    show: function () { swish(0.28, 600, 2400, 0.16); },
    hide: function () { swish(0.22, 2400, 500, 0.12); },
    validate: function () { tone(520, 0.06, { type: 'triangle', vol: 0.2 }); tone(780, 0.08, { type: 'triangle', vol: 0.16, delay: 0.05 }); },
    // accord de fin de manche : plus le score est haut, plus il s'ouvre
    result: function (s) {
      var base = 261.63;
      var ch = s >= 90 ? [0, 4, 7, 12, 16] : s >= 65 ? [0, 4, 7] : s >= 45 ? [0, 3, 7] : [0, 1, 6];
      ch.forEach(function (st, i) {
        tone(base * Math.pow(2, st / 12), 0.6 - i * 0.05, { type: 'sine', vol: 0.13, delay: i * 0.045 });
      });
    },
    lifeLost: function () { tone(220, 0.35, { type: 'sawtooth', vol: 0.06, to: 110 }); },
    record: function () {
      [0, 4, 7, 12, 16, 19, 24].forEach(function (st, i) {
        tone(392 * Math.pow(2, st / 12), 0.22, { type: 'triangle', vol: 0.13, delay: i * 0.07 });
      });
    }
  };

  // Retour tactile — tick (cran), click, heavy, double, rise (réussite), fall (raté)
  var PATTERNS = { tick: 4, click: 12, heavy: 30, double: [14, 60, 14], rise: [8, 40, 16, 40, 30], fall: [40, 50, 40] };
  function haptic(kind) {
    if (!settings().haptics) return;
    try {
      if (root.AndroidBridge && root.AndroidBridge.haptic) { root.AndroidBridge.haptic(kind); return; }
      if (navigator.vibrate) navigator.vibrate(PATTERNS[kind] || 10);
    } catch (e) {}
  }

  root.NC = root.NC || {};
  root.NC.fx = { sfx: sfx, haptic: haptic, ctx: function () { return audio(true); } };
})(this);
