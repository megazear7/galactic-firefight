import type { BattleMap, TileKind } from "./types";

export const TILE = 1.55;
export const MAP_COLS = 16;
export const MAP_ROWS = 12;

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

export function tileAt(map: BattleMap, col: number, row: number): TileKind {
  if (!inBounds(col, row, map)) return "wall";
  return map.tiles[idx(col, row, map.cols)] ?? "wall";
}

export function isBlocked(map: BattleMap, col: number, row: number) {
  const t = tileAt(map, col, row);
  return t === "wall" || t === "structure";
}

export function tileToWorld(col: number, row: number, map: BattleMap) {
  const x = (col - (map.cols - 1) / 2) * TILE;
  const z = (row - (map.rows - 1) / 2) * TILE;
  return { x, z };
}

export function worldToTile(x: number, z: number, map: BattleMap) {
  const col = Math.round(x / TILE + (map.cols - 1) / 2);
  const row = Math.round(z / TILE + (map.rows - 1) / 2);
  return { col, row };
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

  const clusters = 7 + Math.floor(rand() * 4);
  for (let i = 0; i < clusters; i++) {
    const w = 1 + Math.floor(rand() * 3);
    const h = 1 + Math.floor(rand() * 2);
    const c0 = 3 + Math.floor(rand() * (cols - 6 - w));
    const r0 = Math.floor(rand() * (rows - h));
    const kind: TileKind = rand() > 0.55 ? "structure" : "wall";
    for (let r = 0; r < h; r++) {
      for (let c = 0; c < w; c++) {
        if (rand() > 0.18) place(c0 + c, r0 + r, kind);
      }
    }
  }

  for (let i = 0; i < 10; i++) {
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
