/* Le service hors ligne de la version iPhone (construire.js remplit VERSION, FICHIERS, PREFIXE et LOURDS).
   Chaque fichier est gardé sous une clé qui porte l'empreinte de son contenu (chemin?v=empreinte) : une nouvelle version ne
   retélécharge que les fichiers changés, les autres sont recopiés de l'ancienne réserve, puis l'ancienne est effacée.
   - à l'installation : tout sauf les dossiers LOURDS (le jeu démarre sans réseau) ;
   - message « tout » (iphone.js, 4 s après le lancement) : le reste, 6 à la fois, avec l'avancée envoyée à la page ;
   - toute demande d'un fichier du jeu : la réserve d'abord, sinon le réseau (et le fichier est gardé).
   PREFIXE doit être propre au jeu : tous les jeux d'un même compte GitHub partagent l'origine <compte>.github.io, donc les
   mêmes réserves ; l'activation efface les réserves de SON préfixe, jamais celles d'un autre jeu. */
'use strict';
const VERSION = "a32971753fd8";
const FICHIERS = {"css/style.css":"f0d1b43192","fonts/archivo-latin.woff2":"258a93fe93","fonts/jetbrains-mono-latin-400-normal.woff2":"6b8f411e9e","fonts/jetbrains-mono-latin-500-normal.woff2":"7b91ac70be","icon.svg":"a3019f4c61","icones/icone-180.png":"bff3262199","icones/icone-192.png":"eb2b7bc3e1","icones/icone-512.png":"e5bfee28db","index.html":"c1b2bf62a8","iphone.js":"cd24c1fb19","js/app.js":"8e13e94fe5","js/carte.js":"cfd75bbdd5","js/classement.js":"4559ab9601","js/color.js":"a1f57569e1","js/dial.js":"8310b88014","js/ear.js":"08ba309bcf","js/fx.js":"98322ff54e","js/game.js":"de37f3d0ae","js/geste.js":"c999bda690","js/hand.js":"ce02e9eae0","js/melodie.js":"23b3636e3f","js/palette.js":"729147be46","js/picker.js":"ef7cb5f555","js/pitch.js":"4e0370d08a","js/store.js":"a6e48c5bd6","js/tune.js":"de2e79326e","js/ui.js":"48a05b91bb","manifest.webmanifest":"29ea78ef80"};
const PREFIXE = "delta-";
const LOURDS = ["fonts/"];
const RESERVE = PREFIXE + VERSION;
const BASE = new URL('./', self.location).href;
const cle = p => BASE + p + '?v=' + FICHIERS[p];
const ESSENTIELS = Object.keys(FICHIERS).filter(p => !LOURDS.some(l => p.startsWith(l)));

// un fichier dans la réserve : déjà là, recopié d'une ancienne réserve, ou téléchargé
async function garder(res, p) {
  const k = cle(p);
  if (await res.match(k)) return;
  const ancien = await caches.match(k);
  if (ancien) { await res.put(k, ancien); return; }
  const r = await fetch(k, { cache: 'no-cache' });
  if (!r.ok) throw new Error(p + ' : ' + r.status);
  await res.put(k, r);
}

self.addEventListener('install', e => {
  e.waitUntil(caches.open(RESERVE).then(res => Promise.all(ESSENTIELS.map(p => garder(res, p)))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const res = await caches.open(RESERVE);
    const voulues = new Set(Object.keys(FICHIERS).map(cle));
    for (const nom of await caches.keys()) {
      if (nom === RESERVE || !nom.startsWith(PREFIXE)) continue;
      // ce que l'ancienne version avait déjà et qui n'a pas changé passe dans la nouvelle réserve
      const vieille = await caches.open(nom);
      for (const q of await vieille.keys()) if (voulues.has(q.url) && !(await res.match(q.url))) await res.put(q.url, await vieille.match(q));
      await caches.delete(nom);
    }
    await self.clients.claim();
  })());
});

let toutEnCours = null;
async function toutGarder() {
  const res = await caches.open(RESERVE);
  const liste = Object.keys(FICHIERS), dejaLa = new Set((await res.keys()).map(q => q.url));
  let reste = liste.filter(p => !dejaLa.has(cle(p)));
  let fait = liste.length - reste.length;
  const dire = async () => { for (const c of await self.clients.matchAll()) c.postMessage({ type: 'avance', fait, total: liste.length }); };
  await dire();
  // GitHub Pages refuse parfois une demande dans une rafale (1 à 3 fichiers sur 3 642) : les fichiers refusés sont redemandés,
  // moins à la fois, après une pause ; ce qui manque encore sera repris au lancement suivant
  for (const [ouvriers, pause] of [[6, 0], [2, 1000], [1, 4000], [1, 10000]]) {
    if (!reste.length) break;
    if (pause) await new Promise(o => setTimeout(o, pause));
    const rates = [];
    let i = 0;
    const ouvrier = async () => {
      while (i < reste.length) {
        const p = reste[i++];
        try { await garder(res, p); fait++; } catch (e) { rates.push(p); }
        if (fait % 100 === 0) await dire();
      }
    };
    await Promise.all(Array.from({ length: ouvriers }, ouvrier));
    reste = rates;
  }
  await dire();
}
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'tout') { if (!toutEnCours) toutEnCours = toutGarder().finally(() => { toutEnCours = null; }); e.waitUntil(toutEnCours); }
});

self.addEventListener('fetch', e => {
  const q = e.request;
  if (q.method !== 'GET' || !q.url.startsWith(BASE)) return;
  let p = decodeURIComponent(q.url.slice(BASE.length).split('?')[0].split('#')[0]);
  if (p === '' || p.endsWith('/')) p += 'index.html';
  if (!FICHIERS[p]) return;
  e.respondWith((async () => {
    const k = cle(p);
    const r = await caches.match(k);
    if (r) return r;
    const n = await fetch(k);
    if (n.ok) { const res = await caches.open(RESERVE); res.put(k, n.clone()); }
    return n;
  })());
});
