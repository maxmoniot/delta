/* Delta — démarrage, thème, retour arrière (coque Android), raccourcis clavier. */
(function (root) {
  'use strict';
  var S = root.NC.store, doc = document.documentElement;

  if (/[?&]shell=android\b/.test(location.search)) doc.classList.add('shell-android');

  function applyTheme() {
    var dark = S.settings.theme !== 'light';
    doc.classList.toggle('theme-dark', dark);
    doc.classList.toggle('theme-light', !dark);
    var m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute('content', dark ? '#151515' : '#dedede');
    try { if (root.AndroidBridge && root.AndroidBridge.setDark) root.AndroidBridge.setDark(dark); } catch (e) {}
  }

  // Retour arrière Android : réglages → partie → bilan → sortie. Renvoie 'exit' pour fermer l'appli.
  function back() {
    var ui = root.NC.ui;
    if (ui.sheetOpen()) { ui.closeSheet(); return 'ok'; }
    var s = ui.current();
    if (s === 'play') { root.NC.game.abort(); return 'ok'; }
    if (s === 'ear') { root.NC.ear.abort(); return 'ok'; }
    if (s === 'hand') { root.NC.hand.abort(); return 'ok'; }
    if (s === 'tune') { root.NC.tune.abort(); return 'ok'; }
    if (s === 'result') { ui.show('home'); return 'ok'; }
    return 'exit';
  }

  root.NC.app = { applyTheme: applyTheme, back: back };

  applyTheme();
  root.NC.game.init();
  root.NC.ear.init();
  root.NC.hand.init();
  root.NC.tune.init();
  root.NC.ui.init();

  // Filet de sécurité des appuis. Mesuré sur le Pixel 6 : environ un appui sur vingt, quand le téléphone
  // est occupé, Chrome ne produit pas le « click » (l'appui court est pris pour un appui long, que la
  // coque bloque). Si un appui franc — même élément, doigt quasi immobile, moins de 0,8 s — n'a pas
  // donné de click 150 ms après le lever du doigt, on le rejoue. Un vrai click annule le rejeu : jamais deux fois.
  (function () {
    var down = null, pending = null;
    document.addEventListener('pointerdown', function (e) {
      var el = e.target.closest ? e.target.closest('button, #fan-wrap, #cloud-wrap, #keyshero-wrap') : null;
      down = el ? { el: el, x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId } : null;
    }, true);
    document.addEventListener('pointerup', function (e) {
      var d = down; down = null;
      if (!d || e.pointerId !== d.id) return;
      if (Math.abs(e.clientX - d.x) > 10 || Math.abs(e.clientY - d.y) > 10 || performance.now() - d.t > 800) return;
      var hit = document.elementFromPoint(e.clientX, e.clientY);
      if (!hit || !d.el.contains(hit)) return;
      var x = e.clientX, y = e.clientY;
      pending = d.el;
      setTimeout(function () {
        if (pending !== d.el) return;
        pending = null;
        if (d.el.disabled || !d.el.isConnected) return;
        d.el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: x, clientY: y }));
      }, 150);
    }, true);
    document.addEventListener('click', function () { pending = null; }, true);
  })();

  // Le son ne peut démarrer qu'après un premier geste
  document.addEventListener('pointerdown', function () { root.NC.fx.sfx.unlock(); }, { once: true, capture: true });

  document.addEventListener('keydown', function (e) {
    var s = root.NC.ui.current();
    if (e.key === 'Escape') { back(); return; }
    if (e.key !== 'Enter' && e.key !== ' ') return;
    var id = { play: 'btn-go', ear: 'ear-go', hand: 'hand-go', tune: 'tune-go', home: 'btn-play', result: 'btn-again' }[s];
    if (id) { e.preventDefault(); document.getElementById(id).click(); }
  });

  // Les polices doivent être là avant de mesurer l'éventail
  var ready = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
  ready.then(function () { root.NC.ui.show('home'); root.NC.classement.sync(); });
})(this);
