import type { BattleMap, MapSize, TerrainBias, TerrainBlob, TerrainTheme, TileKind } from "./types";

export const TILE = 1.55;
export const MAP_COLS = 32;
export const MAP_ROWS = 24;

export const MAP_DIMS: Record<MapSize, { cols: number; rows: number }> = {
  small: { cols: 24, rows: 18 },
  medium: { cols: 32, rows: 24 },
  large: { cols: 44, rows: 32 },
};

export const MAP_SIZE_LABEL: Record<MapSize, string> = {
  small: "Small",
  medium: "Medium",
  large: "Large",
};

export const TERRAIN_DENSITY_LABEL: Record<TerrainBias, string> = {
  1: "Sparse",
  2: "Typical",
  3: "Packed",
};

export const TERRAIN_SIZE_LABEL: Record<TerrainBias, string> = {
  1: "Small",
  2: "Mixed",
  3: "Large",
};

export function parseTerrainBias(v: unknown, fallback: TerrainBias = 2): TerrainBias {
  return v === 1 || v === 3 ? v : fallback;
}

export const TERRAIN_THEME_LABEL: Record<TerrainTheme, string> = {
  spaceship: "Spaceship",
  infestation: "Infestation",
  wartorn: "Wartorn",
};

export function parseTerrainTheme(v: unknown): TerrainTheme {
  if (v === "infestation" || v === "wartorn") return v;
  return "spaceship";
}

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function idx(col: number, row: number, cols = MAP_COLS) {
  return row * cols + col;
}

export function inBounds(col: number, row: number, map: BattleMap) {
  return col >= 0 && row >= 0 && col < map.cols && row < map.rows;
}

export function tileIndex(v: number) {
  return Math.floor(v + 0.5);
}

export function tileAt(map: BattleMap, col: number, row: number): TileKind {
  const c = tileIndex(col);
  const r = tileIndex(row);
  if (!inBounds(c, r, map)) return "wall";
  return map.tiles[idx(c, r, map.cols)] ?? "wall";
}

export function isBlocked(map: BattleMap, col: number, row: number) {
  const c = Number.isInteger(col) ? col : tileIndex(col);
  const r = Number.isInteger(row) ? row : tileIndex(row);
  if (!inBounds(c, r, map)) return true;
  const t = map.tiles[idx(c, r, map.cols)] ?? "wall";
  return t === "wall" || t === "structure";
}

export function blocksLos(map: BattleMap, col: number, row: number) {
  const c = Number.isInteger(col) ? col : tileIndex(col);
  const r = Number.isInteger(row) ? row : tileIndex(row);
  if (!inBounds(c, r, map)) return true;
  const t = map.tiles[idx(c, r, map.cols)] ?? "wall";
  return t === "wall" || t === "structure" || t === "difficult";
}

export function isDifficult(map: BattleMap, col: number, row: number) {
  const c = Number.isInteger(col) ? col : tileIndex(col);
  const r = Number.isInteger(row) ? row : tileIndex(row);
  if (!inBounds(c, r, map)) return false;
  return map.tiles[idx(c, r, map.cols)] === "difficult";
}

export function moveMultiplier(map: BattleMap, col: number, row: number, fleet = false) {
  if (fleet) return 1;
  return isDifficult(map, col, row) ? 2 : 1;
}

export function clamp(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v;
}

function circleHitsKind(
  map: BattleMap,
  col: number,
  row: number,
  radius: number,
  hit: (map: BattleMap, tc: number, tr: number) => boolean,
  skip?: { col: number; row: number }[],
) {
  const pad = radius;
  if (col < -0.5 + pad || row < -0.5 + pad || col > map.cols - 0.5 - pad || row > map.rows - 0.5 - pad) {
    return true;
  }
  const c0 = Math.floor(col - radius);
  const c1 = Math.ceil(col + radius);
  const r0 = Math.floor(row - radius);
  const r1 = Math.ceil(row + radius);
  const hitR = radius + 0.02;
  for (let tc = c0; tc <= c1; tc++) {
    for (let tr = r0; tr <= r1; tr++) {
      if (skip?.some((s) => s.col === tc && s.row === tr)) continue;
      if (!hit(map, tc, tr)) continue;
      const nx = clamp(col, tc - 0.5, tc + 0.5);
      const ny = clamp(row, tr - 0.5, tr + 0.5);
      const dx = col - nx;
      const dy = row - ny;
      if (dx * dx + dy * dy < hitR * hitR) return true;
    }
  }
  return false;
}

/** Circle vs movement-blocking AABBs and map edges, in tile space. */
export function circleHitsTerrain(map: BattleMap, col: number, row: number, radius: number) {
  return circleHitsKind(map, col, row, radius, isBlocked);
}

/** Circle vs LOS-blocking AABBs (walls, structures, difficult). */
export function circleHitsLos(
  map: BattleMap,
  col: number,
  row: number,
  radius: number,
  skip?: { col: number; row: number }[],
) {
  return circleHitsKind(map, col, row, radius, blocksLos, skip);
}

export function tileToWorld(col: number, row: number, map: BattleMap) {
  const x = (col - (map.cols - 1) / 2) * TILE;
  const z = (row - (map.rows - 1) / 2) * TILE;
  return { x, z };
}

export function worldToPoint(x: number, z: number, map: BattleMap) {
  return {
    col: x / TILE + (map.cols - 1) / 2,
    row: z / TILE + (map.rows - 1) / 2,
  };
}

export function worldToTile(x: number, z: number, map: BattleMap) {
  const p = worldToPoint(x, z, map);
  return { col: tileIndex(p.col), row: tileIndex(p.row) };
}

export function dist(a: { col: number; row: number }, b: { col: number; row: number }) {
  const dx = a.col - b.col;
  const dy = a.row - b.row;
  return Math.hypot(dx, dy);
}

const DENSITY_TILT: Record<TerrainBias, number> = { 1: 0.58, 2: 1, 3: 1.55 };
const SCATTER_TILT: Record<TerrainBias, number> = { 1: 1.4, 2: 1, 3: 0.62 };

function sizeBucket(rand: () => number, sizeBias: TerrainBias): 0 | 1 | 2 {
  const roll = rand();
  if (sizeBias === 1) return roll < 0.55 ? 0 : roll < 0.85 ? 1 : 2;
  if (sizeBias === 3) return roll < 0.14 ? 0 : roll < 0.42 ? 1 : 2;
  return roll < 0.28 ? 0 : roll < 0.72 ? 1 : 2;
}

function clusterFootprint(rand: () => number, sizeBias: TerrainBias) {
  const bucket = sizeBucket(rand, sizeBias);
  if (bucket === 0) return { w: 1 + Math.floor(rand() * 2), h: 1 + Math.floor(rand() * 2) };
  if (bucket === 1) return { w: 2 + Math.floor(rand() * 2), h: 1 + Math.floor(rand() * 3) };
  return { w: 3 + Math.floor(rand() * 4), h: 3 + Math.floor(rand() * 3) };
}

function blobRadius(rand: () => number, sizeBias: TerrainBias) {
  const bucket = sizeBucket(rand, sizeBias);
  if (bucket === 0) return 0.7 + rand() * 0.95;
  if (bucket === 1) return 1.35 + rand() * 1.15;
  return 2.25 + rand() * 2.15;
}

export function generateMap(
  seed: number,
  size: MapSize = "medium",
  terrain: { density?: TerrainBias; size?: TerrainBias; theme?: TerrainTheme } = {},
): BattleMap {
  const { cols, rows } = MAP_DIMS[size];
  const tiles: TileKind[] = Array.from({ length: cols * rows }, () => "floor");
  const rand = mulberry32(seed || 1);
  const scale = (cols * rows) / (MAP_COLS * MAP_ROWS);
  const density = parseTerrainBias(terrain.density);
  const sizeBias = parseTerrainBias(terrain.size);
  const theme = parseTerrainTheme(terrain.theme);
  const blobs: TerrainBlob[] = [];

  const place = (c: number, r: number, kind: TileKind) => {
    if (c < 3 || c >= cols - 3 || r < 3 || r >= rows - 3) return;
    tiles[idx(c, r, cols)] = kind;
  };

  const stampDisk = (cx: number, cy: number, radius: number, kind: "wall" | "structure") => {
    const reach = radius + 0.12;
    const r2 = reach * reach;
    const c0 = Math.floor(cx - reach);
    const c1 = Math.ceil(cx + reach);
    const r0 = Math.floor(cy - reach);
    const r1 = Math.ceil(cy + reach);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const dx = c - cx;
        const dy = r - cy;
        if (dx * dx + dy * dy <= r2) place(c, r, kind);
      }
    }
    blobs.push({ col: cx, row: cy, radius, kind });
  };

  const densityJitter = 0.78 + rand() * 0.44;
  if (theme === "infestation") {
    const nests = Math.max(4, Math.round(12 * DENSITY_TILT[density] * densityJitter * scale));
    for (let i = 0; i < nests; i++) {
      const radius = blobRadius(rand, sizeBias);
      const cx = 4.2 + rand() * Math.max(1, cols - 8.4);
      const cy = 3.6 + rand() * Math.max(1, rows - 7.2);
      const kind: Exclude<TileKind, "floor"> = rand() > 0.45 ? "structure" : "wall";
      stampDisk(cx, cy, radius, kind);
      const satellites = 1 + Math.floor(rand() * 3);
      for (let s = 0; s < satellites; s++) {
        const ang = rand() * Math.PI * 2;
        const offset = radius * (0.35 + rand() * 0.55);
        const r2 = radius * (0.4 + rand() * 0.55);
        stampDisk(cx + Math.cos(ang) * offset, cy + Math.sin(ang) * offset, r2, kind);
      }
    }
    const extraJitter = 0.8 + rand() * 0.4;
    const extras = Math.max(
      3,
      Math.round(10 * DENSITY_TILT[density] * SCATTER_TILT[sizeBias] * extraJitter * scale),
    );
    for (let i = 0; i < extras; i++) {
      stampDisk(
        4.2 + rand() * Math.max(1, cols - 8.4),
        3.4 + rand() * Math.max(1, rows - 6.8),
        0.55 + rand() * 0.55,
        "wall",
      );
    }
  } else if (theme === "wartorn") {
    const fields = Math.max(5, Math.round(10 * DENSITY_TILT[density] * densityJitter * scale));
    for (let i = 0; i < fields; i++) {
      const radius = blobRadius(rand, sizeBias) * 0.85;
      let c = 4.5 + rand() * Math.max(1, cols - 9);
      let r = 4 + rand() * Math.max(1, rows - 8);
      const steps = 10 + Math.round(radius * 14);
      for (let s = 0; s < steps; s++) {
        const wobble = 0.55 + rand() * 0.7;
        const reach = Math.max(0.8, radius * wobble * 0.45);
        const c0 = Math.floor(c - reach);
        const c1 = Math.ceil(c + reach);
        const r0 = Math.floor(r - reach);
        const r1 = Math.ceil(r + reach);
        for (let tr = r0; tr <= r1; tr++) {
          for (let tc = c0; tc <= c1; tc++) {
            const dx = tc - c;
            const dy = tr - r;
            if (dx * dx + dy * dy > reach * reach) continue;
            if (rand() < 0.22) continue;
            place(tc, tr, "difficult");
          }
        }
        c += (rand() - 0.5) * 2.2;
        r += (rand() - 0.5) * 2.2;
      }
    }
    const walls = Math.max(3, Math.round(5 * DENSITY_TILT[density] * densityJitter * scale));
    for (let i = 0; i < walls; i++) {
      const horiz = rand() > 0.5;
      const bucket = sizeBucket(rand, sizeBias);
      const len = bucket === 0 ? 5 + Math.floor(rand() * 5) : bucket === 1 ? 8 + Math.floor(rand() * 7) : 12 + Math.floor(rand() * 10);
      if (horiz) {
        const r0 = 4 + Math.floor(rand() * Math.max(1, rows - 8));
        const c0 = 4 + Math.floor(rand() * Math.max(1, cols - 8 - len));
        for (let c = 0; c < len; c++) place(c0 + c, r0, "wall");
        if (len >= 6 && rand() < 0.62) {
          const door = c0 + 2 + Math.floor(rand() * Math.max(1, len - 4));
          place(door, r0, "door");
          if (len >= 10 && rand() < 0.35) place(door + (rand() > 0.5 ? 1 : -1), r0, "door");
        }
      } else {
        const c0 = 4 + Math.floor(rand() * Math.max(1, cols - 8));
        const r0 = 4 + Math.floor(rand() * Math.max(1, rows - 8 - len));
        for (let r = 0; r < len; r++) place(c0, r0 + r, "wall");
        if (len >= 6 && rand() < 0.62) {
          const door = r0 + 2 + Math.floor(rand() * Math.max(1, len - 4));
          place(c0, door, "door");
          if (len >= 10 && rand() < 0.35) place(c0, door + (rand() > 0.5 ? 1 : -1), "door");
        }
      }
    }
  } else {
    const clusters = Math.max(4, Math.round(17 * DENSITY_TILT[density] * densityJitter * scale));
    for (let i = 0; i < clusters; i++) {
      const { w, h } = clusterFootprint(rand, sizeBias);
      const c0 = 3 + Math.floor(rand() * Math.max(1, cols - 6 - w));
      const r0 = Math.floor(rand() * Math.max(1, rows - h));
      const kind: TileKind = rand() > 0.55 ? "structure" : "wall";
      for (let r = 0; r < h; r++) {
        for (let c = 0; c < w; c++) {
          if (rand() > 0.18) place(c0 + c, r0 + r, kind);
        }
      }
    }
    const extraJitter = 0.8 + rand() * 0.4;
    const extras = Math.max(
      4,
      Math.round(20 * DENSITY_TILT[density] * SCATTER_TILT[sizeBias] * extraJitter * scale),
    );
    for (let i = 0; i < extras; i++) {
      const c = 4 + Math.floor(rand() * Math.max(1, cols - 8));
      const r = Math.floor(rand() * rows);
      place(c, r, "wall");
    }
  }

  return { cols, rows, tiles, seed, theme, blobs };
}

export function deployCols(faction: "empire" | "brood", map: BattleMap) {
  if (faction === "empire") return [0, 1, 2];
  return [map.cols - 3, map.cols - 2, map.cols - 1];
}

export function openDeployTiles(
  faction: "empire" | "brood",
  map: BattleMap,
  taken: Set<string>,
) {
  const cols = deployCols(faction, map);
  const spots: Array<{ col: number; row: number }> = [];
  for (const col of cols) {
    for (let row = 0; row < map.rows; row++) {
      if (isBlocked(map, col, row)) continue;
      const key = `${col},${row}`;
      if (taken.has(key)) continue;
      spots.push({ col, row });
    }
  }
  return spots;
}

function angleOnRect(t: number, cols: number, rows: number) {
  const w = cols - 1;
  const h = rows - 1;
  const peri = 2 * (w + h);
  let d = ((t % 1) + 1) % 1 * peri;
  if (d < w) return { col: d, row: 0 };
  d -= w;
  if (d < h) return { col: w, row: d };
  d -= h;
  if (d < w) return { col: w - d, row: h };
  d -= w;
  return { col: 0, row: h - d };
}

/** Open tiles in a 3-deep pocket around a team's edge anchor, facing the center. */
export function teamDeployTiles(
  map: BattleMap,
  teamIndex: number,
  teamCount: number,
  taken: Set<string>,
) {
  const n = Math.max(1, teamCount);
  const t = (teamIndex + 0.5) / n;
  const anchor = angleOnRect(t, map.cols, map.rows);
  const cx = (map.cols - 1) / 2;
  const cy = (map.rows - 1) / 2;
  const facing = Math.atan2(cy - anchor.row, cx - anchor.col);
  const spots: Array<{ col: number; row: number; facing: number }> = [];
  for (let col = 0; col < map.cols; col++) {
    for (let row = 0; row < map.rows; row++) {
      if (isBlocked(map, col, row)) continue;
      const key = `${col},${row}`;
      if (taken.has(key)) continue;
      const edge = Math.min(col, row, map.cols - 1 - col, map.rows - 1 - row);
      if (edge > 2.6) continue;
      const dx = col - cx;
      const dy = row - cy;
      let a = Math.atan2(dy, dx) - Math.atan2(anchor.row - cy, anchor.col - cx);
      while (a > Math.PI) a -= Math.PI * 2;
      while (a < -Math.PI) a += Math.PI * 2;
      if (Math.abs(a) > Math.PI / n + 0.15) continue;
      spots.push({ col, row, facing });
    }
  }
  spots.sort((a, b) => {
    const da = Math.hypot(a.col - anchor.col, a.row - anchor.row);
    const db = Math.hypot(b.col - anchor.col, b.row - anchor.row);
    return da - db;
  });
  return { spots, facing };
}
