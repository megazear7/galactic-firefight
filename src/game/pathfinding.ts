import { dist, inBounds, isBlocked } from "./map";
import type { BattleMap } from "./types";

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

function octile(dc: number, dr: number) {
  const dx = Math.abs(dc);
  const dy = Math.abs(dr);
  return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
}

export function findPath(
  map: BattleMap,
  start: { col: number; row: number },
  goal: { col: number; row: number },
  occupied: Set<string>,
  maxCost = 99,
): Array<{ col: number; row: number }> | null {
  if (!inBounds(goal.col, goal.row, map) || isBlocked(map, goal.col, goal.row)) return null;
  const goalKey = `${goal.col},${goal.row}`;
  if (occupied.has(goalKey) && (start.col !== goal.col || start.row !== goal.row)) return null;

  const cols = map.cols;
  const key = (c: number, r: number) => r * cols + c;
  const came = new Int32Array(cols * map.rows).fill(-1);
  const bestG = new Float64Array(cols * map.rows).fill(Infinity);
  const open = new MinHeap();
  const si = key(start.col, start.row);
  bestG[si] = 0;
  open.push({ col: start.col, row: start.row, g: 0, f: octile(goal.col - start.col, goal.row - start.row), i: si });

  while (open.size) {
    const cur = open.pop()!;
    if (Math.abs(cur.g - bestG[cur.i]) > 1e-9) continue;
    if (cur.col === goal.col && cur.row === goal.row) {
      const path: Array<{ col: number; row: number }> = [];
      let i = cur.i;
      while (i >= 0) {
        const c = i % cols;
        const r = (i / cols) | 0;
        path.push({ col: c, row: r });
        i = came[i];
      }
      path.reverse();
      return path;
    }
    for (const [dc, dr, cost] of DIRS) {
      const nc = cur.col + dc;
      const nr = cur.row + dr;
      if (!inBounds(nc, nr, map) || isBlocked(map, nc, nr)) continue;
      if (dc !== 0 && dr !== 0) {
        if (isBlocked(map, cur.col + dc, cur.row) && isBlocked(map, cur.col, cur.row + dr)) continue;
      }
      const nk = `${nc},${nr}`;
      if (occupied.has(nk) && !(nc === goal.col && nr === goal.row)) continue;
      const ni = key(nc, nr);
      const g = cur.g + cost;
      if (g > maxCost + 0.01) continue;
      if (g + 1e-6 >= bestG[ni]) continue;
      bestG[ni] = g;
      came[ni] = cur.i;
      open.push({ col: nc, row: nr, g, f: g + octile(goal.col - nc, goal.row - nr), i: ni });
    }
  }
  return null;
}

export function reachable(
  map: BattleMap,
  start: { col: number; row: number },
  move: number,
  occupied: Set<string>,
): Map<string, { col: number; row: number; cost: number }> {
  const out = new Map<string, { col: number; row: number; cost: number }>();
  const cols = map.cols;
  const keyI = (c: number, r: number) => r * cols + c;
  const bestG = new Float64Array(cols * map.rows).fill(Infinity);
  const open = new MinHeap();
  const si = keyI(start.col, start.row);
  bestG[si] = 0;
  open.push({ col: start.col, row: start.row, g: 0, f: 0, i: si });
  out.set(`${start.col},${start.row}`, { col: start.col, row: start.row, cost: 0 });

  while (open.size) {
    const cur = open.pop()!;
    if (Math.abs(cur.g - bestG[cur.i]) > 1e-9) continue;
    for (const [dc, dr, cost] of DIRS) {
      const nc = cur.col + dc;
      const nr = cur.row + dr;
      if (!inBounds(nc, nr, map) || isBlocked(map, nc, nr)) continue;
      if (dc !== 0 && dr !== 0) {
        if (isBlocked(map, cur.col + dc, cur.row) && isBlocked(map, cur.col, cur.row + dr)) continue;
      }
      const nk = `${nc},${nr}`;
      if (occupied.has(nk)) continue;
      const g = cur.g + cost;
      if (g > move + 0.01) continue;
      const ni = keyI(nc, nr);
      if (g + 1e-6 >= bestG[ni]) continue;
      bestG[ni] = g;
      out.set(nk, { col: nc, row: nr, cost: g });
      open.push({ col: nc, row: nr, g, f: g, i: ni });
    }
  }
  return out;
}

export function pathCost(path: Array<{ col: number; row: number }>) {
  let c = 0;
  for (let i = 1; i < path.length; i++) c += dist(path[i - 1], path[i]);
  return c;
}

export function stringPull(
  map: BattleMap,
  path: Array<{ col: number; row: number }>,
): Array<{ col: number; row: number }> {
  if (path.length <= 2) return path;
  const out = [path[0]];
  let i = 0;
  while (i < path.length - 1) {
    let best = i + 1;
    for (let j = path.length - 1; j > i + 1; j--) {
      if (clearLine(map, path[i], path[j])) {
        best = j;
        break;
      }
    }
    out.push(path[best]);
    i = best;
  }
  return out;
}

export function clearLine(
  map: BattleMap,
  a: { col: number; row: number },
  b: { col: number; row: number },
) {
  const steps = Math.max(Math.abs(b.col - a.col), Math.abs(b.row - a.row), 1);
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const c = Math.round(a.col + (b.col - a.col) * t);
    const r = Math.round(a.row + (b.row - a.row) * t);
    if (isBlocked(map, c, r)) return false;
  }
  return true;
}
