import { dist, inBounds, isBlocked } from "./map";
import { UNIT_STATS } from "./units";
import type { BattleMap, UnitState } from "./types";

export function occupiedSet(units: UnitState[], exceptId?: string) {
  const s = new Set<string>();
  for (const u of units) {
    if (!u.alive) continue;
    if (exceptId && u.id === exceptId) continue;
    s.add(`${u.col},${u.row}`);
  }
  return s;
}

export function hasLos(
  map: BattleMap,
  a: { col: number; row: number },
  b: { col: number; row: number },
) {
  if (!inBounds(a.col, a.row, map) || !inBounds(b.col, b.row, map)) return false;
  let x0 = a.col;
  let y0 = a.row;
  const x1 = b.col;
  const y1 = b.row;
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  while (x0 !== x1 || y0 !== y1) {
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x0 += sx;
    }
    if (e2 < dx) {
      err += dx;
      y0 += sy;
    }
    if (x0 === x1 && y0 === y1) break;
    if (isBlocked(map, x0, y0)) return false;
  }
  return true;
}

export function angleTo(from: { col: number; row: number }, to: { col: number; row: number }) {
  return Math.atan2(to.row - from.row, to.col - from.col);
}

export function deltaAngle(a: number, b: number) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function inArc(unit: UnitState, target: { col: number; row: number }) {
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
  if (unit.turnsSinceShot === 0 && unit.revealed) return false;
  if (viewer && dist(unit, viewer) <= stats.stealthRevealRange + 0.05) return false;
  return true;
}

export function visibleTo(viewer: UnitState, target: UnitState, map: BattleMap) {
  if (!viewer.alive || !target.alive) return false;
  if (viewer.faction === target.faction) return true;
  if (isStealthed(target, viewer)) return false;
  return hasLos(map, viewer, target);
}

export function meleeEnemies(unit: UnitState, units: UnitState[]) {
  const stats = UNIT_STATS[unit.type];
  return units.filter(
    (o) =>
      o.alive &&
      o.faction !== unit.faction &&
      dist(unit, o) <= stats.meleeRange + 0.01,
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
    if (!visibleTo(unit, o, map)) return false;
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
        if (!visibleTo(attacker, u, map)) return false;
        return true;
      })
      .slice(0, Math.max(0, stats.maxTargets - 1));
    for (const e of extras) ids.add(e.id);
  }
  return [...ids];
}

export function overwatchShots(
  mover: UnitState,
  from: { col: number; row: number },
  to: { col: number; row: number },
  units: UnitState[],
  map: BattleMap,
) {
  const watchers = units.filter((u) => {
    if (!u.alive || u.faction === mover.faction) return false;
    return UNIT_STATS[u.type].range > 0;
  });
  const hits: Array<{ watcherId: string; damage: number }> = [];
  const steps = Math.max(1, Math.round(dist(from, to)));
  for (let s = 1; s <= steps; s++) {
    const t = s / steps;
    const pos = {
      col: from.col + (to.col - from.col) * t,
      row: from.row + (to.row - from.row) * t,
    };
    const sample: UnitState = { ...mover, col: pos.col, row: pos.row };
    for (const w of watchers) {
      const stats = UNIT_STATS[w.type];
      if (stats.overwatchDamage <= 0) continue;
      if (dist(w, sample) > stats.range + 0.05) continue;
      if (!inArc(w, sample)) continue;
      if (!visibleTo(w, sample, map)) continue;
      hits.push({ watcherId: w.id, damage: stats.overwatchDamage });
    }
  }
  return hits;
}

export function applyDamage(units: UnitState[], id: string, amount: number) {
  return units.map((u) => {
    if (u.id !== id || !u.alive) return u;
    const hp = Math.max(0, u.hp - amount);
    return { ...u, hp, alive: hp > 0 };
  });
}
