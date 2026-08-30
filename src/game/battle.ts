import { pickAiAction } from "./ai";
import {
  applyDamage,
  meleeEnemies,
  occupiedSet,
  overwatchShots,
  rangedTargets,
  shotVictims,
} from "./combat";
import { deployCols, dist, generateMap, openDeployTiles, tileToWorld } from "./map";
import { findPath, pathCost, reachable, stringPull } from "./pathfinding";
import type {
  ArmyLoadout,
  BattleState,
  Faction,
  LogLine,
  PlayMode,
  PointScale,
  UnitState,
} from "./types";
import { SAVE_VERSION } from "./types";
import { UNIT_STATS, factionUnits, leaderType } from "./units";

let seq = 1;
function nid(prefix: string) {
  seq += 1;
  return `${prefix}-${seq.toString(36)}`;
}

function log(text: string, tone: LogLine["tone"] = "neutral"): LogLine {
  return { id: nid("log"), text, tone };
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
}): BattleState {
  const map = generateMap(opts.seed);
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
  return {
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
  };
}

export function defaultEnemyArmy(faction: Faction, points: PointScale): ArmyLoadout {
  if (faction === "empire") {
    if (points === 100) return { captain: 1, soldier: 5, machine_gunner: 1, sniper: 1 };
    if (points === 200) return { captain: 2, soldier: 8, machine_gunner: 2, sniper: 2 };
    return { captain: 3, soldier: 10, machine_gunner: 3, sniper: 3 };
  }
  if (points === 100) return { tyrant: 1, broodling: 10, spatling: 6 };
  if (points === 200) return { tyrant: 1, broodling: 16, spatling: 15 };
  return { tyrant: 2, broodling: 20, spatling: 14 };
}

function living(state: BattleState, faction: Faction) {
  return state.units.some((u) => u.alive && u.faction === faction);
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
  if (state.mode === "single" && state.turn !== state.playerFaction) {
    return { ...state, phase: "enemyTurn", selectedId: null, pendingMove: null, pendingShot: null };
  }
  return { ...state, phase: state.phase === "act" ? "act" : "select", selectedId: state.selectedId };
}

export function readyUnits(state: BattleState) {
  return state.units.filter((u) => u.alive && u.faction === state.turn && !u.moved);
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
  if (unit.moved && unit.acted) return "This unit has already completed its activation.";
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
  if (!canControl(state) && state.phase !== "select" && state.phase !== "act" && state.phase !== "aimMove") {
    return { ...state, selectedId: id };
  }
  if (unit.faction !== state.turn) return { ...state, selectedId: id, phase: "select", pendingMove: null };
  if (unit.moved && !unit.acted) {
    return { ...state, selectedId: id, phase: "act", pendingMove: null };
  }
  if (unit.moved && unit.acted) return { ...state, selectedId: id, phase: "select", pendingMove: null };
  return { ...state, selectedId: id, phase: "aimMove", pendingMove: null };
}

export function chooseDestination(state: BattleState, col: number, row: number): BattleState {
  const unit = unitById(state, state.selectedId);
  if (!unit || state.phase !== "aimMove") return state;
  const stats = UNIT_STATS[unit.type];
  const occ = occupiedSet(state.units, unit.id);
  const reach = reachable(state.map, unit, stats.move, occ);
  if (!reach.has(`${col},${row}`)) return state;
  const path = findPath(state.map, unit, { col, row }, occ, stats.move);
  if (!path) return state;
  const facing = hoverFacing(path[path.length - 1] ?? unit, col + 1, row);
  return {
    ...state,
    phase: "aimFacing",
    pendingMove: {
      unitId: unit.id,
      path: stringPull(state.map, path),
      destCol: col,
      destRow: row,
      facing,
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
  const cost = Math.max(0.35, pathCost(pending.path));
  const speed = 2.8 * stats.speed;
  let progress = state.moveProgress + (dt * speed) / cost;
  if (progress >= 1) progress = 1;

  const t = progress * (pending.path.length - 1);
  const i = Math.min(pending.path.length - 2, Math.floor(t));
  const local = t - i;
  const a = pending.path[i];
  const b = pending.path[i + 1] ?? a;
  const col = a.col + (b.col - a.col) * local;
  const row = a.row + (b.row - a.row) * local;

  const crossed: Array<{ from: { col: number; row: number }; to: { col: number; row: number } }> = [];
  const prevWhole = Math.floor(state.moveProgress * (pending.path.length - 1) + 1e-6);
  const nextWhole = Math.floor(progress * (pending.path.length - 1) + 1e-6);
  for (let k = prevWhole + 1; k <= nextWhole; k++) {
    const from = pending.path[Math.max(0, k - 1)];
    const to = pending.path[k];
    if (from && to) crossed.push({ from, to });
  }

  let units = state.units.map((u) => (u.id === unit.id ? { ...u, col, row } : u));
  const lines = [...state.log];
  for (const step of crossed) {
    const mover = units.find((u) => u.id === unit.id)!;
    const shots = overwatchShots(mover, step.from, step.to, units, state.map);
    for (const s of shots) {
      const watcher = units.find((u) => u.id === s.watcherId);
      if (!watcher) continue;
      units = applyDamage(units, mover.id, s.damage);
      const after = units.find((u) => u.id === mover.id)!;
      lines.unshift(
        log(
          `${UNIT_STATS[watcher.type].name} overwatch (${s.damage}) on ${UNIT_STATS[mover.type].name}.`,
          watcher.faction,
        ),
      );
      if (!after.alive) {
        lines.unshift(log(`${UNIT_STATS[mover.type].name} is cut down mid-stride.`, "danger"));
        break;
      }
    }
  }

  const live = units.find((u) => u.id === unit.id);
  if (!live?.alive) {
    const next = checkWinner({
      ...state,
      units,
      log: lines.slice(0, 40),
      phase: "select",
      selectedId: null,
      pendingMove: null,
      moveProgress: 0,
    });
    if (next.winner) return next;
    return resumeSide(next);
  }

  if (progress < 1) {
    return { ...state, units, log: lines.slice(0, 40), moveProgress: progress };
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
  return resumeSide({
    ...state,
    units,
    log: lines.slice(0, 40),
    pendingMove: null,
    moveProgress: 0,
    selectedId: unit.id,
    phase: "act",
  });
}

export function skipMove(state: BattleState): BattleState {
  const unit = unitById(state, state.selectedId);
  if (!unit) return state;
  const units = state.units.map((u) => (u.id === unit.id ? { ...u, moved: true } : u));
  return { ...state, units, phase: "act", pendingMove: null };
}

export function beginShoot(state: BattleState): BattleState {
  const unit = unitById(state, state.selectedId);
  if (!unit) return state;
  if (unit.engagedAtTurnStart) {
    return {
      ...state,
      log: [log("Engaged at the start of the turn — firearms are silent. Strike or wait.", "neutral"), ...state.log].slice(0, 40),
    };
  }
  const targets = rangedTargets(unit, state.units, state.map);
  if (targets.length === 0) {
    return {
      ...state,
      log: [log("No eligible targets in range, arc, and sight.", "neutral"), ...state.log].slice(0, 40),
    };
  }
  return { ...state, phase: "aimShoot" };
}

export function confirmShoot(state: BattleState, targetId: string): BattleState {
  const unit = unitById(state, state.selectedId);
  const target = unitById(state, targetId);
  if (!unit || !target) return state;
  const ids = shotVictims(unit, target, state.units, state.map);
  return {
    ...state,
    phase: "resolving",
    pendingShot: { attackerId: unit.id, targetIds: ids, kind: "ranged" },
  };
}

export function confirmMelee(state: BattleState, targetId: string): BattleState {
  const unit = unitById(state, state.selectedId);
  const target = unitById(state, targetId);
  if (!unit || !target) return state;
  return {
    ...state,
    phase: "resolving",
    pendingShot: { attackerId: unit.id, targetIds: [target.id], kind: "melee" },
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
  if (!next.units.some((u) => u.alive && u.faction === next.turn && (!u.moved || !u.acted))) {
    return endTurn(next);
  }
  return resumeSide(next);
}

export function waitUnit(state: BattleState): BattleState {
  const unit = unitById(state, state.selectedId);
  if (!unit) return state;
  const units = state.units.map((u) =>
    u.id === unit.id ? { ...u, moved: true, acted: true } : u,
  );
  const next = { ...state, units, phase: "select" as const, selectedId: null, pendingMove: null };
  if (!next.units.some((u) => u.alive && u.faction === next.turn && (!u.moved || !u.acted))) {
    return endTurn(next);
  }
  return resumeSide(next);
}

export function endTurn(state: BattleState): BattleState {
  const nextTurn: Faction = state.turn === "empire" ? "brood" : "empire";
  const units = markEngaged(
    state.units.map((u) => {
      const stealth = UNIT_STATS[u.type].stealth;
      const turnsSinceShot = u.shotThisTurn ? 0 : u.turnsSinceShot + 1;
      const revealed = stealth ? !(turnsSinceShot >= 1) && u.revealed && u.shotThisTurn : false;
      return {
        ...u,
        moved: false,
        acted: false,
        shotThisTurn: false,
        turnsSinceShot,
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
    log: [log(`${name} — your activation.`, nextTurn), ...state.log].slice(0, 40),
  };
}

export function applyAiIntent(state: BattleState): BattleState {
  if (state.phase !== "enemyTurn") return state;
  const intent = pickAiAction(state);
  if (!intent) return endTurn(state);
  if (intent.kind === "wait") {
    const units = state.units.map((u) =>
      u.id === intent.unitId ? { ...u, moved: true, acted: true } : u,
    );
    const next = { ...state, units, selectedId: null };
    if (!next.units.some((u) => u.alive && u.faction === next.turn && (!u.moved || !u.acted))) {
      return endTurn(next);
    }
    return { ...next, phase: "enemyTurn" };
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
  const occ = occupiedSet(state.units, unit.id);
  const path = findPath(state.map, unit, { col: intent.col, row: intent.row }, occ, UNIT_STATS[unit.type].move);
  if (!path) {
    const units = state.units.map((u) =>
      u.id === unit.id ? { ...u, facing: intent.facing, moved: true } : u,
    );
    const next = { ...state, units, selectedId: unit.id };
    if (!next.units.some((u) => u.alive && u.faction === next.turn && (!u.moved || !u.acted))) {
      return endTurn(next);
    }
    return { ...next, phase: "enemyTurn" as const };
  }
  return {
    ...state,
    selectedId: unit.id,
    phase: "moving",
    moveProgress: 0,
    pendingMove: {
      unitId: unit.id,
      path: stringPull(state.map, path),
      destCol: intent.col,
      destRow: intent.row,
      facing: intent.facing,
    },
  };
}

export function worldOf(unit: { col: number; row: number }, map: BattleState["map"]) {
  return tileToWorld(unit.col, unit.row, map);
}

export function reachableTiles(state: BattleState, unit: UnitState) {
  return reachable(state.map, unit, UNIT_STATS[unit.type].move, occupiedSet(state.units, unit.id));
}

export { dist };
