/* Service worker : met l'application en cache pour fonctionner hors-ligne.
   - L'app s'ouvre toujours depuis la copie locale (instantané, même sans réseau).
   - À chaque ouverture, la copie est rafraîchie en arrière-plan : une nouvelle version publiée
     arrive donc toute seule à l'ouverture suivante, sans changer CACHE.
   - CACHE ne doit être changé que si CE fichier (sw.js) est modifié. */
const CACHE = "audit-cuisine-v22";
const ASSETS = ["./", "./index.html", "./manifest.json", "./icon.svg", "./icon-512.png"];

self.addEventListener("install", (e) => {
  // cache:"reload" : on prend la version du serveur, pas celle que le navigateur garde quelques minutes en mémoire
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS.map((u) => new Request(u, { cache: "reload" })))));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Rafraîchit en arrière-plan la copie locale d'un fichier de l'app
async function rafraichir(cache, adresse) {
  try {
    const rep = await fetch(adresse, { cache: "no-cache" });
    if (rep && rep.ok && rep.type === "basic" && !rep.redirected) await cache.put(adresse, rep);
  } catch (err) { /* hors ligne : on garde la copie locale */ }
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;                    // envois vers le relais : le navigateur s'en charge directement
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;     // autres sites (relais Google) : pas mis en cache, pas interceptés
  url.search = ""; url.hash = "";
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(url.href);
    if (cached) {
      const maj = rafraichir(cache, url.href);
      try { e.waitUntil(maj); } catch (err) { /* certains navigateurs refusent ici : le rafraîchissement se fait quand même */ }
      return cached;
    }
    try { return await fetch(req); }
    catch (err) {
      // page de l'app demandée hors ligne sous une autre adresse : on sert l'accueil
      const accueil = req.mode === "navigate" ? await cache.match(new URL("./", self.registration.scope).href) : null;
      if (accueil) return accueil;
      throw err;
    }
  })());
});
