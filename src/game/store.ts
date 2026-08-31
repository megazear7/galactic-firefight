import { create } from "zustand";
import {
  applyAiIntent,
  beginShoot,
  checkWinner,
  chooseDestination,
  confirmMelee,
  confirmMove,
  confirmShoot,
  createBattle,
  defaultEnemyArmy,
  endTurn,
  resolveShot,
  selectUnit,
  setActMode,
  stepMove,
  updateFacing,
  waitUnit,
  ageFx,
} from "./battle";
import { revealExplored } from "./vision";
import type { ActMode } from "./types";
import { meleeEnemies, rangedTargets } from "./combat";
import { sfx, unlockAudio, applyVolumes } from "./audio";
import {
  getSharedGame,
  loadSettings,
  newGameId,
  putHostLobby,
  putSharedGame,
  saveGame,
  saveSettings,
  type MpLobby,
} from "./persistence";
import type {
  ArmyLoadout,
  BattleState,
  Faction,
  GameRecord,
  MapSize,
  PlayMode,
  PointScale,
  Settings,
  UnitState,
} from "./types";
import { DEFAULT_SETTINGS } from "./types";
import { defaultLoadout } from "./units";
import type { UserDataClient } from "@/lib/identity/megazear-users";

export type Screen = "menu" | "setup" | "army" | "battle" | "resume" | "join";

type Store = {
  screen: Screen;
  settings: Settings;
  settingsOpen: boolean;
  mode: PlayMode;
  points: PointScale;
  mapSize: MapSize;
  faction: Faction;
  army: ArmyLoadout;
  record: GameRecord | null;
  battle: BattleState | null;
  hoverCol: number | null;
  hoverRow: number | null;
  camFocus: { x: number; z: number; seq: number } | null;
  camView: { x: number; z: number; w: number; h: number } | null;
  inviteEmail: string;
  joinHostId: string | null;
  joinGameId: string | null;
  statusMessage: string | null;
  aiTimer: number;
  resolveTimer: number;
  setScreen: (s: Screen) => void;
  setSettingsOpen: (v: boolean) => void;
  patchSettings: (p: Partial<Settings>) => void;
  startSetup: (mode: PlayMode) => void;
  setPoints: (p: PointScale) => void;
  setMapSize: (s: MapSize) => void;
  setFaction: (f: Faction) => void;
  setArmy: (a: ArmyLoadout) => void;
  setInviteEmail: (v: string) => void;
  beginBattle: (opts?: { enemyArmy?: ArmyLoadout; first?: Faction }) => void;
  loadRecord: (g: GameRecord) => void;
  select: (id: string) => void;
  clickTile: (col: number, row: number) => void;
  hoverTile: (col: number | null, row: number | null) => void;
  confirmFacing: () => void;
  skip: () => void;
  setMode: (mode: ActMode) => void;
  requestCam: (x: number, z: number) => void;
  setCamView: (view: { x: number; z: number; w: number; h: number }) => void;
  shoot: () => void;
  melee: (targetId: string) => void;
  fireAt: (targetId: string) => void;
  end: () => void;
  tick: (dt: number) => void;
  persist: (client: UserDataClient | null) => void;
  hydrateJoin: (hostId: string, gameId: string) => void;
  syncMulti: (client: UserDataClient, userId: string) => Promise<void>;
};

function blankRecord(partial: Partial<GameRecord>): GameRecord {
  const now = new Date().toISOString();
  return {
    version: 1,
    id: newGameId(),
    name: "Firefight",
    createdAt: now,
    updatedAt: now,
    status: "setup",
    mode: "single",
    points: 100,
    mapSize: "medium",
    playerFaction: "empire",
    seed: (Math.random() * 1e9) | 0,
    battle: null,
    ...partial,
  };
}

export const useGame = create<Store>((set, get) => ({
  screen: "menu",
  settings: loadSettings(),
  settingsOpen: false,
  mode: "single",
  points: 100,
  mapSize: "medium" as MapSize,
  faction: "empire",
  army: defaultLoadout("empire", 100),
  record: null,
  battle: null,
  hoverCol: null,
  hoverRow: null,
  camFocus: null,
  camView: null,
  inviteEmail: "",
  joinHostId: null,
  joinGameId: null,
  statusMessage: null,
  aiTimer: 0,
  resolveTimer: 0,
  setScreen: (screen) => set({ screen }),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  patchSettings: (p) => {
    const settings = { ...get().settings, ...p };
    saveSettings(settings);
    applyVolumes(settings);
    set({ settings });
  },
  startSetup: (mode) => {
    unlockAudio(get().settings);
    sfx.ui();
    const faction = get().faction;
    const points = get().points;
    set({
      mode,
      screen: "setup",
      army: defaultLoadout(faction, points),
      record: null,
      battle: null,
      statusMessage: null,
    });
  },
  setPoints: (points) => {
    const faction = get().faction;
    set({ points, army: defaultLoadout(faction, points) });
  },
  setMapSize: (mapSize) => {
    sfx.ui();
    set({ mapSize });
  },
  setFaction: (faction) => {
    sfx.ui();
    set({ faction, army: defaultLoadout(faction, get().points) });
  },
  setArmy: (army) => set({ army }),
  setInviteEmail: (inviteEmail) => set({ inviteEmail }),
  beginBattle: (opts) => {
    unlockAudio(get().settings);
    const { faction, army, points, mapSize, mode, record } = get();
    const enemyFaction: Faction = faction === "empire" ? "brood" : "empire";
    const enemyArmy = opts?.enemyArmy ?? defaultEnemyArmy(enemyFaction, points);
    const seed = record?.seed ?? ((Math.random() * 1e9) | 0);
    const first = opts?.first ?? (Math.random() < 0.5 ? "empire" : "brood");
    const battle = createBattle({
      seed,
      playerFaction: faction,
      playerArmy: army,
      enemyArmy,
      mode,
      first,
      mapSize: record?.mapSize ?? mapSize,
    });
    const rec =
      record ??
      blankRecord({
        mode,
        points,
        mapSize,
        playerFaction: faction,
        seed,
        name: mode === "multi" ? "Linked firefight" : "Skirmish",
      });
    rec.battle = battle;
    rec.status = "active";
    rec.hostArmy = rec.hostFaction === faction ? army : rec.hostArmy;
    rec.guestArmy = rec.guestFaction === faction ? army : rec.guestArmy;
    sfx.confirm();
    set({ battle, record: rec, screen: "battle", statusMessage: null });
    void saveGame(null, rec);
  },
  loadRecord: (g) => {
    unlockAudio(get().settings);
    set({
      record: g,
      battle: g.battle,
      mode: g.mode,
      points: g.points,
      mapSize: g.mapSize ?? "medium",
      faction: g.playerFaction,
      army: g.playerFaction === "empire" || g.playerFaction === "brood" ? get().army : get().army,
      screen: g.battle ? "battle" : "army",
    });
  },
  select: (id) => {
    const battle = get().battle;
    if (!battle) return;
    sfx.ui();
    set({ battle: selectUnit(battle, id) });
  },
  clickTile: (col, row) => {
    const battle = get().battle;
    if (!battle) return;
    if (battle.phase === "aimMove") {
      const next = chooseDestination(battle, col, row);
      if (next !== battle) sfx.move();
      set({ battle: next });
      return;
    }
    if (battle.phase === "aimFacing") {
      const unit = battle.units.find((u) => u.id === battle.selectedId);
      if (!unit || !battle.pendingMove) return;
      const dest = { col: battle.pendingMove.destCol, row: battle.pendingMove.destRow };
      const facing = Math.atan2(row - dest.row, col - dest.col);
      set({ battle: updateFacing(battle, facing) });
    }
  },
  hoverTile: (col, row) => {
    set({ hoverCol: col, hoverRow: row });
    const battle = get().battle;
    if (!battle) return;
    if (battle.phase === "moving" || battle.phase === "resolving" || battle.phase === "enemyTurn") return;
    if (battle.phase === "aimFacing" && battle.pendingMove && col !== null && row !== null) {
      const dest = { col: battle.pendingMove.destCol, row: battle.pendingMove.destRow };
      const facing = Math.atan2(row - dest.row, col - dest.col);
      set({ battle: updateFacing({ ...battle, hoverCol: col, hoverRow: row }, facing) });
      return;
    }
    if (battle.hoverCol === col && battle.hoverRow === row) return;
    set({ battle: { ...battle, hoverCol: col, hoverRow: row } });
  },
  confirmFacing: () => {
    const battle = get().battle;
    if (!battle) return;
    sfx.confirm();
    set({ battle: confirmMove(battle) });
  },
  skip: () => {
    const battle = get().battle;
    if (!battle) return;
    if (battle.phase === "act" || battle.phase === "aimShoot") {
      sfx.ui();
      set({ battle: waitUnit(battle) });
    }
  },
  setMode: (mode) => {
    const battle = get().battle;
    if (!battle) return;
    sfx.ui();
    set({ battle: setActMode(battle, mode) });
  },
  requestCam: (x, z) => {
    set({ camFocus: { x, z, seq: (get().camFocus?.seq ?? 0) + 1 } });
  },
  setCamView: (camView) => set({ camView }),
  shoot: () => {
    const battle = get().battle;
    if (!battle) return;
    set({ battle: beginShoot(battle) });
  },
  melee: (targetId) => {
    const battle = get().battle;
    if (!battle) return;
    const next = confirmMelee(battle, targetId);
    if (next === battle) return;
    sfx.melee();
    set({ battle: next, resolveTimer: 0.75 });
  },
  fireAt: (targetId) => {
    const battle = get().battle;
    if (!battle) return;
    const next = confirmShoot(battle, targetId);
    if (next === battle) return;
    const unit = battle.units.find((u) => u.id === battle.selectedId);
    if (unit?.faction === "brood") sfx.alien();
    else if (unit?.type === "sniper") sfx.sniper();
    else if (unit?.type === "machine_gunner") sfx.mg();
    else sfx.shot();
    const resolveTimer = unit?.type === "machine_gunner" ? 0.62 : 0.48;
    set({ battle: next, resolveTimer });
  },
  end: () => {
    const battle = get().battle;
    if (!battle) return;
    sfx.ui();
    set({ battle: endTurn(battle), aiTimer: 0.4 });
  },
  tick: (dt) => {
    let { battle, aiTimer, resolveTimer } = get();
    if (!battle) return;
    battle = revealExplored(ageFx(battle, dt));
    if (battle.phase === "moving") {
      const prevFx = battle.fx.length;
      const next = stepMove(battle, dt);
      if (next.fx.length > prevFx) sfx.shot();
      if (next.phase === "gameOver") sfx.lose();
      set({ battle: next });
      return;
    }
    if (battle.phase === "resolving") {
      resolveTimer -= dt;
      if (resolveTimer <= 0) {
        const next = resolveShot(battle);
        if (next.winner === next.playerFaction) sfx.win();
        else if (next.winner) sfx.lose();
        else sfx.hit();
        set({ battle: next, resolveTimer: 0, aiTimer: next.phase === "enemyTurn" ? 0.5 : 0 });
      } else {
        set({ battle, resolveTimer });
      }
      return;
    }
    if (battle.phase === "enemyTurn" && battle.mode === "single") {
      aiTimer -= dt;
      if (aiTimer <= 0) {
        const next = applyAiIntent(battle);
        const extra =
          next.phase === "moving" ? 0 : next.phase === "resolving" ? 0.35 : 0.5;
        if (next.phase === "resolving") {
          const attacker = next.units.find((u) => u.id === next.pendingShot?.attackerId);
          if (next.pendingShot?.kind === "melee") sfx.melee();
          else if (attacker?.faction === "brood") sfx.alien();
          else if (attacker?.type === "sniper") sfx.sniper();
          else if (attacker?.type === "machine_gunner") sfx.mg();
          else sfx.shot();
        }
        const resolveTimer =
          next.phase === "resolving"
            ? next.pendingShot?.kind === "melee"
              ? 0.75
              : 0.5
            : get().resolveTimer;
        set({
          battle: next,
          aiTimer: extra,
          resolveTimer,
        });
      } else {
        set({ battle, aiTimer });
      }
      return;
    }
    if (battle !== get().battle) set({ battle });
  },
  persist: (client) => {
    const { record, battle } = get();
    if (!record || !battle) return;
    const status: GameRecord["status"] =
      battle.winner === record.playerFaction
        ? "victory"
        : battle.winner
          ? "defeat"
          : "active";
    const next = { ...record, battle, status, updatedAt: new Date().toISOString() };
    set({ record: next });
    void saveGame(client, next);
    if (record.mode === "multi" && client && record.hostId) {
      void putSharedGame(client, record.hostId === undefined ? undefined : record.hostId, record.id, next);
    }
  },
  hydrateJoin: (hostId, gameId) => {
    set({
      screen: "join",
      joinHostId: hostId,
      joinGameId: gameId,
      mode: "multi",
    });
  },
  syncMulti: async (client, userId) => {
    const { record, joinHostId, joinGameId } = get();
    const hostId = record?.hostId ?? joinHostId;
    const gameId = record?.id ?? joinGameId;
    if (!hostId || !gameId) return;
    const shared = await getSharedGame(client, hostId, gameId);
    if (shared?.battle) {
      const mine = userId === hostId ? shared.hostFaction : shared.guestFaction;
      set({
        record: { ...shared, playerFaction: mine ?? shared.playerFaction },
        battle: shared.battle,
        faction: mine ?? get().faction,
        screen: "battle",
      });
    }
  },
}));

export function selectedUnit(): UnitState | null {
  const { battle } = useGame.getState();
  if (!battle?.selectedId) return null;
  return battle.units.find((u) => u.id === battle.selectedId) ?? null;
}

export function actOptions(battle: BattleState, unit: UnitState) {
  return {
    ranged: rangedTargets(unit, battle.units, battle.map),
    melee: meleeEnemies(unit, battle.units),
  };
}

export async function publishLobby(
  client: UserDataClient,
  user: { id: string; name?: string; email?: string },
  points: PointScale,
  mapSize: MapSize,
  email: string,
) {
  const id = newGameId();
  const lobby: MpLobby = {
    version: 1,
    id,
    hostId: user.id,
    hostName: user.name ?? "Host",
    hostEmail: user.email,
    points,
    mapSize,
    status: "waiting",
    updatedAt: new Date().toISOString(),
  };
  await putHostLobby(client, lobby);
  return lobby;
}

export { checkWinner };

if (import.meta.env.DEV && typeof window !== "undefined") {
  (window as unknown as { __GFF: typeof useGame }).__GFF = useGame;
}
