import { dist } from "./map";
import { findPath, reachable } from "./pathfinding";
import { meleeEnemies, rangedTargets, shotVictims, unitBlockers, unitRadius } from "./combat";
import { UNIT_STATS } from "./units";
import { ACTIVATIONS_PER_TURN } from "./types";
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
    if (!o.alive || o.team === unit.team) continue;
    const d = dist(unit, o);
    if (d < bestD) {
      bestD = d;
      best = o;
    }
  }
  return best;
}

export function pickAiAction(state: BattleState): AiIntent | null {
  const done = state.units.filter((u) => u.team === state.turnTeam && u.acted).length;
  const mid = state.units.find((u) => u.alive && u.team === state.turnTeam && u.moved && !u.acted);
  if (!mid && done >= ACTIVATIONS_PER_TURN) return null;

  const ready = mid
    ? [mid]
    : state.units.filter((u) => u.alive && u.team === state.turnTeam && !u.acted);
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
        void shotVictims(unit, target, state.units, state.map);
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
      const blockers = unitBlockers(state.units, unit.id);
      const stats = UNIT_STATS[unit.type];
      const radius = unitRadius(unit.type);
      const reach = reachable(state.map, unit, stats.move, blockers, radius);
      let best: { col: number; row: number; score: number } | null = null;
      const stride = Math.max(1, Math.floor(reach.length / 48));
      for (let i = 0; i < reach.length; i += stride) {
        const tile = reach[i];
        const d = dist(tile, enemy);
        const want = stats.range > 0 ? Math.abs(d - Math.max(1.6, stats.range * 0.65)) : d;
        const score = -want - (stats.range > 0 && d <= 1.2 ? 4 : 0);
        if (!best || score > best.score) best = { col: tile.col, row: tile.row, score };
      }
      if (!best) return { kind: "wait", unitId: unit.id };
      const path = findPath(state.map, unit, best, blockers, radius, stats.move);
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
