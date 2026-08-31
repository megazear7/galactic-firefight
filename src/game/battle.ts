import { pickAiAction } from "./ai";
import {
  applyDamage,
  meleeEnemies,
  pickOverwatch,
  rangedTargets,
  shotVictims,
  unitBlockers,
  unitRadius,
} from "./combat";
import { deployCols, dist, generateMap, openDeployTiles, tileToWorld } from "./map";
import { findPath, pathCost, pointAlong, reachable } from "./pathfinding";
import type {
  ActMode,
  ArmyLoadout,
  BattleState,
  Faction,
  FxEvent,
  LogLine,
  MapSize,
  PlayMode,
  PointScale,
  UnitState,
} from "./types";
import { ACTIVATIONS_PER_TURN, SAVE_VERSION } from "./types";
import { UNIT_STATS, factionUnits, leaderType } from "./units";
import { emptyMask, revealExplored } from "./vision";

let seq = 1;
function nid(prefix: string) {
  seq += 1;
  return `${prefix}-${seq.toString(36)}`;
}

function log(text: string, tone: LogLine["tone"] = "neutral"): LogLine {
  return { id: nid("log"), text, tone };
}

function fxTint(faction: Faction, kind: FxEvent["kind"]) {
  if (kind === "slash") return faction === "empire" ? "#e8e6e1" : "#c6e87a";
  if (kind === "impact") return faction === "empire" ? "#f4e4c4" : "#d7f08a";
  return faction === "empire" ? "#ffe7c2" : "#c6e87a";
}

export function spawnShotFx(
  map: BattleState["map"],
  attacker: UnitState,
  targets: UnitState[],
  kind: "ranged" | "melee" | "overwatch",
): FxEvent[] {
  const from = tileToWorld(attacker.col, attacker.row, map);
  const ay = 1.05 * UNIT_STATS[attacker.type].size;
  const tint = fxTint(attacker.faction, kind === "melee" ? "slash" : "tracer");
  const events: FxEvent[] = [];
  if (kind === "melee") {
    const t = targets[0];
    if (!t) return events;
    const to = tileToWorld(t.col, t.row, map);
    const ty = 0.95 * UNIT_STATS[t.type].size;
    events.push({
      id: nid("fx"),
      kind: "slash",
      ax: from.x,
      ay,
      az: from.z,
      bx: to.x,
      by: 1.0,
      bz: to.z,
      age: 0,
      life: 0.72,
      tint,
    });
    events.push({
      id: nid("fx"),
      kind: "impact",
      ax: to.x,
      ay: ty,
      az: to.z,
      bx: to.x,
      by: ty,
      bz: to.z,
      age: -0.08,
      life: 0.5,
      tint: fxTint(attacker.faction, "impact"),
    });
    return events;
  }
  events.push({
    id: nid("fx"),
    kind: "muzzle",
    ax: from.x,
    ay,
    az: from.z,
    bx: from.x,
    by: ay,
    bz: from.z,
    age: 0,
    life: 0.1,
    tint,
  });
  const rounds = attacker.type === "machine_gunner" ? 4 : attacker.type === "soldier" ? 2 : 1;
  targets.forEach((t, i) => {
    const to = tileToWorld(t.col, t.row, map);
    const ty = 0.95 * UNIT_STATS[t.type].size;
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const span = Math.max(0.04, Math.hypot(dx, dz));
    const flight = Math.max(0.12, Math.min(0.26, Math.hypot(dx, ty - ay, dz) * 0.048));
    const px = -dz / span;
    const pz = dx / span;
    for (let r = 0; r < rounds; r++) {
      const delay = i * 0.04 + r * 0.042;
      const side = r === 0 ? 0 : (r % 2 === 0 ? 1 : -1) * 0.035 * Math.ceil(r / 2);
      events.push({
        id: nid("fx"),
        kind: "tracer",
        ax: from.x + px * side * 0.35,
        ay: ay + (r === 0 ? 0 : 0.02),
        az: from.z + pz * side * 0.35,
        bx: to.x + px * side,
        by: ty,
        bz: to.z + pz * side,
        age: -delay,
        life: flight,
        tint,
      });
      events.push({
        id: nid("fx"),
        kind: "impact",
        ax: to.x + px * side * 0.4,
        ay: ty,
        az: to.z + pz * side * 0.4,
        bx: to.x,
        by: ty,
        bz: to.z,
        age: -(delay + flight * 0.92),
        life: 0.2,
        tint: fxTint(attacker.faction, "impact"),
      });
    }
  });
  return events;
}

export function ageFx(state: BattleState, dt: number): BattleState {
  if (!state.fx.length) return state;
  const fx = state.fx.map((f) => ({ ...f, age: f.age + dt })).filter((f) => f.age < f.life);
  return fx.length === state.fx.length && fx.every((f, i) => f.age === state.fx[i].age)
    ? state
    : { ...state, fx };
}

export function expandLoadout(loadout: ArmyLoadout, faction: Faction): UnitState["type"][] {
  const types: UnitState["type"][] = [];
  for (const t of factionUnits(faction)) {
    const n = loadout[t] ?? 0;
    for (let i = 0; i < n; i++) types.push(t);
  }
  if (types.length === 0) types.push(leaderType(faction));
  return types;
}

function placeArmy(
  types: UnitState["type"][],
  faction: Faction,
  map: BattleState["map"],
  taken: Set<string>,
  facing: number,
): UnitState[] {
  const spots = openDeployTiles(faction, map, taken);
  const mid = (map.rows - 1) / 2;
  const frontCol =
    faction === "empire" ? Math.max(...spots.map((s) => s.col), 0) : Math.min(...spots.map((s) => s.col), map.cols);
  const backCol =
    faction === "empire" ? Math.min(...spots.map((s) => s.col), map.cols) : Math.max(...spots.map((s) => s.col), 0);
  const usedRows = new Set<number>();
  const units: UnitState[] = [];
  for (let i = 0; i < types.length; i++) {
    const stats = UNIT_STATS[types[i]];
    const preferBack = stats.stealth || stats.range >= 9;
    const preferFront = stats.range === 0 || types[i] === "tyrant" || types[i] === "broodling";
    let best: (typeof spots)[number] | null = null;
    let bestScore = -Infinity;
    for (const spot of spots) {
      const key = `${spot.col},${spot.row}`;
      if (taken.has(key)) continue;
      const colWant = preferBack ? backCol : preferFront ? frontCol : (frontCol + backCol) / 2;
      const score =
        (usedRows.has(spot.row) ? 0 : 12) -
        Math.abs(spot.row - mid) * 0.15 -
        Math.abs(spot.col - colWant) * 1.4;
      if (score > bestScore) {
        bestScore = score;
        best = spot;
      }
    }
    const spot = best ?? {
      col: deployCols(faction, map)[0],
      row: Math.min(map.rows - 1, i % map.rows),
    };
    taken.add(`${spot.col},${spot.row}`);
    usedRows.add(spot.row);
    units.push({
      id: nid(types[i]),
      type: types[i],
      faction,
      col: spot.col,
      row: spot.row,
      facing,
      hp: stats.hp,
      maxHp: stats.hp,
      moved: false,
      acted: false,
      shotThisTurn: false,
      turnsSinceShot: 2,
      revealed: false,
      engagedAtTurnStart: false,
      overwatchedThisTurn: false,
      alive: true,
    });
  }
  return units;
}

function markEngaged(units: UnitState[]): UnitState[] {
  return units.map((u) => ({
    ...u,
    engagedAtTurnStart: u.alive && meleeEnemies(u, units).length > 0,
  }));
}

export function createBattle(opts: {
  seed: number;
  playerFaction: Faction;
  playerArmy: ArmyLoadout;
  enemyArmy: ArmyLoadout;
  mode: PlayMode;
  first: Faction;
  mapSize?: MapSize;
}): BattleState {
  const map = generateMap(opts.seed, opts.mapSize ?? "medium");
  const enemyFaction: Faction = opts.playerFaction === "empire" ? "brood" : "empire";
  const taken = new Set<string>();
  const playerUnits = placeArmy(
    expandLoadout(opts.playerArmy, opts.playerFaction),
    opts.playerFaction,
    map,
    taken,
    opts.playerFaction === "empire" ? 0 : Math.PI,
  );
  const enemyUnits = placeArmy(
    expandLoadout(opts.enemyArmy, enemyFaction),
    enemyFaction,
    map,
    taken,
    enemyFaction === "empire" ? 0 : Math.PI,
  );
  const units = markEngaged([...playerUnits, ...enemyUnits]);
  const firstName = opts.first === "empire" ? "Galactic Empire" : "Brood Swarm";
  const state: BattleState = {
    version: SAVE_VERSION,
    map,
    units,
    turn: opts.first,
    round: 1,
    phase: opts.mode === "single" && opts.first !== opts.playerFaction ? "enemyTurn" : "select",
    selectedId: null,
    hoverCol: null,
    hoverRow: null,
    pendingMove: null,
    pendingShot: null,
    moveProgress: 0,
    log: [log(`${firstName} has the opening volley.`, opts.first)],
    winner: null,
    playerFaction: opts.playerFaction,
    enemyFaction,
    mode: opts.mode,
    fx: [],
    explored: emptyMask(map),
    actMode: "move",
  };
  return revealExplored(state);
}

export function defaultEnemyArmy(faction: Faction, points: PointScale): ArmyLoadout {
  if (faction === "empire") {
    if (points === 100) return { captain: 1, soldier: 2, machine_gunner: 1, sniper: 1 };
    if (points === 200) return { captain: 2, soldier: 5, machine_gunner: 2, sniper: 2 };
    return { captain: 3, soldier: 6, machine_gunner: 3, sniper: 3 };
  }
  if (points === 100) return { tyrant: 1, broodling: 6, spatling: 4 };
  if (points === 200) return { tyrant: 1, broodling: 10, spatling: 10 };
  return { tyrant: 2, broodling: 10, spatling: 12 };
}

function living(state: BattleState, faction: Faction) {
  return state.units.some((u) => u.alive && u.faction === faction);
}

export function activationsDone(state: BattleState, faction = state.turn) {
  return state.units.filter((u) => u.faction === faction && u.acted).length;
}

export function activationsCap(state: BattleState, faction = state.turn) {
  const n = state.units.filter((u) => u.alive && u.faction === faction).length;
  return Math.min(ACTIVATIONS_PER_TURN, n);
}

export function turnExhausted(state: BattleState) {
  if (state.units.some((u) => u.alive && u.faction === state.turn && u.moved && !u.acted)) return false;
  if (activationsDone(state) >= ACTIVATIONS_PER_TURN) return true;
  return !state.units.some((u) => u.alive && u.faction === state.turn && !u.acted);
}

export function checkWinner(state: BattleState): BattleState {
  const emp = living(state, "empire");
  const brd = living(state, "brood");
  if (emp && brd) return state;
  const winner = emp && !brd ? "empire" : brd && !emp ? "brood" : "draw";
  const text =
    winner === "draw"
      ? "The field is silent. None remain."
      : winner === state.playerFaction
        ? "The field is yours."
        : "Your line has broken.";
  return {
    ...state,
    winner,
    phase: "gameOver",
    selectedId: null,
    pendingMove: null,
    pendingShot: null,
    log: [log(text, winner === "draw" ? "danger" : winner), ...state.log].slice(0, 40),
  };
}

function resumeSide(state: BattleState): BattleState {
  if (state.winner) return state;
  if (turnExhausted(state)) return endTurn(state);
  if (state.mode === "single" && state.turn !== state.playerFaction) {
    return { ...state, phase: "enemyTurn", selectedId: null, pendingMove: null, pendingShot: null };
  }
  return { ...state, phase: state.phase === "act" ? "act" : "select", selectedId: state.selectedId };
}

export function readyUnits(state: BattleState) {
  if (activationsDone(state) >= ACTIVATIONS_PER_TURN) return [];
  return state.units.filter((u) => u.alive && u.faction === state.turn && !u.moved && !u.acted);
}

export function unitById(state: BattleState, id: string | null) {
  return state.units.find((u) => u.id === id) ?? null;
}

export function canControl(state: BattleState) {
  if (state.phase === "moving" || state.phase === "resolving" || state.phase === "enemyTurn") {
    return false;
  }
  if (state.phase === "gameOver") return false;
  if (state.mode === "single" && state.turn !== state.playerFaction) return false;
  return true;
}

export function whyImmobile(state: BattleState, unit: UnitState): string | null {
  if (!unit.alive) return "This unit has fallen.";
  if (state.phase === "gameOver") return "The engagement is over.";
  if (unit.faction !== state.turn) return "It is not this unit's turn.";
  if (unit.acted) return "This unit has already completed its activation.";
  if (activationsDone(state) >= ACTIVATIONS_PER_TURN && !unit.moved) {
    return "This side has spent its five activations.";
  }
  if (unit.moved && !unit.acted) return "Already moved — it may still fire or strike.";
  if (state.phase === "enemyTurn") return "The opposing force is acting.";
  return null;
}

export function hoverFacing(from: { col: number; row: number }, col: number, row: number) {
  if (col === from.col && row === from.row) return 0;
  return Math.atan2(row - from.row, col - from.col);
}

export function selectUnit(state: BattleState, id: string): BattleState {
  const unit = unitById(state, id);
  if (!unit) return state;
  if (
    !canControl(state) &&
    state.phase !== "select" &&
    state.phase !== "act" &&
    state.phase !== "aimMove" &&
    state.phase !== "aimShoot"
  ) {
    return { ...state, selectedId: id };
  }
  if (unit.faction !== state.turn) {
    return { ...state, selectedId: id, phase: "select", pendingMove: null, actMode: "move" };
  }
  if (unit.moved && !unit.acted) {
    return { ...state, selectedId: id, phase: "act", pendingMove: null, actMode: "fire" };
  }
  if (unit.acted || (activationsDone(state) >= ACTIVATIONS_PER_TURN && !unit.moved)) {
    return { ...state, selectedId: id, phase: "select", pendingMove: null, actMode: "move" };
  }
  return { ...state, selectedId: id, phase: "aimMove", pendingMove: null, actMode: "move" };
}

export function setActMode(state: BattleState, mode: ActMode): BattleState {
  const unit = unitById(state, state.selectedId);
  if (!unit || unit.acted || unit.faction !== state.turn) return state;
  if (!canControl(state)) return state;
  if (mode === "move") {
    if (unit.moved) return state;
    return { ...state, actMode: "move", phase: "aimMove", pendingMove: null };
  }
  const targets = rangedTargets(unit, state.units, state.map);
  const melee = meleeEnemies(unit, state.units);
  return {
    ...state,
    actMode: "fire",
    phase: targets.length ? "aimShoot" : "act",
    pendingMove: null,
    log:
      targets.length || melee.length
        ? state.log
        : [log("No eligible targets. Toggle back to move, or wait.", "neutral"), ...state.log].slice(0, 40),
  };
}

export function chooseDestination(state: BattleState, col: number, row: number): BattleState {
  const unit = unitById(state, state.selectedId);
  if (!unit || state.phase !== "aimMove") return state;
  const stats = UNIT_STATS[unit.type];
  const blockers = unitBlockers(state.units, unit.id);
  const radius = unitRadius(unit.type);
  const path = findPath(state.map, unit, { col, row }, blockers, radius, stats.move);
  if (!path || path.length < 1) {
    return {
      ...state,
      log: [log("No path through that ground.", "neutral"), ...state.log].slice(0, 40),
    };
  }
  const dest = path[path.length - 1];
  if (dist(unit, dest) < 0.08 && dist(unit, { col, row }) > 0.45) {
    return {
      ...state,
      log: [log("That ground is blocked.", "neutral"), ...state.log].slice(0, 40),
    };
  }
  const facing = hoverFacing(unit, dest.col + Math.cos(unit.facing), dest.row + Math.sin(unit.facing));
  return {
    ...state,
    phase: "aimFacing",
    pendingMove: {
      unitId: unit.id,
      path,
      destCol: dest.col,
      destRow: dest.row,
      facing,
      overwatchDone: false,
    },
  };
}

export function updateFacing(state: BattleState, facing: number): BattleState {
  if (!state.pendingMove) return state;
  return { ...state, pendingMove: { ...state.pendingMove, facing } };
}

export function confirmMove(state: BattleState): BattleState {
  const pending = state.pendingMove;
  const unit = unitById(state, pending?.unitId ?? null);
  if (!pending || !unit) return state;
  return {
    ...state,
    phase: "moving",
    moveProgress: 0,
  };
}

export function stepMove(state: BattleState, dt: number): BattleState {
  const pending = state.pendingMove;
  const unit = unitById(state, pending?.unitId ?? null);
  if (!pending || !unit || state.phase !== "moving") return state;
  const stats = UNIT_STATS[unit.type];
  const cost = Math.max(0.28, pathCost(pending.path));
  const speed = 3.1 * stats.speed;
  let progress = state.moveProgress + (dt * speed) / cost;
  if (progress >= 1) progress = 1;

  const prev = pointAlong(pending.path, state.moveProgress);
  const now = pointAlong(pending.path, progress);

  let units = state.units.map((u) => (u.id === unit.id ? { ...u, col: now.col, row: now.row } : u));
  const lines = [...state.log];
  let fx = state.fx;
  let overwatchDone = pending.overwatchDone;

  if (!overwatchDone) {
    const span = Math.max(1, Math.ceil(dist(prev, now) * 6));
    for (let s = 1; s <= span && !overwatchDone; s++) {
      const t = s / span;
      const pos = {
        col: prev.col + (now.col - prev.col) * t,
        row: prev.row + (now.row - prev.row) * t,
      };
      const mover = { ...unit, col: pos.col, row: pos.row };
      const hit = pickOverwatch(mover, pos, units, state.map);
      if (!hit) continue;
      const watcher = units.find((u) => u.id === hit.watcherId);
      if (!watcher) continue;
      units = applyDamage(units, mover.id, hit.damage);
      units = units.map((u) => (u.id === watcher.id ? { ...u, overwatchedThisTurn: true } : u));
      lines.unshift(
        log(
          `${UNIT_STATS[watcher.type].name} overwatch (${hit.damage}) on ${UNIT_STATS[mover.type].name}.`,
          watcher.faction,
        ),
      );
      fx = [...spawnShotFx(state.map, watcher, [{ ...mover, col: pos.col, row: pos.row }], "overwatch"), ...fx];
      overwatchDone = true;
      const after = units.find((u) => u.id === unit.id)!;
      if (!after.alive) {
        lines.unshift(log(`${UNIT_STATS[mover.type].name} is cut down mid-stride.`, "danger"));
      }
    }
  }

  const live = units.find((u) => u.id === unit.id);
  if (!live?.alive) {
    const next = checkWinner({
      ...state,
      units,
      fx,
      log: lines.slice(0, 40),
      phase: "select",
      selectedId: null,
      pendingMove: null,
      moveProgress: 0,
    });
    if (next.winner) return next;
    const closed = {
      ...next,
      units: next.units.map((u) => (u.id === unit.id ? { ...u, moved: true, acted: true } : u)),
    };
    return resumeSide(closed);
  }

  if (progress < 1) {
    return revealExplored({
      ...state,
      units,
      fx,
      log: lines.slice(0, 40),
      moveProgress: progress,
      pendingMove: { ...pending, overwatchDone },
    });
  }

  units = units.map((u) =>
    u.id === unit.id
      ? {
          ...u,
          col: pending.destCol,
          row: pending.destRow,
          facing: pending.facing,
          moved: true,
        }
      : u,
  );
  return revealExplored(
    resumeSide({
      ...state,
      units,
      fx,
      log: lines.slice(0, 40),
      pendingMove: null,
      moveProgress: 0,
      selectedId: unit.id,
      phase: "act",
      actMode: "fire",
    }),
  );
}

export function skipMove(state: BattleState): BattleState {
  const unit = unitById(state, state.selectedId);
  if (!unit) return state;
  if (state.phase !== "aimMove" && state.phase !== "aimFacing") return state;
  const units = state.units.map((u) => (u.id === unit.id ? { ...u, moved: true } : u));
  return { ...state, units, phase: "act", pendingMove: null };
}

export function beginShoot(state: BattleState): BattleState {
  const unit = unitById(state, state.selectedId);
  if (!unit) return state;
  if (unit.engagedAtTurnStart) {
    return {
      ...state,
      actMode: "fire",
      log: [log("Engaged at the start of the turn — firearms are silent. Strike or wait.", "neutral"), ...state.log].slice(0, 40),
    };
  }
  const targets = rangedTargets(unit, state.units, state.map);
  if (targets.length === 0) {
    return {
      ...state,
      actMode: "fire",
      log: [log("No eligible targets in range, arc, and sight.", "neutral"), ...state.log].slice(0, 40),
    };
  }
  return { ...state, phase: "aimShoot", actMode: "fire" };
}

export function confirmShoot(state: BattleState, targetId: string): BattleState {
  if (!canControl(state)) return state;
  const unit = unitById(state, state.selectedId);
  const target = unitById(state, targetId);
  if (!unit || !target || !unit.alive || !target.alive) return state;
  if (unit.faction !== state.turn) return state;
  if (unit.faction === target.faction) return state;
  if (unit.acted) return state;
  const ids = shotVictims(unit, target, state.units, state.map);
  const victims = ids.map((id) => unitById(state, id)).filter((u): u is UnitState => !!u);
  return {
    ...state,
    phase: "resolving",
    pendingShot: { attackerId: unit.id, targetIds: ids, kind: "ranged" },
    fx: [...spawnShotFx(state.map, unit, victims, "ranged"), ...state.fx],
  };
}

export function confirmMelee(state: BattleState, targetId: string): BattleState {
  if (!canControl(state)) return state;
  const unit = unitById(state, state.selectedId);
  const target = unitById(state, targetId);
  if (!unit || !target || unit.faction !== state.turn || unit.faction === target.faction) return state;
  return {
    ...state,
    phase: "resolving",
    pendingShot: { attackerId: unit.id, targetIds: [target.id], kind: "melee" },
    fx: [...spawnShotFx(state.map, unit, [target], "melee"), ...state.fx],
  };
}

export function resolveShot(state: BattleState): BattleState {
  const shot = state.pendingShot;
  const attacker = unitById(state, shot?.attackerId ?? null);
  if (!shot || !attacker) return { ...state, phase: "select", pendingShot: null };
  const stats = UNIT_STATS[attacker.type];
  const dmg = shot.kind === "melee" ? stats.meleeDamage : stats.damage;
  let units = state.units;
  const lines = [...state.log];
  for (const id of shot.targetIds) {
    const before = units.find((u) => u.id === id);
    units = applyDamage(units, id, dmg);
    const after = units.find((u) => u.id === id);
    if (before) {
      lines.unshift(
        log(
          `${stats.name} ${shot.kind === "melee" ? "strikes" : "fires on"} ${UNIT_STATS[before.type].name} for ${dmg}.`,
          attacker.faction,
        ),
      );
      if (after && !after.alive) {
        lines.unshift(log(`${UNIT_STATS[before.type].name} is destroyed.`, "danger"));
      }
    }
  }
  units = units.map((u) => {
    if (u.id !== attacker.id) return u;
    return {
      ...u,
      acted: true,
      moved: true,
      shotThisTurn: shot.kind !== "melee",
      turnsSinceShot: shot.kind === "melee" ? u.turnsSinceShot : 0,
      revealed: stats.stealth ? shot.kind !== "melee" : u.revealed,
    };
  });
  const next = checkWinner({
    ...state,
    units,
    log: lines.slice(0, 40),
    phase: "select",
    pendingShot: null,
    selectedId: null,
  });
  if (next.winner) return next;
  return revealExplored(resumeSide(next));
}

export function waitUnit(state: BattleState): BattleState {
  const unit = unitById(state, state.selectedId);
  if (!unit) return state;
  const units = state.units.map((u) =>
    u.id === unit.id ? { ...u, moved: true, acted: true } : u,
  );
  const next = { ...state, units, phase: "select" as const, selectedId: null, pendingMove: null };
  return resumeSide(next);
}

export function endTurn(state: BattleState): BattleState {
  const nextTurn: Faction = state.turn === "empire" ? "brood" : "empire";
  const finishing = state.turn;
  const units = markEngaged(
    state.units.map((u) => {
      const stealth = UNIT_STATS[u.type].stealth;
      const turnsSinceShot = u.shotThisTurn ? 0 : u.turnsSinceShot + 1;
      return {
        ...u,
        moved: false,
        acted: false,
        shotThisTurn: false,
        turnsSinceShot,
        overwatchedThisTurn: u.faction === finishing ? false : u.overwatchedThisTurn,
        revealed: stealth ? (u.shotThisTurn ? true : turnsSinceShot < 1) : false,
      };
    }),
  );
  const name = nextTurn === "empire" ? "Galactic Empire" : "Brood Swarm";
  const enemyPhase =
    state.mode === "single" && nextTurn !== state.playerFaction ? "enemyTurn" : "select";
  return {
    ...state,
    units,
    turn: nextTurn,
    round: nextTurn === "empire" ? state.round + 1 : state.round,
    phase: enemyPhase,
    selectedId: null,
    pendingMove: null,
    pendingShot: null,
    actMode: "move",
    log: [log(`${name} — five activations.`, nextTurn), ...state.log].slice(0, 40),
  };
}

export function applyAiIntent(state: BattleState): BattleState {
  if (state.phase !== "enemyTurn") return state;
  if (turnExhausted(state)) return endTurn(state);
  const intent = pickAiAction(state);
  if (!intent) return endTurn(state);
  if (intent.kind === "wait") {
    const units = state.units.map((u) =>
      u.id === intent.unitId ? { ...u, moved: true, acted: true } : u,
    );
    return resumeSide({ ...state, units, selectedId: null, phase: "select" });
  }
  if (intent.kind === "shoot") {
    const withSel = { ...state, selectedId: intent.unitId, phase: "act" as const };
    return confirmShoot(withSel, intent.targetId);
  }
  if (intent.kind === "melee") {
    const withSel = { ...state, selectedId: intent.unitId, phase: "act" as const };
    return confirmMelee(withSel, intent.targetId);
  }
  const unit = unitById(state, intent.unitId);
  if (!unit) return waitUnit({ ...state, selectedId: intent.unitId });
  const blockers = unitBlockers(state.units, unit.id);
  const path = findPath(
    state.map,
    unit,
    { col: intent.col, row: intent.row },
    blockers,
    unitRadius(unit.type),
    UNIT_STATS[unit.type].move,
  );
  if (!path) {
    const units = state.units.map((u) =>
      u.id === unit.id ? { ...u, facing: intent.facing, moved: true } : u,
    );
    return resumeSide({ ...state, units, selectedId: unit.id, phase: "act" });
  }
  const dest = path[path.length - 1];
  return {
    ...state,
    selectedId: unit.id,
    phase: "moving",
    moveProgress: 0,
    pendingMove: {
      unitId: unit.id,
      path,
      destCol: dest.col,
      destRow: dest.row,
      facing: intent.facing,
      overwatchDone: false,
    },
  };
}

export function worldOf(unit: { col: number; row: number }, map: BattleState["map"]) {
  return tileToWorld(unit.col, unit.row, map);
}

export function previewPath(state: BattleState, unit: UnitState, col: number, row: number) {
  return findPath(
    state.map,
    unit,
    { col, row },
    unitBlockers(state.units, unit.id),
    unitRadius(unit.type),
    UNIT_STATS[unit.type].move,
  );
}

export function reachablePoints(state: BattleState, unit: UnitState) {
  return reachable(
    state.map,
    unit,
    UNIT_STATS[unit.type].move,
    unitBlockers(state.units, unit.id),
    unitRadius(unit.type),
  );
}

export { dist };
