/* Delta — le nuancier tactile des couleurs (demandes de Max, 12/10 puis 26/10/2026).
   Un DISQUE chromatique : l'angle donne la teinte (rouge en haut, sens horaire), la distance au centre
   la saturation. La luminosité est fixe pour tout le jeu (NC.color.V) : plus de molette.
   Pourquoi un disque : la teinte n'a pas de couture (le rouge est partout continu), et elle devient plus
   fine vers le bord, là où l'œil la distingue le mieux ; près du centre (couleurs grises) elle compte peu.
   Le disque est peint une fois à pleine luminosité, puis assombri d'un voile noir d'opacité (1 − B) :
   en sRGB c'est exactement le modèle HSV, donc la couleur sous le doigt est la couleur jouée. */
(function (root) {
  'use strict';
  var RIM = 12;        // marge autour du disque pour la graduation des teintes

  function Picker(pad, onChange) {
    this.pad = pad; this.onChange = onChange || function () {};
    this.h = 0; this.s = 0.5;
    this.touched = false;    // l'utilisateur a-t-il déjà réglé quelque chose ?
    this.locked = true;
    this.target = null;      // affiché à la révélation
    this.lastTick = 0; this.lastStep = null;
    this.base = null; this.baseKey = '';
    var self = this;
    this.bindPad(pad);
    if (root.ResizeObserver) new ResizeObserver(function () { self.drawPad(); }).observe(pad);
  }

  function css(v) { return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); }

  Object.defineProperty(Picker.prototype, 'v', { get: function () { return root.NC.color.V; } });

  // Géométrie du disque dans le canvas (pixels CSS)
  Picker.prototype.geom = function () {
    var r = this.pad.getBoundingClientRect();
    return { w: r.width, h: r.height, cx: r.width / 2, cy: r.height / 2, R: Math.max(10, Math.min(r.width, r.height) / 2 - RIM) };
  };

  Picker.prototype.bindPad = function (el) {
    var self = this, id = null;
    function at(e) {
      var r = el.getBoundingClientRect(), G = self.geom();
      var dx = e.clientX - r.left - G.cx, dy = e.clientY - r.top - G.cy;
      var a = Math.atan2(dx, -dy) * 180 / Math.PI;          // 0° en haut, sens horaire
      self.h = (a + 360) % 360;
      self.s = Math.min(1, Math.sqrt(dx * dx + dy * dy) / G.R);   // hors du disque : on reste au bord
      self.notch(Math.round(self.h / 15) + ':' + Math.round(self.s * 10));
      self.touched = true;
      self.drawPad();
      self.onChange(self.value());
    }
    el.addEventListener('pointerdown', function (e) {
      if (self.locked) return;
      e.preventDefault();
      id = e.pointerId;
      try { el.setPointerCapture(id); } catch (x) {}
      at(e);
    });
    el.addEventListener('pointermove', function (e) { if (id === e.pointerId && !self.locked) at(e); });
    // le lever du doigt compte aussi : le dernier déplacement peut arriver un peu avant (mesuré sur le Pixel 6)
    function up(e) { if (id !== e.pointerId) return; id = null; if (e.type === 'pointerup' && !self.locked) at(e); }
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };

  // Un cran tactile à chaque palier franchi (15° de teinte, 10 % de saturation)
  Picker.prototype.notch = function (step) {
    if (step === this.lastStep) return;
    this.lastStep = step;
    var now = performance.now();
    if (now - this.lastTick < 30) return;
    this.lastTick = now;
    root.NC.fx.haptic('tick');
  };

  Picker.prototype.value = function () { return { h: Math.round(this.h) % 360, s: this.s, v: root.NC.color.V }; };

  // Point de départ d'une manche : une couleur quelconque, déjà affichée (pas d'écran vide)
  Picker.prototype.reset = function (start) {
    this.h = start.h; this.s = start.s; this.touched = false; this.target = null; this.lastStep = null;
    this.drawPad();
  };

  Picker.prototype.fit = function (c) {
    var dpr = root.devicePixelRatio || 1, r = c.getBoundingClientRect();
    var w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    var g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { g: g, w: r.width, h: r.height, dpr: dpr };
  };

  // Le disque à pleine luminosité, peint pixel par pixel une seule fois (et à chaque changement de taille)
  Picker.prototype.baseDisc = function (R, dpr) {
    var Rd = Math.round(R * dpr), key = Rd + '';
    if (this.base && this.baseKey === key) return this.base;
    var size = Rd * 2 + 2, cv = document.createElement('canvas');
    cv.width = cv.height = size;
    var g = cv.getContext('2d'), img = g.createImageData(size, size), d = img.data, c = size / 2;
    for (var j = 0; j < size; j++) {
      for (var i = 0; i < size; i++) {
        var dx = i + 0.5 - c, dy = j + 0.5 - c, dist = Math.sqrt(dx * dx + dy * dy), o = (j * size + i) * 4;
        var alpha = Math.max(0, Math.min(1, Rd + 0.5 - dist));
        if (alpha <= 0) continue;
        var s = Math.min(1, dist / Rd), hh = (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360;
        // HSV → RGB à V = 1, en ligne (pas d'allocation : 400 000 pixels)
        var hp = hh / 60, x = 1 - Math.abs((hp % 2) - 1), r = 0, gg = 0, b = 0;
        if (hp < 1) { r = 1; gg = x; } else if (hp < 2) { r = x; gg = 1; } else if (hp < 3) { gg = 1; b = x; }
        else if (hp < 4) { gg = x; b = 1; } else if (hp < 5) { r = x; b = 1; } else { r = 1; b = x; }
        d[o] = Math.round((1 - s + s * r) * 255); d[o + 1] = Math.round((1 - s + s * gg) * 255); d[o + 2] = Math.round((1 - s + s * b) * 255);
        d[o + 3] = Math.round(alpha * 255);
      }
    }
    g.putImageData(img, 0, 0);
    this.base = cv; this.baseKey = key;
    return cv;
  };

  // Position d'une couleur (teinte, saturation) sur le disque
  function spot(G, h, s) {
    var a = h * Math.PI / 180;
    return { x: G.cx + Math.sin(a) * G.R * s, y: G.cy - Math.cos(a) * G.R * s };
  }

  Picker.prototype.draw = function () { this.drawPad(); };

  Picker.prototype.drawPad = function () {
    var f = this.fit(this.pad), g = f.g, G = this.geom(), C = root.NC.color;
    g.clearRect(0, 0, f.w, f.h);
    // graduation des teintes autour du disque : tous les 15°, plus longue tous les 30°
    g.fillStyle = css('--ink-3');
    for (var t = 0; t < 360; t += 15) {
      var a = t * Math.PI / 180, len = t % 30 === 0 ? 7 : 3.5, r0 = G.R + 3;
      g.save(); g.translate(G.cx + Math.sin(a) * r0, G.cy - Math.cos(a) * r0); g.rotate(a);
      g.fillRect(-0.6, -len, 1.2, len); g.restore();
    }
    // le disque, puis le voile qui lui donne la luminosité choisie
    var base = this.baseDisc(G.R, f.dpr), sz = base.width / f.dpr;
    g.drawImage(base, G.cx - sz / 2, G.cy - sz / 2, sz, sz);
    var v = root.NC.color.V;
    if (v < 1) {
      g.globalAlpha = 1 - v; g.fillStyle = '#000';
      g.beginPath(); g.arc(G.cx, G.cy, G.R + 0.5, 0, Math.PI * 2); g.fill();
      g.globalAlpha = 1;
    }
    var p = spot(G, this.h, this.s);
    if (this.target) {
      var q = spot(G, this.target.h, this.target.s);
      g.save();
      g.setLineDash([4, 4]); g.lineWidth = 1.5;
      g.strokeStyle = 'rgba(0,0,0,.65)'; line(g, p.x, p.y, q.x, q.y);
      g.lineDashOffset = 4; g.strokeStyle = 'rgba(255,255,255,.9)'; line(g, p.x, p.y, q.x, q.y);
      g.restore();
      // la cible : une petite pastille carrée de SA couleur
      var s2 = 18;
      g.fillStyle = C.css(C.hsvToRgb(this.target.h, this.target.s, this.target.v));
      g.fillRect(q.x - s2 / 2, q.y - s2 / 2, s2, s2);
      g.lineWidth = 3; g.strokeStyle = '#fff'; g.strokeRect(q.x - s2 / 2, q.y - s2 / 2, s2, s2);
      g.lineWidth = 1; g.strokeStyle = '#000'; g.strokeRect(q.x - s2 / 2 - 2, q.y - s2 / 2 - 2, s2 + 4, s2 + 4);
    }
    ring(g, p.x, p.y, 12);
  };

  function line(g, x1, y1, x2, y2) { g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); }
  function ring(g, x, y, r) {
    g.lineWidth = 4; g.strokeStyle = '#fff'; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.stroke();
    g.lineWidth = 1; g.strokeStyle = '#000';
    g.beginPath(); g.arc(x, y, r + 2.5, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.arc(x, y, r - 2.5, 0, Math.PI * 2); g.stroke();
  }

  root.NC = root.NC || {};
  root.NC.Picker = Picker;
})(this);
