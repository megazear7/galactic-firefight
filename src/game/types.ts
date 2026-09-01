export const SAVE_VERSION = 4;
export const ACTIVATIONS_PER_TURN = 5;

export type Faction = "empire" | "brood";
export type UnitType =
  | "captain"
  | "soldier"
  | "machine_gunner"
  | "sniper"
  | "tyrant"
  | "broodling"
  | "spatling";

export type PointScale = 100 | 200 | 300;
export type MapSize = "small" | "medium" | "large";
export type GraphicsMode = "sprites" | "models";
export type PlayMode = "single" | "multi";
export type SlotKind = "human" | "local" | "ai" | "open" | "invite";
export type GameVisibility = "public" | "private";
export type ArmyLoadout = Partial<Record<UnitType, number>>;

export const MAP_SLOT_CAP: Record<MapSize, number> = {
  small: 4,
  medium: 6,
  large: 8,
};

export const PLAYER_PALETTE = [
  { id: 0, name: "Crimson", hex: "#c45c4a" },
  { id: 1, name: "Amber", hex: "#d4a054" },
  { id: 2, name: "Gold", hex: "#e8d07a" },
  { id: 3, name: "Viridian", hex: "#6fbf7a" },
  { id: 4, name: "Teal", hex: "#4aa8a8" },
  { id: 5, name: "Azure", hex: "#5a8ad4" },
  { id: 6, name: "Violet", hex: "#8a6fd4" },
  { id: 7, name: "Rose", hex: "#d46fa0" },
] as const;

export type Participant = {
  id: string;
  kind: SlotKind;
  name: string;
  userId?: string;
  email?: string;
  faction: Faction;
  team: number;
  color: number;
  army: ArmyLoadout;
  ready: boolean;
  host: boolean;
};

export type PublicListing = {
  id: string;
  hostId: string;
  hostName: string;
  name: string;
  mapSize: MapSize;
  points: PointScale;
  passcodeRequired: boolean;
  humanCount: number;
  aiCount: number;
  slotCap: number;
  openSlots: number;
  full: boolean;
  updatedAt: string;
};

export type TileKind = "floor" | "wall" | "structure";

export type UnitStats = {
  type: UnitType;
  faction: Faction;
  name: string;
  role: string;
  description: string;
  cost: number;
  hp: number;
  move: number;
  speed: number;
  range: number;
  damage: number;
  overwatchDamage: number;
  arc: number;
  meleeDamage: number;
  meleeRange: number;
  size: number;
  stealth: boolean;
  stealthRevealRange: number;
  aoeRadius: number;
  multiTargetRadius: number;
  maxTargets: number;
};

export type UnitState = {
  id: string;
  type: UnitType;
  faction: Faction;
  playerId: string;
  team: number;
  color: number;
  col: number;
  row: number;
  facing: number;
  hp: number;
  maxHp: number;
  moved: boolean;
  acted: boolean;
  shotThisTurn: boolean;
  turnsSinceShot: number;
  revealed: boolean;
  engagedAtTurnStart: boolean;
  overwatchedThisTurn: boolean;
  alive: boolean;
};

export type BattleMap = {
  cols: number;
  rows: number;
  tiles: TileKind[];
  seed: number;
};

export type LogLine = {
  id: string;
  text: string;
  tone: "neutral" | "empire" | "brood" | "danger";
};

export type Winner = number | "draw" | null;

export type Phase =
  | "select"
  | "aimMove"
  | "aimFacing"
  | "moving"
  | "act"
  | "aimShoot"
  | "resolving"
  | "enemyTurn"
  | "gameOver";

export type ActMode = "move" | "fire";

export type PathPoint = { col: number; row: number };

export type PendingMove = {
  unitId: string;
  path: PathPoint[];
  destCol: number;
  destRow: number;
  facing: number;
  overwatchDone: boolean;
};

export type PendingShot = {
  attackerId: string;
  targetIds: string[];
  kind: "ranged" | "melee" | "overwatch";
};

export type FxEvent = {
  id: string;
  kind: "tracer" | "muzzle" | "impact" | "slash";
  ax: number;
  ay: number;
  az: number;
  bx: number;
  by: number;
  bz: number;
  age: number;
  life: number;
  tint: string;
};

export type BattleState = {
  version: number;
  map: BattleMap;
  units: UnitState[];
  turn: Faction;
  round: number;
  phase: Phase;
  selectedId: string | null;
  hoverCol: number | null;
  hoverRow: number | null;
  pendingMove: PendingMove | null;
  pendingShot: PendingShot | null;
  moveProgress: number;
  log: LogLine[];
  winner: Winner;
  playerFaction: Faction;
  playerId: string;
  turnTeam: number;
  teamOrder: number[];
  participants: Participant[];
  enemyFaction: Faction;
  mode: PlayMode;
  fx: FxEvent[];
  explored: boolean[];
  actMode: ActMode;
  hotseatPending: { playerId: string; name: string; color: number } | null;
};

export type GameRecord = {
  version: number;
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  status: "setup" | "lobby" | "active" | "victory" | "defeat";
  mode: PlayMode;
  points: PointScale;
  mapSize: MapSize;
  visibility: GameVisibility;
  passcode?: string;
  participants: Participant[];
  teamOrder: number[];
  playerId: string;
  playerFaction: Faction;
  hostId?: string;
  guestId?: string;
  hostEmail?: string;
  guestEmail?: string;
  hostFaction?: Faction;
  guestFaction?: Faction;
  hostArmy?: ArmyLoadout;
  guestArmy?: ArmyLoadout;
  seed: number;
  battle: BattleState | null;
};

export type Settings = {
  graphics: GraphicsMode;
  master: number;
  music: number;
  sfx: number;
};

export const DEFAULT_SETTINGS: Settings = {
  graphics: "models",
  master: 0.85,
  music: 0.45,
  sfx: 0.8,
};
