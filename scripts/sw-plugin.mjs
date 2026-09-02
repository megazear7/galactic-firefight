/**
 * Writes a versioned service worker that precaches game assets (GLB, audio,
 * images). Cache name changes only when APP_VERSION / git SHA changes.
 */
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ASSET_EXT = /\.(glb|gltf|png|jpe?g|webp|gif|mp3|wav|ogg|svg|mp4|woff2?)$/i;

export function collectPublicAssets(root = ROOT) {
  const dir = join(root, "public");
  const out = [];
  if (!existsSync(dir)) return out;
  const walk = (current) => {
    for (const ent of readdirSync(current, { withFileTypes: true })) {
      if (ent.name.startsWith(".") || ent.name === "__grok") continue;
      const full = join(current, ent.name);
      if (ent.isDirectory()) {
        walk(full);
        continue;
      }
      if (!ASSET_EXT.test(ent.name)) continue;
      out.push(`/${relative(dir, full).replaceAll("\\", "/")}`);
    }
  };
  walk(dir);
  return out.sort();
}

export function readSourceAppVersion(root = ROOT) {
  try {
    const src = readFileSync(join(root, "src/app-version.ts"), "utf8");
    return src.match(/APP_VERSION = ["']([^"']+)["']/)?.[1] ?? "1";
  } catch {
    return "1";
  }
}

export function gitShortSha(root = ROOT) {
  try {
    return execSync("git rev-parse --short HEAD", { cwd: root, encoding: "utf8" }).trim();
  } catch {
    return "dev";
  }
}

export function resolveBuildVersion(root = ROOT) {
  return `${readSourceAppVersion(root)}-${gitShortSha(root)}`;
}

export function renderServiceWorker({ version, precache }) {
  const cache = `gf-${version}`;
  const list = JSON.stringify(["/", "/app-version.json", "/sw.js", ...precache], null, 0);
  return `/* Galactic Firefight service worker ${version} */
const CACHE = ${JSON.stringify(cache)};
const PRECACHE = ${list};

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    let done = 0;
    for (const url of PRECACHE) {
      try {
        await cache.add(url);
      } catch {
        /* skip missing / quota */
      }
      done += 1;
      const clients = await self.clients.matchAll({ includeUncontrolled: true });
      for (const client of clients) {
        client.postMessage({ type: "PRECACHE", done, total: PRECACHE.length });
      }
    }
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth")) return;

  const asset = /\\.(glb|gltf|png|jpe?g|webp|gif|mp3|wav|ogg|svg|mp4|woff2?|js|css)$/i.test(url.pathname)
    || url.pathname.startsWith("/assets/")
    || url.pathname.startsWith("/__grok/");

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (asset) {
      const hit = await cache.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) await cache.put(req, res.clone()).catch(() => undefined);
      return res;
    }
    try {
      const res = await fetch(req);
      if (res.ok && res.type === "basic") await cache.put(req, res.clone()).catch(() => undefined);
      return res;
    } catch (err) {
      const hit = await cache.match(req);
      if (hit) return hit;
      throw err;
    }
  })());
});
`;
}

function writeInto(dir, version, sw) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "sw.js"), sw);
  writeFileSync(join(dir, "app-version.json"), JSON.stringify({ version }, null, 2) + "\n");
}

export function swPlugin() {
  return {
    name: "gf-service-worker",
    config() {
      const version = resolveBuildVersion();
      return {
        define: {
          "import.meta.env.VITE_APP_VERSION": JSON.stringify(version),
        },
      };
    },
    buildStart() {
      const version = resolveBuildVersion();
      const precache = collectPublicAssets();
      const sw = renderServiceWorker({ version, precache });
      writeInto(join(ROOT, "public"), version, sw);
    },
    closeBundle() {
      const version = resolveBuildVersion();
      const precache = collectPublicAssets();
      const sw = renderServiceWorker({ version, precache });
      for (const dir of ["dist", "dist/client", ".output/public"]) {
        const abs = join(ROOT, dir);
        if (existsSync(abs) || dir === "dist") writeInto(abs, version, sw);
      }
    },
  };
}
