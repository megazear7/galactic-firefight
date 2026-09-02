import assert from "node:assert/strict";
import test from "node:test";
import { collectPublicAssets, readSourceAppVersion, renderServiceWorker } from "./sw-plugin.mjs";

test("collects glb and media from public/", () => {
  const urls = collectPublicAssets();
  assert.ok(urls.some((u) => u.endsWith(".glb")));
  assert.ok(urls.some((u) => u.includes("/assets/3d/")));
  assert.ok(urls.every((u) => u.startsWith("/")));
});

test("reads the source app version", () => {
  assert.match(readSourceAppVersion(), /^\d+$/);
});

test("bakes cache name and skip-waiting into the worker", () => {
  const sw = renderServiceWorker({ version: "9-abc", precache: ["/assets/x.glb"] });
  assert.match(sw, /gf-9-abc/);
  assert.match(sw, /SKIP_WAITING/);
  assert.match(sw, /\/assets\/x\.glb/);
  assert.match(sw, /caches\.delete/);
});
