import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { tileToWorld } from "@/game/map";
import { sightHorizon } from "@/game/combat";
import { sightRange, UNIT_STATS } from "@/game/units";
import type { BattleMap, UnitState } from "@/game/types";

const RAYS = 168;

export function VisibilityOverlay({
  unit,
  map,
  units,
}: {
  unit: UnitState;
  map: BattleMap;
  units: UnitState[];
}) {
  const stamp = `${unit.id}:${unit.col.toFixed(2)},${unit.row.toFixed(2)}:${unit.facing.toFixed(3)}|${units
    .filter((u) => u.alive)
    .map((u) => `${u.id}:${u.col.toFixed(1)},${u.row.toFixed(1)}`)
    .join(";")}`;

  const geo = useMemo(() => {
    const horizon = sightHorizon(unit, map, units, sightRange(unit.type), RAYS);
    const origin = tileToWorld(unit.col, unit.row, map);
    const wrap = UNIT_STATS[unit.type].arc >= 359;
    const n = horizon.length;
    const tris = wrap ? n : Math.max(0, n - 1);
    const pos = new Float32Array(tris * 9);
    const col = new Float32Array(tris * 9);
    const green = [0.435, 0.75, 0.478];
    for (let i = 0; i < tris; i++) {
      const a = tileToWorld(horizon[i].col, horizon[i].row, map);
      const nxt = horizon[wrap ? (i + 1) % n : i + 1];
      const b = tileToWorld(nxt.col, nxt.row, map);
      const o = i * 9;
      pos[o] = origin.x;
      pos[o + 1] = 0.04;
      pos[o + 2] = origin.z;
      pos[o + 3] = a.x;
      pos[o + 4] = 0.04;
      pos[o + 5] = a.z;
      pos[o + 6] = b.x;
      pos[o + 7] = 0.04;
      pos[o + 8] = b.z;
      for (let k = 0; k < 9; k += 3) {
        col[o + k] = green[0];
        col[o + k + 1] = green[1];
        col[o + k + 2] = green[2];
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    g.computeVertexNormals();
    return g;
    // stamp captures pose, facing, and bodies
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stamp, map, unit.type]);

  useEffect(() => () => geo.dispose(), [geo]);

  return (
    <mesh geometry={geo} renderOrder={2}>
      <meshBasicMaterial
        vertexColors
        transparent
        opacity={0.1}
        depthWrite={false}
        side={THREE.DoubleSide}
        toneMapped={false}
      />
    </mesh>
  );
}
