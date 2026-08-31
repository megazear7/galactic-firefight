import type { BattleMap, TileKind } from "./types";

export const TILE = 1.55;
export const MAP_COLS = 32;
export const MAP_ROWS = 24;

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

export function generateMap(seed: number): BattleMap {
  const cols = MAP_COLS;
  const rows = MAP_ROWS;
  const tiles: TileKind[] = Array.from({ length: cols * rows }, () => "floor");
  const rand = mulberry32(seed || 1);

  const place = (c: number, r: number, kind: TileKind) => {
    if (c < 3 || c >= cols - 3) return;
    if (r < 0 || r >= rows || c < 0 || c >= cols) return;
    tiles[idx(c, r, cols)] = kind;
  };

  const clusters = 16 + Math.floor(rand() * 8);
  for (let i = 0; i < clusters; i++) {
    const w = 1 + Math.floor(rand() * 4);
    const h = 1 + Math.floor(rand() * 3);
    const c0 = 3 + Math.floor(rand() * Math.max(1, cols - 6 - w));
    const r0 = Math.floor(rand() * Math.max(1, rows - h));
    const kind: TileKind = rand() > 0.55 ? "structure" : "wall";
    for (let r = 0; r < h; r++) {
      for (let c = 0; c < w; c++) {
        if (rand() > 0.18) place(c0 + c, r0 + r, kind);
      }
    }
  }

  for (let i = 0; i < 22; i++) {
    const c = 4 + Math.floor(rand() * (cols - 8));
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
