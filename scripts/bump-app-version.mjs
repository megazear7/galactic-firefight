import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const file = join(dirname(fileURLToPath(import.meta.url)), "../src/app-version.ts");
const src = readFileSync(file, "utf8");
const match = src.match(/APP_VERSION = ["'](\d+)["']/);
const next = String((match ? Number(match[1]) : 0) + 1);
writeFileSync(file, `/** Bumped by \`scripts/bump-app-version.mjs\` at the start of production builds. */\nexport const APP_VERSION = "${next}";\n`);
console.log(`[gf] app version -> ${next}`);
