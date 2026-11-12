/* Le service hors ligne de la version iPhone (construire.js remplit VERSION, FICHIERS, PREFIXE, LOURDS et PAQUETS).
   Chaque fichier est gardé sous une clé qui porte l'empreinte de son contenu (chemin?v=empreinte) : une nouvelle version ne
   retélécharge que les fichiers changés, les autres sont recopiés de l'ancienne réserve, puis l'ancienne est effacée.
   - à l'installation : tout sauf les dossiers LOURDS (le jeu démarre sans réseau) ;
   - message « tout » (iphone.js, 4 s après le lancement) : le reste, avec l'avancée envoyée à la page ;
   - toute demande d'un fichier du jeu : la réserve d'abord, sinon le réseau (et le fichier est gardé).
   PEU DE DEMANDES AU SERVEUR (vu en classe le 12/11/2026 : GitHub Pages refuse (429 « Too many requests ») une adresse qui demande
   trop, et tout un collège sort par la même ; un jeu de 3 600 fichiers gardés un à un a fait refuser le 4e élève) :
   - un jeu à beaucoup de fichiers les fait voyager en PAQUETS (construire.js, réglage PAQUETS) : une image qui manque fait venir son
     paquet (une demande pour des centaines d'images), que le service découpe ; le fond fait venir les paquets deux à la fois ;
   - après une mise à jour, il ne manque que quelques fichiers : ils viennent seuls, sans leur paquet (SEUIL) ;
   - un refus (429, 503) met le travail de fond en pause (Retry-After, sinon 20 s, puis le double, jusqu'à 5 min) au lieu
     d'insister ; après des refus répétés il s'arrête, et iphone.js le relance plus tard.
   PREFIXE doit être propre au jeu : tous les jeux d'un même compte GitHub partagent l'origine <compte>.github.io, donc les
   mêmes réserves ; l'activation efface les réserves de SON préfixe, jamais celles d'un autre jeu. */
'use strict';
const VERSION = "8814b989d0b5";
const FICHIERS = {"css/style.css":"f0d1b43192","fonts/archivo-latin.woff2":"258a93fe93","fonts/jetbrains-mono-latin-400-normal.woff2":"6b8f411e9e","fonts/jetbrains-mono-latin-500-normal.woff2":"7b91ac70be","icon.svg":"a3019f4c61","icones/icone-180.png":"bff3262199","icones/icone-192.png":"eb2b7bc3e1","icones/icone-512.png":"e5bfee28db","index.html":"e60fc06323","iphone.js":"be6c373d0f","js/app.js":"8e13e94fe5","js/carte.js":"cfd75bbdd5","js/classement.js":"4559ab9601","js/color.js":"a1f57569e1","js/dial.js":"8310b88014","js/ear.js":"08ba309bcf","js/fx.js":"98322ff54e","js/game.js":"de37f3d0ae","js/geste.js":"c999bda690","js/hand.js":"ce02e9eae0","js/melodie.js":"23b3636e3f","js/palette.js":"729147be46","js/picker.js":"ef7cb5f555","js/pitch.js":"4e0370d08a","js/store.js":"a6e48c5bd6","js/tune.js":"de2e79326e","js/ui.js":"48a05b91bb","manifest.webmanifest":"29ea78ef80"};
const PREFIXE = "delta-";
const LOURDS = ["fonts/"];
const PAQUETS = [];
const RESERVE = PREFIXE + VERSION;
const BASE = new URL('./', self.location).href;
const cle = p => BASE + p + '?v=' + FICHIERS[p];
// un paquet : ses fichiers bout à bout, notés [rang dans FICHIERS, taille] ; ici [chemin, début, taille]
const NOMS = Object.keys(FICHIERS), PAQUET_DE = {};
PAQUETS.forEach((q, i) => {
  let a = 0;
  q.n = q.n.map(([j, t]) => { const e = [NOMS[j], a, t]; a += t; return e; });
  for (const [p] of q.n) PAQUET_DE[p] = i;
});
const ESSENTIELS = NOMS.filter(p => !LOURDS.some(l => p.startsWith(l)));
const TYPES = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml', json: 'application/json',
  js: 'text/javascript; charset=utf-8', html: 'text/html; charset=utf-8', css: 'text/css; charset=utf-8', webmanifest: 'application/manifest+json',
  woff2: 'font/woff2', woff: 'font/woff', ttf: 'font/ttf', mp3: 'audio/mpeg', ogg: 'audio/ogg', wav: 'audio/wav', m4a: 'audio/mp4', txt: 'text/plain; charset=utf-8' };
const typeDe = p => TYPES[p.split('.').pop().toLowerCase()] || 'application/octet-stream';
const SEUIL = 4;          // jusqu'à ce nombre de fichiers manquants dans un paquet, ils viennent un à un ; au-delà, le paquet
const MAX_UN_A_UN = 40;   // au plus ce nombre de fichiers demandés un à un par passe de fond (jamais des milliers de demandes)
const attendre = ms => new Promise(o => setTimeout(o, ms));

// la réserve et ce qu'elle contient déjà (gardé en mémoire, tenu à jour à chaque ajout, relu à chaque passe de fond)
let presents = null, ouverture = null;
const reserve = () => {
  if (!ouverture) ouverture = caches.open(RESERVE).then(async res => { presents = new Set((await res.keys()).map(q => q.url)); return res; });
  return ouverture;
};
const ranger = async (res, k, r) => { await res.put(k, r); presents.add(k); };
const manquants = i => PAQUETS[i].n.filter(([p]) => !presents.has(cle(p)));

// le serveur demande d'attendre : le travail de fond se met en pause (ce que le jeu demande passe quand même)
let pauseJusqua = 0, pauseDuree = 0, refusDeSuite = 0;
async function demander(url, fond, mode) {
  if (fond) while (Date.now() < pauseJusqua) await attendre(pauseJusqua - Date.now());
  const r = await fetch(url, mode ? { cache: mode } : undefined);
  if (r.status === 429 || r.status === 503) {
    const ra = parseFloat(r.headers.get('Retry-After'));
    pauseDuree = Math.min(Math.max(pauseDuree * 2, r.status === 429 ? 20000 : 3000), 300000);
    pauseJusqua = Date.now() + (ra > 0 ? Math.min(ra * 1000, 600000) : pauseDuree);
    refusDeSuite++;
  } else if (r.ok) { pauseDuree = 0; refusDeSuite = 0; }
  return r;
}

// un paquet : une demande, découpé en fichiers rangés chacun sous sa clé ; deux demandes du même paquet n'en font qu'une
const enCours = new Map();
function paquet(i, fond) {
  if (!enCours.has(i)) {
    enCours.set(i, (async () => {
      const q = PAQUETS[i];
      const r = await demander(BASE + q.f, fond);
      if (!r.ok) throw new Error(q.f + ' : ' + r.status);
      const buf = await r.arrayBuffer();
      const fin = q.n.reduce((m, [, a, n]) => Math.max(m, a + n), 0);
      if (buf.byteLength !== fin) throw new Error(q.f + ' : ' + buf.byteLength + ' octets au lieu de ' + fin);
      const res = await reserve();
      for (const [p, a, n] of q.n) {
        const k = cle(p);
        if (!presents.has(k)) await ranger(res, k, new Response(buf.slice(a, a + n), { headers: { 'Content-Type': typeDe(p) } }));
      }
    })().finally(() => enCours.delete(i)));
  }
  return enCours.get(i);
}

// un fichier seul : déjà là, recopié d'une ancienne réserve, ou demandé au serveur
async function garder(res, p, fond, mode) {
  const k = cle(p);
  if (presents.has(k)) return;
  const ancien = await caches.match(k);
  if (ancien) { await ranger(res, k, ancien); return; }
  const r = await demander(k, fond, mode);
  if (!r.ok) throw new Error(p + ' : ' + r.status);
  await ranger(res, k, r);
}

self.addEventListener('install', e => {
  e.waitUntil(reserve().then(res => Promise.all(ESSENTIELS.map(p => garder(res, p, false, 'no-cache')))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const res = await caches.open(RESERVE);
    const voulues = new Set(NOMS.map(cle));
    for (const nom of await caches.keys()) {
      if (nom === RESERVE || !nom.startsWith(PREFIXE)) continue;
      // ce que l'ancienne version avait déjà et qui n'a pas changé passe dans la nouvelle réserve
      const vieille = await caches.open(nom);
      for (const q of await vieille.keys()) if (voulues.has(q.url) && !(await res.match(q.url))) await res.put(q.url, await vieille.match(q));
      await caches.delete(nom);
    }
    ouverture = null; presents = null;
    await self.clients.claim();
  })());
});

let toutEnCours = null;
async function toutGarder() {
  const res = await reserve();
  presents = new Set((await res.keys()).map(q => q.url));
  const total = NOMS.length;
  const dire = async fin => {
    const fait = NOMS.filter(p => presents.has(cle(p))).length;
    for (const c of await self.clients.matchAll()) c.postMessage({ type: 'avance', fait, total, fin: !!fin });
  };
  await dire();
  // 1. les paquets où il manque beaucoup : une demande par paquet, deux à la fois
  const aFaire = PAQUETS.map((q, i) => i).filter(i => manquants(i).length > SEUIL);
  let j = 0;
  const ouvrier = async () => {
    while (j < aFaire.length && refusDeSuite < 4) {
      const i = aFaire[j++];
      for (let essai = 0; essai < 3 && refusDeSuite < 4; essai++) {
        try { await paquet(i, true); break; } catch (err) { await attendre(1000 * (essai + 1)); }
      }
      await dire();
    }
  };
  await Promise.all([ouvrier(), ouvrier()]);
  // 2. le reste, un fichier à la fois : un petit jeu sans paquets, les fichiers changés d'une mise à jour, ou d'un paquet refusé
  //    (au plus MAX_UN_A_UN par passe quand le jeu a des paquets : leurs fichiers ne partent jamais un à un par milliers)
  let unAUn = 0;
  for (const p of NOMS) {
    if (refusDeSuite >= 4 || (PAQUETS.length && unAUn >= MAX_UN_A_UN)) break;
    if (presents.has(cle(p))) continue;
    const i = PAQUET_DE[p];
    if (i !== undefined && manquants(i).length > SEUIL) continue;   // son paquet viendra au prochain passage
    unAUn++;
    for (let essai = 0; essai < 3 && refusDeSuite < 4; essai++) {
      try { await garder(res, p, true); break; } catch (err) { await attendre(1000 * (essai + 1)); }
    }
    if (unAUn % 50 === 0) await dire();
  }
  await dire(true);
}
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'tout') {
    if (!toutEnCours) { refusDeSuite = 0; toutEnCours = toutGarder().catch(() => { }).finally(() => { toutEnCours = null; }); }
    e.waitUntil(toutEnCours);
  }
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
    const res = await reserve();
    // un fichier qui manque : son paquet (une seule demande pour lui et ses voisins), sauf s'il n'en manque que quelques-uns
    const i = PAQUET_DE[p];
    if (i !== undefined && (enCours.has(i) || manquants(i).length > SEUIL)) {
      try { await paquet(i, false); const r2 = await caches.match(k); if (r2) return r2; } catch (err) { /* le fichier seul */ }
    }
    let n = await demander(k, false);
    // un refus passager (503) : une seconde chance, un peu plus tard ; un 429 (trop de demandes) n'est jamais redemandé tout de suite
    if (n.status === 503) { await attendre(800); n = await demander(k, false); }
    if (n.ok) await ranger(res, k, n.clone());
    return n;
  })());
});
