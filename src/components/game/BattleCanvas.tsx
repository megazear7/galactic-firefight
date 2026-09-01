import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { MapControls } from "@react-three/drei";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useGame } from "@/game/store";
import { dist, tileToWorld } from "@/game/map";
import { Ground } from "./Ground";
import { UnitVisual } from "./UnitBillboard";
import { MoveOverlay } from "./MoveOverlay";
import { VisibilityOverlay } from "./VisibilityOverlay";
import { CombatFx } from "./CombatFx";
import { FogOfWar } from "./FogOfWar";
import { readyUnits, canControl } from "@/game/battle";
import { enemyVisible, localTeam, tileExplored, visionMask } from "@/game/vision";
import { hasUnitModel } from "@/game/models";
import type { MapControls as MapControlsImpl } from "three-stdlib";

function Loop() {
  const tick = useGame((s) => s.tick);
  useFrame((_, delta) => {
    tick(Math.min(delta, 0.1));
  });
  return null;
}

const CAM_OFFSET = new THREE.Vector3(14, 18, 16);

function CameraRig() {
  const controls = useRef<MapControlsImpl>(null);
  const keys = useRef(new Set<string>());
  const camFocus = useGame((s) => s.camFocus);
  const setCamView = useGame((s) => s.setCamView);
  const settingsOpen = useGame((s) => s.settingsOpen);
  const { camera, size } = useThree();
  const seeded = useRef<number | null>(null);
  const battle = useGame((s) => s.battle);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (settingsOpen) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (
        e.code === "KeyW" ||
        e.code === "KeyA" ||
        e.code === "KeyS" ||
        e.code === "KeyD" ||
        e.code === "ArrowUp" ||
        e.code === "ArrowDown" ||
        e.code === "ArrowLeft" ||
        e.code === "ArrowRight"
      ) {
        e.preventDefault();
        keys.current.add(e.code);
      }
    };
    const up = (e: KeyboardEvent) => keys.current.delete(e.code);
    window.addEventListener("keydown", down, { passive: false });
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [settingsOpen]);

  useEffect(() => {
    if (!battle || !controls.current) return;
    if (seeded.current === battle.map.seed) return;
    seeded.current = battle.map.seed;
    const mine = battle.units.filter((u) => u.alive && u.team === localTeam(battle));
    if (!mine.length) return;
    const col = mine.reduce((s, u) => s + u.col, 0) / mine.length;
    const row = mine.reduce((s, u) => s + u.row, 0) / mine.length;
    const w = tileToWorld(col, row, battle.map);
    controls.current.target.set(w.x, 0, w.z);
    camera.position.set(w.x + CAM_OFFSET.x, CAM_OFFSET.y, w.z + CAM_OFFSET.z);
    controls.current.update();
  }, [battle, camera]);

  useEffect(() => {
    if (!camFocus || !controls.current) return;
    controls.current.target.set(camFocus.x, 0, camFocus.z);
    camera.position.set(camFocus.x + CAM_OFFSET.x, CAM_OFFSET.y, camFocus.z + CAM_OFFSET.z);
    controls.current.update();
  }, [camFocus, camera]);

  useFrame((_, dt) => {
    const ctrl = controls.current;
    if (!ctrl) return;
    const speed = 22 * dt;
    let dx = 0;
    let dz = 0;
    if (keys.current.has("KeyW") || keys.current.has("ArrowUp")) dz -= 1;
    if (keys.current.has("KeyS") || keys.current.has("ArrowDown")) dz += 1;
    if (keys.current.has("KeyA") || keys.current.has("ArrowLeft")) dx -= 1;
    if (keys.current.has("KeyD") || keys.current.has("ArrowRight")) dx += 1;
    if (dx || dz) {
      const len = Math.hypot(dx, dz) || 1;
      dx = (dx / len) * speed;
      dz = (dz / len) * speed;
      // Map is isometric (camera on +X/+Z). Rotate pan 45° so W is screen-up.
      const iso = Math.SQRT1_2;
      const rx = iso * (dx + dz);
      const rz = iso * (-dx + dz);
      ctrl.target.x += rx;
      ctrl.target.z += rz;
      camera.position.x += rx;
      camera.position.z += rz;
      ctrl.update();
    }
    const distCam = camera.position.distanceTo(ctrl.target);
    const fov = (("fov" in camera ? camera.fov : 38) as number) * (Math.PI / 180);
    const h = 2 * Math.tan(fov / 2) * distCam * 0.72;
    const w = h * (size.width / Math.max(1, size.height));
    const next = { x: ctrl.target.x, z: ctrl.target.z, w, h };
    const prev = useGame.getState().camView;
    if (
      !prev ||
      Math.abs(prev.x - next.x) > 0.12 ||
      Math.abs(prev.z - next.z) > 0.12 ||
      Math.abs(prev.w - next.w) > 0.4 ||
      Math.abs(prev.h - next.h) > 0.4
    ) {
      setCamView(next);
    }
  });

  return (
    <MapControls
      ref={controls}
      enableDamping
      dampingFactor={0.12}
      minDistance={10}
      maxDistance={52}
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
  );
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
  const fireAt = useGame((s) => s.fireAt);
  const moveDrag = useRef<{
    startCol: number;
    startRow: number;
    from: "aimMove" | "aimFacing";
    dragged: boolean;
    armed: boolean;
  } | null>(null);

  const finishMoveDrag = () => {
    const drag = moveDrag.current;
    if (!drag?.armed) return;
    drag.armed = false;
    moveDrag.current = null;
    const b = useGame.getState().battle;
    if (!b || b.phase !== "aimFacing") return;
    if (drag.dragged || drag.from === "aimFacing") useGame.getState().confirmFacing();
  };

  useEffect(() => {
    const up = () => finishMoveDrag();
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, []);

  const visKey = battle
    ? battle.units.map((u) => `${u.id}:${u.alive ? 1 : 0}:${u.col.toFixed(2)},${u.row.toFixed(2)}`).join("|")
    : "";
  const vis = useMemo(
    () => (battle ? visionMask(battle, localTeam(battle)) : []),
    // visKey captures living unit pose
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visKey, battle?.map, battle?.playerId],
  );
  if (!battle) return null;
  const selected = battle.units.find((u) => u.id === battle.selectedId) ?? null;
  const ready = new Set(readyUnits(battle).map((u) => u.id));
  const showVis =
    selected &&
    selected.playerId === battle.playerId &&
    battle.phase !== "moving" &&
    battle.phase !== "resolving" &&
    battle.phase !== "gameOver";

  return (
    <>
      <color attach="background" args={["#101218"]} />
      <fog attach="fog" args={["#101218", 62, 130]} />
      <hemisphereLight args={["#c8ced6", "#4a463e", 0.7]} />
      <ambientLight intensity={0.28} />
      <directionalLight
        position={[18, 28, 14]}
        intensity={1.12}
        castShadow
        shadow-mapSize={[1024, 1024]}
      />
      <directionalLight position={[-14, 12, -10]} intensity={0.32} />
      <Ground
        map={battle.map}
        explored={battle.explored}
        onHover={(col, row) => {
          hoverTile(col, row);
          const drag = moveDrag.current;
          if (!drag || col == null || row == null) return;
          if (Math.hypot(col - drag.startCol, row - drag.startRow) > 0.22) drag.dragged = true;
        }}
        onRelease={() => finishMoveDrag()}
        onPoint={(col, row) => {
          if (!canControl(battle)) return;
          if (battle.phase === "aimShoot" || battle.actMode === "fire") {
            const t = nearestUnit(
              col,
              row,
              battle.units.filter(
                (u) => u.alive && u.team !== selected?.team && enemyVisible(battle, u, vis),
              ),
              0.9,
            );
            if (t) {
              fireAt(t.id);
              return;
            }
            if (battle.phase === "aimShoot") return;
          }
          const occupant = nearestUnit(col, row, battle.units, 0.5);
          if (occupant && occupant.team !== localTeam(battle) && !enemyVisible(battle, occupant, vis)) {
            clickTile(col, row);
            return;
          }
          if (occupant && battle.phase !== "aimMove" && battle.phase !== "aimFacing") {
            select(occupant.id);
            return;
          }
          if (
            occupant &&
            occupant.playerId === battle.playerId &&
            occupant.id !== selected?.id &&
            battle.phase !== "aimFacing"
          ) {
            select(occupant.id);
            return;
          }
          if (battle.phase === "aimMove") {
            clickTile(col, row);
            if (useGame.getState().battle?.phase === "aimFacing") {
              moveDrag.current = {
                startCol: col,
                startRow: row,
                from: "aimMove",
                dragged: false,
                armed: true,
              };
            }
            return;
          }
          if (battle.phase === "aimFacing") {
            clickTile(col, row);
            moveDrag.current = {
              startCol: col,
              startRow: row,
              from: "aimFacing",
              dragged: false,
              armed: true,
            };
            return;
          }
          clickTile(col, row);
        }}
      />
      <FogOfWar map={battle.map} explored={battle.explored} visible={vis} />
      {showVis && selected && (
        <VisibilityOverlay unit={selected} map={battle.map} units={battle.units} />
      )}
      {battle.units.map((u) => {
        const modeled = settings.graphics !== "sprites" && hasUnitModel(u.type, u.faction);
        if (!u.alive && !modeled) return null;
        const hidden = u.alive ? !enemyVisible(battle, u, vis) : !tileExplored(battle, u.col, u.row);
        return (
          <group
            key={u.id}
            onClick={(e) => {
              e.stopPropagation();
              if (hidden || !u.alive) return;
              if (!canControl(battle)) return;
              if (
                (battle.phase === "aimShoot" || battle.actMode === "fire") &&
                selected &&
                u.team !== selected.team
              ) {
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
              battle={battle}
              selected={u.id === battle.selectedId && u.playerId === battle.playerId}
              ready={ready.has(u.id)}
              hidden={hidden}
              dim={u.team !== battle.turnTeam || !u.alive}
            />
          </group>
        );
      })}
      {selected && selected.playerId === battle.playerId && (
        <MoveOverlay battle={battle} unit={selected} />
      )}
      <CombatFx events={battle.fx ?? []} />
      <CameraRig />
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
      camera={{ position: [14, 18, 16], fov: 38, near: 0.1, far: 180 }}
      onCreated={({ camera }) => {
        camera.lookAt(0, 0, 0);
      }}
    >
      <Scene />
    </Canvas>
  );
}
