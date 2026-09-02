import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { UNIT_STATS, SPRITE_SRC } from "@/game/units";
import type { UnitState } from "@/game/types";
import { colorHex } from "@/game/lobby";
import { UnitModel } from "./UnitModel";
import { hasDeathClip, hasUnitModel, unitModelSet, unitPose, type UnitPose } from "@/game/models";
import { tileToWorld } from "@/game/map";
import type { BattleMap, BattleState, GraphicsMode } from "@/game/types";

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

function UnitSprite({
  type,
  faction,
  height,
  size,
  opacity,
}: {
  type: UnitState["type"];
  faction: UnitState["faction"];
  height: number;
  size: number;
  opacity: number;
}) {
  const tex = useSprite(SPRITE_SRC[type]);
  return (
    <sprite position={[0, height * 0.52, 0]} scale={[1.15 * size, height, 1]}>
      <spriteMaterial
        map={tex}
        color={faction === "brood" ? "#8a8078" : "#ffffff"}
        transparent
        opacity={opacity}
        depthWrite={false}
        alphaTest={0.12}
      />
    </sprite>
  );
}

export function UnitVisual({
  unit,
  map,
  graphics,
  battle,
  selected,
  ready,
  hidden,
  dim,
}: {
  unit: UnitState;
  map: BattleMap;
  graphics: GraphicsMode;
  battle: BattleState;
  selected: boolean;
  ready: boolean;
  hidden: boolean;
  dim: boolean;
}) {
  const stats = UNIT_STATS[unit.type];
  const { x, z } = tileToWorld(unit.col, unit.row, map);
  const group = useRef<THREE.Group>(null);
  const ring = useRef<THREE.Mesh>(null);
  const height = 1.15 * stats.size + (unit.type === "tyrant" ? 0.55 : 0);
  const modeled = graphics !== "sprites" && hasUnitModel(unit.type, unit.faction);
  const modelScale = unitModelSet(unit.type, unit.faction)?.scale ?? 1;
  const logical = unitPose(unit, battle);
  const [held, setHeld] = useState<UnitPose | null>(null);
  useEffect(() => {
    if (!unit.alive || logical === "move") {
      setHeld(null);
      return;
    }
    if (logical === "reload" || logical === "ranged" || logical === "melee") setHeld(logical);
  }, [logical, unit.alive]);
  const pose = !unit.alive ? "dead" : logical === "move" ? "move" : (held ?? logical);
  const clearHold = useCallback(() => setHeld(null), []);
  const barY = modeled ? 1.92 * modelScale : height + 0.18;

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
  if (!unit.alive && !(modeled && hasDeathClip(unit.type, unit.faction))) return null;
  const opacity = dim ? 0.78 : unit.hp / unit.maxHp < 0.35 ? 0.9 : 1;
  const playerColor = colorHex(unit.color ?? 0);
  const sprite = (
    <UnitSprite
      type={unit.type}
      faction={unit.faction}
      height={height}
      size={stats.size}
      opacity={unit.alive ? opacity : 0.55}
    />
  );

  return (
    <group ref={group} position={[x, 0, z]}>
      {unit.alive && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.035, 0]}>
          <ringGeometry args={[0.34 * stats.size, 0.5 * stats.size, 28]} />
          <meshBasicMaterial color={playerColor} transparent opacity={selected ? 0.92 : 0.28} depthWrite={false} />
        </mesh>
      )}
      {ready && unit.alive && (
        <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]}>
          <ringGeometry args={[0.52 * stats.size, 0.62 * stats.size, 32]} />
          <meshBasicMaterial color="#6fbf7a" transparent opacity={0.28} depthWrite={false} />
        </mesh>
      )}
      {selected && unit.alive && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]}>
          <ringGeometry args={[0.64 * stats.size, 0.76 * stats.size, 32]} />
          <meshBasicMaterial color={playerColor} transparent opacity={0.7} depthWrite={false} />
        </mesh>
      )}
      {modeled ? (
        <Suspense fallback={sprite}>
          <UnitModel
            type={unit.type}
            faction={unit.faction}
            pose={pose}
            seed={unit.id}
            facing={unit.facing}
            onFinished={pose === "reload" || pose === "ranged" || pose === "melee" ? clearHold : undefined}
          />
        </Suspense>
      ) : (
        sprite
      )}
      {unit.alive && (
        <>
          <mesh position={[0, barY, 0]}>
            <planeGeometry args={[0.7 * stats.size, 0.07]} />
            <meshBasicMaterial color="#1a1c20" transparent opacity={0.7} depthWrite={false} />
          </mesh>
          <mesh position={[-(0.7 * stats.size * (1 - unit.hp / unit.maxHp)) / 2, barY, 0.001]}>
            <planeGeometry args={[0.7 * stats.size * (unit.hp / unit.maxHp), 0.05]} />
            <meshBasicMaterial
              color={unit.hp / unit.maxHp > 0.45 ? "#6fbf7a" : "#c45c4a"}
              depthWrite={false}
            />
          </mesh>
        </>
      )}
    </group>
  );
}
