import type { BattleState, Faction, UnitType } from "./types";

export type UnitPose = "idle" | "idle_special" | "move" | "reload" | "ranged" | "melee" | "dead";

export const IDLE_SPECIAL_CHANCE = 0.05;

export type UnitModelSet = {
  /** Extra yaw on top of game facing, in radians. */
  yawOffset: number;
  /** Uniform scale on top of the file's baked transform. */
  scale: number;
  clips: Record<UnitPose, string[]>;
};

function numbered(
  faction: Faction,
  type: UnitType,
  pose: string,
  count: number,
  filePrefix?: string,
) {
  const slug = type.replaceAll("_", "-");
  const poseSlug = pose.replaceAll("_", "-");
  const folder = `/assets/3d/${slug}`;
  const head = filePrefix ?? faction;
  return Array.from({ length: count }, (_, i) => {
    const n = String(i + 1).padStart(2, "0");
    return `${folder}/${head}-${slug}-${poseSlug}-${n}.glb`;
  });
}

function emptyClips(): Record<UnitPose, string[]> {
  return {
    idle: [],
    idle_special: [],
    move: [],
    reload: [],
    ranged: [],
    melee: [],
    dead: [],
  };
}

function pack(
  faction: Faction,
  type: UnitType,
  counts: Partial<Record<UnitPose, number>>,
  extras: Partial<Pick<UnitModelSet, "yawOffset" | "scale">> & { filePrefix?: string } = {},
): UnitModelSet {
  const prefix = extras.filePrefix;
  return {
    yawOffset: extras.yawOffset ?? 0,
    scale: extras.scale ?? 1,
    clips: {
      idle: numbered(faction, type, "idle", counts.idle ?? 0, prefix),
      idle_special: numbered(faction, type, "idle_special", counts.idle_special ?? 0, prefix),
      move: numbered(faction, type, "move", counts.move ?? 0, prefix),
      reload: numbered(faction, type, "reload", counts.reload ?? 0, prefix),
      ranged: numbered(faction, type, "ranged", counts.ranged ?? 0, prefix),
      melee: numbered(faction, type, "melee", counts.melee ?? 0, prefix),
      dead: numbered(faction, type, "dead", counts.dead ?? 0, prefix),
    },
  };
}

/** One unanimated mesh used for every pose until clips exist. */
function staticMesh(
  url: string,
  extras: Partial<Pick<UnitModelSet, "yawOffset" | "scale">> = {},
): UnitModelSet {
  const clips = emptyClips();
  clips.idle = [url];
  return { yawOffset: extras.yawOffset ?? 0, scale: extras.scale ?? 1, clips };
}

/**
 * Register glTF clips here as they land in `public/assets/3d/{type}/`.
 * File names: `{faction}-{type}-{pose}-NN.glb` (underscores in type become hyphens).
 * Pass `filePrefix` when the files use a different head than the faction slug.
 */
const CATALOG: Partial<Record<UnitType, Partial<Record<Faction, UnitModelSet>>>> = {
  soldier: {
    empire: pack("empire", "soldier", { idle: 2, move: 1, reload: 1, melee: 1, dead: 1 }),
  },
  captain: {
    empire: pack("empire", "captain", {
      idle: 2,
      idle_special: 1,
      move: 1,
      ranged: 1,
      melee: 1,
      dead: 1,
    }),
  },
  sniper: {
    empire: pack("empire", "sniper", {
      idle: 2,
      idle_special: 0,
      move: 1,
      ranged: 1,
      melee: 1,
      dead: 1,
    }),
  },
  machine_gunner: {
    empire: staticMesh("/assets/3d/machine-gunner/machine-gunner.glb"),
  },
  broodling: {
    brood: pack(
      "brood",
      "broodling",
      { idle: 2, move: 1, melee: 1, dead: 1 },
      { filePrefix: "swarm" },
    ),
  },
  spatling: {
    brood: pack(
      "brood",
      "spatling",
      { idle: 2, move: 1, ranged: 0, dead: 1 },
      { filePrefix: "swarm" },
    ),
  },
  tyrant: {
    brood: pack(
      "brood",
      "tyrant",
      { idle: 2, move: 1, melee: 0, ranged: 0, dead: 1 },
      { filePrefix: "swarm", scale: 2 },
    ),
  },
};

export function unitModelSet(type: UnitType, faction: Faction): UnitModelSet | null {
  return CATALOG[type]?.[faction] ?? null;
}

export function hasUnitModel(type: UnitType, faction: Faction) {
  const set = unitModelSet(type, faction);
  return !!set && set.clips.idle.length > 0;
}

export function hasClip(type: UnitType, faction: Faction, pose: UnitPose) {
  return (unitModelSet(type, faction)?.clips[pose]?.length ?? 0) > 0;
}

export function hasDeathClip(type: UnitType, faction: Faction) {
  return hasClip(type, faction, "dead");
}

function hashSeed(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h, 31) + seed.charCodeAt(i);
  return h >>> 0;
}

export function pickModelUrl(
  type: UnitType,
  faction: Faction,
  pose: UnitPose,
  seed: string,
): string | null {
  const set = unitModelSet(type, faction);
  if (!set) return null;
  const list = (set.clips[pose]?.length ? set.clips[pose] : set.clips.idle) ?? [];
  if (!list.length) return null;
  return list[hashSeed(`${seed}:${pose}`) % list.length];
}

export function unitPose(
  unit: { id: string; alive: boolean; type?: UnitType; faction?: Faction },
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
    unit.type &&
    unit.faction
  ) {
    if (battle.pendingShot.kind === "melee") {
      if (hasClip(unit.type, unit.faction, "melee")) return "melee";
    } else {
      if (hasClip(unit.type, unit.faction, "ranged")) return "ranged";
      if (hasClip(unit.type, unit.faction, "reload")) return "reload";
    }
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

/** One idle clip per type on the field. Variants share a clip so GPU memory stays shared. */
export function rosterModelUrls(units: Array<{ type: UnitType; faction: Faction }>): string[] {
  const urls = new Set<string>();
  const seen = new Set<string>();
  for (const u of units) {
    const key = `${u.type}:${u.faction}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const idle = pickModelUrl(u.type, u.faction, "idle", key);
    if (idle) urls.add(idle);
  }
  return [...urls];
}
