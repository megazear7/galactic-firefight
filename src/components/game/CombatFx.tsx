import { useMemo } from "react";
import { Line } from "@react-three/drei";
import * as THREE from "three";
import type { FxEvent } from "@/game/types";

const ADD = THREE.AdditiveBlending;

function Beam({
  ax,
  ay,
  az,
  bx,
  by,
  bz,
  color,
  opacity,
  radius,
}: {
  ax: number;
  ay: number;
  az: number;
  bx: number;
  by: number;
  bz: number;
  color: string;
  opacity: number;
  radius: number;
}) {
  const { mid, quat, len } = useMemo(() => {
    const from = new THREE.Vector3(ax, ay, az);
    const to = new THREE.Vector3(bx, by, bz);
    const dir = to.clone().sub(from);
    const len = Math.max(0.01, dir.length());
    dir.normalize();
    const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    const mid = from.clone().add(to).multiplyScalar(0.5);
    return { mid, quat, len };
  }, [ax, ay, az, bx, by, bz]);
  return (
    <mesh position={mid} quaternion={quat}>
      <cylinderGeometry args={[radius, radius * 0.55, len, 6, 1, true]} />
      <meshBasicMaterial
        color={color}
        transparent
        opacity={opacity}
        blending={ADD}
        depthWrite={false}
        toneMapped={false}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

function Tracer({ fx }: { fx: FxEvent }) {
  if (fx.age < 0) return null;
  const t = Math.max(0, Math.min(1, fx.age / fx.life));
  const head = Math.min(1, t * 1.35);
  const tail = Math.max(0, head - 0.28);
  const ax = fx.ax + (fx.bx - fx.ax) * tail;
  const ay = fx.ay + (fx.by - fx.ay) * tail;
  const az = fx.az + (fx.bz - fx.az) * tail;
  const bx = fx.ax + (fx.bx - fx.ax) * head;
  const by = fx.ay + (fx.by - fx.ay) * head;
  const bz = fx.az + (fx.bz - fx.az) * head;
  const glow = 1 - t * 0.35;
  return (
    <group>
      <Beam
        ax={fx.ax}
        ay={fx.ay}
        az={fx.az}
        bx={fx.bx}
        by={fx.by}
        bz={fx.bz}
        color={fx.tint}
        opacity={0.22 * glow}
        radius={0.045}
      />
      {head - tail > 0.02 ? (
        <>
          <Beam ax={ax} ay={ay} az={az} bx={bx} by={by} bz={bz} color="#fff6e0" opacity={0.95 * glow} radius={0.07} />
          <mesh position={[bx, by, bz]}>
            <sphereGeometry args={[0.13, 10, 10]} />
            <meshBasicMaterial
              color="#fff8e8"
              transparent
              opacity={0.95 * glow}
              blending={ADD}
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
        </>
      ) : null}
    </group>
  );
}

function Muzzle({ fx }: { fx: FxEvent }) {
  const t = Math.max(0, Math.min(1, fx.age / fx.life));
  const s = 0.16 + t * 0.7;
  const op = 1 - t * t;
  const spikes = useMemo(() => {
    const out: number[] = [];
    for (let i = 0; i < 6; i++) out.push((i / 6) * Math.PI * 2 + fx.ax * 0.3);
    return out;
  }, [fx.ax]);
  return (
    <group position={[fx.ax, fx.ay, fx.az]}>
      <mesh>
        <sphereGeometry args={[s * 0.28, 12, 12]} />
        <meshBasicMaterial
          color="#fff7d8"
          transparent
          opacity={0.95 * op}
          blending={ADD}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      <mesh>
        <sphereGeometry args={[s * 0.62, 12, 12]} />
        <meshBasicMaterial
          color={fx.tint}
          transparent
          opacity={0.5 * op}
          blending={ADD}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      {spikes.map((a, i) => (
        <mesh key={i} rotation={[0, a, a * 0.2]} scale={[0.06, s * 1.1, 0.06]}>
          <boxGeometry args={[1, 1, 1]} />
          <meshBasicMaterial
            color="#fff4cc"
            transparent
            opacity={0.7 * op}
            blending={ADD}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      ))}
    </group>
  );
}

function Impact({ fx }: { fx: FxEvent }) {
  const t = Math.max(0, Math.min(1, fx.age / fx.life));
  if (fx.age < 0) return null;
  const op = 1 - t;
  const sparks = useMemo(() => {
    const pts: Array<[number, number, number]> = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + fx.ax;
      pts.push([Math.cos(a) * 0.48, 0.1 + (i % 3) * 0.1, Math.sin(a) * 0.48]);
    }
    return pts;
  }, [fx.ax]);
  return (
    <group position={[fx.ax, fx.ay, fx.az]}>
      <mesh scale={0.45 + t * 1.1}>
        <sphereGeometry args={[0.12, 10, 10]} />
        <meshBasicMaterial
          color="#ffffff"
          transparent
          opacity={0.75 * op}
          blending={ADD}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -fx.ay + 0.05, 0]} scale={0.35 + t * 1.4}>
        <ringGeometry args={[0.16, 0.28, 20]} />
        <meshBasicMaterial
          color={fx.tint}
          transparent
          opacity={0.55 * op}
          blending={ADD}
          depthWrite={false}
          toneMapped={false}
          side={THREE.DoubleSide}
        />
      </mesh>
      {sparks.map((p, i) => (
        <Line
          key={i}
          points={[
            [0, 0, 0],
            [p[0] * (0.4 + t), p[1], p[2] * (0.4 + t)],
          ]}
          color={fx.tint}
          lineWidth={1.6}
          transparent
          opacity={0.9 * op}
        />
      ))}
    </group>
  );
}

function Slash({ fx }: { fx: FxEvent }) {
  const t = Math.max(0, Math.min(1, fx.age / fx.life));
  const dirx = fx.bx - fx.ax;
  const dirz = fx.bz - fx.az;
  const yaw = Math.atan2(dirx, dirz);
  const sweep = -0.85 + t * 1.9;
  const midX = (fx.ax + fx.bx) * 0.5;
  const midY = (fx.ay + fx.by) * 0.5 + 0.12;
  const midZ = (fx.az + fx.bz) * 0.5;
  const op = t < 0.12 ? t / 0.12 : Math.max(0, 1 - (t - 0.12) / 0.88);
  return (
    <group position={[midX, midY, midZ]}>
      <mesh rotation={[Math.PI / 2.15, yaw + sweep, 0]}>
        <ringGeometry args={[0.32, 0.82, 22, 1, 0, Math.PI * 0.78]} />
        <meshBasicMaterial
          color={fx.tint}
          transparent
          opacity={0.9 * op}
          blending={ADD}
          depthWrite={false}
          toneMapped={false}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh rotation={[Math.PI / 2.15, yaw + sweep * 0.55, 0]}>
        <ringGeometry args={[0.22, 0.52, 16, 1, 0, Math.PI * 0.55]} />
        <meshBasicMaterial
          color="#ffffff"
          transparent
          opacity={0.7 * op}
          blending={ADD}
          depthWrite={false}
          toneMapped={false}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh position={[dirx * 0.18, 0.05, dirz * 0.18]} scale={0.7 + t * 0.8}>
        <sphereGeometry args={[0.14, 8, 8]} />
        <meshBasicMaterial
          color="#fff6e0"
          transparent
          opacity={0.55 * op}
          blending={ADD}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

export function CombatFx({ events }: { events: FxEvent[] }) {
  if (!events.length) return null;
  return (
    <group>
      {events.map((fx) => {
        if (fx.kind === "tracer") return <Tracer key={fx.id} fx={fx} />;
        if (fx.kind === "muzzle") return <Muzzle key={fx.id} fx={fx} />;
        if (fx.kind === "impact") return <Impact key={fx.id} fx={fx} />;
        return <Slash key={fx.id} fx={fx} />;
      })}
    </group>
  );
}
