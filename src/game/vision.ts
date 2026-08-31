import { circleHitsTerrain, dist, idx, isBlocked } from "./map";
import { hasLos } from "./combat";
import { sightRange } from "./units";
import type { BattleMap, BattleState, Faction, UnitState } from "./types";

export { sightRange };

export function emptyMask(map: BattleMap): boolean[] {
  return Array.from({ length: map.cols * map.rows }, () => false);
}

function canSeeTile(unit: UnitState, map: BattleMap, units: UnitState[], col: number, row: number) {
  const cap = sightRange(unit.type);
  if (dist(unit, { col, row }) > cap + 0.55) return false;
  if (!isBlocked(map, col, row)) {
    return hasLos(map, unit, { col, row }, units, [unit.id]);
  }
  const dx = col - unit.col;
  const dy = row - unit.row;
  const len = Math.hypot(dx, dy) || 1;
  const before = { col: col - (dx / len) * 0.58, row: row - (dy / len) * 0.58 };
  if (circleHitsTerrain(map, before.col, before.row, 0.05) && dist(unit, before) > 0.4) return false;
  return hasLos(map, unit, before, units, [unit.id]);
}

/** Tiles currently seen by living units of `faction`. */
export function visionMask(state: BattleState, faction: Faction): boolean[] {
  const { map, units } = state;
  const vis = emptyMask(map);
  const viewers = units.filter((u) => u.alive && u.faction === faction);
  for (const unit of viewers) {
    const cap = sightRange(unit.type);
    const reach = cap + 0.6;
    const c0 = Math.max(0, Math.floor(unit.col - reach));
    const c1 = Math.min(map.cols - 1, Math.ceil(unit.col + reach));
    const r0 = Math.max(0, Math.floor(unit.row - reach));
    const r1 = Math.min(map.rows - 1, Math.ceil(unit.row + reach));
    for (let row = r0; row <= r1; row++) {
      for (let col = c0; col <= c1; col++) {
        const i = idx(col, row, map.cols);
        if (vis[i]) continue;
        if (canSeeTile(unit, map, units, col, row)) vis[i] = true;
      }
    }
  }
  return vis;
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

export function enemyVisible(state: BattleState, unit: UnitState, vis: boolean[]) {
  if (unit.faction === state.playerFaction) return true;
  return tileVisibleNow(vis, state.map, unit.col, unit.row);
}

export function revealExplored(state: BattleState): BattleState {
  const vis = visionMask(state, state.playerFaction);
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
