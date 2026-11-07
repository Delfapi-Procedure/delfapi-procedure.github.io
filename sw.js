/* Procedure e sicurezza – Delfapi: funzionamento senza campo */
var VERS = "v7";
var SHELL = "shell-" + VERS, MEDIA = "media-" + VERS, ESTERNO = "esterno-" + VERS;
var PRECACHE = ["./", "./index.html", "./manifest.webmanifest", "./marchio.png", "./logo.png", "./icona-192.png", "./icona-512.png", "./icona-180.png"];

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(SHELL).then(function (c) { return Promise.all(PRECACHE.map(function (u) { return c.add(u).catch(function () {}); })); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return [SHELL, MEDIA, ESTERNO].indexOf(k) < 0; }).map(function (k) { return caches.delete(k); })); }).then(function () { return self.clients.claim(); }));
});

function daRange(resp, rangeHeader) {
  return resp.arrayBuffer().then(function (buf) {
    var tot = buf.byteLength, m = /bytes=(\d*)-(\d*)/.exec(rangeHeader || "");
    var ini = m && m[1] ? parseInt(m[1], 10) : 0, fin = m && m[2] ? parseInt(m[2], 10) : tot - 1;
    if (ini >= tot) return new Response(null, { status: 416, headers: { "Content-Range": "bytes */" + tot } });
    fin = Math.min(fin, tot - 1);
    return new Response(buf.slice(ini, fin + 1), { status: 206, headers: { "Content-Type": resp.headers.get("Content-Type") || "video/mp4", "Content-Range": "bytes " + ini + "-" + fin + "/" + tot, "Content-Length": String(fin - ini + 1), "Accept-Ranges": "bytes" } });
  });
}

self.addEventListener("fetch", function (e) {
  var req = e.request; if (req.method !== "GET") return;
  var url = new URL(req.url), stessa = url.origin === self.location.origin;

  // Pagina: prima la rete (così gli aggiornamenti arrivano), se manca il campo la copia salvata
  if (req.mode === "navigate" || (stessa && /\/(index\.html|controlli\.html|rifornimento\.html|giornaliera\.html|richiesta\.html|modar\.html)?$/.test(url.pathname))) {
    e.respondWith(fetch(url.origin + url.pathname + url.search, { cache: "no-store", credentials: "same-origin" }).then(function (r) { var cp = r.clone(); caches.open(SHELL).then(function (c) { c.put(url.origin + url.pathname, cp); }); return r; })
      .catch(function () { return caches.match(url.origin + url.pathname).then(function (r) { return r || caches.match("./index.html"); }); }));
    return;
  }

  // Video dello stesso sito: dopo la prima visione restano sul telefono (gestione delle richieste parziali)
  if (stessa && /\.mp4$/i.test(url.pathname)) {
    var chiave = url.pathname;
    e.respondWith(caches.open(MEDIA).then(function (c) {
      return c.match(chiave).then(function (salvato) {
        var range = req.headers.get("Range");
        if (salvato) return range ? daRange(salvato, range) : salvato;
        // non ancora salvato: servo dalla rete e scarico il file intero in sottofondo
        var scarica = fetch(url.href, { headers: {} }).then(function (r) { if (r.ok && r.status === 200) c.put(chiave, r.clone()); return r; }).catch(function () {});
        if (!range) return scarica.then(function (r) { return r || fetch(req); });
        e.waitUntil(scarica);
        return fetch(req);
      });
    }));
    return;
  }

  // Altri file del sito (immagini, manifest, PDF): prima la copia salvata, altrimenti rete e salva
  if (stessa) {
    e.respondWith(caches.match(req).then(function (r) { return r || fetch(req).then(function (n) { var cp = n.clone(); caches.open(SHELL).then(function (c) { c.put(req, cp); }); return n; }); }));
    return;
  }

  // Esterni (font Google, foto delfapi.it): rete, e salvo per quando manca il campo
  e.respondWith(fetch(req).then(function (n) { if (n && (n.ok || n.type === "opaque")) { var cp = n.clone(); caches.open(ESTERNO).then(function (c) { c.put(req, cp); }); } return n; })
    .catch(function () { return caches.match(req); }));
});
