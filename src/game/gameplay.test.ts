import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  hasLos,
  pickOverwatch,
} from "./combat.ts";
import { createBattle, selectUnit, turnExhausted, waitUnit, activationsDone, activationsCap } from "./battle.ts";
import { findPath, pathCost, blockedAt } from "./pathfinding.ts";
import { circleHitsTerrain } from "./map.ts";
import type { BattleMap, UnitState } from "./types.ts";

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
    const mover = unit({ id: "m", col: 6, row: 3, faction: "brood", type: "broodling" });
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
    assert.equal(activationsDone(state, "empire"), 0);
  });
});
