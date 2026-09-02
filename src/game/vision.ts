import { blocksLos, clamp, dist, idx, inBounds } from "./map";
import { hasTerrainLos } from "./combat";
import { sightRange } from "./units";
import type { BattleMap, BattleState, TerrainBlob, UnitState } from "./types";
import { devicePlayers } from "./lobby";

export { sightRange };

const TERRAIN_DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
] as const;

export function emptyMask(map: BattleMap): boolean[] {
  return Array.from({ length: map.cols * map.rows }, () => false);
}

/** Terrain collision that ignores the obstacle we are trying to see. */
function hitsOtherTerrain(
  map: BattleMap,
  col: number,
  row: number,
  radius: number,
  exceptCol: number,
  exceptRow: number,
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
      if (tc === exceptCol && tr === exceptRow) continue;
      if (!blocksLos(map, tc, tr)) continue;
      const nx = clamp(col, tc - 0.5, tc + 0.5);
      const ny = clamp(row, tr - 0.5, tr + 0.5);
      const dx = col - nx;
      const dy = row - ny;
      if (dx * dx + dy * dy < hitR * hitR) return true;
    }
  }
  return false;
}

function inTile(col: number, row: number, tc: number, tr: number, pad: number) {
  return col >= tc - 0.5 - pad && col <= tc + 0.5 + pad && row >= tr - 0.5 - pad && row <= tr + 0.5 + pad;
}

/** True when a ray from the unit reaches this obstacle's facing surface. */
function canSeeTerrainFace(
  unit: UnitState,
  map: BattleMap,
  col: number,
  row: number,
) {
  const cap = sightRange(unit.type);
  const faceCol = clamp(unit.col, col - 0.5, col + 0.5);
  const faceRow = clamp(unit.row, row - 0.5, row + 0.5);
  const dx = faceCol - unit.col;
  const dy = faceRow - unit.row;
  const len = Math.hypot(dx, dy);
  if (len > cap + 0.12) return false;
  if (len < 0.16) return true;
  const steps = Math.max(10, Math.ceil(len * 16));
  for (let s = 1; s <= steps; s++) {
    const t = s / steps;
    const c = unit.col + dx * t;
    const r = unit.row + dy * t;
    if (inTile(c, r, col, row, 0.04)) return true;
    if (hitsOtherTerrain(map, c, r, 0.07, col, row)) return false;
  }
  return true;
}

function canSeeTile(unit: UnitState, map: BattleMap, col: number, row: number) {
  const cap = sightRange(unit.type);
  if (!blocksLos(map, col, row)) {
    if (dist(unit, { col, row }) > cap + 0.55) return false;
    return hasTerrainLos(map, unit, { col, row });
  }
  return canSeeTerrainFace(unit, map, col, row);
}

function revealTerrainVolume(vis: boolean[], map: BattleMap) {
  const out = vis.slice();
  for (let row = 0; row < map.rows; row++) {
    for (let col = 0; col < map.cols; col++) {
      const i = idx(col, row, map.cols);
      if (!vis[i] || blocksLos(map, col, row)) continue;
      for (const [dc, dr] of TERRAIN_DIRS) {
        if (dc !== 0 && dr !== 0) continue;
        const nc = col + dc;
        const nr = row + dr;
        if (!inBounds(nc, nr, map) || !blocksLos(map, nc, nr)) continue;
        out[idx(nc, nr, map.cols)] = true;
      }
    }
  }
  const seeded = out.slice();
  for (let row = 0; row < map.rows; row++) {
    for (let col = 0; col < map.cols; col++) {
      const i = idx(col, row, map.cols);
      if (!seeded[i] || !blocksLos(map, col, row)) continue;
      for (const [dc, dr] of TERRAIN_DIRS) {
        const nc = col + dc;
        const nr = row + dr;
        if (!inBounds(nc, nr, map) || !blocksLos(map, nc, nr)) continue;
        out[idx(nc, nr, map.cols)] = true;
      }
    }
  }
  return out;
}

function forEachDiskTile(map: BattleMap, blob: TerrainBlob, pad: number, fn: (i: number, col: number, row: number) => void) {
  const reach = blob.radius + pad;
  const r2 = reach * reach;
  const c0 = Math.max(0, Math.floor(blob.col - reach));
  const c1 = Math.min(map.cols - 1, Math.ceil(blob.col + reach));
  const r0 = Math.max(0, Math.floor(blob.row - reach));
  const r1 = Math.min(map.rows - 1, Math.ceil(blob.row + reach));
  for (let row = r0; row <= r1; row++) {
    for (let col = c0; col <= c1; col++) {
      const dx = col - blob.col;
      const dy = row - blob.row;
      if (dx * dx + dy * dy > r2) continue;
      fn(idx(col, row, map.cols), col, row);
    }
  }
}

/** Once you see any part of a hive mass, the whole disc is spotted. */
function revealInfestationBlobs(vis: boolean[], map: BattleMap) {
  if (map.theme !== "infestation" || !map.blobs.length) return vis;
  const out = vis.slice();
  for (const blob of map.blobs) {
    let seen = false;
    forEachDiskTile(map, blob, 1.05, (i) => {
      if (vis[i]) seen = true;
    });
    if (!seen) continue;
    forEachDiskTile(map, blob, 0.55, (i) => {
      out[i] = true;
    });
  }
  return out;
}

/** Tiles currently seen by living units of `team`. */
export function visionMask(state: BattleState, team: number): boolean[] {
  const { map, units } = state;
  const vis = emptyMask(map);
  const hotseat = devicePlayers(state.participants ?? []).length >= 2;
  const viewers = units.filter((u) => {
    if (!u.alive) return false;
    if (hotseat) return u.playerId === state.playerId;
    return u.team === team;
  });
  for (const unit of viewers) {
    const cap = sightRange(unit.type);
    const reach = cap + 1.05;
    const c0 = Math.max(0, Math.floor(unit.col - reach));
    const c1 = Math.min(map.cols - 1, Math.ceil(unit.col + reach));
    const r0 = Math.max(0, Math.floor(unit.row - reach));
    const r1 = Math.min(map.rows - 1, Math.ceil(unit.row + reach));
    for (let row = r0; row <= r1; row++) {
      for (let col = c0; col <= c1; col++) {
        const i = idx(col, row, map.cols);
        if (vis[i]) continue;
        if (canSeeTile(unit, map, col, row)) vis[i] = true;
      }
    }
  }
  return revealInfestationBlobs(revealTerrainVolume(vis, map), map);
}

export function tileExplored(state: BattleState, col: number, row: number) {
  const c = Math.floor(col + 0.5);
  const r = Math.floor(row + 0.5);
  if (c < 0 || r < 0 || c >= state.map.cols || r >= state.map.rows) return false;
  return !!state.explored[idx(c, r, state.map.cols)];
}

export function tileVisibleNow(mask: boolean[], map: BattleMap, col: number, row: number) {
  const c = Math.floor(col + 0.5);
  const r = Math.floor(row + 0.5);
  if (c < 0 || r < 0 || c >= map.cols || r >= map.rows) return false;
  return !!mask[idx(c, r, map.cols)];
}

export function localTeam(state: BattleState) {
  const p = state.participants?.find((x) => x.id === state.playerId);
  if (p) return p.team;
  const u = state.units.find((x) => x.playerId === state.playerId);
  return u?.team ?? 1;
}

export function enemyVisible(state: BattleState, unit: UnitState, vis: boolean[]) {
  if (devicePlayers(state.participants ?? []).length >= 2) {
    if (unit.playerId === state.playerId) return true;
  } else if (unit.team === localTeam(state)) {
    return true;
  }
  if (tileVisibleNow(vis, state.map, unit.col, unit.row)) return true;
  const hotseat = devicePlayers(state.participants ?? []).length >= 2;
  const viewers = state.units.filter((u) => {
    if (!u.alive) return false;
    if (hotseat) return u.playerId === state.playerId;
    return u.team === localTeam(state);
  });
  for (const v of viewers) {
    if (dist(v, unit) > sightRange(v.type) + 0.55) continue;
    if (hasTerrainLos(state.map, v, unit)) return true;
  }
  return false;
}

export function revealExplored(state: BattleState): BattleState {
  const vis = visionMask(state, localTeam(state));
  const explored = state.explored.slice();
  let changed = false;
  for (let i = 0; i < vis.length; i++) {
    if (vis[i] && !explored[i]) {
      explored[i] = true;
      changed = true;
    }
  }
  return changed ? { ...state, explored } : state;
}
