/* Delta — le moteur du monde « La main » (Δx) : le mouvement et la forme.
   Tout se mesure en pixels CSS de la toile, et s'affiche en millimètres (1 px ≈ 0,16 mm sur un téléphone :
   un pixel CSS Android vaut 1/160 de pouce). Les scores rapportent l'écart à la plus petite dimension
   de la toile, pour être justes d'un écran à l'autre.
   Même fichier pour la page et pour les tests Node (module.exports en bas). */
(function (root) {
  'use strict';

  /* ---------- le mouvement : un trajet lisse, rythmé ---------- */

  // Spline cardinale (tension 0,35 : peu de dépassement) entre points de passage tirés au hasard.
  // Le temps se partage entre les tronçons en proportion de leur longueur ; dans chaque tronçon, une
  // légère décélération près des points de passage donne au mouvement un vrai rythme.
  var TENSION = 0.35;
  function tangent(pts, i) {
    var a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    return [(1 - TENSION) / 2 * (b[0] - a[0]), (1 - TENSION) / 2 * (b[1] - a[1])];
  }
  function hermite(pts, i, t) {
    var p1 = pts[i], p2 = pts[i + 1], m1 = tangent(pts, i), m2 = tangent(pts, i + 1);
    var t2 = t * t, t3 = t2 * t;
    var h00 = 2 * t3 - 3 * t2 + 1, h10 = t3 - 2 * t2 + t, h01 = -2 * t3 + 3 * t2, h11 = t3 - t2;
    return [h00 * p1[0] + h10 * m1[0] + h01 * p2[0] + h11 * m2[0], h00 * p1[1] + h10 * m1[1] + h01 * p2[1] + h11 * m2[1]];
  }
  function ease(x) { return 0.65 * x + 0.35 * (0.5 - 0.5 * Math.cos(Math.PI * x)); }

  // Un trajet à UN SEUL virage (demande de Max du 27/10 : « un seul virage sinon c'est trop dur ; il pourra
  // être courbé ou cubique ») : deux jambes de longueurs voisines qui se rejoignent en un coin C, tourné de
  // 65 à 140°. Deux sortes, au hasard : « courbe » = Bézier cubique dont les poignées visent le coin (de l'arc
  // large au virage serré) ; « angle » = le coin net, comme l'arête d'un cube. Le rond freine dans le virage.
  // La courbe est mise à l'échelle et posée au hasard dans la toile ; asp = hauteur / largeur de la toile,
  // pour que le virage garde sa forme une fois la toile étirée.
  var KINDS = ['courbe', 'angle'];
  var FLOW = 72;                          // points de la courbe
  function path(rand, kind, asp) {
    asp = asp || 1;
    var pick = rand();                    // tiré même si la sorte est imposée : la suite du hasard ne bouge pas
    kind = KINDS.indexOf(kind) >= 0 ? kind : KINDS[pick < 0.5 ? 0 : 1];
    var T = (65 + rand() * 75) * Math.PI / 180 * (rand() < 0.5 ? -1 : 1), head = rand() * Math.PI * 2;
    var la = 0.75 + rand() * 0.5, lb = 0.75 + rand() * 0.5, f = 0.35 + rand() * 0.4, mid = 0.4 + rand() * 0.2;
    var C = [0, 0], A = [-la * Math.cos(head), -la * Math.sin(head)], B = [lb * Math.cos(head + T), lb * Math.sin(head + T)];
    var raw = [], turn = [];
    for (var i = 0; i < FLOW; i++) {
      var s = i / (FLOW - 1), q;
      if (kind === 'angle') {             // le coin à la fraction « mid » du temps de parcours
        q = s < mid ? [A[0] + (C[0] - A[0]) * s / mid, A[1] + (C[1] - A[1]) * s / mid]
                    : [C[0] + (B[0] - C[0]) * (s - mid) / (1 - mid), C[1] + (B[1] - C[1]) * (s - mid) / (1 - mid)];
        turn.push(Math.exp(-Math.pow((s - mid) / 0.07, 2)));
      } else {                            // Bézier cubique A, A→C·f, B→C·f, B
        var P1 = [A[0] + (C[0] - A[0]) * f, A[1] + (C[1] - A[1]) * f], P2 = [B[0] + (C[0] - B[0]) * f, B[1] + (C[1] - B[1]) * f];
        var m = 1 - s, w0 = m * m * m, w1 = 3 * m * m * s, w2 = 3 * m * s * s, w3 = s * s * s;
        q = [w0 * A[0] + w1 * P1[0] + w2 * P2[0] + w3 * B[0], w0 * A[1] + w1 * P1[1] + w2 * P2[1] + w3 * B[1]];
        turn.push(Math.exp(-Math.pow((s - 0.5) / 0.22, 2)));
      }
      raw.push(q);
    }
    if (kind === 'angle') raw[Math.round(mid * (FLOW - 1))] = C;    // le coin exact, pour qu'il reste net
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    raw.forEach(function (q) { x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); x1 = Math.max(x1, q[0]); y1 = Math.max(y1, q[1]); });
    var room = 0.6 + rand() * 0.14, k = Math.min(room / Math.max(1e-6, x1 - x0), room * asp / Math.max(1e-6, y1 - y0));
    var ox = 0.12 + rand() * (0.76 - (x1 - x0) * k), oy = 0.12 * asp + rand() * (0.76 * asp - (y1 - y0) * k);
    var pts = raw.map(function (q) { return [+(ox + (q[0] - x0) * k).toFixed(6), +((oy + (q[1] - y0) * k) / asp).toFixed(6)]; });
    var slow = kind === 'angle' ? 2.2 : 0.8, total = 0, wsum = 0, ws = [];
    for (var j = 0; j < pts.length - 1; j++) {
      var L = Math.hypot(pts[j + 1][0] - pts[j][0], pts[j + 1][1] - pts[j][1]), w = L * (1 + slow * (turn[j] + turn[j + 1]) / 2);
      total += L; ws.push(w); wsum += w;
    }
    var cum = [0], acc = 0;
    ws.forEach(function (w) { acc += w / wsum; cum.push(+acc.toFixed(6)); });
    cum[cum.length - 1] = 1;
    var dur = Math.max(1.4, Math.min(3.4, 1.1 + total * 0.95));
    return { pts: pts, cum: cum, dur: +dur.toFixed(2), flow: 1, kind: kind, sharp: kind === 'angle' ? 1 : 0 };
  }

  // Position (carré unité) au temps relatif u ∈ [0, 1]
  function at(p, u) {
    u = Math.max(0, Math.min(1, u));
    if (p.flow) u = ease(u);                // une courbe dense : départ et arrivée en douceur, vitesse continue
    var i = 0;
    while (i < p.cum.length - 2 && u > p.cum[i + 1]) i++;
    var span = p.cum[i + 1] - p.cum[i], tau = span > 0 ? (u - p.cum[i]) / span : 0;
    tau = Math.max(0, Math.min(1, tau));
    if (p.sharp) {                          // le coin net : segments droits (la spline arrondirait le coin)
      var a = p.pts[i], b = p.pts[i + 1];
      return [a[0] + (b[0] - a[0]) * tau, a[1] + (b[1] - a[1]) * tau];
    }
    return hermite(p.pts, i, p.flow ? tau : ease(tau));
  }

  // n points à pas de temps égaux le long d'un tracé [{x, y, t}]
  function resample(trace, n) {
    n = Math.max(2, Math.round(n) || 2);      // jamais moins de 2 points (sinon .pop() rend undefined)
    var t0 = trace[0].t, t1 = trace[trace.length - 1].t, out = [], j = 0;
    for (var k = 0; k < n; k++) {
      var tt = t0 + (t1 - t0) * k / (n - 1);
      while (j < trace.length - 2 && trace[j + 1].t < tt) j++;
      var a = trace[j], b = trace[Math.min(trace.length - 1, j + 1)], span = b.t - a.t;
      var f = span > 0 ? Math.max(0, Math.min(1, (tt - a.t) / span)) : 0;
      out.push([a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f]);
    }
    return out;
  }

  /* Compare ton tracé au trajet : sa SUPERPOSITION au chemin demandé (demande de Max du 28/10 : « noter le tracé dans
     son ensemble » ; avant, on comparait les positions à temps égal, et attendre 0,7 s sur le rond avant de partir
     faisait tomber un tracé parfait à 41).
     - Ce qui dépasse avant le départ ou après l'arrivée ne compte pas, ni le temps passé posé sans bouger.
     - L'écart = distance moyenne entre ton tracé et le chemin comparés point à point à DISTANCE PARCOURUE égale
       (et non plus à temps égal) : la vitesse n'y entre pas, un décalage compte en entier, s'arrêter à mi-chemin
       coûte cher. (La distance « au plus près » a été écartée : un tracé décalé d'un quart d'écran y gardait 60.)
     - Le rythme ne compte plus qu'au-delà d'une large marge (× 1,5 plus lent ou plus rapide) : assez pour que
       tracer au ralenti ne paie pas, jamais pour une vitesse un peu inégale. */
  // TK 14 → 11 le 28/10 : le temps ne gonfle plus l'écart, l'échelle se resserre pour que le classement départage
  // (écart de forme 4 % → 88, 8 % → 65, 12 % → 46)
  var TK = 11, TW = 12, SLACK = Math.log(1.5), STILL = 6, COS35 = Math.cos(35 * Math.PI / 180);

  // Le chemin du modèle en pixels, en ligne brisée fine (le coin net garde son sommet exact)
  function outline(p, W, H) {
    if (p.sharp) return p.pts.map(function (q) { return [q[0] * W, q[1] * H]; });
    var o = [];
    for (var i = 0; i <= 240; i++) { var q = at(p, i / 240); o.push([q[0] * W, q[1] * H]); }
    return o;
  }
  function lengths(pl) {
    var cum = [0];
    for (var i = 1; i < pl.length; i++) cum.push(cum[i - 1] + Math.hypot(pl[i][0] - pl[i - 1][0], pl[i][1] - pl[i - 1][1]));
    return cum;
  }
  // Point le plus proche de q sur la ligne brisée : distance, abscisse curviligne, et s'il tombe sur une extrémité
  function nearest(pl, cum, q) {
    var best = { d: Infinity, s: 0, end: 0, at: pl[0] };
    for (var i = 0; i < pl.length - 1; i++) {
      var a = pl[i], b = pl[i + 1], vx = b[0] - a[0], vy = b[1] - a[1], L2 = vx * vx + vy * vy;
      var u = L2 > 0 ? ((q[0] - a[0]) * vx + (q[1] - a[1]) * vy) / L2 : 0, cu = Math.max(0, Math.min(1, u));
      var x = a[0] + vx * cu, y = a[1] + vy * cu, d = Math.hypot(q[0] - x, q[1] - y);
      if (d < best.d) best = { d: d, s: cum[i] + (cum[i + 1] - cum[i]) * cu, end: i === 0 && u <= 0 ? -1 : i === pl.length - 2 && u >= 1 ? 1 : 0, at: [x, y] };
    }
    return best;
  }
  // n points à pas de longueur égaux le long d'une ligne brisée
  function byLength(pl, n) {
    var cum = lengths(pl), L = cum[cum.length - 1], out = [], j = 0;
    if (L <= 0) { for (var z = 0; z < n; z++) out.push(pl[0].slice()); return out; }
    for (var k = 0; k < n; k++) {
      var s = L * k / (n - 1);
      while (j < pl.length - 2 && cum[j + 1] < s) j++;
      var span = cum[j + 1] - cum[j], f = span > 0 ? (s - cum[j]) / span : 0;
      out.push([pl[j][0] + (pl[j + 1][0] - pl[j][0]) * f, pl[j][1] + (pl[j + 1][1] - pl[j][1]) * f]);
    }
    return out;
  }
  // Durée « en mouvement » d'une suite de points datés : du premier pas hors du point de départ au dernier pas
  // avant le point d'arrivée (le temps passé posé, au départ comme à l'arrivée, ne compte pas)
  function moving(pts) {
    var a = 0, b = pts.length - 1, first = pts[0], last = pts[b];
    while (a < b && Math.hypot(pts[a][0] - first[0], pts[a][1] - first[1]) < STILL) a++;
    while (b > a && Math.hypot(pts[b][0] - last[0], pts[b][1] - last[1]) < STILL) b--;
    return Math.max(0, pts[b][2] - pts[Math.max(0, a - 1)][2]);
  }

  function compareTrace(p, trace, W, H) {
    var M = Math.min(W, H), N = 64, pl = outline(p, W, H), cum = lengths(pl), L = cum[cum.length - 1];
    var mine = trace.map(function (q) { return [q.x, q.y, q.t]; });
    // ce qui dépasse avant le départ ou après l'arrivée du chemin, DANS SON PROLONGEMENT (cône de 35°), est mis de
    // côté ; un tracé simplement décalé sur le côté, lui, garde tous ses points (sinon le décalage serait sous-compté)
    var proj = mine.map(function (q) { return nearest(pl, cum, q); }), i0 = 0, i1 = mine.length - 1;
    function beyond(q, tip, from) {
      var tx = tip[0] - from[0], ty = tip[1] - from[1], vx = q[0] - tip[0], vy = q[1] - tip[1], n = Math.hypot(vx, vy);
      return n < STILL || (vx * tx + vy * ty) / (n * (Math.hypot(tx, ty) || 1)) > COS35;
    }
    // au plus 15 % de la longueur du chemin de chaque côté : au-delà, ce n'est plus un dépassement, c'est un autre tracé
    var head = pl[0], head2 = pl[Math.min(pl.length - 1, 3)], tail = pl[pl.length - 1], tail2 = pl[Math.max(0, pl.length - 4)];
    var mineCum = lengths(mine), last = mineCum[mineCum.length - 1], cap = 0.15 * L;
    while (i0 < i1 && proj[i0].end === -1 && beyond(mine[i0], head, head2) && mineCum[i0 + 1] <= cap) i0++;
    while (i1 > i0 && proj[i1].end === 1 && beyond(mine[i1], tail, tail2) && last - mineCum[i1 - 1] <= cap) i1--;
    var kept = mine.slice(Math.max(0, i0 - 1), i1 + 2), keptCum = lengths(kept);
    // ton tracé et le chemin, chacun en N points à pas de longueur égaux, comparés point à point
    var U = byLength(kept, N), V = byLength(pl, N), sum = 0, sx = 0, sy = 0;
    for (var j = 0; j < N; j++) { var ex = U[j][0] - V[j][0], ey = U[j][1] - V[j][1]; sum += Math.hypot(ex, ey); sx += ex; sy += ey; }
    var d = sum / N, dPct = d / M * 100;
    // jusqu'où le chemin a été suivi (abscisse la plus avancée atteinte à moins de 8 % de l'écran)
    var reach = 0;
    proj.forEach(function (n) { if (n.d < 0.08 * M) reach = Math.max(reach, n.s); });
    // rythme : durée en mouvement, comparée à celle du modèle mesurée de la même façon
    var model = [];
    for (var k = 0; k <= 200; k++) { var q = at(p, k / 200); model.push([q[0] * W, q[1] * H, k / 200 * p.dur * 1000]); }
    var T = moving(kept) / 1000, T0 = Math.max(0.2, moving(model) / 1000), r = Math.max(1e-3, T / T0);
    var pace = TW * Math.max(0, Math.abs(Math.log(r)) - SLACK), E = dPct + pace;
    return {
      d: d, dPct: dPct, reach: L > 0 ? reach / L : 1, L: L, len: keptCum[keptCum.length - 1], off: [sx / N, sy / N],
      r: r, dt: T - T0, T: T, pace: pace, E: E, score: Math.round(100 / (1 + Math.pow(E / TK, 2)))
    };
  }

  function traceHint(c) {
    if (c.E < 1.5) return 'Rien à redire';
    if (c.reach < 0.85 && c.len < 0.85 * c.L) return 'Arrêté trop tôt : il manquait ' + mm((1 - c.reach) * c.L);
    if (c.pace > c.dPct) return (c.r > 1 ? 'Trop lent' : 'Trop rapide') + ' : ' + sec(c.T) + ' au lieu de ' + sec(c.T - c.dt);
    var o = Math.hypot(c.off[0], c.off[1]);
    if (o > 0.6 * c.d) return 'Décalé ' + direction(c.off) + ' de ' + mm(o);
    return 'Trajet approximatif : ' + mm(c.d) + ' d’écart moyen';
  }

  /* ---------- la forme : des polygones sans symétrie de rotation ---------- */

  function norm(name, raw) {
    // centre = centre de gravité de la surface ; rayon maximal ramené à 1
    var A = 0, cx = 0, cy = 0;
    for (var i = 0; i < raw.length; i++) {
      var a = raw[i], b = raw[(i + 1) % raw.length], cr = a[0] * b[1] - b[0] * a[1];
      A += cr; cx += (a[0] + b[0]) * cr; cy += (a[1] + b[1]) * cr;
    }
    A /= 2; cx /= 6 * A; cy /= 6 * A;
    var pts = raw.map(function (p) { return [p[0] - cx, p[1] - cy]; });
    var R = Math.max.apply(null, pts.map(function (p) { return Math.hypot(p[0], p[1]); }));
    pts = pts.map(function (p) { return [+(p[0] / R).toFixed(5), +(p[1] / R).toFixed(5)]; });
    var mean = pts.reduce(function (s, p) { return s + Math.hypot(p[0], p[1]); }, 0) / pts.length;
    return { name: name, pts: pts, mean: mean };
  }
  var SHAPES = [
    norm('Flèche', [[0, -3], [2, -1], [0.8, -1], [0.8, 3], [-0.8, 3], [-0.8, -1], [-2, -1]]),
    norm('Équerre', [[0, 0], [1, 0], [1, 3], [3.2, 3], [3.2, 4], [0, 4]]),
    norm('Maison', [[0, 1.4], [1.5, 0], [3, 1.4], [3, 3.6], [0, 3.6]]),
    norm('Drapeau', [[0, 0], [2.6, 0.9], [0.5, 1.8], [0.5, 4], [0, 4]]),
    norm('Trapèze', [[0.4, 0], [2.2, 0], [3.4, 2.2], [0, 2.2]])
  ];

  // Sommets d'une forme pour une pose {x, y, a (radians, sens horaire à l'écran), k (rayon en px)}
  function place(sh, pose) {
    var c = Math.cos(pose.a), s = Math.sin(pose.a);
    return sh.pts.map(function (p) { return [pose.x + pose.k * (p[0] * c - p[1] * s), pose.y + pose.k * (p[0] * s + p[1] * c)]; });
  }

  // Écart entre la pose visée et la tienne : distance moyenne entre sommets correspondants
  var SK = 6;
  function shapeError(sh, pT, pP, W, H) {
    var A = place(sh, pT), B = place(sh, pP), sum = 0, M = Math.min(W, H);
    for (var i = 0; i < A.length; i++) sum += Math.hypot(A[i][0] - B[i][0], A[i][1] - B[i][1]);
    var d = sum / A.length, E = d / M * 100;
    var dAng = ((pP.a - pT.a) * 180 / Math.PI) % 360;
    if (dAng > 180) dAng -= 360; if (dAng <= -180) dAng += 360;
    return {
      d: d, E: E, M: M, dPos: Math.hypot(pP.x - pT.x, pP.y - pT.y), off: [pP.x - pT.x, pP.y - pT.y],
      dAng: dAng, kRatio: pP.k / pT.k, r: sh.mean * pT.k, score: Math.round(100 / (1 + Math.pow(E / SK, 2)))
    };
  }

  function shapeHint(e) {
    if (e.E < 1) return 'Rien à redire';
    var pos = e.dPos / e.M * 100;
    var rot = 2 * e.r * Math.sin(Math.abs(e.dAng) * Math.PI / 360) / e.M * 100;
    var sca = Math.abs(e.kRatio - 1) * e.r / e.M * 100;
    var m = Math.max(pos, rot, sca);
    if (m === pos) return 'Décalée ' + direction(e.off) + ' de ' + mm(e.dPos);
    if (m === rot) return 'Tournée de ' + Math.round(Math.abs(e.dAng)) + '° de trop, ' + (e.dAng > 0 ? 'sens horaire' : 'sens antihoraire');
    return (e.kRatio > 1 ? 'Trop grande de ' : 'Trop petite de ') + Math.round(Math.abs(e.kRatio - 1) * 100) + ' %';
  }

  // Pose tirée au hasard, forme entièrement dans la toile
  function randomPose(rand, W, H) {
    var M = Math.min(W, H), k = (0.17 + rand() * 0.1) * M, m = k + 8;
    return { x: m + rand() * (W - 2 * m), y: m + rand() * (H - 2 * m), a: rand() * Math.PI * 2, k: k };
  }
  // Pose de départ du joueur : au centre, nettement tournée et à une autre taille
  function scramble(rand, target, W, H) {
    var turn = (60 + rand() * 120) * Math.PI / 180 * (rand() < 0.5 ? -1 : 1);
    var f = rand() < 0.5 ? 0.62 + rand() * 0.18 : 1.2 + rand() * 0.2;
    return { x: W / 2, y: H / 2, a: target.a + turn, k: Math.min(target.k * f, Math.min(W, H) * 0.32) };
  }

  /* ---------- mots et unités ---------- */

  var MM = 0.16;
  function mm(px) {
    var v = px * MM, r = v >= 10 ? Math.round(v) : Math.round(v * 10) / 10;
    return String(r).replace('.', ',') + ' mm';
  }
  function sec(s) { return (s >= 10 ? String(Math.round(s)) : (Math.round(s * 10) / 10).toFixed(1).replace('.', ',')) + ' s'; }
  function direction(v) {
    var ax = Math.abs(v[0]), ay = Math.abs(v[1]);
    if (ax > 2.4 * ay) return v[0] > 0 ? 'vers la droite' : 'vers la gauche';
    if (ay > 2.4 * ax) return v[1] > 0 ? 'vers le bas' : 'vers le haut';
    return 'vers le ' + (v[1] > 0 ? 'bas' : 'haut') + (v[0] > 0 ? ' à droite' : ' à gauche');
  }

  var RANKS = [
    [95, 'Main de chirurgien'], [88, 'Main d’horloger'], [78, 'Main sûre'], [66, 'Bonne main'],
    [52, 'Main curieuse'], [38, 'Main distraite'], [0, 'Main tremblante']
  ];
  function rank(avg) { for (var i = 0; i < RANKS.length; i++) if (avg >= RANKS[i][0]) return RANKS[i][1]; return ''; }
  function nextRank(avg) {
    for (var i = RANKS.length - 1; i >= 0; i--) if (RANKS[i][0] > avg) return { name: RANKS[i][1], at: RANKS[i][0] };
    return null;
  }

  var api = {
    path: path, KINDS: KINDS, at: at, resample: resample, compareTrace: compareTrace, traceHint: traceHint,
    SHAPES: SHAPES, place: place, shapeError: shapeError, shapeHint: shapeHint, randomPose: randomPose, scramble: scramble,
    mm: mm, sec: sec, direction: direction, RANKS: RANKS, rank: rank, nextRank: nextRank
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.NC = root.NC || {}; root.NC.geste = api; }
})(this);
