/* Delta — les classements Google Play Jeux (demande de Max du 28/10/2026 : « un tableau des scores partagé, via Google
   directement, sans passer par mon site »). Le jeu web ne parle qu'au pont natif (window.AndroidBridge) : hors de
   l'appli Android, rien ne s'affiche. Un classement par mode, sauf les défis du jour (leur « jour » Google commence à
   minuit heure du Pacifique, pas à minuit chez nous). Identifiants : android/app/src/main/res/values/jeux.xml.
   Google ne garde que le meilleur score de chaque joueur : renvoyer un record déjà envoyé ne coûte rien. */
(function (root) {
  'use strict';
  var MODES = ['partie', 'survie', 'son', 'son-survie', 'accord', 'geste', 'forme', 'melodie', 'melodie-survie'];
  // le record de chaque mode, tel que la mémoire du jeu le range (store.js)
  var BEST = {
    partie: 'partie', survie: 'survie', son: 'son', 'son-survie': 'sonSurvie', accord: 'accord',
    geste: 'geste', forme: 'forme', melodie: 'melodie', 'melodie-survie': 'melodieSurvie'
  };

  function bridge() {
    var B = root.AndroidBridge;
    try { return B && B.jeux && B.jeux() ? B : null; } catch (e) { return null; }
  }
  // Les classements sont-ils là (et celui de ce mode existe-t-il) ?
  function dispo(mode) { return !!bridge() && (mode === undefined || MODES.indexOf(mode) >= 0); }

  // Fin de partie : le score part sur le classement de son mode
  function envoyer(game) {
    var B = bridge();
    if (!B || MODES.indexOf(game.mode) < 0 || !(game.total > 0)) return;
    try { B.envoyerScore(game.mode, game.total); } catch (e) { }
  }

  // Au lancement (et à la connexion) : les records gardés sur le téléphone, y compris ceux d'avant les classements
  function sync() {
    var B = bridge();
    if (!B) return;
    var best = root.NC.store.data.best, out = {}, n = 0;
    MODES.forEach(function (m) { var v = best[BEST[m]] || 0; if (v > 0) { out[m] = v; n++; } });
    if (n) try { B.envoyerRecords(JSON.stringify(out)); } catch (e) { }
  }

  // L'écran des classements de Google Play Jeux : celui du mode, ou tous
  function ouvrir(mode) {
    var B = bridge();
    if (!B) return;
    try { B.ouvrirClassement(MODES.indexOf(mode) >= 0 ? mode : ''); } catch (e) { }
  }

  root.NC = root.NC || {};
  root.NC.classement = { MODES: MODES, dispo: dispo, envoyer: envoyer, sync: sync, ouvrir: ouvrir };
})(this);
