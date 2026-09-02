import { circleHitsTerrain, dist, moveMultiplier } from "./map";
import type { BattleMap, PathPoint } from "./types";

export type Blocker = { col: number; row: number; radius: number };

/** Sub-tile navigation grid. 6 cells per tile ≈ 0.17 tile steps. */
export const NAV_RES = 6;

type Node = { col: number; row: number; g: number; f: number; i: number };

class MinHeap {
  data: Node[] = [];
  push(n: Node) {
    this.data.push(n);
    this.up(this.data.length - 1);
  }
  pop(): Node | undefined {
    const a = this.data;
    if (a.length === 0) return undefined;
    const top = a[0];
    const last = a.pop()!;
    if (a.length) {
      a[0] = last;
      this.down(0);
    }
    return top;
  }
  get size() {
    return this.data.length;
  }
  private up(i: number) {
    const a = this.data;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p].f <= a[i].f) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  private down(i: number) {
    const a = this.data;
    for (;;) {
      const l = i * 2 + 1;
      const r = l + 1;
      let m = i;
      if (l < a.length && a[l].f < a[m].f) m = l;
      if (r < a.length && a[r].f < a[m].f) m = r;
      if (m === i) break;
      [a[m], a[i]] = [a[i], a[m]];
      i = m;
    }
  }
}

const DIRS = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, Math.SQRT2],
  [1, -1, Math.SQRT2],
  [-1, 1, Math.SQRT2],
  [-1, -1, Math.SQRT2],
] as const;

export function hitsBlocker(col: number, row: number, blockers: Blocker[], extra = 0) {
  for (const b of blockers) {
    const r = b.radius + extra;
    const dx = col - b.col;
    const dy = row - b.row;
    if (dx * dx + dy * dy < r * r) return true;
  }
  return false;
}

export function blockedAt(
  map: BattleMap,
  col: number,
  row: number,
  blockers: Blocker[],
  radius: number,
) {
  if (circleHitsTerrain(map, col, row, radius)) return true;
  return hitsBlocker(col, row, blockers, radius);
}

function navSize(map: BattleMap) {
  return { nx: map.cols * NAV_RES, ny: map.rows * NAV_RES };
}

export function cellCenter(i: number, j: number) {
  return { col: (i + 0.5) / NAV_RES - 0.5, row: (j + 0.5) / NAV_RES - 0.5 };
}

export function toCell(col: number, row: number, nx: number, ny: number) {
  const i = Math.max(0, Math.min(nx - 1, Math.floor((col + 0.5) * NAV_RES)));
  const j = Math.max(0, Math.min(ny - 1, Math.floor((row + 0.5) * NAV_RES)));
  return { i, j };
}

function walkableCell(
  map: BattleMap,
  i: number,
  j: number,
  nx: number,
  ny: number,
  blockers: Blocker[],
  radius: number,
  allowStart?: { i: number; j: number },
) {
  if (i < 0 || j < 0 || i >= nx || j >= ny) return false;
  if (allowStart && i === allowStart.i && j === allowStart.j) return true;
  const c = cellCenter(i, j);
  return !blockedAt(map, c.col, c.row, blockers, radius);
}

export function snapWalkable(
  map: BattleMap,
  goal: PathPoint,
  blockers: Blocker[],
  radius: number,
  maxDist = 1.15,
): PathPoint | null {
  if (!blockedAt(map, goal.col, goal.row, blockers, radius)) return goal;
  const { nx, ny } = navSize(map);
  const g = toCell(goal.col, goal.row, nx, ny);
  let best: PathPoint | null = null;
  let bestD = maxDist;
  const span = Math.ceil(maxDist * NAV_RES) + 1;
  for (let dj = -span; dj <= span; dj++) {
    for (let di = -span; di <= span; di++) {
      const i = g.i + di;
      const j = g.j + dj;
      if (!walkableCell(map, i, j, nx, ny, blockers, radius)) continue;
      const c = cellCenter(i, j);
      const d = dist(c, goal);
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
  }
  return best;
}

function clearSegment(
  map: BattleMap,
  a: PathPoint,
  b: PathPoint,
  blockers: Blocker[],
  radius: number,
) {
  const len = dist(a, b);
  const steps = Math.max(2, Math.ceil(len * 10));
  for (let s = 1; s < steps; s++) {
    const t = s / steps;
    const col = a.col + (b.col - a.col) * t;
    const row = a.row + (b.row - a.row) * t;
    if (blockedAt(map, col, row, blockers, radius)) return false;
  }
  return true;
}

export function stringPull(
  path: PathPoint[],
  map: BattleMap,
  blockers: Blocker[],
  radius: number,
): PathPoint[] {
  if (path.length <= 2) return path;
  const out = [path[0]];
  let i = 0;
  while (i < path.length - 1) {
    let best = i + 1;
    for (let j = path.length - 1; j > i + 1; j--) {
      if (clearSegment(map, path[i], path[j], blockers, radius)) {
        best = j;
        break;
      }
    }
    out.push(path[best]);
    i = best;
  }
  return out;
}

export function pathCost(path: PathPoint[], map?: BattleMap, fleet = false) {
  let c = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    const len = dist(a, b);
    if (!map || len < 1e-6) {
      c += len;
      continue;
    }
    const steps = Math.max(1, Math.ceil(len * 8));
    const ds = len / steps;
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const col = a.col + (b.col - a.col) * t;
      const row = a.row + (b.row - a.row) * t;
      c += ds * moveMultiplier(map, col, row, fleet);
    }
  }
  return c;
}

export function pointAlong(path: PathPoint[], t: number, map?: BattleMap, fleet = false): PathPoint {
  if (path.length === 0) return { col: 0, row: 0 };
  if (path.length === 1 || t <= 0) return path[0];
  if (t >= 1) return path[path.length - 1];
  const total = Math.max(1e-6, pathCost(path, map, fleet));
  let d = t * total;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    const seg = pathCost([a, b], map, fleet);
    if (d <= seg || i === path.length - 1) {
      const u = seg < 1e-6 ? 1 : d / seg;
      return { col: a.col + (b.col - a.col) * u, row: a.row + (b.row - a.row) * u };
    }
    d -= seg;
  }
  return path[path.length - 1];
}

export function truncatePath(path: PathPoint[], maxCost: number, map?: BattleMap, fleet = false): PathPoint[] {
  if (path.length <= 1) return path;
  if (pathCost(path, map, fleet) <= maxCost + 1e-6) return path;
  const out = [path[0]];
  let used = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    const seg = pathCost([a, b], map, fleet);
    if (used + seg >= maxCost) {
      const u = seg < 1e-6 ? 1 : (maxCost - used) / seg;
      out.push({ col: a.col + (b.col - a.col) * u, row: a.row + (b.row - a.row) * u });
      return out;
    }
    out.push(b);
    used += seg;
  }
  return out;
}

type Search = {
  nx: number;
  ny: number;
  sc: { i: number; j: number };
  bestG: Float64Array;
  came: Int32Array;
};

function searchReachable(
  map: BattleMap,
  start: PathPoint,
  blockers: Blocker[],
  radius: number,
  maxCost: number,
  fleet = false,
): Search {
  const { nx, ny } = navSize(map);
  const key = (i: number, j: number) => j * nx + i;
  const sc = toCell(start.col, start.row, nx, ny);
  const bestG = new Float64Array(nx * ny).fill(Infinity);
  const came = new Int32Array(nx * ny).fill(-1);
  const open = new MinHeap();
  const si = key(sc.i, sc.j);
  bestG[si] = 0;
  open.push({ col: sc.i, row: sc.j, g: 0, f: 0, i: si });
  const cellStep = 1 / NAV_RES;

  while (open.size) {
    const cur = open.pop()!;
    if (Math.abs(cur.g - bestG[cur.i]) > 1e-9) continue;
    for (const [dc, dr, step] of DIRS) {
      const ni = cur.col + dc;
      const nj = cur.row + dr;
      if (!walkableCell(map, ni, nj, nx, ny, blockers, radius, sc)) continue;
      if (dc !== 0 && dr !== 0) {
        const a = walkableCell(map, cur.col + dc, cur.row, nx, ny, blockers, radius, sc);
        const b = walkableCell(map, cur.col, cur.row + dr, nx, ny, blockers, radius, sc);
        // Both orthogonals must be free — no squeezing through wall corners.
        if (!a || !b) continue;
      }
      const nxt = cellCenter(ni, nj);
      const g = cur.g + step * cellStep * moveMultiplier(map, nxt.col, nxt.row, fleet);
      if (g > maxCost + 0.08) continue;
      const idx = key(ni, nj);
      if (g + 1e-6 >= bestG[idx]) continue;
      bestG[idx] = g;
      came[idx] = cur.i;
      open.push({ col: ni, row: nj, g, f: g, i: idx });
    }
  }
  return { nx, ny, sc, bestG, came };
}

function reconstruct(search: Search, endIndex: number, start: PathPoint): PathPoint[] {
  const { nx, came } = search;
  const cells: PathPoint[] = [];
  let i = endIndex;
  const guard = nx * search.ny + 2;
  let n = 0;
  while (i >= 0 && n++ < guard) {
    const ci = i % nx;
    const cj = (i / nx) | 0;
    cells.push(cellCenter(ci, cj));
    i = came[i];
  }
  cells.reverse();
  if (cells.length === 0) cells.push(start);
  cells[0] = { col: start.col, row: start.row };
  return cells;
}

/**
 * Any-angle path toward `goal` that stays within `maxCost` tile-units.
 * If the exact click is out of range or blocked, walks as far as possible
 * toward it, routing around terrain and other units.
 */
export function findPath(
  map: BattleMap,
  start: PathPoint,
  goal: PathPoint,
  blockers: Blocker[],
  radius: number,
  maxCost = 99,
  fleet = false,
): PathPoint[] | null {
  const snapped = snapWalkable(map, goal, blockers, radius);
  const target = snapped ?? goal;
  if (dist(start, target) < 0.045) {
    const dest = snapped && !blockedAt(map, goal.col, goal.row, blockers, radius) ? goal : target;
    return [start, dest];
  }

  const search = searchReachable(map, start, blockers, radius, maxCost, fleet);
  const { nx, ny, bestG } = search;
  const gc = toCell(target.col, target.row, nx, ny);
  const goalIdx = gc.j * nx + gc.i;

  let end = -1;
  if (bestG[goalIdx] < Infinity) {
    end = goalIdx;
  } else {
    let bestScore = Infinity;
    for (let idx = 0; idx < bestG.length; idx++) {
      if (bestG[idx] === Infinity) continue;
      const ci = idx % nx;
      const cj = (idx / nx) | 0;
      const c = cellCenter(ci, cj);
      const d = dist(c, target);
      const score = d + bestG[idx] * 0.02;
      if (score < bestScore) {
        bestScore = score;
        end = idx;
      }
    }
  }
  if (end < 0) return [start];

  let cells = reconstruct(search, end, start);
  const last = cells[cells.length - 1];
  if (snapped && dist(last, snapped) > 0.02 && pathCost(cells, map, fleet) + pathCost([last, snapped], map, fleet) <= maxCost + 0.12) {
    if (clearSegment(map, last, snapped, blockers, radius)) cells.push(snapped);
  }
  const exactOk = !blockedAt(map, goal.col, goal.row, blockers, radius);
  if (exactOk) {
    const tail = cells[cells.length - 1];
    if (dist(tail, goal) > 0.02 && pathCost(cells, map, fleet) + pathCost([tail, goal], map, fleet) <= maxCost + 0.12) {
      if (clearSegment(map, tail, goal, blockers, radius)) cells.push(goal);
    }
  }

  cells = stringPull(cells, map, blockers, radius);
  cells = truncatePath(cells, maxCost + 0.08, map, fleet);
  if (pathCost(cells, map, fleet) > maxCost + 0.16) return null;
  return cells;
}

export function reachable(
  map: BattleMap,
  start: PathPoint,
  move: number,
  blockers: Blocker[],
  radius: number,
  fleet = false,
): Array<{ col: number; row: number; cost: number }> {
  const search = searchReachable(map, start, blockers, radius, move, fleet);
  const { nx, bestG } = search;
  const out: Array<{ col: number; row: number; cost: number }> = [
    { col: start.col, row: start.row, cost: 0 },
  ];
  for (let idx = 0; idx < bestG.length; idx++) {
    const g = bestG[idx];
    if (g === Infinity || g <= 0) continue;
    const ci = idx % nx;
    const cj = (idx / nx) | 0;
    const c = cellCenter(ci, cj);
    out.push({ col: c.col, row: c.row, cost: g });
  }
  return out;
}

export function clearLine(
  map: BattleMap,
  a: PathPoint,
  b: PathPoint,
  blockers: Blocker[] = [],
  radius = 0.12,
) {
  return clearSegment(map, a, b, blockers, radius);
}
