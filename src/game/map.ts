import type { BattleMap, MapSize, TerrainBias, TileKind } from "./types";

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

export function clamp(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Circle vs wall/structure AABBs and map edges, in tile space. */
export function circleHitsTerrain(map: BattleMap, col: number, row: number, radius: number) {
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
      if (!isBlocked(map, tc, tr)) continue;
      const nx = clamp(col, tc - 0.5, tc + 0.5);
      const ny = clamp(row, tr - 0.5, tr + 0.5);
      const dx = col - nx;
      const dy = row - ny;
      if (dx * dx + dy * dy < hitR * hitR) return true;
    }
  }
  return false;
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

function clusterFootprint(rand: () => number, sizeBias: TerrainBias) {
  const roll = rand();
  let bucket: 0 | 1 | 2;
  if (sizeBias === 1) bucket = roll < 0.55 ? 0 : roll < 0.85 ? 1 : 2;
  else if (sizeBias === 3) bucket = roll < 0.14 ? 0 : roll < 0.42 ? 1 : 2;
  else bucket = roll < 0.28 ? 0 : roll < 0.72 ? 1 : 2;
  if (bucket === 0) return { w: 1 + Math.floor(rand() * 2), h: 1 + Math.floor(rand() * 2) };
  if (bucket === 1) return { w: 2 + Math.floor(rand() * 2), h: 1 + Math.floor(rand() * 3) };
  return { w: 3 + Math.floor(rand() * 4), h: 3 + Math.floor(rand() * 3) };
}

export function generateMap(
  seed: number,
  size: MapSize = "medium",
  terrain: { density?: TerrainBias; size?: TerrainBias } = {},
): BattleMap {
  const { cols, rows } = MAP_DIMS[size];
  const tiles: TileKind[] = Array.from({ length: cols * rows }, () => "floor");
  const rand = mulberry32(seed || 1);
  const scale = (cols * rows) / (MAP_COLS * MAP_ROWS);
  const density = parseTerrainBias(terrain.density);
  const sizeBias = parseTerrainBias(terrain.size);

  const place = (c: number, r: number, kind: TileKind) => {
    if (c < 3 || c >= cols - 3 || r < 3 || r >= rows - 3) return;
    tiles[idx(c, r, cols)] = kind;
  };

  const densityJitter = 0.78 + rand() * 0.44;
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

  return { cols, rows, tiles, seed };
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
