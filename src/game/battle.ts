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
import { dist, generateMap, teamDeployTiles, tileToWorld } from "./map";
import { devicePlayers, isDevicePlayer, playable, shuffleTeams } from "./lobby";
import { findPath, pathCost, pointAlong, reachable } from "./pathfinding";
import type {
  ActMode,
  ArmyLoadout,
  BattleState,
  Faction,
  FxEvent,
  LogLine,
  MapSize,
  Participant,
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
  participant: Participant,
  map: BattleState["map"],
  taken: Set<string>,
  spots: Array<{ col: number; row: number; facing: number }>,
  facing: number,
): UnitState[] {
  const units: UnitState[] = [];
  let cursor = 0;
  for (let i = 0; i < types.length; i++) {
    const stats = UNIT_STATS[types[i]];
    let spot = spots[cursor];
    while (spot && taken.has(`${spot.col},${spot.row}`)) {
      cursor += 1;
      spot = spots[cursor];
    }
    if (!spot) {
      spot = { col: 1, row: Math.min(map.rows - 1, i), facing };
    }
    taken.add(`${spot.col},${spot.row}`);
    cursor += 1;
    units.push({
      id: nid(types[i]),
      type: types[i],
      faction: participant.faction,
      playerId: participant.id,
      team: participant.team,
      color: participant.color,
      col: spot.col,
      row: spot.row,
      facing: spot.facing ?? facing,
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

export function localParticipant(state: BattleState) {
  return state.participants.find((p) => p.id === state.playerId) ?? state.participants.find((p) => p.host) ?? null;
}

export function hotseatActive(state: BattleState) {
  return devicePlayers(state.participants).length >= 2;
}

function deviceOnTeam(state: BattleState, team: number) {
  return devicePlayers(state.participants).filter((p) => p.team === team);
}

function nextDeviceOnTeam(state: BattleState, exceptId: string) {
  return deviceOnTeam(state, state.turnTeam).find((p) => {
    if (p.id === exceptId) return false;
    return state.units.some((u) => u.alive && u.playerId === p.id && !u.acted);
  });
}

export function foes(a: { team: number }, b: { team: number }) {
  return a.team !== b.team;
}

function markEngaged(units: UnitState[]): UnitState[] {
  return units.map((u) => ({
    ...u,
    engagedAtTurnStart: u.alive && meleeEnemies(u, units).length > 0,
  }));
}

export function createBattle(opts: {
  seed: number;
  playerFaction?: Faction;
  playerArmy?: ArmyLoadout;
  enemyArmy?: ArmyLoadout;
  mode?: PlayMode;
  first?: Faction;
  mapSize?: MapSize;
  participants?: Participant[];
  localPlayerId?: string;
  teamOrder?: number[];
}): BattleState {
  const playerFaction = opts.playerFaction ?? "empire";
  const enemyFaction: Faction = playerFaction === "empire" ? "brood" : "empire";
  const participants =
    opts.participants?.filter(playable) ??
    ([
      {
        id: "p-host",
        kind: "human" as const,
        name: "You",
        faction: playerFaction,
        team: 1,
        color: 0,
        army: opts.playerArmy ?? { captain: 1, soldier: 2 },
        ready: true,
        host: true,
      },
      {
        id: "p-ai",
        kind: "ai" as const,
        name: "Opponent",
        faction: enemyFaction,
        team: 2,
        color: 1,
        army: opts.enemyArmy ?? defaultEnemyArmy(enemyFaction, 100),
        ready: true,
        host: false,
      },
    ] satisfies Participant[]);
  const teams = [...new Set(participants.map((p) => p.team))];
  const teamOrder =
    opts.teamOrder && opts.teamOrder.length
      ? opts.teamOrder
      : opts.first
        ? opts.first === enemyFaction
          ? [2, 1].filter((t) => teams.includes(t)).concat(teams.filter((t) => t !== 1 && t !== 2))
          : [1, 2].filter((t) => teams.includes(t)).concat(teams.filter((t) => t !== 1 && t !== 2))
        : shuffleTeams(teams, opts.seed);
  const localPlayerId = opts.localPlayerId ?? participants.find((p) => p.kind === "human")?.id ?? participants[0].id;
  const local = participants.find((p) => p.id === localPlayerId) ?? participants[0];
  const map = generateMap(opts.seed, opts.mapSize ?? "medium");
  const taken = new Set<string>();
  const units: UnitState[] = [];
  const grouped = new Map<number, Participant[]>();
  for (const p of participants) {
    const list = grouped.get(p.team) ?? [];
    list.push(p);
    grouped.set(p.team, list);
  }
  const teamList = [...grouped.keys()];
  for (const team of teamList) {
    const members = grouped.get(team) ?? [];
    const pocket = teamDeployTiles(map, teamList.indexOf(team), teamList.length, taken);
    for (const member of members) {
      const placed = placeArmy(
        expandLoadout(member.army, member.faction),
        member,
        map,
        taken,
        pocket.spots,
        pocket.facing,
      );
      units.push(...placed);
    }
  }
  const firstTeam = teamOrder[0] ?? teams[0];
  const firstPart = participants.find((p) => p.team === firstTeam);
  const firstFaction = firstPart?.faction ?? playerFaction;
  const localOnFirst = local.team === firstTeam;
  const state: BattleState = {
    version: SAVE_VERSION,
    map,
    units: markEngaged(units),
    turn: firstFaction,
    turnTeam: firstTeam,
    teamOrder,
    participants,
    playerId: local.id,
    round: 1,
    phase: localOnFirst ? "select" : "enemyTurn",
    selectedId: null,
    hoverCol: null,
    hoverRow: null,
    pendingMove: null,
    pendingShot: null,
    moveProgress: 0,
    log: [log(`Team ${firstTeam} has the opening volley.`, firstFaction)],
    winner: null,
    playerFaction: local.faction,
    enemyFaction,
    mode: opts.mode ?? (participants.some((p) => p.kind === "human" && !p.host) ? "multi" : "single"),
    fx: [],
    explored: emptyMask(map),
    actMode: "move",
    hotseatPending: null,
  };
  const firstLocal = deviceOnTeam(state, firstTeam)[0];
  if (hotseatActive(state) && firstLocal) {
    return revealExplored({
      ...state,
      playerId: firstLocal.id,
      playerFaction: firstLocal.faction,
      hotseatPending: { playerId: firstLocal.id, name: firstLocal.name, color: firstLocal.color },
    });
  }
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

function livingTeams(state: BattleState) {
  return [...new Set(state.units.filter((u) => u.alive).map((u) => u.team))];
}

export function activationsDone(state: BattleState, team = state.turnTeam) {
  return state.units.filter((u) => u.team === team && u.acted).length;
}

export function activationsCap(state: BattleState, team = state.turnTeam) {
  const n = state.units.filter((u) => u.alive && u.team === team).length;
  return Math.min(ACTIVATIONS_PER_TURN, n);
}

export function turnExhausted(state: BattleState) {
  if (state.units.some((u) => u.alive && u.team === state.turnTeam && u.moved && !u.acted)) return false;
  if (activationsDone(state) >= ACTIVATIONS_PER_TURN) return true;
  return !state.units.some((u) => u.alive && u.team === state.turnTeam && !u.acted);
}

export function checkWinner(state: BattleState): BattleState {
  const teams = livingTeams(state);
  if (teams.length > 1) return state;
  const winner = teams.length === 1 ? teams[0] : "draw";
  const local = localParticipant(state);
  const text =
    winner === "draw"
      ? "The field is silent. None remain."
      : local && winner === local.team
        ? "The field is yours."
        : "Your line has broken.";
  const tone = winner === "draw" ? "danger" : state.units.find((u) => u.team === winner)?.faction ?? "neutral";
  return {
    ...state,
    winner,
    phase: "gameOver",
    selectedId: null,
    pendingMove: null,
    pendingShot: null,
    log: [log(text, tone), ...state.log].slice(0, 40),
  };
}

function teamIsLocal(state: BattleState, team = state.turnTeam) {
  return deviceOnTeam(state, team).length > 0;
}

function resumeSide(state: BattleState): BattleState {
  if (state.winner) return state;
  if (turnExhausted(state)) return endTurn(state);
  if (!teamIsLocal(state)) {
    return { ...state, phase: "enemyTurn", selectedId: null, pendingMove: null, pendingShot: null };
  }
  return { ...state, phase: state.phase === "act" ? "act" : "select", selectedId: state.selectedId };
}

function enterFireAfterMove(state: BattleState): BattleState {
  if (state.phase !== "act" && state.phase !== "select") return state;
  const unit = unitById(state, state.selectedId);
  if (!unit?.alive || unit.acted) return state;
  if (rangedTargets(unit, state.units, state.map).length) {
    return { ...state, actMode: "fire", phase: "aimShoot" };
  }
  return { ...state, actMode: "fire", phase: "act" };
}

export function readyUnits(state: BattleState) {
  if (activationsDone(state) >= ACTIVATIONS_PER_TURN) return [];
  const me = localParticipant(state);
  return state.units.filter((u) => {
    if (!u.alive || u.team !== state.turnTeam || u.moved || u.acted) return false;
    if (me && u.playerId !== me.id) return false;
    return true;
  });
}

export function unitById(state: BattleState, id: string | null) {
  return state.units.find((u) => u.id === id) ?? null;
}

export function canControl(state: BattleState) {
  if (state.hotseatPending) return false;
  if (state.phase === "moving" || state.phase === "resolving" || state.phase === "enemyTurn") {
    return false;
  }
  if (state.phase === "gameOver") return false;
  const me = localParticipant(state);
  return Boolean(me && isDevicePlayer(me) && me.team === state.turnTeam);
}

export function whyImmobile(state: BattleState, unit: UnitState): string | null {
  if (!unit.alive) return "This unit has fallen.";
  if (state.phase === "gameOver") return "The engagement is over.";
  if (unit.team !== state.turnTeam) return "It is not this unit's turn.";
  const me = localParticipant(state);
  if (me && unit.playerId !== me.id) return "That unit belongs to another commander.";
  if (unit.acted) return "This unit has already completed its activation.";
  if (activationsDone(state) >= ACTIVATIONS_PER_TURN && !unit.moved) {
    return "This side has spent its five activations.";
  }
  if (unit.moved && !unit.acted) return "Already moved — it may still fire or strike.";
  if (state.phase === "enemyTurn") return "Another team is acting.";
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
  if (unit.team !== state.turnTeam || (localParticipant(state)?.id && unit.playerId !== localParticipant(state)?.id)) {
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

export function deselectUnit(state: BattleState): BattleState {
  if (!state.selectedId) return state;
  if (state.phase === "moving" || state.phase === "resolving") return state;
  return {
    ...state,
    selectedId: null,
    pendingMove: null,
    phase: state.phase === "enemyTurn" || state.phase === "gameOver" ? state.phase : "select",
    actMode: "move",
  };
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
  return enterFireAfterMove(
    revealExplored(
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
    ),
  );
}

export function skipMove(state: BattleState): BattleState {
  const unit = unitById(state, state.selectedId);
  if (!unit) return state;
  if (state.phase !== "aimMove" && state.phase !== "aimFacing") return state;
  const units = state.units.map((u) => (u.id === unit.id ? { ...u, moved: true } : u));
  return enterFireAfterMove({ ...state, units, phase: "act", pendingMove: null, actMode: "fire" });
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
  const unit = unitById(state, state.selectedId);
  const target = unitById(state, targetId);
  if (!unit || !target || !unit.alive || !target.alive) return state;
  if (unit.team !== state.turnTeam || unit.team === target.team) return state;
  if (unit.acted) return state;
  if (state.phase === "gameOver" || state.phase === "moving" || state.phase === "resolving") return state;
  if (state.phase === "enemyTurn") {
    const owner = state.participants.find((p) => p.id === unit.playerId);
    if (owner?.kind !== "ai") return state;
  } else if (!canControl(state)) return state;
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
  const unit = unitById(state, state.selectedId);
  const target = unitById(state, targetId);
  if (!unit || !target) return state;
  if (unit.team !== state.turnTeam || unit.team === target.team) return state;
  if (state.phase === "enemyTurn") {
    const owner = state.participants.find((p) => p.id === unit.playerId);
    if (owner?.kind !== "ai") return state;
  } else if (!canControl(state)) return state;
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

export function beginHotseat(state: BattleState): BattleState {
  const hold = state.hotseatPending;
  if (!hold) return state;
  const p = state.participants.find((x) => x.id === hold.playerId);
  return {
    ...state,
    hotseatPending: null,
    playerId: hold.playerId,
    playerFaction: p?.faction ?? state.playerFaction,
    selectedId: null,
    pendingMove: null,
    actMode: "move",
    phase: "select",
  };
}

export function endTurn(state: BattleState): BattleState {
  if (state.hotseatPending) return state;
  const me = localParticipant(state);
  if (me && isDevicePlayer(me) && me.team === state.turnTeam && activationsDone(state) < activationsCap(state)) {
    const nextLocal = nextDeviceOnTeam(state, me.id);
    if (nextLocal && hotseatActive(state)) {
      return {
        ...state,
        selectedId: null,
        pendingMove: null,
        actMode: "move",
        phase: "select",
        hotseatPending: { playerId: nextLocal.id, name: nextLocal.name, color: nextLocal.color },
        log: [log(`Pass the device to ${nextLocal.name}.`, "neutral"), ...state.log].slice(0, 40),
      };
    }
  }
  const finishing = state.turnTeam;
  const order = (state.teamOrder.length ? state.teamOrder : livingTeams(state)).filter((t) =>
    state.units.some((u) => u.alive && u.team === t),
  );
  const idx = Math.max(0, order.indexOf(finishing));
  const nextIdx = order.length ? (idx + 1) % order.length : 0;
  const nextTeam = order[nextIdx] ?? finishing;
  const wrapped = nextIdx === 0;
  const nextFaction = state.participants.find((p) => p.team === nextTeam)?.faction ?? state.turn;
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
        overwatchedThisTurn: u.team === finishing ? false : u.overwatchedThisTurn,
        revealed: stealth ? (u.shotThisTurn ? true : turnsSinceShot < 1) : false,
      };
    }),
  );
  const locals = deviceOnTeam({ ...state, units }, nextTeam);
  const nextLocal = locals[0];
  const enemyPhase = nextLocal ? "select" : "enemyTurn";
  const hold =
    nextLocal && hotseatActive(state)
      ? { playerId: nextLocal.id, name: nextLocal.name, color: nextLocal.color }
      : null;
  return {
    ...state,
    units,
    turn: nextFaction,
    turnTeam: nextTeam,
    round: wrapped ? state.round + 1 : state.round,
    phase: enemyPhase,
    playerId: nextLocal?.id ?? state.playerId,
    playerFaction: nextLocal?.faction ?? state.playerFaction,
    selectedId: null,
    pendingMove: null,
    pendingShot: null,
    actMode: "move",
    hotseatPending: hold,
    log: [
      log(
        hold ? `Pass the device to ${hold.name}.` : `Team ${nextTeam} — five activations.`,
        nextFaction,
      ),
      ...state.log,
    ].slice(0, 40),
  };
}

export function applyAiIntent(state: BattleState): BattleState {
  if (state.hotseatPending) return state;
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
    const withSel = { ...state, selectedId: intent.unitId };
    return confirmShoot(withSel, intent.targetId);
  }
  if (intent.kind === "melee") {
    const withSel = { ...state, selectedId: intent.unitId };
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
