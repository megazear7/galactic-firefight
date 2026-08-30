import type { UnitType } from "@/game/types";

/** Drop glTF files here later and switch UnitVisual to useGLTF(url). */
export const MODEL_URLS: Partial<Record<UnitType, string>> = {};

const COLOR: Record<UnitType, string> = {
  captain: "#8d8f96",
  soldier: "#6e737c",
  machine_gunner: "#5c616a",
  sniper: "#4a4e56",
  tyrant: "#5a6238",
  broodling: "#6a7344",
  spatling: "#4e5534",
};

export function PlaceholderModel({ type, factionTint }: { type: UnitType; factionTint: string }) {
  const c = COLOR[type];
  if (type === "tyrant") {
    return (
      <group>
        <mesh position={[0, 0.45, 0.18]} castShadow>
          <capsuleGeometry args={[0.18, 0.55, 4, 8]} />
          <meshStandardMaterial color={c} metalness={0.1} roughness={0.7} />
        </mesh>
        <mesh position={[0, 0.45, -0.18]} castShadow>
          <capsuleGeometry args={[0.18, 0.55, 4, 8]} />
          <meshStandardMaterial color={c} metalness={0.1} roughness={0.7} />
        </mesh>
        <mesh position={[0, 1.15, 0]} castShadow>
          <sphereGeometry args={[0.42, 12, 10]} />
          <meshStandardMaterial color={c} metalness={0.15} roughness={0.55} />
        </mesh>
        <mesh position={[0.42, 1.05, 0.22]} rotation={[0, 0, -0.6]} castShadow>
          <boxGeometry args={[0.7, 0.12, 0.12]} />
          <meshStandardMaterial color={factionTint} />
        </mesh>
        <mesh position={[0.42, 1.05, -0.22]} rotation={[0, 0, -0.6]} castShadow>
          <boxGeometry args={[0.7, 0.12, 0.12]} />
          <meshStandardMaterial color={factionTint} />
        </mesh>
      </group>
    );
  }
  if (type === "broodling") {
    return (
      <group>
        <mesh position={[0, 0.28, 0]} castShadow>
          <sphereGeometry args={[0.22, 10, 8]} />
          <meshStandardMaterial color={c} roughness={0.6} />
        </mesh>
        <mesh position={[0.22, 0.32, 0]} rotation={[0, 0, -0.8]} castShadow>
          <boxGeometry args={[0.38, 0.06, 0.06]} />
          <meshStandardMaterial color="#cfc6a8" />
        </mesh>
      </group>
    );
  }
  const tall = type === "sniper" || type === "captain";
  return (
    <group>
      <mesh position={[0, tall ? 0.55 : 0.48, 0]} castShadow>
        <capsuleGeometry args={[0.16, tall ? 0.55 : 0.42, 4, 8]} />
        <meshStandardMaterial color={c} metalness={0.35} roughness={0.45} />
      </mesh>
      <mesh position={[0, tall ? 1.02 : 0.88, 0]} castShadow>
        <sphereGeometry args={[0.14, 10, 8]} />
        <meshStandardMaterial color={c} metalness={0.3} roughness={0.4} />
      </mesh>
      <mesh position={[0.28, 0.72, 0]} rotation={[0, 0, -0.4]} castShadow>
        <boxGeometry args={[type === "machine_gunner" ? 0.7 : type === "sniper" ? 0.85 : 0.5, 0.07, 0.07]} />
        <meshStandardMaterial color={factionTint} metalness={0.6} roughness={0.3} />
      </mesh>
    </group>
  );
}
