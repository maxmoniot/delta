/* Version iPhone et iPad d'un jeu web (appli web de l'écran d'accueil) : ce que la coque Android fait pour le jeu, ici pour Safari.
   Chargé AVANT le premier script du jeu (construire.js l'insère) ; le jeu lui-même n'est pas modifié.
   1. Marges de l'écran (encoche, île dynamique, coins arrondis, barre du bas) : lues sur #sonde (env(safe-area-inset-*)), posées
      en variables CSS (--marge-haut, --marge-droite, --marge-bas, --marge-gauche) et passées à surMarges() (À ADAPTER, en bas).
   2. Le son : Safari ne démarre le son que sur un geste qui se termine (doigt levé, clic) et le coupe en arrière-plan ; chaque
      contexte audio créé par le jeu est noté et repris au geste suivant.
   3. Les gestes de Safari : pas de zoom à deux doigts ni au double appui, pas de loupe ni de menu à l'appui long, pas de défilement.
   4. L'écran reste allumé (verrou d'écran, repris au retour dans l'appli).
   5. Hors ligne : sw.js garde tout le jeu sur l'appareil (l'essentiel à l'installation, le reste 4 s après le lancement).
   6. Dans Safari (pas encore sur l'écran d'accueil) : la fenêtre #installer montre les trois gestes pour l'installer, ou
      « Jouer ici ». Tout appui posé sur elle est arrêté avant le jeu : un jeu qui écoute les appuis sur toute la page et les annule
      (preventDefault) empêche sinon Safari de faire le clic, et « Jouer ici » ne répond pas au doigt. */
(function () {
  'use strict';
  const I = window.IPHONE = { contextes: [], marges: { haut: 0, droite: 0, bas: 0, gauche: 0 }, garde: null, hors: { fait: 0, total: 0, fini: false } };
  const ua = navigator.userAgent || '';
  // l'iPad se présente comme un Mac depuis iPadOS 13 : un « Mac » tactile est un iPad
  I.ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  // le navigateur d'une appli (Instagram, Facebook, TikTok, Snapchat, Google…) n'a pas « Sur l'écran d'accueil » : d'abord Safari
  I.dansAppli = /FBAN|FBAV|FB_IAB|Instagram|Snapchat|musical_ly|Bytedance|TikTok|Line\/|LinkedInApp|Pinterest|GSA\//.test(ua);
  I.installe = navigator.standalone === true || (window.matchMedia && matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches);

  /* 1. Les marges */
  const px = v => parseFloat(v) || 0;
  I.mesurer = () => {
    const s = document.getElementById('sonde');
    if (!s) return I.marges;
    const cs = getComputedStyle(s);
    I.marges = { haut: px(cs.paddingTop), droite: px(cs.paddingRight), bas: px(cs.paddingBottom), gauche: px(cs.paddingLeft) };
    const r = document.documentElement.style;
    for (const k in I.marges) r.setProperty('--marge-' + k, I.marges[k] + 'px');
    return I.marges;
  };
  const majMarges = () => { I.mesurer(); try { surMarges(I.marges); } catch (e) { /* jeu pas encore prêt */ } };
  // Safari donne les nouvelles marges un peu après le demi-tour de l'écran
  const apresRotation = () => { majMarges(); setTimeout(majMarges, 250); setTimeout(majMarges, 700); };
  window.addEventListener('resize', apresRotation);
  window.addEventListener('orientationchange', apresRotation);
  document.addEventListener('DOMContentLoaded', majMarges);
  window.addEventListener('load', apresRotation);

  /* 2. Le son */
  const AC = window.AudioContext || window.webkitAudioContext;
  if (AC) {
    const Note = function (o) { const c = o ? new AC(o) : new AC(); I.contextes.push(c); return c; };
    Note.prototype = AC.prototype;
    window.AudioContext = Note;
    if (window.webkitAudioContext) window.webkitAudioContext = Note;
  }
  let debloque = false;
  const reprendre = () => {
    try { apresGeste(); } catch (e) { /* jeu pas encore prêt */ }
    for (const c of I.contextes) {
      if (c.state !== 'running' && c.state !== 'closed') { try { c.resume(); } catch (e) { /* refusé */ } }
      // la première fois, un silence joué dans le geste ouvre la sortie du son (vieux iOS)
      if (!debloque) {
        try { const b = c.createBuffer(1, 1, 22050), s = c.createBufferSource(); s.buffer = b; s.connect(c.destination); s.start(0); debloque = true; } catch (e) { /* rien */ }
      }
    }
    garderEcran();
  };
  for (const ev of ['touchend', 'click', 'keydown']) window.addEventListener(ev, reprendre, true);

  /* 3. Les gestes de Safari */
  const dansFenetre = e => !!(e.target && e.target.closest && e.target.closest('#installer'));
  for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, e => e.preventDefault(), { passive: false });
  document.addEventListener('dblclick', e => e.preventDefault(), { passive: false });
  document.addEventListener('contextmenu', e => e.preventDefault());
  // l'écran ne défile pas (dans Safari, un glissé ferait bouger la page et ses barres), SAUF dans les zones de DEFILENT
  // À ADAPTER : ajouter les zones du jeu qui défilent (feuille de réglages, liste, texte long), sinon elles sont bloquées
  // Delta : la feuille des réglages (petits écrans) et la rangée des manches du bilan (longue survie)
  const DEFILENT = '#installer, .sheet-card, .res-chips';
  document.addEventListener('touchmove', e => { if (!(e.target && e.target.closest && e.target.closest(DEFILENT))) e.preventDefault(); }, { passive: false });
  // un appui sur la fenêtre d'installation n'arrive jamais au jeu caché dessous (voir 6) ; le clic, lui, passe : c'est lui que
  // le bouton écoute (l'arrêter ici, en capture, l'empêcherait d'atteindre le bouton)
  for (const ev of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'touchstart', 'touchmove', 'touchend', 'touchcancel', 'mousedown', 'mouseup']) {
    window.addEventListener(ev, e => { if (dansFenetre(e)) e.stopPropagation(); }, true);
  }

  /* 4. L'écran allumé */
  function garderEcran() {
    if (I.garde || !navigator.wakeLock || document.hidden) return;
    navigator.wakeLock.request('screen').then(v => { I.garde = v; v.addEventListener('release', () => { I.garde = null; }); }).catch(() => { });
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { garderEcran(); majMarges(); } });

  /* 5. Hors ligne */
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', () => {
      navigator.serviceWorker.addEventListener('message', e => {
        const m = e.data || {};
        if (m.type === 'avance') { I.hors.fait = m.fait; I.hors.total = m.total; I.hors.fini = m.fait >= m.total; }
      });
      navigator.serviceWorker.register('sw.js').then(() => navigator.serviceWorker.ready).then(r => {
        // le reste des fichiers, en arrière-plan, sans gêner le chargement du jeu
        setTimeout(() => { if (r.active) r.active.postMessage({ type: 'tout' }); }, 4000);
      }).catch(() => { });
      // demande à Safari de ne pas effacer la réserve ni la sauvegarde quand la place manque
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => { });
    });
  }

  /* 6. La fenêtre d'installation, dans Safari seulement, pas deux fois dans la même visite */
  const ouvrirInstallation = () => {
    const f = document.getElementById('installer');
    if (!f) return;
    let vu = false;
    try { vu = sessionStorage.getItem('iphone.jouerIci') === '1'; } catch (e) { /* navigation privée */ }
    if (I.ios && !I.installe && !vu) f.classList.add('ouvert');
    if (I.dansAppli) f.classList.add('dans-appli');
    document.getElementById('jouer-ici').addEventListener('click', () => {
      f.classList.remove('ouvert');
      try { sessionStorage.setItem('iphone.jouerIci', '1'); } catch (e) { /* rien */ }
    });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ouvrirInstallation); else ouvrirInstallation();

  /* ===== À ADAPTER au jeu =====
     surMarges(m) : appelé au chargement, à chaque rotation et au retour dans l'appli, avec les marges en pixels CSS.
       Rien à faire si le CSS du jeu utilise déjà var(--marge-…) ou env(safe-area-inset-…). Un jeu sur toile (canvas) qui place
       ses boutons lui-même doit les écarter de ces bords : un iPhone en paysage a ~59 px à gauche ET à droite (île + coins
       arrondis), sur TOUTE la hauteur ; ne pas protéger que le milieu du bord.
       Exemple (Silence, ça vole !, dont ui.js lit les encoches de la coque Android en pixels de l'écran) :
         window.AndroidBridge = { encoches: () => JSON.stringify(rectanglesDesBords()) };  puis  G.UI.encoches();
     apresGeste() : appelé à chaque geste qui se termine ; y réveiller le son du jeu s'il le crée lui-même plus tard
       (ex. if (window.G && G.Audio) G.Audio.init();). */
  function surMarges(m) { /* rien par défaut : var(--marge-…) suffit */ }
  // Delta ouvre son son au premier appui (pointerdown, js/app.js) : Safari veut un geste qui se termine, on le rouvre ici
  function apresGeste() { if (window.NC && NC.fx && NC.fx.sfx && NC.fx.sfx.unlock) NC.fx.sfx.unlock(); }
})();
