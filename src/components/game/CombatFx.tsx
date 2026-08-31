import * as THREE from "three";
import type { FxEvent } from "@/game/types";

const Y_UP = new THREE.Vector3(0, 1, 0);

function travelQuat(fx: FxEvent) {
  const dx = fx.bx - fx.ax;
  const dy = fx.by - fx.ay;
  const dz = fx.bz - fx.az;
  const len = Math.max(0.04, Math.hypot(dx, dy, dz));
  const dir = new THREE.Vector3(dx / len, dy / len, dz / len);
  return new THREE.Quaternion().setFromUnitVectors(Y_UP, dir);
}

function Bullet({ fx }: { fx: FxEvent }) {
  if (fx.age < 0) return null;
  const t = Math.max(0, Math.min(1, fx.age / fx.life));
  const x = fx.ax + (fx.bx - fx.ax) * t;
  const y = fx.ay + (fx.by - fx.ay) * t;
  const z = fx.az + (fx.bz - fx.az) * t;
  const fade = t > 0.82 ? (1 - t) / 0.18 : 1;
  const quat = travelQuat(fx);
  return (
    <group position={[x, y, z]} quaternion={quat}>
      <mesh>
        <cylinderGeometry args={[0.022, 0.014, 0.18, 6]} />
        <meshBasicMaterial color="#fff6d6" transparent opacity={0.96 * fade} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh position={[0, -0.14, 0]}>
        <cylinderGeometry args={[0.012, 0.004, 0.22, 6]} />
        <meshBasicMaterial color={fx.tint} transparent opacity={0.55 * fade} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0.09, 0]}>
        <sphereGeometry args={[0.028, 8, 8]} />
        <meshBasicMaterial color="#fffaf0" transparent opacity={0.9 * fade} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  );
}

function Muzzle({ fx }: { fx: FxEvent }) {
  if (fx.age < 0) return null;
  const t = Math.max(0, Math.min(1, fx.age / fx.life));
  const op = Math.max(0, 1 - t * t);
  const s = 0.09 + t * 0.08;
  return (
    <group position={[fx.ax, fx.ay, fx.az]}>
      <mesh>
        <sphereGeometry args={[s * 0.55, 8, 8]} />
        <meshBasicMaterial color="#fff7d8" transparent opacity={0.9 * op} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh>
        <sphereGeometry args={[s, 8, 8]} />
        <meshBasicMaterial color={fx.tint} transparent opacity={0.45 * op} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  );
}

function Impact({ fx }: { fx: FxEvent }) {
  if (fx.age < 0) return null;
  const t = Math.max(0, Math.min(1, fx.age / fx.life));
  const op = 1 - t;
  const spread = 0.08 + t * 0.16;
  const sparks: Array<[number, number, number]> = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + fx.ax * 0.7;
    sparks.push([Math.cos(a) * spread, 0.04 + (i % 2) * 0.05, Math.sin(a) * spread]);
  }
  return (
    <group position={[fx.ax, fx.ay, fx.az]}>
      <mesh scale={0.7 + t * 0.7}>
        <sphereGeometry args={[0.07, 8, 8]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.85 * op} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} scale={0.55 + t * 0.9}>
        <ringGeometry args={[0.05, 0.11, 16]} />
        <meshBasicMaterial
          color={fx.tint}
          transparent
          opacity={0.55 * op}
          depthWrite={false}
          toneMapped={false}
          side={THREE.DoubleSide}
        />
      </mesh>
      {sparks.map((p, i) => (
        <mesh key={i} position={p}>
          <sphereGeometry args={[0.018, 5, 5]} />
          <meshBasicMaterial color={fx.tint} transparent opacity={0.8 * op} depthWrite={false} toneMapped={false} />
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
  const sweep = -0.7 + t * 1.55;
  const midX = (fx.ax + fx.bx) * 0.5;
  const midY = (fx.ay + fx.by) * 0.5 + 0.18;
  const midZ = (fx.az + fx.bz) * 0.5;
  const op = (t < 0.12 ? t / 0.12 : Math.max(0, 1 - (t - 0.12) / 0.88)) * 0.42;
  return (
    <group position={[midX, midY, midZ]} rotation={[0, yaw, 0]}>
      <mesh rotation={[Math.PI / 2.08, sweep, 0]}>
        <ringGeometry args={[0.22, 0.72, 20, 1, 0, Math.PI * 0.7]} />
        <meshBasicMaterial
          color={fx.tint}
          transparent
          opacity={0.7 * op}
          depthWrite={false}
          toneMapped={false}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh rotation={[Math.PI / 2.08, sweep * 0.6, 0]}>
        <ringGeometry args={[0.14, 0.4, 16, 1, 0, Math.PI * 0.5]} />
        <meshBasicMaterial
          color="#ffffff"
          transparent
          opacity={0.55 * op}
          depthWrite={false}
          toneMapped={false}
          side={THREE.DoubleSide}
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
        if (fx.kind === "tracer") return <Bullet key={fx.id} fx={fx} />;
        if (fx.kind === "muzzle") return <Muzzle key={fx.id} fx={fx} />;
        if (fx.kind === "impact") return <Impact key={fx.id} fx={fx} />;
        return <Slash key={fx.id} fx={fx} />;
      })}
    </group>
  );
}
