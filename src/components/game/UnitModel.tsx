import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAnimations, useGLTF } from "@react-three/drei";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
import * as THREE from "three";
import type { Faction, UnitType } from "@/game/types";
import {
  hasClip,
  IDLE_SPECIAL_CHANCE,
  pickModelUrl,
  unitModelSet,
  type UnitPose,
} from "@/game/models";

const ACTION_MATCH: Record<UnitPose, RegExp[]> = {
  idle: [/^idle/i, /idle/i, /stance/i],
  idle_special: [/shout/i, /special/i, /kneel/i, /reload/i],
  move: [/^run/i, /running/i, /walking/i, /walk/i, /charge/i],
  melee: [/^attack$/i, /punch/i, /axe_spin/i, /reaping/i, /swing/i, /thrust/i, /slash/i, /push/i],
  ranged: [/shoot/i, /shot/i, /draw/i, /rifle_turn/i],
  reload: [/reload/i],
  dead: [/^dead$/i, /dying/i, /fall_dead/i],
};

function clipKey(name: string) {
  const parts = name.split("|");
  return (parts[1] ?? parts[0] ?? name).trim();
}

function meshTint(type: UnitType, faction: Faction) {
  if (faction === "brood") return 0.68;
  if (type === "sniper" || type === "machine_gunner") return 1.34;
  return 1.18;
}

function tintMaterial(material: THREE.Material | THREE.Material[], tint: number) {
  const one = (mat: THREE.Material) => {
    const copy = mat.clone();
    const colored = copy as THREE.MeshStandardMaterial;
    if (colored.color) colored.color.multiplyScalar(tint);
    return copy;
  };
  return Array.isArray(material) ? material.map(one) : one(material);
}

function pickAction(actions: Record<string, THREE.AnimationAction | null>, pose: UnitPose) {
  const entries = Object.entries(actions).filter(([, action]) => action);
  if (!entries.length) return null;
  if (entries.length === 1) return entries[0][1];
  for (const re of ACTION_MATCH[pose] ?? []) {
    const hit = entries.find(([name]) => re.test(clipKey(name)) || re.test(name));
    if (hit) return hit[1];
  }
  return entries[0][1];
}

function SkinnedClip({
  url,
  pose,
  loop,
  scale,
  tint,
  onFinished,
  onLoop,
}: {
  url: string;
  pose: UnitPose;
  loop: boolean;
  scale: number;
  tint: number;
  onFinished?: () => void;
  onLoop?: () => void;
}) {
  const root = useRef<THREE.Group>(null);
  const { scene, animations } = useGLTF(url);
  const cloned = useMemo(() => {
    const copy = clone(scene);
    copy.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      if ((mesh as THREE.SkinnedMesh).isSkinnedMesh) mesh.frustumCulled = false;
      mesh.material = tintMaterial(mesh.material, tint);
    });
    return copy;
  }, [scene, tint]);
  const { actions } = useAnimations(animations, root);

  useEffect(() => {
    const action = pickAction(actions, pose);
    if (!action) return;
    action.reset();
    if (loop) {
      action.setLoop(THREE.LoopRepeat, Infinity);
      action.clampWhenFinished = false;
    } else {
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
    }
    const mixer = action.getMixer();
    const done = () => onFinished?.();
    const looped = () => onLoop?.();
    mixer.addEventListener("finished", done);
    mixer.addEventListener("loop", looped);
    action.fadeIn(0.08).play();
    return () => {
      mixer.removeEventListener("finished", done);
      mixer.removeEventListener("loop", looped);
      action.fadeOut(0.08);
    };
  }, [actions, loop, onFinished, onLoop, pose]);

  return (
    <group ref={root} scale={scale}>
      <primitive object={cloned} />
    </group>
  );
}

export function UnitModel({
  type,
  faction,
  pose,
  seed,
  facing,
  onFinished,
}: {
  type: UnitType;
  faction: Faction;
  pose: UnitPose;
  seed: string;
  facing: number;
  onFinished?: () => void;
}) {
  const set = unitModelSet(type, faction);
  const [idleBreak, setIdleBreak] = useState(false);
  const canSpecial = hasClip(type, faction, "idle_special");
  useEffect(() => {
    if (pose !== "idle") setIdleBreak(false);
  }, [pose]);
  useEffect(() => {
    if (!set) return;
    for (const list of Object.values(set.clips)) {
      for (const src of list) useGLTF.preload(src);
    }
  }, [set]);
  const onIdleLoop = useCallback(() => {
    if (Math.random() < IDLE_SPECIAL_CHANCE) setIdleBreak(true);
  }, []);
  const onSpecialDone = useCallback(() => setIdleBreak(false), []);
  const playing: UnitPose = pose === "idle" && idleBreak ? "idle_special" : pose;
  const url = pickModelUrl(type, faction, playing, seed);
  if (!set || !url) return null;
  const loop = playing === "idle" || playing === "move";
  return (
    <group rotation={[0, Math.PI / 2 - facing + set.yawOffset, 0]}>
      <SkinnedClip
        key={url}
        url={url}
        pose={playing}
        loop={loop}
        scale={set.scale}
        tint={meshTint(type, faction)}
        onLoop={playing === "idle" && canSpecial ? onIdleLoop : undefined}
        onFinished={playing === "idle_special" ? onSpecialDone : loop ? undefined : onFinished}
      />
    </group>
  );
}
