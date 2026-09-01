import { useEffect, useMemo, useRef } from "react";
import { useAnimations, useGLTF } from "@react-three/drei";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
import * as THREE from "three";
import type { Faction, UnitType } from "@/game/types";
import { pickModelUrl, unitModelSet, type UnitPose } from "@/game/models";

function SkinnedClip({ url, loop, scale }: { url: string; loop: boolean; scale: number }) {
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
    });
    return copy;
  }, [scene]);
  const { actions } = useAnimations(animations, root);

  useEffect(() => {
    const action = Object.values(actions).find(Boolean);
    if (!action) return;
    action.reset();
    if (loop) {
      action.setLoop(THREE.LoopRepeat, Infinity);
      action.clampWhenFinished = false;
    } else {
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
    }
    action.fadeIn(0.12).play();
    return () => {
      action.fadeOut(0.08);
    };
  }, [actions, loop]);

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
}: {
  type: UnitType;
  faction: Faction;
  pose: UnitPose;
  seed: string;
  facing: number;
}) {
  const set = unitModelSet(type, faction);
  const url = pickModelUrl(type, faction, pose, seed);
  useEffect(() => {
    for (const src of set?.clips.idle ?? []) useGLTF.preload(src);
  }, [set]);
  if (!set || !url) return null;
  const loop = pose === "idle" || pose === "move";
  return (
    <group rotation={[0, Math.PI / 2 - facing + set.yawOffset, 0]}>
      <SkinnedClip key={url} url={url} loop={loop} scale={set.scale} />
    </group>
  );
}
