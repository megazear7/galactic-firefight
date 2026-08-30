import { dist } from "./map";
import { findPath, reachable } from "./pathfinding";
import { meleeEnemies, occupiedSet, rangedTargets, shotVictims } from "./combat";
import { UNIT_STATS } from "./units";
import type { BattleState, UnitState } from "./types";

export type AiIntent =
  | { kind: "shoot"; unitId: string; targetId: string }
  | { kind: "melee"; unitId: string; targetId: string }
  | { kind: "move"; unitId: string; col: number; row: number; facing: number }
  | { kind: "wait"; unitId: string };

function nearestEnemy(unit: UnitState, units: UnitState[]) {
  let best: UnitState | null = null;
  let bestD = Infinity;
  for (const o of units) {
    if (!o.alive || o.faction === unit.faction) continue;
    const d = dist(unit, o);
    if (d < bestD) {
      bestD = d;
      best = o;
    }
  }
  return best;
}

export function pickAiAction(state: BattleState): AiIntent | null {
  const ready = state.units.filter(
    (u) => u.alive && u.faction === state.turn && (!u.moved || !u.acted),
  );
  if (ready.length === 0) return null;

  ready.sort((a, b) => {
    const da = UNIT_STATS[a.type].range;
    const db = UNIT_STATS[b.type].range;
    return da - db;
  });

  for (const unit of ready) {
    if (!unit.acted) {
      const ranged = rangedTargets(unit, state.units, state.map);
      if (ranged.length) {
        ranged.sort((a, b) => a.hp - b.hp);
        const target = ranged[0];
        const victims = shotVictims(unit, target, state.units, state.map);
        void victims;
        return { kind: "shoot", unitId: unit.id, targetId: target.id };
      }
      const melee = meleeEnemies(unit, state.units);
      if (melee.length && (unit.moved || UNIT_STATS[unit.type].range === 0)) {
        melee.sort((a, b) => a.hp - b.hp);
        return { kind: "melee", unitId: unit.id, targetId: melee[0].id };
      }
    }

    if (!unit.moved) {
      const enemy = nearestEnemy(unit, state.units);
      if (!enemy) return { kind: "wait", unitId: unit.id };
      const occ = occupiedSet(state.units, unit.id);
      const stats = UNIT_STATS[unit.type];
      const reach = reachable(state.map, unit, stats.move, occ);
      let best: { col: number; row: number; score: number } | null = null;
      for (const tile of reach.values()) {
        const d = dist(tile, enemy);
        const want =
          stats.range > 0
            ? Math.abs(d - Math.max(2, stats.range * 0.7))
            : d;
        const score = -want - (stats.range > 0 && d <= 1.4 ? 4 : 0);
        if (!best || score > best.score) best = { col: tile.col, row: tile.row, score };
      }
      if (!best) return { kind: "wait", unitId: unit.id };
      const path = findPath(state.map, unit, best, occ, stats.move);
      if (!path || path.length < 2) {
        const facing = Math.atan2(enemy.row - unit.row, enemy.col - unit.col);
        return { kind: "move", unitId: unit.id, col: unit.col, row: unit.row, facing };
      }
      const dest = path[path.length - 1];
      const facing = Math.atan2(enemy.row - dest.row, enemy.col - dest.col);
      return { kind: "move", unitId: unit.id, col: dest.col, row: dest.row, facing };
    }

    if (!unit.acted) return { kind: "wait", unitId: unit.id };
  }
  return { kind: "wait", unitId: ready[0].id };
}
