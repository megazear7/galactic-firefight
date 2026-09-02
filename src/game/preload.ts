import { SPRITE_SRC } from "./units";
import { allAudioUrls, warmAudioBank } from "./audio";
import { allModelUrls } from "./models";
import { APP_VERSION } from "@/app-version";

const ASSET_CACHE = `gf-${import.meta.env?.VITE_APP_VERSION ?? APP_VERSION}`;

const IMAGE_URLS = [
  ...Object.values(SPRITE_SRC),
  "/assets/menu-bg.jpg",
  "/assets/codex-bg.jpg",
  "/assets/empire-bg.jpg",
  "/assets/brood-bg.jpg",
  "/assets/ground/plates.jpg",
  "/assets/ground/grate.jpg",
  "/assets/ground/rust.jpg",
  "/assets/ground/hazard.jpg",
  "/assets/ground/crate.jpg",
  "/assets/ground/bulkhead.jpg",
];

const POOL = 4;

export function allGameAssetUrls() {
  return [...new Set([...IMAGE_URLS, ...allAudioUrls(), ...allModelUrls()])];
}

function isImage(url: string) {
  return /\.(png|jpe?g|webp|gif)$/i.test(url);
}

function isGltf(url: string) {
  return /\.(glb|gltf)$/i.test(url);
}

async function decodeImage(url: string) {
  await new Promise<void>((resolve) => {
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = () => resolve();
    img.src = url;
  });
}

async function fetchOne(url: string) {
  try {
    const cache = typeof caches !== "undefined" ? await caches.open(ASSET_CACHE) : null;
    const cached = cache ? await cache.match(url) : null;
    if (!cached) {
      const res = await fetch(url);
      if (res.ok && cache) await cache.put(url, res.clone()).catch(() => undefined);
    }
  } catch {
    /* skip missing files */
  }
  if (isImage(url)) await decodeImage(url);
}

async function mapPool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const item = items[i++];
      await fn(item);
    }
  });
  await Promise.all(workers);
}

async function warmGltf(urls: string[]) {
  if (!urls.length) return;
  const { useGLTF } = await import("@react-three/drei");
  for (const url of urls) useGLTF.preload(url);
}

type Listener = (progress: number, ready: boolean) => void;

let ready = false;
let progress = 0;
let inflight: Promise<void> | null = null;
const listeners = new Set<Listener>();

function emit() {
  for (const fn of listeners) fn(progress, ready);
}

export function assetsReady() {
  return ready;
}

export function assetProgress() {
  return progress;
}

export function subscribeAssets(fn: Listener) {
  listeners.add(fn);
  fn(progress, ready);
  return () => {
    listeners.delete(fn);
  };
}

export function ensureGameAssets() {
  if (ready) return Promise.resolve();
  if (inflight) return inflight;
  inflight = (async () => {
    const urls = allGameAssetUrls();
    const total = Math.max(1, urls.length);
    let done = 0;
    await mapPool(urls, POOL, async (url) => {
      await fetchOne(url);
      done += 1;
      progress = done / total;
      emit();
    });
    await Promise.all([warmAudioBank(), warmGltf(urls.filter(isGltf))]);
    progress = 1;
    ready = true;
    emit();
  })().catch(() => {
    progress = 1;
    ready = true;
    emit();
  });
  return inflight;
}
