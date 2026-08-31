import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { TILE, tileToWorld } from "@/game/map";
import type { BattleMap } from "@/game/types";

export function FogOfWar({
  map,
  explored,
  visible,
}: {
  map: BattleMap;
  explored: boolean[];
  visible: boolean[];
}) {
  const tex = useMemo(() => {
    const data = new Uint8Array(map.cols * map.rows * 4);
    const t = new THREE.DataTexture(data, map.cols, map.rows, THREE.RGBAFormat);
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    t.flipY = false;
    t.needsUpdate = true;
    return t;
  }, [map.cols, map.rows]);

  useEffect(() => {
    const data = tex.image.data as Uint8Array;
    for (let row = 0; row < map.rows; row++) {
      for (let col = 0; col < map.cols; col++) {
        const src = row * map.cols + col;
        const dstRow = map.rows - 1 - row;
        const i = (dstRow * map.cols + col) * 4;
        if (!explored[src]) {
          data[i] = 4;
          data[i + 1] = 5;
          data[i + 2] = 8;
          data[i + 3] = 255;
        } else if (!visible[src]) {
          data[i] = 6;
          data[i + 1] = 7;
          data[i + 2] = 10;
          data[i + 3] = 168;
        } else {
          data[i] = 0;
          data[i + 1] = 0;
          data[i + 2] = 0;
          data[i + 3] = 0;
        }
      }
    }
    tex.needsUpdate = true;
  }, [tex, map.cols, map.rows, explored, visible]);

  useEffect(() => () => tex.dispose(), [tex]);

  const origin = tileToWorld((map.cols - 1) / 2, (map.rows - 1) / 2, map);

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[origin.x, 0.08, origin.z]} renderOrder={4}>
      <planeGeometry args={[map.cols * TILE, map.rows * TILE]} />
      <meshBasicMaterial map={tex} transparent depthWrite={false} toneMapped={false} />
    </mesh>
  );
}
