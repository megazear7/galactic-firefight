import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  hasLos,
  hasTerrainLos,
  inArc,
  meleeEnemies,
  pickOverwatch,
  rangedTargets,
  sightHorizon,
} from "./combat.ts";
import {
  createBattle,
  confirmShoot,
  selectUnit,
  deselectUnit,
  setActMode,
  chooseDestination,
  confirmMove,
  stepMove,
  turnExhausted,
  waitUnit,
  activationsDone,
  activationsCap,
  beginHotseat,
  endTurn,
  canControl,
  localParticipant,
} from "./battle.ts";
import { UNIT_STATS, isFaction, unitSpecials } from "./units.ts";
import { MAP_SLOT_CAP } from "./types.ts";
import { findPath, pathCost, blockedAt } from "./pathfinding.ts";
import { circleHitsTerrain, dist, generateMap, idx, isBlocked, MAP_DIMS } from "./map.ts";
import { enemyVisible, visionMask } from "./vision.ts";
import {
  hasClip,
  hasDeathClip,
  hasUnitModel,
  pickModelUrl,
  rosterModelUrls,
  unitModelSet,
  unitPose,
} from "./models.ts";
import { allGameAssetUrls, bootAssetUrls } from "./preload.ts";
import type { BattleMap, BattleState, UnitState } from "./types.ts";

function floorMap(cols = 8, rows = 8): BattleMap {
  return {
    cols,
    rows,
    tiles: Array.from({ length: cols * rows }, () => "floor" as const),
    seed: 1,
    theme: "spaceship" as const,
    blobs: [],
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

function samplePathClear(
  map: BattleMap,
  path: { col: number; row: number }[],
  blockers: { col: number; row: number; radius: number }[],
  radius: number,
) {
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

  it("charges double through difficult terrain unless the unit has Fleet", () => {
    const map = floorMap(14, 6);
    for (let c = 3; c <= 9; c++) setTile(map, c, 3, "difficult");
    const start = { col: 1, row: 3 };
    const goal = { col: 11, row: 3 };
    const slow = findPath(map, start, goal, [], 0.3, 20, false);
    const fleet = findPath(map, start, goal, [], 0.3, 20, true);
    assert.ok(slow && fleet);
    const geo = pathCost(slow);
    const hard = pathCost(slow, map, false);
    const easy = pathCost(fleet, map, true);
    assert.ok(hard > geo * 1.35, `difficult cost ${hard} vs geometric ${geo}`);
    assert.ok(Math.abs(easy - geo) < 0.35, `fleet should pay geometric, got ${easy} vs ${geo}`);
  });
});

describe("line of sight", () => {
  it("blocks ranged fire through terrain", () => {
    const map = floorMap();
    setTile(map, 4, 3, "wall");
    assert.equal(hasLos(map, { col: 1, row: 3 }, { col: 7, row: 3 }, [], []), false);
    assert.equal(hasLos(map, { col: 1, row: 1 }, { col: 3, row: 1 }, [], []), true);
  });

  it("blocks shots through difficult debris but not through doors", () => {
    const map = floorMap();
    setTile(map, 4, 3, "difficult");
    assert.equal(hasLos(map, { col: 1, row: 3 }, { col: 7, row: 3 }), false);
    setTile(map, 4, 3, "door");
    assert.equal(hasLos(map, { col: 1, row: 3 }, { col: 7, row: 3 }), true);
    assert.equal(blockedAt(map, 4, 3, [], 0.3), false);
    setTile(map, 4, 3, "wall");
    assert.equal(hasLos(map, { col: 1, row: 3 }, { col: 7, row: 3 }), false);
    assert.equal(blockedAt(map, 4, 3, [], 0.3), true);
  });

  it("blocks ranged fire through another unit", () => {
    const map = floorMap();
    const body = unit({ id: "body", col: 4, row: 3, type: "soldier" });
    assert.equal(hasLos(map, { col: 1, row: 3 }, { col: 7, row: 3 }, [body], []), false);
    assert.equal(hasLos(map, { col: 1, row: 3 }, { col: 7, row: 3 }, [], []), true);
  });

  it("does not let unit bodies block spotting", () => {
    const map = floorMap();
    const body = unit({ id: "body", col: 4, row: 3, type: "soldier" });
    assert.equal(hasTerrainLos(map, { col: 1, row: 3 }, { col: 7, row: 3 }), true);
    assert.equal(hasLos(map, { col: 1, row: 3 }, { col: 7, row: 3 }, [body], [], false), true);
  });
});

describe("overwatch", () => {
  it("picks the closest eligible watcher and skips those who already overwatched", () => {
    const map = floorMap();
    const mover = unit({
      id: "m",
      col: 6,
      row: 3,
      faction: "brood",
      type: "broodling",
      team: 2,
      playerId: "p-ai",
      color: 1,
    });
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
      assert.equal(
        inArc(sniper, p),
        true,
        `ray ${p.col.toFixed(2)},${p.row.toFixed(2)} outside 60° arc`,
      );
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

  it("tilts clutter density without emptying or filling the field", () => {
    const sparse = generateMap(11, "medium", { density: 1, size: 2 });
    const packed = generateMap(11, "medium", { density: 3, size: 2 });
    const blocked = (map: BattleMap) => map.tiles.filter((t) => t !== "floor").length;
    const a = blocked(sparse);
    const b = blocked(packed);
    assert.ok(b > a, `packed ${b} should beat sparse ${a}`);
    assert.ok(a > 8, "sparse still has cover");
    assert.ok(b < sparse.tiles.length * 0.55, "packed still leaves room to walk");
  });

  it("tilts toward larger masses while still mixing sizes", () => {
    const small = generateMap(11, "medium", { density: 2, size: 1 });
    const large = generateMap(11, "medium", { density: 2, size: 3 });
    const maxBlob = (map: BattleMap) => {
      const seen = new Set<number>();
      let best = 0;
      for (let i = 0; i < map.tiles.length; i++) {
        if (map.tiles[i] === "floor" || seen.has(i)) continue;
        let n = 0;
        const stack = [i];
        seen.add(i);
        while (stack.length) {
          const k = stack.pop()!;
          n++;
          const c = k % map.cols;
          const r = Math.floor(k / map.cols);
          for (const [dc, dr] of [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ] as const) {
            const nc = c + dc;
            const nr = r + dr;
            if (nc < 0 || nr < 0 || nc >= map.cols || nr >= map.rows) continue;
            const j = nr * map.cols + nc;
            if (seen.has(j) || map.tiles[j] === "floor") continue;
            seen.add(j);
            stack.push(j);
          }
        }
        if (n > best) best = n;
      }
      return best;
    };
    assert.ok(maxBlob(large) > maxBlob(small), "large bias should make bigger masses");
    assert.ok(maxBlob(small) >= 1);
  });

  it("stamps overlapping circular infestation masses", () => {
    const ship = generateMap(21, "medium", { density: 2, size: 2, theme: "spaceship" });
    const hive = generateMap(21, "medium", { density: 2, size: 3, theme: "infestation" });
    assert.equal(ship.theme, "spaceship");
    assert.equal(ship.blobs.length, 0);
    assert.equal(hive.theme, "infestation");
    assert.ok(hive.blobs.length >= 6, `expected nests, got ${hive.blobs.length}`);
    let overlap = false;
    for (let i = 0; i < hive.blobs.length && !overlap; i++) {
      for (let j = i + 1; j < hive.blobs.length; j++) {
        const a = hive.blobs[i];
        const b = hive.blobs[j];
        if (dist(a, b) < a.radius + b.radius - 0.25) {
          overlap = true;
          break;
        }
      }
    }
    assert.equal(overlap, true, "nests should overlap");
    const blocked = hive.tiles.filter((t) => t !== "floor").length;
    assert.ok(blocked > 10);
    assert.ok(blocked < hive.tiles.length * 0.6);
  });

  it("builds wartorn fields with debris, walls, and doors", () => {
    const map = generateMap(8, "medium", { density: 2, size: 2, theme: "wartorn" });
    assert.equal(map.theme, "wartorn");
    assert.ok(map.tiles.includes("difficult"), "debris fields");
    assert.ok(map.tiles.includes("wall"), "straight walls");
    assert.ok(map.tiles.includes("door"), "doors in some walls");
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
    const soldier = state.units.find(
      (x) => x.alive && x.type === "soldier" && x.faction === "empire",
    );
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
    const soldier = state.units.find(
      (x) => x.alive && x.type === "soldier" && x.faction === "empire",
    );
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
    const shooter = state.units.find(
      (x) => x.alive && x.playerId === state.playerId && UNIT_STATS[x.type].range > 0,
    );
    const victim = state.units.find((x) => x.alive && x.team !== shooter?.team);
    assert.ok(shooter && victim);
    state = { ...state, selectedId: shooter.id, actMode: "fire" };
    const next = confirmShoot(state, victim.id);
    assert.equal(next.phase, "enemyTurn");
    assert.equal(next.pendingShot, null);
  });
});

describe("shooting restrictions", () => {
  it("uses the expanded engagement distance without expanding melee reach", () => {
    const shooter = unit({ id: "shooter", col: 0, row: 0 });
    const enemy = unit({ id: "enemy", col: 1.9, row: 0, faction: "brood", team: 2 });
    const units = [shooter, enemy];
    assert.equal(meleeEnemies(shooter, units).length, 0);
    assert.equal(rangedTargets(shooter, units, floorMap()).length, 0);
  });

  it("keeps a unit from shooting for the turn after it starts engaged", () => {
    const shooter = unit({ id: "shooter", col: 0, row: 0, engagedAtTurnStart: true, moved: true });
    const enemy = unit({ id: "enemy", col: 4, row: 0, faction: "brood", team: 2 });
    assert.equal(rangedTargets(shooter, [shooter, enemy], floorMap()).length, 0);
  });

  it("does not shoot an enemy engaged with a friendly unit", () => {
    const shooter = unit({ id: "shooter", col: 4, row: 0 });
    const friendly = unit({ id: "friendly", col: 0, row: 1.9 });
    const enemy = unit({ id: "enemy", col: 0, row: 0, faction: "brood", team: 2 });
    assert.equal(rangedTargets(shooter, [shooter, friendly, enemy], floorMap()).length, 0);
  });

  it("halves range after moving except for the captain's Assault pistol", () => {
    const enemy = unit({ id: "enemy", col: 4, row: 0, faction: "brood", team: 2 });
    const soldier = unit({ id: "soldier", col: 0, row: 0, moved: true });
    const captain = unit({ id: "captain", type: "captain", col: 0, row: 0, moved: true });
    assert.equal(rangedTargets(soldier, [soldier, enemy], floorMap()).length, 0);
    assert.equal(rangedTargets(captain, [captain, enemy], floorMap()).length, 1);
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

  it("lets an authenticated joined human control their active team", () => {
    const state = createBattle({
      seed: 12,
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
          id: "p-guest",
          kind: "human",
          name: "Guest",
          faction: "brood",
          team: 2,
          color: 1,
          army: { tyrant: 1, broodling: 2 },
          ready: true,
          host: false,
        },
      ],
      localPlayerId: "p-guest",
      teamOrder: [2, 1],
      mode: "multi",
    });
    assert.equal(state.playerId, "p-guest");
    assert.equal(state.turnTeam, 2);
    assert.equal(state.phase, "select");
    assert.equal(canControl(state), true);
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
  it("never falls back to the host view for an online player", () => {
    const map = floorMap(16, 10);
    const host = unit({ id: "host-unit", col: 1, row: 1, playerId: "p-host", team: 1 });
    const guest = unit({ id: "guest-unit", col: 14, row: 8, playerId: "p-guest", team: 2 });
    const state = {
      map,
      units: [host, guest],
      participants: [
        {
          id: "p-host",
          kind: "human",
          name: "Host",
          team: 1,
          color: 0,
          faction: "empire",
          host: true,
        },
        {
          id: "p-guest",
          kind: "human",
          name: "Guest",
          team: 2,
          color: 1,
          faction: "brood",
          host: false,
        },
      ],
      playerId: "p-missing",
      mode: "multi",
      explored: Array(map.cols * map.rows).fill(false),
    } as unknown as BattleState;
    assert.equal(localParticipant(state), null);
    const vis = visionMask({ ...state, playerId: "p-guest" }, 2);
    assert.equal(enemyVisible({ ...state, playerId: "p-guest" }, guest, vis), true);
    assert.equal(enemyVisible({ ...state, playerId: "p-guest" }, host, vis), false);
  });

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

  it("reveals the interior of an infestation mass once you can see around it", () => {
    const map = generateMap(21, "medium", { density: 2, size: 3, theme: "infestation" });
    const blob = map.blobs.filter((b) => b.radius >= 1.6).sort((a, b) => b.radius - a.radius)[0];
    assert.ok(blob, "expected a sizable hive mass");
    let floor: { col: number; row: number } | null = null;
    const reach = blob.radius + 1.4;
    for (let row = 0; row < map.rows && !floor; row++) {
      for (let col = 0; col < map.cols; col++) {
        if (isBlocked(map, col, row)) continue;
        const d = dist({ col, row }, blob);
        if (d > blob.radius + 0.35 && d < reach) {
          floor = { col, row };
          break;
        }
      }
    }
    assert.ok(floor, "expected open ground beside the mass");
    const viewer = unit({ id: "v", col: floor.col, row: floor.row, type: "soldier" });
    const vis = visOf(map, viewer);
    const cc = Math.max(0, Math.min(map.cols - 1, Math.round(blob.col)));
    const rr = Math.max(0, Math.min(map.rows - 1, Math.round(blob.row)));
    assert.equal(vis[idx(cc, rr, map.cols)], true, "hive interior should be spotted");
  });

  it("spots a tyrant in the open even though its body is large", () => {
    const map = floorMap(16, 10);
    const viewer = unit({ id: "v", col: 2, row: 5, type: "soldier", team: 1 });
    const tyrant = unit({
      id: "t",
      col: 6,
      row: 5,
      type: "tyrant",
      faction: "brood",
      team: 2,
      playerId: "p-ai",
      color: 1,
    });
    const state = {
      map,
      units: [viewer, tyrant],
      participants: [],
      playerId: viewer.playerId,
    } as unknown as BattleState;
    const vis = visionMask(state, 1);
    assert.equal(vis[idx(6, 5, map.cols)], true, "tile under the tyrant is spotted");
    assert.equal(enemyVisible(state, tyrant, vis), true);
  });

  it("spots an enemy standing behind another unit, but shots are still blocked", () => {
    const map = floorMap(16, 10);
    const viewer = unit({ id: "v", col: 1, row: 5, type: "soldier", team: 1 });
    const cover = unit({
      id: "cover",
      col: 4,
      row: 5,
      type: "soldier",
      faction: "brood",
      team: 2,
      playerId: "p-ai",
      color: 1,
    });
    const tyrant = unit({
      id: "t",
      col: 7,
      row: 5,
      type: "tyrant",
      faction: "brood",
      team: 2,
      playerId: "p-ai",
      color: 1,
    });
    const state = {
      map,
      units: [viewer, cover, tyrant],
      participants: [],
      playerId: viewer.playerId,
    } as unknown as BattleState;
    const vis = visionMask(state, 1);
    assert.equal(enemyVisible(state, cover, vis), true);
    assert.equal(enemyVisible(state, tyrant, vis), true);
    assert.equal(
      hasLos(map, viewer, tyrant, [viewer, cover, tyrant], [viewer.id, tyrant.id]),
      false,
      "the broodling still blocks the shot",
    );
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
  it("allows every living unit to activate before ending the turn", () => {
    let state = createBattle({
      seed: 7,
      playerFaction: "empire",
      playerArmy: { captain: 1, soldier: 5, machine_gunner: 1, sniper: 1 },
      enemyArmy: { tyrant: 1, broodling: 6, spatling: 2 },
      mode: "single",
      first: "empire",
    });
    const living = state.units.filter((u) => u.alive && u.faction === "empire").length;
    assert.equal(activationsCap(state), living);
    for (let i = 0; i < living; i++) {
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
    assert.ok(unitSpecials(UNIT_STATS.broodling).some((s) => s.startsWith("Fleet")));
    assert.ok(unitSpecials(UNIT_STATS.tyrant).some((s) => s.startsWith("Burst")));
  });
});

describe("unit models", () => {
  it("uses empire soldier glTF clips and falls back when a unit has none", () => {
    assert.equal(hasUnitModel("soldier", "empire"), true);
    assert.equal(hasUnitModel("captain", "empire"), true);
    assert.equal(hasUnitModel("soldier", "brood"), false);
    const idle = pickModelUrl("soldier", "empire", "idle", "u-1");
    assert.ok(idle?.endsWith(".glb"));
    assert.match(idle ?? "", /empire-soldier-idle-/);
    assert.equal(
      unitPose({ id: "a", alive: true }, { phase: "select", pendingMove: null, pendingShot: null }),
      "idle",
    );
    assert.equal(
      unitPose(
        { id: "a", alive: true },
        { phase: "moving", pendingMove: { unitId: "a" }, pendingShot: null },
      ),
      "move",
    );
    assert.equal(
      unitPose(
        { id: "a", alive: false },
        { phase: "select", pendingMove: null, pendingShot: null },
      ),
      "dead",
    );
    const soldier = {
      id: "a",
      alive: true as const,
      type: "soldier" as const,
      faction: "empire" as const,
    };
    assert.equal(
      unitPose(soldier, {
        phase: "resolving",
        pendingMove: null,
        pendingShot: { attackerId: "a", kind: "ranged" },
      }),
      "reload",
    );
    assert.equal(
      unitPose(soldier, {
        phase: "resolving",
        pendingMove: null,
        pendingShot: { attackerId: "a", kind: "melee" },
      }),
      "melee",
    );
    assert.match(pickModelUrl("soldier", "empire", "melee", "u-1") ?? "", /empire-soldier-melee-/);
    const captain = {
      id: "c",
      alive: true as const,
      type: "captain" as const,
      faction: "empire" as const,
    };
    assert.equal(
      unitPose(captain, {
        phase: "resolving",
        pendingMove: null,
        pendingShot: { attackerId: "c", kind: "ranged" },
      }),
      "ranged",
    );
    assert.equal(
      unitPose(captain, {
        phase: "resolving",
        pendingMove: null,
        pendingShot: { attackerId: "c", kind: "melee" },
      }),
      "melee",
    );
    assert.match(
      pickModelUrl("captain", "empire", "idle_special", "u-1") ?? "",
      /empire-captain-idle-special-/,
    );
    assert.match(
      pickModelUrl("captain", "empire", "ranged", "u-1") ?? "",
      /empire-captain-ranged-/,
    );
    assert.equal(hasUnitModel("sniper", "empire"), true);
    assert.equal(hasUnitModel("machine_gunner", "empire"), true);
    assert.equal(hasDeathClip("machine_gunner", "empire"), false);
    assert.equal(hasClip("soldier", "empire", "dead"), true);
    assert.match(
      pickModelUrl("machine_gunner", "empire", "move", "u-1") ?? "",
      /machine-gunner\.glb/,
    );
    assert.match(
      pickModelUrl("machine_gunner", "empire", "melee", "u-1") ?? "",
      /machine-gunner\.glb/,
    );
    const sniper = {
      id: "s",
      alive: true as const,
      type: "sniper" as const,
      faction: "empire" as const,
    };
    assert.equal(
      unitPose(sniper, {
        phase: "resolving",
        pendingMove: null,
        pendingShot: { attackerId: "s", kind: "ranged" },
      }),
      "ranged",
    );
    assert.equal(
      unitPose(sniper, {
        phase: "resolving",
        pendingMove: null,
        pendingShot: { attackerId: "s", kind: "melee" },
      }),
      "melee",
    );
    assert.equal(hasUnitModel("broodling", "brood"), true);
    assert.equal(hasUnitModel("broodling", "empire"), false);
    const broodling = {
      id: "b",
      alive: true as const,
      type: "broodling" as const,
      faction: "brood" as const,
    };
    assert.equal(
      unitPose(broodling, {
        phase: "resolving",
        pendingMove: null,
        pendingShot: { attackerId: "b", kind: "melee" },
      }),
      "melee",
    );
    assert.equal(
      unitPose(broodling, {
        phase: "resolving",
        pendingMove: null,
        pendingShot: { attackerId: "b", kind: "ranged" },
      }),
      "idle",
    );
    assert.match(pickModelUrl("broodling", "brood", "idle", "u-1") ?? "", /swarm-broodling-idle-/);
    assert.match(pickModelUrl("broodling", "brood", "move", "u-1") ?? "", /swarm-broodling-move-/);
    assert.match(
      pickModelUrl("broodling", "brood", "melee", "u-1") ?? "",
      /swarm-broodling-melee-/,
    );
    assert.match(pickModelUrl("broodling", "brood", "dead", "u-1") ?? "", /swarm-broodling-dead-/);
    assert.equal(hasUnitModel("spatling", "brood"), true);
    assert.equal(hasUnitModel("spatling", "empire"), false);
    const spatling = {
      id: "p",
      alive: true as const,
      type: "spatling" as const,
      faction: "brood" as const,
    };
    assert.equal(
      unitPose(spatling, {
        phase: "resolving",
        pendingMove: null,
        pendingShot: { attackerId: "p", kind: "melee" },
      }),
      "idle",
    );
    assert.match(pickModelUrl("spatling", "brood", "idle", "u-1") ?? "", /swarm-spatling-idle-/);
    assert.match(pickModelUrl("spatling", "brood", "move", "u-1") ?? "", /swarm-spatling-move-/);
    assert.match(pickModelUrl("spatling", "brood", "dead", "u-1") ?? "", /swarm-spatling-dead-/);
    assert.equal(hasUnitModel("tyrant", "brood"), true);
    assert.equal(hasUnitModel("tyrant", "empire"), false);
    const tyrant = {
      id: "y",
      alive: true as const,
      type: "tyrant" as const,
      faction: "brood" as const,
    };
    assert.equal(
      unitPose(tyrant, {
        phase: "resolving",
        pendingMove: null,
        pendingShot: { attackerId: "y", kind: "ranged" },
      }),
      "idle",
    );
    assert.equal(
      unitPose(tyrant, {
        phase: "resolving",
        pendingMove: null,
        pendingShot: { attackerId: "y", kind: "melee" },
      }),
      "idle",
    );
    assert.match(pickModelUrl("tyrant", "brood", "idle", "u-1") ?? "", /swarm-tyrant-idle-/);
    assert.match(pickModelUrl("tyrant", "brood", "move", "u-1") ?? "", /swarm-tyrant-move-/);
    assert.match(pickModelUrl("tyrant", "brood", "dead", "u-1") ?? "", /swarm-tyrant-dead-/);
    assert.equal(unitModelSet("tyrant", "brood")?.scale, 2);
    assert.equal(unitModelSet("soldier", "empire")?.scale, 1);
  });

  it("preloads audio, models, and sprites before a match", () => {
    const urls = allGameAssetUrls();
    const boot = bootAssetUrls();
    assert.equal(
      boot.some((u) => u.endsWith(".glb")),
      false,
      "boot preload must not parse the 1GB GLB catalog",
    );
    const roster = rosterModelUrls([
      { type: "soldier", faction: "empire" },
      { type: "soldier", faction: "empire" },
      { type: "tyrant", faction: "brood" },
    ]);
    assert.equal(roster.length, 2);
    assert.ok(roster.some((u) => u.includes("empire-soldier-idle-")));
    assert.ok(roster.some((u) => u.includes("swarm-tyrant-idle-")));
    assert.equal(
      roster.some((u) => u.includes("melee") || u.includes("move") || u.includes("dead")),
      false,
    );
    assert.ok(urls.some((u) => u.endsWith("ambience.mp3")));
    assert.ok(urls.some((u) => u.includes("empire-soldier-idle-01.glb")));
    assert.ok(urls.some((u) => u.endsWith("/assets/units/soldier.png")));
    assert.ok(urls.some((u) => u.includes("empire-soldier-ranged-attack-01.mp3")));
    assert.ok(urls.some((u) => u.includes("empire-soldier-melee-01.glb")));
    assert.ok(urls.some((u) => u.includes("empire-soldier-reload-01.glb")));
    assert.ok(urls.some((u) => u.includes("empire-captain-idle-01.glb")));
    assert.ok(urls.some((u) => u.includes("empire-captain-idle-special-01.glb")));
    assert.ok(urls.some((u) => u.includes("empire-sniper-idle-01.glb")));
    assert.ok(urls.some((u) => u.endsWith("/assets/3d/machine-gunner/machine-gunner.glb")));
    assert.ok(urls.some((u) => u.includes("swarm-broodling-idle-01.glb")));
    assert.ok(urls.some((u) => u.includes("swarm-broodling-melee-01.glb")));
    assert.ok(urls.some((u) => u.includes("swarm-broodling-move-01.glb")));
    assert.ok(urls.some((u) => u.includes("swarm-spatling-idle-01.glb")));
    assert.ok(urls.some((u) => u.includes("swarm-spatling-move-01.glb")));
    assert.ok(urls.some((u) => u.includes("swarm-tyrant-idle-01.glb")));
    assert.ok(urls.some((u) => u.includes("empire-soldier-idle-02.glb")));
    for (const type of [
      "soldier",
      "captain",
      "sniper",
      "machine_gunner",
      "broodling",
      "spatling",
      "tyrant",
    ] as const) {
      for (const set of [
        unitModelSet(
          type,
          type === "soldier" || type === "captain" || type === "sniper" || type === "machine_gunner"
            ? "empire"
            : "brood",
        ),
      ]) {
        if (!set) continue;
        for (const clips of Object.values(set.clips)) assert.ok(clips.length <= 2);
      }
    }
    assert.ok(urls.some((u) => /-02\.glb$/.test(u)));
  });
});
