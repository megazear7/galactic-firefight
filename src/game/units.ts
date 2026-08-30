import type { ArmyLoadout, Faction, PointScale, UnitStats, UnitType } from "./types";

export const UNIT_STATS: Record<UnitType, UnitStats> = {
  captain: {
    type: "captain",
    faction: "empire",
    name: "Captain",
    role: "Command",
    description:
      "Short-ranged pistol with a full 360° firing arc. Issued free with the task force; one extra can be commissioned.",
    cost: 25,
    hp: 14,
    move: 4,
    speed: 1,
    range: 4,
    damage: 7,
    overwatchDamage: 3,
    arc: 360,
    meleeDamage: 4,
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
    description: "Medium-ranged assault rifle and a 270° arc. The backbone of every imperial firing line.",
    cost: 10,
    hp: 9,
    move: 5,
    speed: 1,
    range: 6,
    damage: 4,
    overwatchDamage: 2,
    arc: 270,
    meleeDamage: 3,
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
      "Moves slowly. Long-range cannon that can rake several clustered enemies, but only through a 90° cone. Overwatch hits as hard as a aimed burst.",
    cost: 20,
    hp: 11,
    move: 3,
    speed: 0.62,
    range: 9,
    damage: 5,
    overwatchDamage: 5,
    arc: 90,
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
      "Extra-long single shot through a 90° arc. Invisible unless an enemy closes in. Firing reveals them; one quiet turn and they vanish again.",
    cost: 20,
    hp: 7,
    move: 4,
    speed: 1,
    range: 12,
    damage: 9,
    overwatchDamage: 3,
    arc: 90,
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
    cost: 50,
    hp: 28,
    move: 4,
    speed: 0.78,
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
    cost: 5,
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
    cost: 8,
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
    if (points === 100) return { [leader]: free, soldier: 4, machine_gunner: 1, sniper: 2 };
    if (points === 200) return { [leader]: free, soldier: 8, machine_gunner: 2, sniper: 3 };
    return { [leader]: free + 1, soldier: 10, machine_gunner: 3, sniper: 4 };
  }
  if (points === 100) return { [leader]: free, broodling: 8, spatling: 7 };
  if (points === 200) return { [leader]: free, broodling: 14, spatling: 16 };
  return { [leader]: free + 1, broodling: 18, spatling: 16 };
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
