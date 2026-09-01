import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  hasLos,
  inArc,
  pickOverwatch,
  sightHorizon,
} from "./combat.ts";
import { createBattle, confirmShoot, selectUnit, deselectUnit, setActMode, chooseDestination, confirmMove, stepMove, turnExhausted, waitUnit, activationsDone, activationsCap, beginHotseat, endTurn, canControl } from "./battle.ts";
import { UNIT_STATS, isFaction, unitSpecials } from "./units.ts";
import { MAP_SLOT_CAP } from "./types.ts";
import { findPath, pathCost, blockedAt } from "./pathfinding.ts";
import { circleHitsTerrain, dist, generateMap, idx, MAP_DIMS } from "./map.ts";
import { visionMask } from "./vision.ts";
import { hasUnitModel, pickModelUrl, unitPose } from "./models.ts";
import { allGameAssetUrls } from "./preload.ts";
import type { BattleMap, BattleState, UnitState } from "./types.ts";

function floorMap(cols = 8, rows = 8): BattleMap {
  return {
    cols,
    rows,
    tiles: Array.from({ length: cols * rows }, () => "floor" as const),
    seed: 1,
  };
}

function setTile(map: BattleMap, col: number, row: number, kind: BattleMap["tiles"][number]) {
  map.tiles[row * map.cols + col] = kind;
}

function unit(partial: Partial<UnitState> & Pick<UnitState, "id" | "col" | "row">): UnitState {
  return {
    type: "soldier",
    faction: "empire",
    playerId: "p-host",
    team: 1,
    color: 0,
    facing: 0,
    hp: 9,
    maxHp: 9,
    moved: false,
    acted: false,
    shotThisTurn: false,
    turnsSinceShot: 2,
    revealed: false,
    engagedAtTurnStart: false,
    overwatchedThisTurn: false,
    alive: true,
    ...partial,
  };
}

function samplePathClear(map: BattleMap, path: { col: number; row: number }[], blockers: { col: number; row: number; radius: number }[], radius: number) {
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    const len = Math.hypot(b.col - a.col, b.row - a.row);
    const steps = Math.max(4, Math.ceil(len * 12));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const col = a.col + (b.col - a.col) * t;
      const row = a.row + (b.row - a.row) * t;
      assert.equal(
        blockedAt(map, col, row, blockers, radius),
        false,
        `path clips at ${col.toFixed(2)},${row.toFixed(2)}`,
      );
    }
  }
}

describe("pathfinding", () => {
  it("routes around a wall instead of walking through it", () => {
    const map = floorMap(10, 8);
    for (let r = 0; r < 8; r++) {
      if (r === 5) continue;
      setTile(map, 4, r, "wall");
    }
    const start = { col: 1.2, row: 2.4 };
    const goal = { col: 7.35, row: 2.1 };
    const path = findPath(map, start, goal, [], 0.3, 12);
    assert.ok(path && path.length >= 2);
    samplePathClear(map, path, [], 0.3);
    const dest = path[path.length - 1];
    assert.ok(Math.abs(dest.col - goal.col) < 0.12, `dest col ${dest.col} vs ${goal.col}`);
    assert.ok(Math.abs(dest.row - goal.row) < 0.12, `dest row ${dest.row} vs ${goal.row}`);
    assert.ok(
      path.some((p) => p.row > 4.2 && p.col > 3 && p.col < 5.2),
      "should detour through the gap near row 5",
    );
  });

  it("keeps the exact clicked point when it is walkable", () => {
    const map = floorMap();
    const goal = { col: 3.35, row: 5.2 };
    const path = findPath(map, { col: 1, row: 5 }, goal, [], 0.3, 6);
    assert.ok(path);
    const dest = path[path.length - 1];
    assert.ok(Math.abs(dest.col - 3.35) < 0.02);
    assert.ok(Math.abs(dest.row - 5.2) < 0.02);
  });

  it("does not cut the corner of two diagonal walls", () => {
    const map = floorMap();
    setTile(map, 2, 1, "wall");
    setTile(map, 1, 2, "wall");
    const path = findPath(map, { col: 1, row: 1 }, { col: 2, row: 2 }, [], 0.3, 6);
    assert.ok(path);
    samplePathClear(map, path, [], 0.3);
    assert.equal(circleHitsTerrain(map, 1.5, 1.5, 0.3), true);
    const cost = pathCost(path);
    assert.ok(cost > 1.55, `diagonal sneak cost ${cost}`);
  });

  it("walks around another unit", () => {
    const map = floorMap();
    const blocker = { col: 3, row: 3, radius: 0.3 };
    const path = findPath(map, { col: 1, row: 3 }, { col: 5.2, row: 3 }, [blocker], 0.3, 6);
    assert.ok(path && path.length >= 2);
    samplePathClear(map, path, [blocker], 0.3);
    const dest = path[path.length - 1];
    assert.ok(Math.abs(dest.col - 5.2) < 0.12);
  });

  it("stops at move range when the click is farther than the unit can walk", () => {
    const map = floorMap(16, 8);
    const path = findPath(map, { col: 1, row: 3 }, { col: 14, row: 3 }, [], 0.3, 5);
    assert.ok(path);
    const cost = pathCost(path);
    assert.ok(cost <= 5.2, `cost ${cost}`);
    assert.ok(cost > 4.4, `should spend the budget, got ${cost}`);
    const dest = path[path.length - 1];
    assert.ok(dest.col < 8, "should not teleport past move range");
  });
});

describe("line of sight", () => {
  it("blocks ranged fire through terrain", () => {
    const map = floorMap();
    setTile(map, 4, 3, "wall");
    assert.equal(hasLos(map, { col: 1, row: 3 }, { col: 7, row: 3 }, [], []), false);
    assert.equal(hasLos(map, { col: 1, row: 1 }, { col: 3, row: 1 }, [], []), true);
  });

  it("blocks ranged fire through another unit", () => {
    const map = floorMap();
    const body = unit({ id: "body", col: 4, row: 3, type: "soldier" });
    assert.equal(hasLos(map, { col: 1, row: 3 }, { col: 7, row: 3 }, [body], []), false);
    assert.equal(hasLos(map, { col: 1, row: 3 }, { col: 7, row: 3 }, [], []), true);
  });
});

describe("overwatch", () => {
  it("picks the closest eligible watcher and skips those who already overwatched", () => {
    const map = floorMap();
    const mover = unit({ id: "m", col: 6, row: 3, faction: "brood", type: "broodling", team: 2, playerId: "p-ai", color: 1 });
    const far = unit({
      id: "far",
      col: 0.4,
      row: 1.4,
      facing: 0,
      type: "soldier",
      faction: "empire",
    });
    const close = unit({
      id: "close",
      col: 3.1,
      row: 4.3,
      facing: 0,
      type: "soldier",
      faction: "empire",
    });
    const hit = pickOverwatch(mover, { col: 6, row: 3 }, [mover, far, close], map);
    assert.equal(hit?.watcherId, "close");

    const closeSpent = { ...close, overwatchedThisTurn: true };
    const second = pickOverwatch(mover, { col: 6, row: 3 }, [mover, far, closeSpent], map);
    assert.equal(second?.watcherId, "far");

    const both = [mover, { ...far, overwatchedThisTurn: true }, closeSpent];
    assert.equal(pickOverwatch(mover, { col: 6, row: 3 }, both, map), null);
  });
});

describe("firing arcs", () => {
  it("uses 180° for soldiers and 60° for snipers and machine gunners", () => {
    assert.equal(UNIT_STATS.soldier.arc, 180);
    assert.equal(UNIT_STATS.sniper.arc, 60);
    assert.equal(UNIT_STATS.machine_gunner.arc, 60);
  });

  it("clips the sight overlay to the unit firing arc", () => {
    const map = floorMap(20, 20);
    const sniper = unit({ id: "s", type: "sniper", col: 10, row: 10, facing: 0 });
    const pts = sightHorizon(sniper, map, [sniper], 12, 48);
    assert.ok(pts.length >= 8);
    for (const p of pts) {
      if (dist(sniper, p) < 0.25) continue;
      assert.equal(inArc(sniper, p), true, `ray ${p.col.toFixed(2)},${p.row.toFixed(2)} outside 60° arc`);
    }
  });
});

describe("map size", () => {
  it("builds small, medium, and large fields", () => {
    const small = generateMap(4, "small");
    const medium = generateMap(4, "medium");
    const large = generateMap(4, "large");
    assert.equal(small.cols, MAP_DIMS.small.cols);
    assert.equal(small.rows, MAP_DIMS.small.rows);
    assert.equal(medium.cols, 32);
    assert.equal(medium.rows, 24);
    assert.equal(large.cols, MAP_DIMS.large.cols);
    assert.equal(large.rows, MAP_DIMS.large.rows);
    assert.equal(small.tiles.length, small.cols * small.rows);
    assert.equal(large.tiles.length, large.cols * large.rows);
  });
});

describe("fire/move toggle", () => {
  it("defaults to move and can toggle fire without spending the move", () => {
    let state = createBattle({
      seed: 3,
      playerFaction: "empire",
      playerArmy: { captain: 1, soldier: 3 },
      enemyArmy: { tyrant: 1, broodling: 4, spatling: 2 },
      mode: "single",
      first: "empire",
    });
    const u = state.units.find((x) => x.alive && x.faction === "empire" && !x.acted);
    assert.ok(u);
    state = selectUnit(state, u.id);
    assert.equal(state.phase, "aimMove");
    assert.equal(state.actMode, "move");
    state = setActMode(state, "fire");
    assert.equal(state.actMode, "fire");
    const afterFire = state.units.find((x) => x.id === u.id);
    assert.equal(afterFire?.moved, false);
    assert.equal(afterFire?.acted, false);
    state = setActMode(state, "move");
    assert.equal(state.phase, "aimMove");
    assert.equal(state.actMode, "move");
  });

  it("selects attack targets after moving if any are in range", () => {
    let state = createBattle({
      seed: 3,
      playerFaction: "empire",
      playerArmy: { captain: 1, soldier: 3 },
      enemyArmy: { tyrant: 1, broodling: 4, spatling: 2 },
      mode: "single",
      first: "empire",
    });
    const soldier = state.units.find((x) => x.alive && x.type === "soldier" && x.faction === "empire");
    const prey = state.units.find((x) => x.alive && x.faction === "brood");
    assert.ok(soldier && prey);
    const col = Math.min(soldier.col, state.map.cols - 6);
    const row = Math.max(2, Math.min(state.map.rows - 3, soldier.row));
    state = {
      ...state,
      map: {
        ...state.map,
        tiles: state.map.tiles.map((kind, i) => {
          const c = i % state.map.cols;
          const r = Math.floor(i / state.map.cols);
          if (r === row && c >= col && c <= col + 5) return "floor";
          return kind;
        }),
      },
      units: state.units.map((u) => {
        if (u.id === soldier.id) return { ...u, col, row, facing: 0 };
        if (u.id === prey.id) return { ...u, col: col + 4, row, facing: Math.PI };
        return u;
      }),
    };
    state = selectUnit(state, soldier.id);
    state = chooseDestination(state, col + 1, row);
    assert.equal(state.phase, "aimFacing");
    state = confirmMove(state);
    for (let i = 0; i < 40 && state.phase === "moving"; i++) {
      state = stepMove(state, 1);
    }
    assert.equal(state.actMode, "fire");
    assert.equal(state.phase, "aimShoot");
    assert.equal(state.selectedId, soldier.id);
  });

  it("stays in act after a move when nothing is in range", () => {
    let state = createBattle({
      seed: 3,
      playerFaction: "empire",
      playerArmy: { captain: 1, soldier: 3 },
      enemyArmy: { tyrant: 1, broodling: 4, spatling: 2 },
      mode: "single",
      first: "empire",
    });
    const soldier = state.units.find((x) => x.alive && x.type === "soldier" && x.faction === "empire");
    assert.ok(soldier);
    const col = Math.min(soldier.col, 2);
    const row = Math.max(2, Math.min(state.map.rows - 3, soldier.row));
    state = {
      ...state,
      map: {
        ...state.map,
        tiles: state.map.tiles.map((kind, i) => {
          const c = i % state.map.cols;
          const r = Math.floor(i / state.map.cols);
          if (r === row && c >= 0 && c <= 4) return "floor";
          return kind;
        }),
      },
      units: state.units.map((u) => {
        if (u.id === soldier.id) return { ...u, col, row, facing: 0 };
        if (u.faction === "brood") return { ...u, col: state.map.cols - 2, row: u.row };
        return u;
      }),
    };
    state = selectUnit(state, soldier.id);
    state = chooseDestination(state, col + 1, row);
    state = confirmMove(state);
    for (let i = 0; i < 40 && state.phase === "moving"; i++) {
      state = stepMove(state, 1);
    }
    assert.equal(state.actMode, "fire");
    assert.equal(state.phase, "act");
  });

  it("deselects a unit and cancels an unconfirmed move", () => {
    let state = createBattle({
      seed: 3,
      playerFaction: "empire",
      playerArmy: { captain: 1, soldier: 3 },
      enemyArmy: { tyrant: 1, broodling: 4, spatling: 2 },
      mode: "single",
      first: "empire",
    });
    const u = state.units.find((x) => x.alive && x.faction === "empire" && !x.acted);
    assert.ok(u);
    state = selectUnit(state, u.id);
    assert.equal(state.selectedId, u.id);
    state = deselectUnit(state);
    assert.equal(state.selectedId, null);
    assert.equal(state.phase, "select");
    assert.equal(state.pendingMove, null);
  });

  it("does not fire when it is not the player's turn", () => {
    let state = createBattle({
      seed: 5,
      playerFaction: "empire",
      playerArmy: { captain: 1, soldier: 2 },
      enemyArmy: { tyrant: 1, spatling: 3, broodling: 2 },
      mode: "single",
      first: "brood",
    });
    assert.equal(state.phase, "enemyTurn");
    const shooter = state.units.find((x) => x.alive && x.playerId === state.playerId && UNIT_STATS[x.type].range > 0);
    const victim = state.units.find((x) => x.alive && x.team !== shooter?.team);
    assert.ok(shooter && victim);
    state = { ...state, selectedId: shooter.id, actMode: "fire" };
    const next = confirmShoot(state, victim.id);
    assert.equal(next.phase, "enemyTurn");
    assert.equal(next.pendingShot, null);
  });
});

describe("lobby slots", () => {
  it("caps players by map size", () => {
    assert.equal(MAP_SLOT_CAP.small, 4);
    assert.equal(MAP_SLOT_CAP.medium, 6);
    assert.equal(MAP_SLOT_CAP.large, 8);
  });
});

describe("hotseat", () => {
  it("holds the board until the next local player starts their turn", () => {
    let state = createBattle({
      seed: 9,
      mapSize: "small",
      participants: [
        {
          id: "p-host",
          kind: "human",
          name: "Host",
          faction: "empire",
          team: 1,
          color: 0,
          army: { captain: 1, soldier: 1 },
          ready: true,
          host: true,
        },
        {
          id: "p-two",
          kind: "local",
          name: "Guest",
          faction: "brood",
          team: 2,
          color: 1,
          army: { tyrant: 1, broodling: 2 },
          ready: true,
          host: false,
        },
      ],
      localPlayerId: "p-host",
      teamOrder: [1, 2],
    });
    assert.ok(state.hotseatPending);
    assert.equal(state.hotseatPending?.playerId, "p-host");
    state = beginHotseat(state);
    assert.equal(state.hotseatPending, null);
    assert.equal(state.playerId, "p-host");
    state = endTurn(state);
    assert.ok(state.hotseatPending);
    assert.equal(state.hotseatPending?.playerId, "p-two");
    assert.equal(canControl(state), false);
    state = beginHotseat(state);
    assert.equal(state.playerId, "p-two");
    assert.equal(state.turnTeam, 2);
  });
});

function visOf(map: BattleMap, u: UnitState, extras: UnitState[] = []) {
  return visionMask(
    {
      map,
      units: [u, ...extras],
      participants: [],
      playerId: u.playerId,
    } as unknown as BattleState,
    u.team,
  );
}

describe("fog of war", () => {
  it("reveals a wall you are looking at, including diagonally", () => {
    const map = floorMap(12, 8);
    setTile(map, 6, 3, "wall");
    setTile(map, 5, 5, "structure");
    const viewer = unit({ id: "v", col: 3, row: 3, type: "soldier" });
    const vis = visOf(map, viewer);
    assert.equal(vis[idx(6, 3, map.cols)], true, "front wall should be visible");
    assert.equal(vis[idx(5, 5, map.cols)], true, "diagonal structure should be visible");
  });

  it("reveals the rest of a terrain cluster once its front face is seen", () => {
    const map = floorMap(12, 8);
    setTile(map, 6, 3, "wall");
    setTile(map, 7, 3, "wall");
    setTile(map, 6, 4, "wall");
    const viewer = unit({ id: "v", col: 3, row: 3, type: "soldier" });
    const vis = visOf(map, viewer);
    assert.equal(vis[idx(6, 3, map.cols)], true);
    assert.equal(vis[idx(7, 3, map.cols)], true, "depth behind the front face");
    assert.equal(vis[idx(6, 4, map.cols)], true, "adjacent mass of the same obstacle");
  });

  it("does not reveal terrain behind a blocking wall", () => {
    const map = floorMap(14, 8);
    setTile(map, 5, 3, "wall");
    setTile(map, 10, 3, "wall");
    const viewer = unit({ id: "v", col: 2, row: 3, type: "soldier" });
    const vis = visOf(map, viewer);
    assert.equal(vis[idx(5, 3, map.cols)], true);
    assert.equal(vis[idx(10, 3, map.cols)], false);
  });

  it("reveals tiles around the player army and hides the far edge", () => {
    const state = createBattle({
      seed: 11,
      playerFaction: "empire",
      playerArmy: { captain: 1, soldier: 2 },
      enemyArmy: { tyrant: 1, broodling: 4 },
      mode: "single",
      first: "empire",
    });
    assert.equal(state.map.cols, 32);
    assert.equal(state.map.rows, 24);
    const seen = state.explored.filter(Boolean).length;
    assert.ok(seen > 8, `expected starting vision, got ${seen}`);
    assert.ok(seen < state.explored.length * 0.85, "should not reveal the whole map at start");
    const far = (state.map.rows - 1) * state.map.cols + (state.map.cols - 1);
    assert.equal(state.explored[far], false);
  });
});

describe("activations", () => {
  it("caps a side at five activations then ends the turn", () => {
    let state = createBattle({
      seed: 7,
      playerFaction: "empire",
      playerArmy: { captain: 1, soldier: 5, machine_gunner: 1, sniper: 1 },
      enemyArmy: { tyrant: 1, broodling: 6, spatling: 2 },
      mode: "single",
      first: "empire",
    });
    const living = state.units.filter((u) => u.alive && u.faction === "empire").length;
    assert.ok(living > 5);
    assert.equal(activationsCap(state), 5);
    for (let i = 0; i < 5; i++) {
      const u = state.units.find((x) => x.alive && x.faction === "empire" && !x.acted);
      assert.ok(u, `missing ready unit at ${i}`);
      state = waitUnit(selectUnit(state, u.id));
    }
    assert.equal(state.turn, "brood");
    assert.equal(turnExhausted(state), false);
    assert.equal(activationsDone(state, 1), 0);
  });
});

describe("force codex", () => {
  it("lists faction slugs and unit specials", () => {
    assert.equal(isFaction("empire"), true);
    assert.equal(isFaction("brood"), true);
    assert.equal(isFaction("pirates"), false);
    assert.ok(unitSpecials(UNIT_STATS.sniper).some((s) => s.startsWith("Stealth")));
    assert.ok(unitSpecials(UNIT_STATS.broodling).includes("Melee only"));
    assert.ok(unitSpecials(UNIT_STATS.tyrant).some((s) => s.startsWith("Burst")));
  });
});

describe("unit models", () => {
  it("uses empire soldier glTF clips and falls back when a unit has none", () => {
    assert.equal(hasUnitModel("soldier", "empire"), true);
    assert.equal(hasUnitModel("captain", "empire"), false);
    assert.equal(hasUnitModel("soldier", "brood"), false);
    const idle = pickModelUrl("soldier", "empire", "idle", "u-1");
    assert.ok(idle?.endsWith(".glb"));
    assert.match(idle ?? "", /empire-soldier-idle-/);
    assert.equal(unitPose({ id: "a", alive: true }, { phase: "select", pendingMove: null, pendingShot: null }), "idle");
    assert.equal(
      unitPose(
        { id: "a", alive: true },
        { phase: "moving", pendingMove: { unitId: "a" }, pendingShot: null },
      ),
      "move",
    );
    assert.equal(unitPose({ id: "a", alive: false }, { phase: "select", pendingMove: null, pendingShot: null }), "dead");
  });

  it("preloads audio, models, and sprites before a match", () => {
    const urls = allGameAssetUrls();
    assert.ok(urls.some((u) => u.endsWith("ambience.mp3")));
    assert.ok(urls.some((u) => u.includes("empire-soldier-idle-01.glb")));
    assert.ok(urls.some((u) => u.endsWith("/assets/units/soldier.png")));
    assert.ok(urls.some((u) => u.includes("empire-soldier-ranged-attack-01.mp3")));
  });
});
