import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { TILE, tileToWorld } from "@/game/map";
import { sightHorizon } from "@/game/combat";
import type { BattleMap, UnitState } from "@/game/types";

const RAYS = 168;
const VISION = 16.5;

export function VisibilityOverlay({
  unit,
  map,
  units,
}: {
  unit: UnitState;
  map: BattleMap;
  units: UnitState[];
}) {
  const stamp = `${unit.id}:${unit.col.toFixed(2)},${unit.row.toFixed(2)}|${units
    .filter((u) => u.alive)
    .map((u) => `${u.id}:${u.col.toFixed(1)},${u.row.toFixed(1)}`)
    .join(";")}`;

  const geo = useMemo(() => {
    const horizon = sightHorizon(unit, map, units, VISION, RAYS);
    const origin = tileToWorld(unit.col, unit.row, map);
    const n = horizon.length;
    const pos = new Float32Array(n * 9);
    const col = new Float32Array(n * 9);
    const green = [0.435, 0.75, 0.478];
    for (let i = 0; i < n; i++) {
      const a = tileToWorld(horizon[i].col, horizon[i].row, map);
      const nxt = horizon[(i + 1) % n];
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
      // origin brighter, rim more transparent via vertex color (material uses vertexColors)
      col[o] = green[0];
      col[o + 1] = green[1];
      col[o + 2] = green[2];
      col[o + 3] = green[0];
      col[o + 4] = green[1];
      col[o + 5] = green[2];
      col[o + 6] = green[0];
      col[o + 7] = green[1];
      col[o + 8] = green[2];
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    g.computeVertexNormals();
    return g;
    // stamp captures pose + bodies
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stamp, map, unit.type]);

  useEffect(() => () => geo.dispose(), [geo]);

  const origin = tileToWorld((map.cols - 1) / 2, (map.rows - 1) / 2, map);

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[origin.x, 0.028, origin.z]} renderOrder={1}>
        <planeGeometry args={[map.cols * TILE, map.rows * TILE]} />
        <meshBasicMaterial color="#0a0c10" transparent opacity={0.26} depthWrite={false} />
      </mesh>
      <mesh geometry={geo} renderOrder={2}>
        <meshBasicMaterial
          vertexColors
          transparent
          opacity={0.32}
          depthWrite={false}
          side={THREE.DoubleSide}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}
