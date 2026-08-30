import { useMemo } from "react";
import * as THREE from "three";
import { TILE, tileToWorld, worldToPoint } from "@/game/map";
import type { BattleMap } from "@/game/types";
import type { ThreeEvent } from "@react-three/fiber";

const loader = new THREE.TextureLoader();
loader.setCrossOrigin("anonymous");

export function Ground({
  map,
  onPoint,
  onHover,
}: {
  map: BattleMap;
  onPoint: (col: number, row: number) => void;
  onHover: (col: number | null, row: number | null) => void;
}) {
  const ground = useMemo(() => {
    const t = loader.load("/assets/ground.jpg");
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(map.cols / 3.2, map.rows / 3.2);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, [map.cols, map.rows]);

  const w = map.cols * TILE;
  const h = map.rows * TILE;

  const pick = (e: ThreeEvent<PointerEvent>, click: boolean) => {
    e.stopPropagation();
    const p = worldToPoint(e.point.x, e.point.z, map);
    if (click) onPoint(p.col, p.row);
    else onHover(p.col, p.row);
  };

  return (
    <group>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          pick(e, true);
        }}
        onPointerMove={(e) => pick(e, false)}
        onPointerOut={() => onHover(null, null)}
      >
        <planeGeometry args={[w + TILE, h + TILE]} />
        <meshStandardMaterial map={ground} color="#8a8680" roughness={0.95} metalness={0} />
      </mesh>
      {map.tiles.map((kind, i) => {
        if (kind === "floor") return null;
        const col = i % map.cols;
        const row = Math.floor(i / map.cols);
        const p = tileToWorld(col, row, map);
        const tall = kind === "structure";
        return (
          <mesh
            key={i}
            position={[p.x, tall ? 1.15 : 0.55, p.z]}
            castShadow
            receiveShadow
            onPointerDown={(e) => {
              e.stopPropagation();
            }}
          >
            <boxGeometry args={[TILE * 0.92, tall ? 2.3 : 1.1, TILE * 0.92]} />
            <meshStandardMaterial
              color={tall ? "#3a3d44" : "#4a4e55"}
              roughness={0.85}
              metalness={0.08}
            />
          </mesh>
        );
      })}
    </group>
  );
}
