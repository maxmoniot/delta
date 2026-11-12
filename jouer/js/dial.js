/* Delta — la molette : une bande graduée qu'on fait défiler sous un repère central fixe.
   Sert à la teinte (bande arc-en-ciel, circulaire) et à la fréquence (clavier, bornée).
   Pourquoi pas un curseur classique : le doigt ne cache jamais la valeur choisie (elle est au
   centre), la bande n'affiche qu'une partie de l'étendue donc chaque pixel vaut moins (plus fin),
   et il n'y a plus de bord où « coincer » le pouce. Glisser = régler, lancer = élan,
   toucher à côté du repère = y aller. Un cran vibrant à chaque palier. */
(function (root) {
  'use strict';

  var FLING_MIN = 0.5;     // px/ms : en dessous, on relâche sans élan (réglage fin)
  var FRICTION = 0.93;     // par tranche de 16 ms

  function Dial(canvas, o) {
    this.c = canvas;
    this.o = o;
    this.v = o.value || 0;
    this.locked = false;
    this.anim = 0;
    this.lastStep = null; this.lastTick = 0;
    var self = this, id = null, x0 = 0, v0 = 0, t0 = 0, moved = false, samples = [];

    function width() { return canvas.getBoundingClientRect().width || 1; }
    function px(e) { return e.clientX - canvas.getBoundingClientRect().left; }

    canvas.addEventListener('pointerdown', function (e) {
      if (self.locked) return;
      e.preventDefault();
      cancelAnimationFrame(self.anim);
      id = e.pointerId; moved = false;
      try { canvas.setPointerCapture(id); } catch (x) {}
      x0 = px(e); v0 = self.v; t0 = performance.now(); samples = [[t0, x0]];
      if (o.onStart) o.onStart(self.v);
    });
    canvas.addEventListener('pointermove', function (e) {
      if (id !== e.pointerId || self.locked) return;
      var x = px(e), now = performance.now();
      if (Math.abs(x - x0) > 4) moved = true;
      if (!moved) return;
      samples.push([now, x]); if (samples.length > 6) samples.shift();
      self.set(v0 - (x - x0) * o.span / width(), true);
    });
    function up(e) {
      if (id !== e.pointerId) return;
      id = null;
      if (self.locked) return;
      var x = px(e), w = width(), now = performance.now();
      if (!moved && now - t0 < 350) {
        // appui : la graduation touchée vient se placer sous le repère
        self.glide(self.v + (x - w / 2) * o.span / w, 220);
        return;
      }
      if (moved) self.set(v0 - (x - x0) * o.span / w, true);   // le lever du doigt compte aussi
      // élan : vitesse des derniers instants du geste
      var a = samples[0], b = samples[samples.length - 1], vel = 0;
      if (b && a && b[0] - a[0] > 8 && now - b[0] < 60) vel = (b[1] - a[1]) / (b[0] - a[0]);
      if (Math.abs(vel) < FLING_MIN) { if (o.onEnd) o.onEnd(self.v); return; }
      var last = now;
      (function coast(t) {
        var dt = Math.min(40, t - last); last = t;
        vel *= Math.pow(FRICTION, dt / 16);
        var before = self.v;
        self.set(self.v - vel * dt * o.span / w, true);
        if (Math.abs(vel) > 0.03 && (o.wrap || self.v !== before)) self.anim = requestAnimationFrame(coast);
        else if (o.onEnd) o.onEnd(self.v);
      })(now);
    }
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    if (root.ResizeObserver) new ResizeObserver(function () { self.draw(); }).observe(canvas);
  }

  Dial.prototype.norm = function (v) {
    if (this.o.wrap) return ((v % this.o.wrap) + this.o.wrap) % this.o.wrap;
    return Math.max(this.o.min, Math.min(this.o.max, v));
  };

  Dial.prototype.set = function (v, user) {
    v = this.norm(v);
    if (user && this.o.step) {
      var s = Math.floor((v + (this.o.stepOffset || 0)) / this.o.step);   // un cran par touche franchie
      if (s !== this.lastStep) {
        var now = performance.now();
        if (this.lastStep !== null && now - this.lastTick > 25) { this.lastTick = now; root.NC.fx.haptic('tick'); }
        this.lastStep = s;
      }
    }
    this.v = v;
    this.draw();
    if (user && this.o.onChange) this.o.onChange(v);
  };

  // Glissement animé vers une valeur (appui à côté du repère)
  Dial.prototype.glide = function (to, ms) {
    var self = this, from = this.v, t0 = performance.now(), d;
    if (this.o.wrap) { d = ((to - from) % this.o.wrap + this.o.wrap * 1.5) % this.o.wrap - this.o.wrap / 2; }
    else d = this.norm(to) - from;
    cancelAnimationFrame(this.anim);
    (function step(t) {
      var k = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - k, 3);
      self.set(from + d * e, true);
      if (k < 1) self.anim = requestAnimationFrame(step);
      else if (self.o.onEnd) self.o.onEnd(self.v);
    })(t0);
  };

  // Abscisse d'une valeur, le repère central valant la valeur courante
  Dial.prototype.xOf = function (v, w) {
    var d = v - this.v;
    if (this.o.wrap) d = ((d % this.o.wrap) + this.o.wrap * 1.5) % this.o.wrap - this.o.wrap / 2;
    return w / 2 + d * w / this.o.span;
  };

  Dial.prototype.draw = function () {
    var c = this.c, dpr = root.devicePixelRatio || 1, r = c.getBoundingClientRect();
    var W = Math.max(1, Math.round(r.width * dpr)), H = Math.max(1, Math.round(r.height * dpr));
    if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
    var g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, r.width, r.height);
    this.o.render(g, r.width, r.height, this);
  };

  // Le repère central : un cadre blanc liseré de noir, lisible sur n'importe quelle couleur
  // gap (facultatif) : [y0, y1], une fenêtre laissée libre pour que le chiffre sous le repère reste lisible
  Dial.needle = function (g, w, h, half, gap) {
    half = half || 6;
    if (gap) { frame(g, w, 0, gap[0], half); frame(g, w, gap[1], h, half); return; }
    frame(g, w, 0, h, half);
  };
  function frame(g, w, y0, y1, half) {
    var x = Math.round(w / 2), hh = y1 - y0;
    g.lineWidth = 4; g.strokeStyle = '#fff'; g.strokeRect(x - half, y0 + 2, half * 2, hh - 4);
    g.lineWidth = 1; g.strokeStyle = '#000'; g.strokeRect(x - half - 2.5, y0 + 0.5, half * 2 + 5, hh - 1);
    g.strokeRect(x - half + 2.5, y0 + 4.5, half * 2 - 5, hh - 9);
  }
  // Encoche de la cible (révélation) ; flèche au bord si elle est hors de la bande
  Dial.mark = function (g, x, w, h) {
    var s = 9, out = x < 0 || x > w;
    x = Math.max(s, Math.min(w - s, x));
    g.fillStyle = '#fff'; g.strokeStyle = '#000'; g.lineWidth = 1;
    if (out) {
      var dir = x < w / 2 ? -1 : 1, y = h / 2;
      g.beginPath(); g.moveTo(x + dir * s, y); g.lineTo(x - dir * s * 0.4, y - s); g.lineTo(x - dir * s * 0.4, y + s); g.closePath(); g.fill(); g.stroke();
      return;
    }
    g.beginPath(); g.moveTo(x - s / 1.3, 0); g.lineTo(x + s / 1.3, 0); g.lineTo(x, s); g.closePath(); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(x - s / 1.3, h); g.lineTo(x + s / 1.3, h); g.lineTo(x, h - s); g.closePath(); g.fill(); g.stroke();
  };

  root.NC = root.NC || {};
  root.NC.Dial = Dial;
})(this);
