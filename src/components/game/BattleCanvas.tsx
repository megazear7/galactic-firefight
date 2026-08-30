import { Canvas, useFrame } from "@react-three/fiber";
import { MapControls } from "@react-three/drei";
import { useEffect, useState } from "react";
import * as THREE from "three";
import { useGame } from "@/game/store";
import { isStealthed } from "@/game/combat";
import { dist } from "@/game/map";
import { Ground } from "./Ground";
import { UnitVisual } from "./UnitBillboard";
import { MoveOverlay } from "./MoveOverlay";
import { VisibilityOverlay } from "./VisibilityOverlay";
import { CombatFx } from "./CombatFx";
import { readyUnits } from "@/game/battle";

function Loop() {
  const tick = useGame((s) => s.tick);
  useFrame((_, delta) => {
    tick(Math.min(delta, 0.1));
  });
  return null;
}

function nearestUnit<T extends { id: string; col: number; row: number; alive: boolean }>(
  col: number,
  row: number,
  units: T[],
  max = 0.55,
) {
  let best: T | null = null;
  let bestD = max;
  for (const u of units) {
    if (!u.alive) continue;
    const d = dist({ col, row }, u);
    if (d < bestD) {
      bestD = d;
      best = u;
    }
  }
  return best;
}

function Scene() {
  const battle = useGame((s) => s.battle);
  const settings = useGame((s) => s.settings);
  const select = useGame((s) => s.select);
  const clickTile = useGame((s) => s.clickTile);
  const hoverTile = useGame((s) => s.hoverTile);
  const confirmFacing = useGame((s) => s.confirmFacing);
  const fireAt = useGame((s) => s.fireAt);

  if (!battle) return null;
  const selected = battle.units.find((u) => u.id === battle.selectedId) ?? null;
  const ready = new Set(readyUnits(battle).map((u) => u.id));
  const showVis =
    selected &&
    battle.phase !== "moving" &&
    battle.phase !== "resolving" &&
    battle.phase !== "gameOver" &&
    selected.faction === battle.turn;

  return (
    <>
      <color attach="background" args={["#07080a"]} />
      <fog attach="fog" args={["#07080a", 22, 48]} />
      <hemisphereLight args={["#b8c0cc", "#1a1814", 0.55]} />
      <directionalLight
        position={[10, 16, 8]}
        intensity={1.35}
        castShadow
        shadow-mapSize={[1024, 1024]}
      />
      <Ground
        map={battle.map}
        onHover={hoverTile}
        onPoint={(col, row) => {
          if (battle.phase === "aimFacing") {
            clickTile(col, row);
            confirmFacing();
            return;
          }
          if (battle.phase === "aimShoot") {
            const t = nearestUnit(
              col,
              row,
              battle.units.filter((u) => u.alive && u.faction !== selected?.faction),
              0.9,
            );
            if (t) fireAt(t.id);
            return;
          }
          const occupant = nearestUnit(col, row, battle.units, 0.5);
          if (occupant && battle.phase !== "aimMove") {
            select(occupant.id);
            return;
          }
          if (occupant && occupant.faction === battle.playerFaction && occupant.id !== selected?.id) {
            select(occupant.id);
            return;
          }
          clickTile(col, row);
        }}
      />
      {showVis && selected && (
        <VisibilityOverlay unit={selected} map={battle.map} units={battle.units} />
      )}
      {battle.units.map((u) => {
        if (!u.alive) return null;
        const viewer =
          battle.units
            .filter((x) => x.alive && x.faction === battle.playerFaction)
            .reduce<(typeof battle.units)[number] | null>((best, x) => {
              if (!best) return x;
              return dist(u, x) < dist(u, best) ? x : best;
            }, null);
        const hidden = u.faction !== battle.playerFaction && isStealthed(u, viewer);
        return (
          <group
            key={u.id}
            onClick={(e) => {
              e.stopPropagation();
              if (hidden) return;
              if (battle.phase === "aimShoot" && selected && u.faction !== selected.faction) {
                fireAt(u.id);
                return;
              }
              select(u.id);
            }}
          >
            <UnitVisual
              unit={u}
              map={battle.map}
              graphics={settings.graphics}
              selected={u.id === battle.selectedId}
              ready={ready.has(u.id) && battle.turn === battle.playerFaction}
              hidden={hidden}
              dim={u.faction !== battle.turn}
            />
          </group>
        );
      })}
      {selected && <MoveOverlay battle={battle} unit={selected} />}
      <CombatFx events={battle.fx ?? []} />
      <MapControls
        enableDamping
        dampingFactor={0.12}
        minDistance={8}
        maxDistance={28}
        maxPolarAngle={Math.PI / 2.15}
        minPolarAngle={0.35}
        mouseButtons={{
          LEFT: THREE.MOUSE.ROTATE,
          MIDDLE: THREE.MOUSE.DOLLY,
          RIGHT: THREE.MOUSE.PAN,
        }}
        touches={{
          ONE: THREE.TOUCH.ROTATE,
          TWO: THREE.TOUCH.DOLLY_PAN,
        }}
        enableRotate={false}
      />
      <Loop />
    </>
  );
}

export function BattleCanvas() {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  if (!ready) return <div className="size-full bg-bg" />;
  return (
    <Canvas
      className="size-full touch-none"
      shadows="percentage"
      dpr={[1, 2]}
      gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping }}
      camera={{ position: [11, 14, 14], fov: 38, near: 0.1, far: 80 }}
      onCreated={({ camera }) => {
        camera.lookAt(0, 0, 0);
      }}
    >
      <Scene />
    </Canvas>
  );
}
