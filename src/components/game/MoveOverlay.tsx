import { useMemo } from "react";
import { Line } from "@react-three/drei";
import { TILE, tileToWorld } from "@/game/map";
import { UNIT_STATS } from "@/game/units";
import { previewPath } from "@/game/battle";
import { rangedTargets } from "@/game/combat";
import type { BattleState, PathPoint, UnitState } from "@/game/types";

function circlePoints(radius: number, y: number) {
  const pts: Array<[number, number, number]> = [];
  const n = 72;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    pts.push([Math.cos(a) * radius, y, Math.sin(a) * radius]);
  }
  return pts;
}

function worldPath(path: PathPoint[], map: BattleState["map"]): Array<[number, number, number]> {
  return path.map((p) => {
    const w = tileToWorld(p.col, p.row, map);
    return [w.x, 0.08, w.z];
  });
}

function DestMark({ x, z, color }: { x: number; z: number; color: string }) {
  return (
    <group position={[x, 0, z]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.06, 0]}>
        <ringGeometry args={[0.1, 0.22, 24]} />
        <meshBasicMaterial color={color} transparent opacity={0.9} depthWrite={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.055, 0]}>
        <circleGeometry args={[0.08, 16]} />
        <meshBasicMaterial color={color} transparent opacity={0.35} depthWrite={false} />
      </mesh>
    </group>
  );
}

function ArcLines({
  facing,
  arc,
  range,
  color,
}: {
  facing: number;
  arc: number;
  range: number;
  color: string;
}) {
  if (arc >= 359) return null;
  const half = ((arc * Math.PI) / 180) / 2;
  const pts: Array<[number, number, number]> = [[0, 0.07, 0]];
  const steps = 16;
  for (let i = 0; i <= steps; i++) {
    const a = facing - half + (i / steps) * half * 2;
    pts.push([Math.cos(a) * range, 0.07, Math.sin(a) * range]);
  }
  pts.push([0, 0.07, 0]);
  return (
    <Line
      points={pts}
      color={color}
      dashed
      dashSize={0.16}
      gapSize={0.1}
      lineWidth={1.2}
      transparent
      opacity={0.32}
    />
  );
}

function RangedArc({ facing, arc, range, moved, assault }: { facing: number; arc: number; range: number; moved: boolean; assault: boolean }) {
  const reduced = moved && !assault;
  return (
    <>
      {reduced && <ArcLines facing={facing} arc={arc} range={(range / 2) * TILE} color="#d8dde4" />}
      <ArcLines facing={facing} arc={arc} range={range * TILE} color={reduced ? "#c45c4a" : "#d8dde4"} />
    </>
  );
}

export function MoveOverlay({ battle, unit }: { battle: BattleState; unit: UnitState }) {
  const stats = UNIT_STATS[unit.type];
  const origin = tileToWorld(unit.col, unit.row, battle.map);
  const dest = battle.pendingMove
    ? tileToWorld(battle.pendingMove.destCol, battle.pendingMove.destRow, battle.map)
    : origin;
  const facing = battle.pendingMove?.facing ?? unit.facing;
  const targets =
    battle.phase === "aimShoot" ? rangedTargets(unit, battle.units, battle.map) : [];

  const hoverPath = useMemo(() => {
    if (battle.phase !== "aimMove") return null;
    if (battle.hoverCol == null || battle.hoverRow == null) return null;
    return previewPath(battle, unit, battle.hoverCol, battle.hoverRow);
  }, [battle, unit, battle.hoverCol, battle.hoverRow, battle.phase]);

  const confirmed =
    battle.phase === "aimFacing" && battle.pendingMove ? worldPath(battle.pendingMove.path, battle.map) : null;
  const hoverPts = hoverPath && hoverPath.length > 1 ? worldPath(hoverPath, battle.map) : null;
  const hoverEnd =
    battle.phase === "aimMove" && hoverPath && hoverPath.length
      ? tileToWorld(hoverPath[hoverPath.length - 1].col, hoverPath[hoverPath.length - 1].row, battle.map)
      : battle.phase === "aimMove" && battle.hoverCol != null && battle.hoverRow != null
        ? tileToWorld(battle.hoverCol, battle.hoverRow, battle.map)
        : null;

  return (
    <group>
      {(battle.phase === "aimMove" || battle.phase === "aimFacing") && (
        <group position={[origin.x, 0, origin.z]}>
          <Line
            points={circlePoints(stats.move * TILE, 0.06)}
            color="#6fbf7a"
            dashed
            dashSize={0.18}
            gapSize={0.12}
            lineWidth={1.2}
            transparent
            opacity={0.32}
          />
        </group>
      )}
      {hoverPts && (
        <Line
          points={hoverPts}
          color="#8ed49a"
          dashed
          dashSize={0.14}
          gapSize={0.1}
          lineWidth={1.6}
          transparent
          opacity={0.4}
        />
      )}
      {hoverEnd && <DestMark x={hoverEnd.x} z={hoverEnd.z} color="#8ed49a" />}
      {confirmed && confirmed.length > 1 && (
        <Line points={confirmed} color="#6fbf7a" lineWidth={2} transparent opacity={0.45} />
      )}
      {battle.phase === "aimFacing" && battle.pendingMove && (
        <group position={[dest.x, 0, dest.z]}>
          <DestMark x={0} z={0} color="#6fbf7a" />
          <mesh position={[0, 0.55, 0]}>
            <coneGeometry args={[0.12, 0.4, 4]} />
            <meshStandardMaterial color="#6fbf7a" />
          </mesh>
          <mesh position={[0, 0.28, 0]}>
            <cylinderGeometry args={[0.04, 0.04, 0.5, 6]} />
            <meshStandardMaterial color="#c5ccd6" />
          </mesh>
          <mesh
            position={[Math.cos(facing) * 0.7, 0.12, Math.sin(facing) * 0.7]}
            rotation={[0, -facing, 0]}
          >
            <coneGeometry args={[0.1, 0.55, 8]} />
            <meshBasicMaterial color="#6fbf7a" />
          </mesh>
          {stats.range > 0 && (
            <RangedArc facing={facing} arc={stats.arc} range={stats.range} moved={unit.moved} assault={stats.assault} />
          )}
        </group>
      )}
      {(battle.phase === "aimShoot" || battle.actMode === "fire") && stats.range > 0 && (
        <group position={[origin.x, 0, origin.z]}>
          <RangedArc facing={unit.facing} arc={stats.arc} range={stats.range} moved={unit.moved} assault={stats.assault} />
        </group>
      )}
      {targets.map((t) => {
        const p = tileToWorld(t.col, t.row, battle.map);
        return (
          <mesh key={t.id} rotation={[-Math.PI / 2, 0, 0]} position={[p.x, 0.04, p.z]}>
            <ringGeometry args={[0.5, 0.64, 24]} />
            <meshBasicMaterial color="#c45c4a" transparent opacity={0.7} depthWrite={false} />
          </mesh>
        );
      })}
    </group>
  );
}
