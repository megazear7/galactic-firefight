import type { ArmyLoadout, Faction, PointScale, UnitStats, UnitType } from "./types";

export const UNIT_STATS: Record<UnitType, UnitStats> = {
  captain: {
    type: "captain",
    faction: "empire",
    name: "Captain",
    role: "Command",
    description:
      "Short-ranged pistol with a full 360° firing arc. Issued free with the task force; one extra can be commissioned.",
    cost: 38,
    hp: 14,
    move: 4,
    speed: 1,
    range: 4,
    damage: 7,
    overwatchDamage: 3,
    arc: 360,
    meleeDamage: 5,
    meleeRange: 1.35,
    size: 1,
    stealth: false,
    stealthRevealRange: 0,
    aoeRadius: 0,
    multiTargetRadius: 0,
    maxTargets: 1,
  },
  soldier: {
    type: "soldier",
    faction: "empire",
    name: "Soldier",
    role: "Line infantry",
    description: "Medium-ranged assault rifle and a 180° arc. The backbone of every imperial firing line.",
    cost: 15,
    hp: 9,
    move: 4,
    speed: 1,
    range: 6,
    damage: 4,
    overwatchDamage: 2,
    arc: 180,
    meleeDamage: 2,
    meleeRange: 1.35,
    size: 1,
    stealth: false,
    stealthRevealRange: 0,
    aoeRadius: 0,
    multiTargetRadius: 0,
    maxTargets: 1,
  },
  machine_gunner: {
    type: "machine_gunner",
    faction: "empire",
    name: "Machine Gunner",
    role: "Suppression",
    description:
      "Moves slowly. Long-range cannon that can rake several clustered enemies, but only through a 60° cone. Overwatch hits as hard as a aimed burst.",
    cost: 30,
    hp: 11,
    move: 3,
    speed: 0.62,
    range: 9,
    damage: 5,
    overwatchDamage: 5,
    arc: 60,
    meleeDamage: 3,
    meleeRange: 1.35,
    size: 1,
    stealth: false,
    stealthRevealRange: 0,
    aoeRadius: 0,
    multiTargetRadius: 1.6,
    maxTargets: 3,
  },
  sniper: {
    type: "sniper",
    faction: "empire",
    name: "Sniper",
    role: "Infiltration",
    description:
      "Extra-long single shot through a 60° arc. Invisible unless an enemy closes in. Firing reveals them; one quiet turn and they vanish again.",
    cost: 30,
    hp: 7,
    move: 4,
    speed: 1,
    range: 12,
    damage: 9,
    overwatchDamage: 3,
    arc: 60,
    meleeDamage: 2,
    meleeRange: 1.35,
    size: 1,
    stealth: true,
    stealthRevealRange: 1.5,
    aoeRadius: 0,
    multiTargetRadius: 0,
    maxTargets: 1,
  },
  tyrant: {
    type: "tyrant",
    faction: "brood",
    name: "Tyrant",
    role: "Apex",
    description:
      "A two-legged siege beast. Devastating claw, and a short bio-cannon that bursts around the target. Extremely tough.",
    cost: 75,
    hp: 28,
    move: 4,
    speed: 0.273,
    range: 4,
    damage: 6,
    overwatchDamage: 2,
    arc: 180,
    meleeDamage: 9,
    meleeRange: 1.5,
    size: 1.45,
    stealth: false,
    stealthRevealRange: 0,
    aoeRadius: 1.55,
    multiTargetRadius: 0,
    maxTargets: 1,
  },
  broodling: {
    type: "broodling",
    faction: "brood",
    name: "Broodling",
    role: "Swarm",
    description: "Fast, fragile, and armed only with scythe limbs. They close distance and tear.",
    cost: 8,
    hp: 5,
    move: 7,
    speed: 1.45,
    range: 0,
    damage: 0,
    overwatchDamage: 0,
    arc: 360,
    meleeDamage: 4,
    meleeRange: 1.35,
    size: 0.78,
    stealth: false,
    stealthRevealRange: 0,
    aoeRadius: 0,
    multiTargetRadius: 0,
    maxTargets: 1,
  },
  spatling: {
    type: "spatling",
    faction: "brood",
    name: "Spatling",
    role: "Spitter",
    description: "A medium-paced shooter. Spits a burning bio-round at rifle distance.",
    cost: 12,
    hp: 7,
    move: 5,
    speed: 1,
    range: 6,
    damage: 3,
    overwatchDamage: 1,
    arc: 180,
    meleeDamage: 2,
    meleeRange: 1.35,
    size: 0.95,
    stealth: false,
    stealthRevealRange: 0,
    aoeRadius: 0,
    multiTargetRadius: 0,
    maxTargets: 1,
  },
};

export function sightRange(type: UnitType) {
  const range = UNIT_STATS[type].range;
  return range > 0 ? range + 1.25 : 6;
}

export const EMPIRE_UNITS: UnitType[] = ["captain", "soldier", "machine_gunner", "sniper"];
export const BROOD_UNITS: UnitType[] = ["tyrant", "broodling", "spatling"];

export function factionUnits(faction: Faction): UnitType[] {
  return faction === "empire" ? EMPIRE_UNITS : BROOD_UNITS;
}

export function freeLeaders(faction: Faction, points: PointScale): number {
  if (faction === "empire") {
    return points === 100 ? 1 : points === 200 ? 2 : 3;
  }
  return 1;
}

export function leaderType(faction: Faction): UnitType {
  return faction === "empire" ? "captain" : "tyrant";
}

export function maxExtraLeaders(faction: Faction): number {
  return 1;
}

export function armyCost(faction: Faction, points: PointScale, loadout: ArmyLoadout): number {
  const leader = leaderType(faction);
  const free = freeLeaders(faction, points);
  let total = 0;
  for (const type of factionUnits(faction)) {
    const count = loadout[type] ?? 0;
    const paid = type === leader ? Math.max(0, count - free) : count;
    total += paid * UNIT_STATS[type].cost;
  }
  return total;
}

export function remainingPoints(faction: Faction, points: PointScale, loadout: ArmyLoadout): number {
  return points - armyCost(faction, points, loadout);
}

export function defaultLoadout(faction: Faction, points: PointScale): ArmyLoadout {
  const leader = leaderType(faction);
  const free = freeLeaders(faction, points);
  if (faction === "empire") {
    if (points === 100) return { [leader]: free, soldier: 2, machine_gunner: 1, sniper: 1 };
    if (points === 200) return { [leader]: free, soldier: 5, machine_gunner: 2, sniper: 2 };
    return { [leader]: free, soldier: 6, machine_gunner: 3, sniper: 4 };
  }
  if (points === 100) return { [leader]: free, broodling: 6, spatling: 4 };
  if (points === 200) return { [leader]: free, broodling: 10, spatling: 10 };
  return { [leader]: free + 1, broodling: 10, spatling: 12 };
}

export function emptyLoadout(faction: Faction, points: PointScale): ArmyLoadout {
  return { [leaderType(faction)]: freeLeaders(faction, points) };
}

export function unitCount(loadout: ArmyLoadout): number {
  return Object.values(loadout).reduce((a, b) => a + (b ?? 0), 0);
}

export const SPRITE_SRC: Record<UnitType, string> = {
  captain: "/assets/units/captain.png",
  soldier: "/assets/units/soldier.png",
  machine_gunner: "/assets/units/machine_gunner.png",
  sniper: "/assets/units/sniper.png",
  tyrant: "/assets/units/tyrant.png",
  broodling: "/assets/units/broodling.png",
  spatling: "/assets/units/spatling.png",
};

export const FACTION_NAME: Record<Faction, string> = {
  empire: "Galactic Empire",
  brood: "Brood Swarm",
};

export const FACTION_BLURB: Record<Faction, string> = {
  empire: "Disciplined steel and fire. Captains, rifles, suppression, and vanishing marksmen.",
  brood: "A living tide. A tyrant at the core, broodlings in the teeth, spatlings in the dark.",
};

export const FACTION_MOTTO: Record<Faction, string> = {
  empire: "Five activations. No wasted shot.",
  brood: "Close the distance. Unmake the line.",
};

export const FACTION_LORE: Record<Faction, string> = {
  empire:
    "The Galactic Empire does not hold a ruin with bodies. It holds it with doctrine. A captain keeps the pocket honest, soldiers stitch a firing line, machine gunners pin anything that clusters, and snipers unmake a leader from a street away — then vanish until the next quiet turn. Every activation is spent like ammunition: counted, aimed, and never offered twice.",
  brood:
    "The Brood Swarm is weather with teeth. It does not garrison. It arrives. A tyrant is the hinge — claw for the close work, a bio-cannon that bursts around whatever it hates. Broodlings sprint the last meters and tear. Spatlings spit burning rounds at rifle distance so the tide can close. There is no rear rank. There is only the next thing that still moves.",
};

export const FACTION_DOCTRINE: Record<Faction, string> = {
  empire:
    "Short pistol fire in a full circle. Rifles through a 180° front. Suppression in a 60° cone. One long shot from a ghost. Overwatch punishes the walk between cover.",
  brood:
    "The tyrant breaks the hinge. Broodlings own the last tile. Spatlings keep the line honest while the swarm closes. Melee is not a fallback. It is the plan.",
};

export const FACTIONS: Faction[] = ["empire", "brood"];

export function isFaction(value: string): value is Faction {
  return value === "empire" || value === "brood";
}

export function unitSpecials(stats: UnitStats): string[] {
  const out: string[] = [];
  if (stats.range <= 0) out.push("Melee only");
  if (stats.arc >= 359) out.push("360° firing arc");
  if (stats.stealth) out.push(`Stealth — revealed within ${stats.stealthRevealRange} or after firing`);
  if (stats.aoeRadius > 0) out.push(`Burst ${stats.aoeRadius} around the impact`);
  if (stats.maxTargets > 1) out.push(`Up to ${stats.maxTargets} targets`);
  if (stats.multiTargetRadius > 0) out.push(`Rakes a ${stats.multiTargetRadius} cluster`);
  return out;
}
