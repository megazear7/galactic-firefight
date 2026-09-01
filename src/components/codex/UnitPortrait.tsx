import { Suspense, useEffect, useLayoutEffect, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { ContactShadows } from "@react-three/drei";
import { UnitModel } from "@/components/game/UnitModel";
import { hasUnitModel } from "@/game/models";
import { SPRITE_SRC } from "@/game/units";
import type { Faction, UnitType } from "@/game/types";
import { cn } from "@/lib/utils";

function FaceOn() {
  const { camera } = useThree();
  useLayoutEffect(() => {
    camera.lookAt(0, 0.88, 0);
  }, [camera]);
  return null;
}

export function UnitPortrait({
  type,
  faction,
  className,
}: {
  type: UnitType;
  faction: Faction;
  className?: string;
}) {
  const modeled = hasUnitModel(type, faction);
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);

  if (!modeled) {
    return (
      <div className={cn("relative flex items-end justify-center overflow-hidden bg-surface-2", className)}>
        <img
          src={SPRITE_SRC[type]}
          alt=""
          className="h-full max-h-[22rem] w-auto object-contain drop-shadow-[0_12px_24px_rgba(0,0,0,0.45)]"
          crossOrigin="anonymous"
        />
      </div>
    );
  }

  if (!ready) {
    return <div className={cn("bg-surface-2", className)} />;
  }

  return (
    <div className={cn("relative overflow-hidden bg-[#101218]", className)}>
      <Canvas
        className="pointer-events-none size-full"
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true }}
        camera={{ position: [3.3, 1.55, 0], fov: 32, near: 0.1, far: 50 }}
      >
        <FaceOn />
        <hemisphereLight args={["#d0d4dc", "#3a3832", 0.9]} />
        <ambientLight intensity={0.28} />
        <directionalLight position={[3.5, 7, 4]} intensity={1.2} />
        <directionalLight position={[-4, 2, -2]} intensity={0.28} />
        <Suspense fallback={null}>
          <UnitModel type={type} faction={faction} pose="idle" seed={`${type}-codex`} facing={0} />
        </Suspense>
        <ContactShadows position={[0, 0, 0]} opacity={0.42} scale={5} blur={2.2} far={2.4} />
      </Canvas>
    </div>
  );
}
