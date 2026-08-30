import { Line } from "@react-three/drei";
import { TILE, tileToWorld } from "@/game/map";
import { UNIT_STATS } from "@/game/units";
import { reachableTiles } from "@/game/battle";
import { rangedTargets } from "@/game/combat";
import type { BattleState, UnitState } from "@/game/types";

function circlePoints(radius: number, y: number) {
  const pts: Array<[number, number, number]> = [];
  const n = 64;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    pts.push([Math.cos(a) * radius, y, Math.sin(a) * radius]);
  }
  return pts;
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
  const half = ((arc * Math.PI) / 180) / 2;
  const pts: Array<[number, number, number]> = [[0, 0.07, 0]];
  const steps = 12;
  for (let i = 0; i <= steps; i++) {
    const a = facing - half + (i / steps) * half * 2;
    pts.push([Math.cos(a) * range, 0.07, Math.sin(a) * range]);
  }
  pts.push([0, 0.07, 0]);
  return <Line points={pts} color={color} dashed dashSize={0.16} gapSize={0.1} lineWidth={1.5} />;
}

export function MoveOverlay({ battle, unit }: { battle: BattleState; unit: UnitState }) {
  const stats = UNIT_STATS[unit.type];
  const origin = tileToWorld(unit.col, unit.row, battle.map);
  const dest = battle.pendingMove
    ? tileToWorld(battle.pendingMove.destCol, battle.pendingMove.destRow, battle.map)
    : origin;
  const reach = battle.phase === "aimMove" ? reachableTiles(battle, unit) : null;
  const facing = battle.pendingMove?.facing ?? unit.facing;
  const targets =
    battle.phase === "aimShoot" ? rangedTargets(unit, battle.units, battle.map) : [];

  return (
    <group>
      {reach &&
        [...reach.values()].map((t) => {
          const p = tileToWorld(t.col, t.row, battle.map);
          return (
            <mesh key={`${t.col}:${t.row}`} rotation={[-Math.PI / 2, 0, 0]} position={[p.x, 0.03, p.z]}>
              <circleGeometry args={[TILE * 0.38, 16]} />
              <meshBasicMaterial color="#6fbf7a" transparent opacity={0.18} depthWrite={false} />
            </mesh>
          );
        })}
      {(battle.phase === "aimMove" || battle.phase === "aimFacing") && (
        <group position={[origin.x, 0, origin.z]}>
          <Line
            points={circlePoints(stats.move * TILE, 0.06)}
            color="#6fbf7a"
            dashed
            dashSize={0.18}
            gapSize={0.12}
            lineWidth={1.5}
          />
        </group>
      )}
      {battle.phase === "aimFacing" && battle.pendingMove && (
        <group position={[dest.x, 0, dest.z]}>
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
            <ArcLines facing={facing} arc={stats.arc} range={stats.range * TILE} color="#c5ccd6" />
          )}
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
