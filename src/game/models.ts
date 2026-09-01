import type { BattleState, Faction, UnitType } from "./types";

export type UnitPose = "idle" | "move" | "reload" | "dead";

export type UnitModelSet = {
  /** Extra yaw on top of game facing, in radians. */
  yawOffset: number;
  /** Uniform scale on top of the file's baked transform. */
  scale: number;
  clips: Record<UnitPose, string[]>;
};

function numbered(faction: Faction, type: UnitType, pose: string, count: number) {
  const slug = type.replaceAll("_", "-");
  const folder = `/assets/3d/${slug}`;
  return Array.from({ length: count }, (_, i) => {
    const n = String(i + 1).padStart(2, "0");
    return `${folder}/${faction}-${slug}-${pose}-${n}.glb`;
  });
}

function pack(
  faction: Faction,
  type: UnitType,
  counts: Partial<Record<UnitPose, number>>,
  extras: Partial<Pick<UnitModelSet, "yawOffset" | "scale">> = {},
): UnitModelSet {
  return {
    yawOffset: extras.yawOffset ?? 0,
    scale: extras.scale ?? 1,
    clips: {
      idle: numbered(faction, type, "idle", counts.idle ?? 0),
      move: numbered(faction, type, "move", counts.move ?? 0),
      reload: numbered(faction, type, "reload", counts.reload ?? 0),
      dead: numbered(faction, type, "dead", counts.dead ?? 0),
    },
  };
}

/**
 * Register glTF clips here as they land in `public/assets/3d/{type}/`.
 * File names: `{faction}-{type}-{pose}-NN.glb` (underscores in type become hyphens).
 */
const CATALOG: Partial<Record<UnitType, Partial<Record<Faction, UnitModelSet>>>> = {
  soldier: {
    empire: pack("empire", "soldier", { idle: 3, move: 2, reload: 1, dead: 3 }),
  },
};

export function unitModelSet(type: UnitType, faction: Faction): UnitModelSet | null {
  return CATALOG[type]?.[faction] ?? null;
}

export function hasUnitModel(type: UnitType, faction: Faction) {
  const set = unitModelSet(type, faction);
  return !!set && set.clips.idle.length > 0;
}

function hashSeed(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h, 31) + seed.charCodeAt(i);
  return h >>> 0;
}

export function pickModelUrl(type: UnitType, faction: Faction, pose: UnitPose, seed: string): string | null {
  const set = unitModelSet(type, faction);
  if (!set) return null;
  const list = (set.clips[pose]?.length ? set.clips[pose] : set.clips.idle) ?? [];
  if (!list.length) return null;
  return list[hashSeed(`${seed}:${pose}`) % list.length];
}

export function unitPose(
  unit: { id: string; alive: boolean },
  battle: {
    phase: BattleState["phase"];
    pendingMove: { unitId: string } | null;
    pendingShot: { attackerId: string; kind: string } | null;
  },
): UnitPose {
  if (!unit.alive) return "dead";
  if (battle.phase === "moving" && battle.pendingMove?.unitId === unit.id) return "move";
  if (
    battle.phase === "resolving" &&
    battle.pendingShot?.attackerId === unit.id &&
    battle.pendingShot.kind !== "melee"
  ) {
    return "reload";
  }
  return "idle";
}

export function allModelUrls(type?: UnitType, faction?: Faction): string[] {
  const out: string[] = [];
  const types = type ? [type] : (Object.keys(CATALOG) as UnitType[]);
  for (const t of types) {
    const byFaction = CATALOG[t];
    if (!byFaction) continue;
    const factions = faction ? [faction] : (Object.keys(byFaction) as Faction[]);
    for (const f of factions) {
      const set = byFaction[f];
      if (!set) continue;
      for (const list of Object.values(set.clips)) out.push(...list);
    }
  }
  return out;
}
