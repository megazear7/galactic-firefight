import { circleHitsTerrain, dist } from "./map";
import { UNIT_STATS } from "./units";
import { hitsBlocker, type Blocker } from "./pathfinding";
import type { BattleMap, PathPoint, UnitState, UnitType } from "./types";

export function unitRadius(type: UnitType) {
  return 0.3 * UNIT_STATS[type].size;
}

export function losRadius(type: UnitType) {
  return 0.38 * UNIT_STATS[type].size;
}

export function unitBlockers(units: UnitState[], exceptId?: string): Blocker[] {
  const out: Blocker[] = [];
  for (const u of units) {
    if (!u.alive) continue;
    if (exceptId && u.id === exceptId) continue;
    out.push({ col: u.col, row: u.row, radius: unitRadius(u.type) });
  }
  return out;
}

export function occupiedSet(units: UnitState[], exceptId?: string) {
  const s = new Set<string>();
  for (const u of units) {
    if (!u.alive) continue;
    if (exceptId && u.id === exceptId) continue;
    s.add(`${Math.round(u.col * 4) / 4},${Math.round(u.row * 4) / 4}`);
  }
  return s;
}

function unitBlocksSample(
  col: number,
  row: number,
  units: UnitState[],
  skip: Set<string>,
) {
  for (const u of units) {
    if (!u.alive || skip.has(u.id)) continue;
    const r = losRadius(u.type);
    const dx = col - u.col;
    const dy = row - u.row;
    if (dx * dx + dy * dy < r * r) return true;
  }
  return false;
}

/** Sampled line of sight: walls/structures and other unit bodies block. */
export function hasLos(
  map: BattleMap,
  a: PathPoint,
  b: PathPoint,
  units: UnitState[] = [],
  exceptIds: string[] = [],
) {
  const skip = new Set(exceptIds);
  const len = dist(a, b);
  if (len < 0.08) return true;
  const steps = Math.max(8, Math.ceil(len * 14));
  for (let s = 1; s < steps; s++) {
    const t = s / steps;
    const col = a.col + (b.col - a.col) * t;
    const row = a.row + (b.row - a.row) * t;
    if (circleHitsTerrain(map, col, row, 0.07)) return false;
    const fromA = t * len;
    const fromB = (1 - t) * len;
    if (fromA < 0.34 || fromB < 0.34) continue;
    if (unitBlocksSample(col, row, units, skip)) return false;
  }
  return true;
}

/**
 * Polar horizon of what `unit` can see. Each entry is the first blocked
 * (or max-range) point along that ray — used to build the vis fan.
 */
export function sightHorizon(
  unit: UnitState,
  map: BattleMap,
  units: UnitState[],
  maxRange: number,
  rays = 160,
): PathPoint[] {
  const skip = new Set([unit.id]);
  const pts: PathPoint[] = [];
  const steps = Math.max(10, Math.ceil(maxRange * 12));
  for (let i = 0; i < rays; i++) {
    const a = (i / rays) * Math.PI * 2;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    let last: PathPoint = { col: unit.col, row: unit.row };
    for (let s = 1; s <= steps; s++) {
      const t = (s / steps) * maxRange;
      const col = unit.col + dx * t;
      const row = unit.row + dy * t;
      if (circleHitsTerrain(map, col, row, 0.07)) break;
      if (t > 0.34 && unitBlocksSample(col, row, units, skip)) break;
      last = { col, row };
    }
    pts.push(last);
  }
  return pts;
}

export function angleTo(from: PathPoint, to: PathPoint) {
  return Math.atan2(to.row - from.row, to.col - from.col);
}

export function deltaAngle(a: number, b: number) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function inArc(unit: UnitState, target: PathPoint) {
  const stats = UNIT_STATS[unit.type];
  if (stats.arc >= 359) return true;
  const to = angleTo(unit, target);
  const half = ((stats.arc * Math.PI) / 180) / 2;
  return Math.abs(deltaAngle(unit.facing, to)) <= half + 1e-3;
}

export function isStealthed(unit: UnitState, viewer: UnitState | null) {
  const stats = UNIT_STATS[unit.type];
  if (!stats.stealth) return false;
  if (unit.revealed) return false;
  if (unit.shotThisTurn) return false;
  if (viewer && dist(unit, viewer) <= stats.stealthRevealRange + 0.05) return false;
  return true;
}

export function visibleTo(viewer: UnitState, target: UnitState, map: BattleMap, units: UnitState[]) {
  if (!viewer.alive || !target.alive) return false;
  if (viewer.faction === target.faction) return true;
  if (isStealthed(target, viewer)) return false;
  return hasLos(map, viewer, target, units, [viewer.id, target.id]);
}

export function meleeEnemies(unit: UnitState, units: UnitState[]) {
  const stats = UNIT_STATS[unit.type];
  return units.filter(
    (o) =>
      o.alive &&
      o.faction !== unit.faction &&
      dist(unit, o) <= stats.meleeRange + unitRadius(o.type) + 0.05,
  );
}

export function rangedTargets(unit: UnitState, units: UnitState[], map: BattleMap) {
  const stats = UNIT_STATS[unit.type];
  if (stats.range <= 0) return [];
  if (unit.engagedAtTurnStart) return [];
  return units.filter((o) => {
    if (!o.alive || o.faction === unit.faction) return false;
    if (dist(unit, o) > stats.range + 0.05) return false;
    if (!inArc(unit, o)) return false;
    if (!visibleTo(unit, o, map, units)) return false;
    return true;
  });
}

export function shotVictims(attacker: UnitState, primary: UnitState, units: UnitState[], map: BattleMap) {
  const stats = UNIT_STATS[attacker.type];
  const ids = new Set<string>([primary.id]);
  if (stats.aoeRadius > 0) {
    for (const u of units) {
      if (!u.alive || u.faction === attacker.faction) continue;
      if (dist(primary, u) <= stats.aoeRadius + 0.05) ids.add(u.id);
    }
  }
  if (stats.multiTargetRadius > 0) {
    const extras = units
      .filter((u) => {
        if (!u.alive || u.faction === attacker.faction || u.id === primary.id) return false;
        if (dist(primary, u) > stats.multiTargetRadius + 0.05) return false;
        if (dist(attacker, u) > stats.range + 0.05) return false;
        if (!inArc(attacker, u)) return false;
        if (!visibleTo(attacker, u, map, units)) return false;
        return true;
      })
      .slice(0, Math.max(0, stats.maxTargets - 1));
    for (const e of extras) ids.add(e.id);
  }
  return [...ids];
}

/** Closest eligible watcher that has not overwatched this turn. */
export function pickOverwatch(
  mover: UnitState,
  pos: PathPoint,
  units: UnitState[],
  map: BattleMap,
): { watcherId: string; damage: number } | null {
  const sample: UnitState = { ...mover, col: pos.col, row: pos.row };
  let best: { watcherId: string; damage: number; d: number } | null = null;
  for (const w of units) {
    if (!w.alive || w.faction === mover.faction) continue;
    if (w.overwatchedThisTurn) continue;
    const stats = UNIT_STATS[w.type];
    if (stats.overwatchDamage <= 0 || stats.range <= 0) continue;
    const d = dist(w, sample);
    if (d > stats.range + 0.05) continue;
    if (!inArc(w, sample)) continue;
    if (!visibleTo(w, sample, map, units)) continue;
    if (!best || d < best.d) {
      best = { watcherId: w.id, damage: stats.overwatchDamage, d };
    }
  }
  return best ? { watcherId: best.watcherId, damage: best.damage } : null;
}

export function applyDamage(units: UnitState[], id: string, amount: number) {
  return units.map((u) => {
    if (u.id !== id || !u.alive) return u;
    const hp = Math.max(0, u.hp - amount);
    return { ...u, hp, alive: hp > 0 };
  });
}

export function canSeePoint(unit: UnitState, point: PathPoint, map: BattleMap, units: UnitState[]) {
  if (circleHitsTerrain(map, point.col, point.row, 0.05)) return false;
  if (hitsBlocker(point.col, point.row, unitBlockers(units, unit.id), 0.12)) {
    /* standing on another unit is not 'seen ground' but LOS can still pass nearby */
  }
  return hasLos(map, unit, point, units, [unit.id]);
}

export { dist };
