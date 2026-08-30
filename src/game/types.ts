export const SAVE_VERSION = 2;
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
export type GraphicsMode = "sprites" | "models";
export type PlayMode = "single" | "multi";

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

export type Winner = Faction | "draw" | null;

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
  enemyFaction: Faction;
  mode: PlayMode;
  fx: FxEvent[];
};

export type ArmyLoadout = Partial<Record<UnitType, number>>;

export type GameRecord = {
  version: number;
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  status: "setup" | "active" | "victory" | "defeat";
  mode: PlayMode;
  points: PointScale;
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
  graphics: "sprites",
  master: 0.85,
  music: 0.45,
  sfx: 0.8,
};
