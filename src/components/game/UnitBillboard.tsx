import { useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { UNIT_STATS, SPRITE_SRC } from "@/game/units";
import type { UnitState } from "@/game/types";
import { PlaceholderModel } from "./PlaceholderModel";
import { tileToWorld } from "@/game/map";
import type { BattleMap, GraphicsMode } from "@/game/types";

const loader = new THREE.TextureLoader();
loader.setCrossOrigin("anonymous");
const cache = new Map<string, THREE.Texture>();

function useSprite(src: string) {
  return useMemo(() => {
    const hit = cache.get(src);
    if (hit) return hit;
    const tex = loader.load(src);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    cache.set(src, tex);
    return tex;
  }, [src]);
}

export function UnitVisual({
  unit,
  map,
  graphics,
  selected,
  ready,
  hidden,
  dim,
}: {
  unit: UnitState;
  map: BattleMap;
  graphics: GraphicsMode;
  selected: boolean;
  ready: boolean;
  hidden: boolean;
  dim: boolean;
}) {
  const stats = UNIT_STATS[unit.type];
  const { x, z } = tileToWorld(unit.col, unit.row, map);
  const group = useRef<THREE.Group>(null);
  const ring = useRef<THREE.Mesh>(null);
  const tex = useSprite(SPRITE_SRC[unit.type]);
  const height = 1.15 * stats.size + (unit.type === "tyrant" ? 0.55 : 0);

  useLayoutEffect(() => {
    if (group.current) group.current.position.set(x, 0, z);
  }, [x, z]);

  useFrame((_, delta) => {
    const d = Math.min(delta, 0.1);
    if (!group.current) return;
    group.current.position.x += (x - group.current.position.x) * Math.min(1, d * 14);
    group.current.position.z += (z - group.current.position.z) * Math.min(1, d * 14);
    if (ring.current) {
      const mat = ring.current.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.22 + Math.sin(performance.now() / 280) * 0.08;
    }
  });

  if (hidden) return null;
  const tint = unit.faction === "empire" ? "#9a4444" : "#6a7544";
  const opacity = dim ? 0.38 : unit.hp / unit.maxHp < 0.35 ? 0.85 : 1;

  return (
    <group ref={group} position={[x, 0, z]}>
      {ready && (
        <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]}>
          <ringGeometry args={[0.42 * stats.size, 0.58 * stats.size, 32]} />
          <meshBasicMaterial color="#6fbf7a" transparent opacity={0.28} depthWrite={false} />
        </mesh>
      )}
      {selected && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]}>
          <ringGeometry args={[0.62 * stats.size, 0.72 * stats.size, 32]} />
          <meshBasicMaterial color="#e8e6e1" transparent opacity={0.55} depthWrite={false} />
        </mesh>
      )}
      {graphics === "models" ? (
        <group rotation={[0, unit.facing + Math.PI / 2, 0]}>
          <PlaceholderModel type={unit.type} factionTint={tint} />
        </group>
      ) : (
        <sprite position={[0, height * 0.52, 0]} scale={[1.15 * stats.size, height, 1]}>
          <spriteMaterial
            map={tex}
            transparent
            opacity={opacity}
            depthWrite={false}
            alphaTest={0.12}
          />
        </sprite>
      )}
      <mesh position={[0, height + 0.18, 0]}>
        <planeGeometry args={[0.7 * stats.size, 0.07]} />
        <meshBasicMaterial color="#1a1c20" transparent opacity={0.7} depthWrite={false} />
      </mesh>
      <mesh position={[-(0.7 * stats.size * (1 - unit.hp / unit.maxHp)) / 2, height + 0.18, 0.001]}>
        <planeGeometry args={[0.7 * stats.size * (unit.hp / unit.maxHp), 0.05]} />
        <meshBasicMaterial
          color={unit.hp / unit.maxHp > 0.45 ? "#6fbf7a" : "#c45c4a"}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}
