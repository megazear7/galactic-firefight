import { useMemo } from "react";
import * as THREE from "three";
import type { FxEvent } from "@/game/types";

function orientY(ax: number, ay: number, az: number, bx: number, by: number, bz: number) {
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  const len = Math.max(0.05, Math.hypot(dx, dy, dz));
  const dir = new THREE.Vector3(dx / len, dy / len, dz / len);
  const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  return {
    mid: [(ax + bx) / 2, (ay + by) / 2, (az + bz) / 2] as [number, number, number],
    quat,
    len,
  };
}

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
  const { mid, quat, len } = orientY(ax, ay, az, bx, by, bz);
  return (
    <mesh position={mid} quaternion={quat}>
      <cylinderGeometry args={[radius, radius * 0.7, len, 10]} />
      <meshBasicMaterial color={color} transparent opacity={opacity} depthWrite={false} toneMapped={false} />
    </mesh>
  );
}

function Tracer({ fx }: { fx: FxEvent }) {
  if (fx.age < 0) return null;
  const t = Math.max(0, Math.min(1, fx.age / fx.life));
  const head = Math.min(1, 0.2 + t * 1.1);
  const tail = Math.max(0, head - 0.55);
  const ax = fx.ax + (fx.bx - fx.ax) * tail;
  const ay = fx.ay + (fx.by - fx.ay) * tail;
  const az = fx.az + (fx.bz - fx.az) * tail;
  const bx = fx.ax + (fx.bx - fx.ax) * head;
  const by = fx.ay + (fx.by - fx.ay) * head;
  const bz = fx.az + (fx.bz - fx.az) * head;
  const glow = 1 - t * 0.18;
  return (
    <group>
      <Beam
        ax={fx.ax}
        ay={0.18}
        az={fx.az}
        bx={fx.bx}
        by={0.18}
        bz={fx.bz}
        color={fx.tint}
        opacity={0.7 * glow}
        radius={0.2}
      />
      <Beam
        ax={fx.ax}
        ay={fx.ay}
        az={fx.az}
        bx={fx.bx}
        by={fx.by}
        bz={fx.bz}
        color={fx.tint}
        opacity={0.9 * glow}
        radius={0.16}
      />
      <Beam ax={ax} ay={ay} az={az} bx={bx} by={by} bz={bz} color="#fff6d6" opacity={0.98 * glow} radius={0.26} />
      <mesh position={[bx, by, bz]}>
        <sphereGeometry args={[0.48, 12, 12]} />
        <meshBasicMaterial color="#fffaf0" transparent opacity={0.95 * glow} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  );
}

function Muzzle({ fx }: { fx: FxEvent }) {
  if (fx.age < 0) return null;
  const t = Math.max(0, Math.min(1, fx.age / fx.life));
  const s = 0.5 + t * 1.15;
  const op = 1 - t * t;
  const spikes = useMemo(() => {
    const out: number[] = [];
    for (let i = 0; i < 8; i++) out.push((i / 8) * Math.PI * 2 + fx.ax * 0.2);
    return out;
  }, [fx.ax]);
  return (
    <group position={[fx.ax, fx.ay, fx.az]}>
      <mesh>
        <sphereGeometry args={[s * 0.6, 12, 12]} />
        <meshBasicMaterial color="#fff7d8" transparent opacity={0.98 * op} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh>
        <sphereGeometry args={[s * 1.1, 12, 12]} />
        <meshBasicMaterial color={fx.tint} transparent opacity={0.7 * op} depthWrite={false} toneMapped={false} />
      </mesh>
      {spikes.map((a, i) => (
        <mesh key={i} rotation={[0.4, a, 0.1]} scale={[0.16, s * 1.7, 0.16]}>
          <boxGeometry args={[1, 1, 1]} />
          <meshBasicMaterial color="#ffe7a0" transparent opacity={0.88 * op} depthWrite={false} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

function Impact({ fx }: { fx: FxEvent }) {
  if (fx.age < 0) return null;
  const t = Math.max(0, Math.min(1, fx.age / fx.life));
  const op = 1 - t;
  const sparks = useMemo(() => {
    const pts: Array<[number, number, number]> = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + fx.ax;
      pts.push([Math.cos(a), 0.25 + (i % 3) * 0.12, Math.sin(a)]);
    }
    return pts;
  }, [fx.ax]);
  return (
    <group position={[fx.ax, fx.ay, fx.az]}>
      <mesh scale={0.9 + t * 1.4}>
        <sphereGeometry args={[0.42, 12, 12]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.92 * op} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -fx.ay + 0.1, 0]} scale={0.8 + t * 2.2}>
        <ringGeometry args={[0.3, 0.6, 24]} />
        <meshBasicMaterial
          color={fx.tint}
          transparent
          opacity={0.85 * op}
          depthWrite={false}
          toneMapped={false}
          side={THREE.DoubleSide}
        />
      </mesh>
      {sparks.map((p, i) => (
        <mesh key={i} position={[p[0] * (0.4 + t * 0.75), p[1], p[2] * (0.4 + t * 0.75)]}>
          <sphereGeometry args={[0.08, 6, 6]} />
          <meshBasicMaterial color={fx.tint} transparent opacity={0.92 * op} depthWrite={false} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

function Slash({ fx }: { fx: FxEvent }) {
  const t = Math.max(0, Math.min(1, fx.age / fx.life));
  const dirx = fx.bx - fx.ax;
  const dirz = fx.bz - fx.az;
  const yaw = Math.atan2(dirx, dirz);
  const sweep = -0.95 + t * 2.15;
  const midX = (fx.ax + fx.bx) * 0.5;
  const midY = (fx.ay + fx.by) * 0.5 + 0.25;
  const midZ = (fx.az + fx.bz) * 0.5;
  const op = t < 0.1 ? t / 0.1 : Math.max(0, 1 - (t - 0.1) / 0.9);
  return (
    <group position={[midX, midY, midZ]} rotation={[0, yaw, 0]}>
      <mesh rotation={[Math.PI / 2.08, sweep, 0]}>
        <ringGeometry args={[0.55, 1.55, 28, 1, 0, Math.PI * 0.9]} />
        <meshBasicMaterial
          color={fx.tint}
          transparent
          opacity={0.95 * op}
          depthWrite={false}
          toneMapped={false}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh rotation={[Math.PI / 2.08, sweep * 0.6, 0]}>
        <ringGeometry args={[0.3, 0.85, 20, 1, 0, Math.PI * 0.65]} />
        <meshBasicMaterial
          color="#ffffff"
          transparent
          opacity={0.9 * op}
          depthWrite={false}
          toneMapped={false}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh rotation={[0, sweep, 0]}>
        <boxGeometry args={[0.16, 0.1, 2.4]} />
        <meshBasicMaterial color="#fff8e0" transparent opacity={0.9 * op} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh scale={1 + t * 1.2}>
        <sphereGeometry args={[0.36, 10, 10]} />
        <meshBasicMaterial color="#fff6e0" transparent opacity={0.8 * op} depthWrite={false} toneMapped={false} />
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
