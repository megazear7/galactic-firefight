import { create } from "zustand";
import {
  applyAiIntent,
  beginHotseat,
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
  deselectUnit,
  setActMode,
  stepMove,
  updateFacing,
  waitUnit,
  ageFx,
} from "./battle";
import { revealExplored } from "./vision";
import type { ActMode } from "./types";
import { meleeEnemies, rangedTargets } from "./combat";
import { sfx, unlockAudio, applyVolumes, startAmbience, stopAmbience } from "./audio";
import {
  getPublicGame,
  getSharedGame,
  grantGuestAcl,
  loadSettings,
  newGameId,
  putHostLobby,
  putSharedGame,
  removePublicLobby,
  saveGame,
  saveSettings,
  upsertPublicLobby,
  type MpLobby,
} from "./persistence";
import type {
  ArmyLoadout,
  BattleState,
  Faction,
  GameRecord,
  GameVisibility,
  MapSize,
  Participant,
  PlayMode,
  PointScale,
  PublicListing,
  Settings,
  SlotKind,
  TerrainBias,
  TerrainTheme,
  UnitState,
} from "./types";
import { DEFAULT_SETTINGS } from "./types";
import { defaultLoadout } from "./units";
import type { UserDataClient } from "@/lib/identity/megazear-users";
import {
  canAddSlot,
  claimInviteSlot,
  claimOpenSlot,
  defaultMatch,
  humansReady,
  makeParticipant,
  nextColor,
  nextTeam,
  passcodeOk,
  playable,
  shuffleTeams,
  slotCap,
} from "./lobby";
import { localParticipant } from "./battle";

export type Screen =
  "menu" | "create" | "lobby" | "browse" | "setup" | "army" | "battle" | "resume" | "join";

type Store = {
  screen: Screen;
  settings: Settings;
  settingsOpen: boolean;
  mode: PlayMode;
  points: PointScale;
  mapSize: MapSize;
  terrainDensity: TerrainBias;
  terrainSize: TerrainBias;
  terrainTheme: TerrainTheme;
  faction: Faction;
  army: ArmyLoadout;
  record: GameRecord | null;
  battle: BattleState | null;
  hoverCol: number | null;
  hoverRow: number | null;
  camFocus: { x: number; z: number; seq: number } | null;
  camView: { x: number; z: number; w: number; h: number } | null;
  inviteEmail: string;
  gameName: string;
  passcode: string;
  visibility: GameVisibility;
  participants: Participant[];
  joinPasscode: string;
  joinHostId: string | null;
  joinGameId: string | null;
  statusMessage: string | null;
  aiTimer: number;
  resolveTimer: number;
  dataClient: UserDataClient | null;
  setDataClient: (c: UserDataClient | null) => void;
  setScreen: (s: Screen) => void;
  setSettingsOpen: (v: boolean) => void;
  patchSettings: (p: Partial<Settings>) => void;
  startSetup: (mode?: PlayMode) => void;
  setPoints: (p: PointScale) => void;
  setMapSize: (s: MapSize) => void;
  setTerrainDensity: (n: TerrainBias) => void;
  setTerrainSize: (n: TerrainBias) => void;
  setTerrainTheme: (t: TerrainTheme) => void;
  setFaction: (f: Faction) => void;
  setArmy: (a: ArmyLoadout) => void;
  setInviteEmail: (v: string) => void;
  setGameName: (v: string) => void;
  setPasscode: (v: string) => void;
  setVisibility: (v: GameVisibility) => void;
  confirmCreate: (
    user?: { id?: string; name?: string; email?: string } | null,
    client?: UserDataClient | null,
  ) => Promise<void>;
  addSlot: (kind: SlotKind, email?: string) => void;
  removeSlot: (id: string) => void;
  patchParticipant: (id: string, patch: Partial<Participant>) => void;
  toggleReady: (id: string) => void;
  startMatch: () => void;
  startHotseat: () => void;
  joinListing: (
    listing: PublicListing,
    passcode: string,
    user?: { id?: string; name?: string; email?: string } | null,
    client?: UserDataClient | null,
  ) => Promise<string | null>;
  beginBattle: (opts?: { enemyArmy?: ArmyLoadout; first?: Faction }) => void;
  loadRecord: (g: GameRecord) => void;
  select: (id: string) => void;
  deselect: () => void;
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
  surrender: () => void;
  tick: (dt: number) => void;
  persist: (client: UserDataClient | null, actorId?: string) => void;
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
    terrainDensity: 2,
    terrainSize: 2,
    terrainTheme: "spaceship",
    visibility: "private",
    participants: [],
    teamOrder: [],
    playerId: "p-host",
    playerFaction: "empire",
    seed: (Math.random() * 1e9) | 0,
    battle: null,
    ...partial,
  };
}

function publishSharedLobby(client: UserDataClient | null, record: GameRecord | null) {
  if (client && record?.mode === "multi" && record.hostId) {
    void putSharedGame(client, record.hostId, record.id, record);
  }
}

export const useGame = create<Store>((set, get) => ({
  screen: "menu",
  settings: loadSettings(),
  settingsOpen: false,
  mode: "single",
  points: 100,
  mapSize: "medium" as MapSize,
  terrainDensity: 2 as TerrainBias,
  terrainSize: 2 as TerrainBias,
  terrainTheme: "spaceship" as TerrainTheme,
  faction: "empire",
  army: defaultLoadout("empire", 100),
  record: null,
  battle: null,
  hoverCol: null,
  hoverRow: null,
  camFocus: null,
  camView: null,
  inviteEmail: "",
  gameName: "Firefight",
  passcode: "",
  visibility: "private",
  participants: [],
  joinPasscode: "",
  joinHostId: null,
  joinGameId: null,
  statusMessage: null,
  aiTimer: 0,
  resolveTimer: 0,
  dataClient: null,
  setDataClient: (dataClient) => set({ dataClient }),
  setScreen: (screen) => {
    if (screen === "battle") startAmbience();
    else stopAmbience();
    set({ screen });
  },
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  patchSettings: (p) => {
    const settings = { ...get().settings, ...p };
    saveSettings(settings);
    applyVolumes(settings);
    set({ settings });
  },
  startSetup: (mode = "single") => {
    unlockAudio(get().settings);
    sfx.ui();
    const faction = get().faction;
    const points = get().points;
    set({
      mode,
      screen: "create",
      army: defaultLoadout(faction, points),
      record: null,
      battle: null,
      statusMessage: null,
      gameName: "Firefight",
      passcode: "",
      visibility: "private",
      participants: [],
      terrainDensity: 2,
      terrainSize: 2,
      terrainTheme: "spaceship",
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
  setTerrainDensity: (terrainDensity) => {
    sfx.ui();
    const rec = get().record;
    const next = rec ? { ...rec, terrainDensity, updatedAt: new Date().toISOString() } : rec;
    set({ terrainDensity, record: next });
    if (next) {
      void saveGame(get().dataClient, next);
      void upsertPublicLobby(get().dataClient, next, next.hostId);
    }
  },
  setTerrainSize: (terrainSize) => {
    sfx.ui();
    const rec = get().record;
    const next = rec ? { ...rec, terrainSize, updatedAt: new Date().toISOString() } : rec;
    set({ terrainSize, record: next });
    if (next) {
      void saveGame(get().dataClient, next);
      void upsertPublicLobby(get().dataClient, next, next.hostId);
    }
  },
  setTerrainTheme: (terrainTheme) => {
    sfx.ui();
    const rec = get().record;
    const next = rec ? { ...rec, terrainTheme, updatedAt: new Date().toISOString() } : rec;
    set({ terrainTheme, record: next });
    if (next) {
      void saveGame(get().dataClient, next);
      void upsertPublicLobby(get().dataClient, next, next.hostId);
    }
  },
  setFaction: (faction) => {
    sfx.ui();
    set({ faction, army: defaultLoadout(faction, get().points) });
  },
  setArmy: (army) => set({ army }),
  setInviteEmail: (inviteEmail) => set({ inviteEmail }),
  setGameName: (gameName) => set({ gameName }),
  setPasscode: (passcode) => set({ passcode }),
  setVisibility: (visibility) => {
    sfx.ui();
    set({ visibility });
  },
  confirmCreate: async (user, client) => {
    if (client !== undefined) set({ dataClient: client });
    const dataClient = get().dataClient;
    const {
      points,
      mapSize,
      terrainDensity,
      terrainSize,
      terrainTheme,
      gameName,
      passcode,
      visibility,
      faction,
    } = get();
    const participants = defaultMatch(
      points,
      {
        name: user?.name || user?.email || "You",
        userId: user?.id,
        email: user?.email,
      },
      visibility === "public" ? "open" : "ai",
    ).map((p) =>
      p.host
        ? { ...p, faction, army: defaultLoadout(faction, points) }
        : { ...p, army: defaultLoadout(p.faction, points) },
    );
    const rec = blankRecord({
      name: gameName.trim() || "Firefight",
      points,
      mapSize,
      terrainDensity,
      terrainSize,
      terrainTheme,
      visibility,
      passcode: passcode.trim() || undefined,
      participants,
      playerId: participants[0].id,
      playerFaction: participants[0].faction,
      hostId: user?.id,
      hostEmail: user?.email,
      status: "lobby",
      mode:
        visibility === "public" ||
        participants.some((p) => p.kind === "open" || p.kind === "invite")
          ? "multi"
          : "single",
    });
    sfx.confirm();
    set({
      record: rec,
      participants,
      screen: "lobby",
      faction: participants[0].faction,
      army: participants[0].army,
    });
    try {
      await saveGame(dataClient, rec, { throwOnError: true });
      if (dataClient && rec.mode === "multi" && rec.hostId) {
        await putSharedGame(dataClient, rec.hostId, rec.id, rec);
      }
      const listingError = await upsertPublicLobby(dataClient, rec, user?.id);
      if (listingError) set({ statusMessage: listingError });
    } catch (err) {
      console.warn("game creation failed", err);
      set({
        statusMessage: err instanceof Error ? `Could not create game: ${err.message}` : "Could not create game.",
      });
    }
  },
  addSlot: (kind, email) => {
    const { participants, mapSize, points, visibility } = get();
    if (!canAddSlot(participants, mapSize)) return;
    if (kind === "open" && visibility !== "public") return;
    sfx.ui();
    const faction: Faction = participants.length % 2 === 0 ? "empire" : "brood";
    const slot = makeParticipant({
      kind,
      faction,
      team: nextTeam(participants),
      color: nextColor(participants.map((p) => p.color)),
      army: defaultLoadout(faction, points),
      email: email?.trim() || undefined,
      name:
        kind === "invite"
          ? email?.trim() || "Invite"
          : kind === "open"
            ? "Open slot"
            : kind === "local"
              ? `Player ${participants.filter((p) => p.kind === "local" || p.host).length + 1}`
              : "AI",
      ready: kind === "ai",
    });
    const next = [...participants, slot];
    const rec = get().record
      ? { ...get().record!, participants: next, updatedAt: new Date().toISOString() }
      : get().record;
    set({ participants: next, record: rec });
    if (rec) {
      void saveGame(get().dataClient, rec);
      publishSharedLobby(get().dataClient, rec);
      const dataClient = get().dataClient;
      if (kind === "invite" && email && rec.hostId && dataClient) {
        void grantGuestAcl(dataClient, rec.hostId, rec.id, { email: email.trim() });
      }
      void upsertPublicLobby(get().dataClient, rec, rec.hostId).then((err) => {
        if (err) set({ statusMessage: err });
        else set({ statusMessage: null });
      });
    }
  },
  removeSlot: (id) => {
    const { participants, record } = get();
    const target = participants.find((p) => p.id === id);
    if (!target || target.host) return;
    sfx.ui();
    const next = participants.filter((p) => p.id !== id);
    const rec = record
      ? { ...record, participants: next, updatedAt: new Date().toISOString() }
      : record;
    set({ participants: next, record: rec });
    if (rec) {
      void saveGame(get().dataClient, rec);
      publishSharedLobby(get().dataClient, rec);
      void upsertPublicLobby(get().dataClient, rec, rec.hostId);
    }
  },
  patchParticipant: (id, patch) => {
    const { participants, record, points } = get();
    const next = participants.map((p) => {
      if (p.id !== id) return p;
      const merged = { ...p, ...patch };
      if (patch.faction && patch.faction !== p.faction) {
        merged.army = defaultLoadout(patch.faction, points);
        merged.ready = p.kind === "ai";
      }
      return merged;
    });
    const rec = record
      ? { ...record, participants: next, updatedAt: new Date().toISOString() }
      : record;
    set({ participants: next, record: rec });
    if (rec) {
      void saveGame(get().dataClient, rec);
      publishSharedLobby(get().dataClient, rec);
      void upsertPublicLobby(get().dataClient, rec, rec.hostId);
    }
  },
  toggleReady: (id) => {
    const { participants, record } = get();
    sfx.ui();
    const next = participants.map((p) => (p.id === id ? { ...p, ready: !p.ready } : p));
    const rec = record
      ? { ...record, participants: next, updatedAt: new Date().toISOString() }
      : record;
    set({ participants: next, record: rec });
    if (rec) {
      void saveGame(get().dataClient, rec);
      publishSharedLobby(get().dataClient, rec);
      void upsertPublicLobby(get().dataClient, rec, rec.hostId);
    }
  },
  startHotseat: () => {
    const battle = get().battle;
    if (!battle?.hotseatPending) return;
    sfx.confirm();
    set({ battle: beginHotseat(battle) });
  },
  startMatch: () => {
    const {
      record,
      participants,
      points,
      mapSize,
      terrainDensity,
      terrainSize,
      terrainTheme,
      mode,
    } = get();
    if (!humansReady(participants)) return;
    const play = participants.filter(playable);
    if (play.length < 2) return;
    const seed = record?.seed ?? (Math.random() * 1e9) | 0;
    const teamOrder = shuffleTeams(
      play.map((p) => p.team),
      seed,
    );
    const localId = record?.playerId ?? play.find((p) => p.host)?.id ?? play[0].id;
    const battle = createBattle({
      seed,
      mapSize,
      terrainDensity,
      terrainSize,
      terrainTheme,
      participants: play,
      localPlayerId: localId,
      teamOrder,
      mode: play.some((p) => p.kind === "human" && !p.host) ? "multi" : "single",
    });
    const rec = {
      ...(record ?? blankRecord({})),
      participants,
      teamOrder,
      battle,
      status: "active" as const,
      seed,
      mode: battle.mode,
      playerId: localId,
      playerFaction: battle.playerFaction,
      terrainDensity,
      terrainSize,
      terrainTheme,
    };
    sfx.confirm();
    startAmbience();
    set({ battle, record: rec, screen: "battle", participants });
    void saveGame(get().dataClient, rec);
    void removePublicLobby(get().dataClient, rec.id);
  },
  joinListing: async (listing, code, user, passedClient) => {
    if (passedClient !== undefined) set({ dataClient: passedClient });
    const client = get().dataClient;
    const record = get().record;
    let game = record?.id === listing.id ? record : null;
    if (!game) {
      try {
        const raw = localStorage.getItem("gff.games.v1");
        const parsed = raw ? (JSON.parse(raw) as { games?: GameRecord[] }) : { games: [] };
        game = (parsed.games ?? []).find((g) => g.id === listing.id) ?? null;
      } catch {
        game = null;
      }
    }
    if (!game) {
      game = await getPublicGame(client, listing.hostId, listing.id);
    }
    if (!game) {
      return client
        ? "Could not load that table from the host. They may be offline, or you need to sign in."
        : "Sign in to join public tables from other commanders.";
    }
    if (game.status !== "lobby") return "That game has already started.";
    if (!passcodeOk(game.passcode, code)) return "Wrong pass code.";
    const claimed = claimOpenSlot(
      game.participants,
      {
        id: user?.id ?? `guest-${Date.now().toString(36)}`,
        name: user?.name || user?.email || "Guest",
        userId: user?.id,
        email: user?.email,
      },
      game.points,
    );
    if (!claimed) return "No open slots.";
    const playerId = claimed.find(
      (p) => p.userId === user?.id || p.name === (user?.name || user?.email || "Guest"),
    )?.id;
    const next = {
      ...game,
      participants: claimed,
      playerId: playerId ?? game.playerId,
      status: "lobby" as const,
      updatedAt: new Date().toISOString(),
    };
    sfx.confirm();
    set({
      record: next,
      participants: claimed,
      screen: "lobby",
      points: next.points,
      mapSize: next.mapSize,
      terrainDensity: next.terrainDensity ?? 2,
      terrainSize: next.terrainSize ?? 2,
      terrainTheme:
        next.terrainTheme === "infestation" || next.terrainTheme === "wartorn"
          ? next.terrainTheme
          : "spaceship",
      visibility: next.visibility,
      gameName: next.name,
    });
    void saveGame(client, next);
    void upsertPublicLobby(client, next, user?.id);
    if (client && listing.hostId) {
      void putSharedGame(client, listing.hostId, listing.id, next);
    }
    return null;
  },
  beginBattle: (opts) => {
    const { participants } = get();
    if (participants.filter(playable).length >= 2) {
      get().startMatch();
      return;
    }
    unlockAudio(get().settings);
    const {
      faction,
      army,
      points,
      mapSize,
      terrainDensity,
      terrainSize,
      terrainTheme,
      mode,
      record,
    } = get();
    const enemyFaction: Faction = faction === "empire" ? "brood" : "empire";
    const enemyArmy = opts?.enemyArmy ?? defaultEnemyArmy(enemyFaction, points);
    const seed = record?.seed ?? (Math.random() * 1e9) | 0;
    const first = opts?.first ?? (Math.random() < 0.5 ? "empire" : "brood");
    const battle = createBattle({
      seed,
      playerFaction: faction,
      playerArmy: army,
      enemyArmy,
      mode,
      first,
      mapSize: record?.mapSize ?? mapSize,
      terrainDensity: record?.terrainDensity ?? terrainDensity,
      terrainSize: record?.terrainSize ?? terrainSize,
      terrainTheme: record?.terrainTheme ?? terrainTheme,
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
    startAmbience();
    set({ battle, record: rec, screen: "battle", statusMessage: null });
    void saveGame(get().dataClient, rec);
  },
  loadRecord: (g) => {
    unlockAudio(get().settings);
    if (g.battle) startAmbience();
    else stopAmbience();
    set({
      record: g,
      battle: g.battle,
      mode: g.mode,
      points: g.points,
      mapSize: g.mapSize ?? "medium",
      terrainDensity: g.terrainDensity ?? 2,
      terrainSize: g.terrainSize ?? 2,
      terrainTheme:
        g.terrainTheme === "infestation" || g.terrainTheme === "wartorn"
          ? g.terrainTheme
          : "spaceship",
      visibility: g.visibility ?? "private",
      participants: g.participants ?? [],
      gameName: g.name,
      passcode: g.passcode ?? "",
      faction: g.playerFaction,
      army: g.playerFaction === "empire" || g.playerFaction === "brood" ? get().army : get().army,
      screen: g.battle ? "battle" : "army",
    });
  },
  select: (id) => {
    const battle = get().battle;
    if (!battle) return;
    const unit = battle.units.find((u) => u.id === id);
    if (!unit || !sfx.command(unit.type, unit.faction)) sfx.ui();
    set({ battle: selectUnit(battle, id) });
  },
  deselect: () => {
    const battle = get().battle;
    if (!battle) return;
    const next = deselectUnit(battle);
    if (next === battle) return;
    sfx.ui();
    set({ battle: next });
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
    if (battle.phase === "moving" || battle.phase === "resolving" || battle.phase === "enemyTurn")
      return;
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
    if (unit) sfx.attack(unit.type, unit.faction);
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
  surrender: () => {
    const battle = get().battle;
    const me = battle ? localParticipant(battle) : null;
    if (!battle || !me || battle.phase === "gameOver") return;
    const defeated = {
      ...battle,
      units: battle.units.map((unit) =>
        unit.team === me.team ? { ...unit, alive: false, hp: 0 } : unit,
      ),
    };
    sfx.lose();
    set({ battle: checkWinner(defeated) });
  },
  tick: (dt) => {
    let { battle, aiTimer, resolveTimer } = get();
    if (!battle) return;
    battle = revealExplored(ageFx(battle, dt));
    if (battle.hotseatPending) {
      if (battle !== get().battle) set({ battle });
      return;
    }
    if (battle.phase === "moving") {
      const prevFx = battle.fx.length;
      const next = stepMove(battle, dt);
      if (next.fx.length > prevFx) {
        const watcher = next.units.find(
          (u) =>
            u.overwatchedThisTurn && !battle.units.find((p) => p.id === u.id)?.overwatchedThisTurn,
        );
        if (watcher) sfx.attack(watcher.type, watcher.faction);
        else sfx.shot();
      }
      if (next.phase === "gameOver") sfx.lose();
      set({ battle: next });
      return;
    }
    if (battle.phase === "resolving") {
      resolveTimer -= dt;
      if (resolveTimer <= 0) {
        const next = resolveShot(battle);
        const me = localParticipant(next);
        if (next.winner === me?.team) sfx.win();
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
        const extra = next.phase === "moving" ? 0 : next.phase === "resolving" ? 0.35 : 0.5;
        if (next.phase === "resolving") {
          const attacker = next.units.find((u) => u.id === next.pendingShot?.attackerId);
          if (next.pendingShot?.kind === "melee") sfx.melee();
          else if (attacker) sfx.attack(attacker.type, attacker.faction);
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
  persist: (client, actorId) => {
    const { record, battle } = get();
    if (!record) return;
    if (!battle) {
      void saveGame(client, record);
      void upsertPublicLobby(client, record, actorId);
      return;
    }
    const status: GameRecord["status"] =
      battle.winner === (record.participants.find((p) => p.id === record.playerId)?.team ?? 1)
        ? "victory"
        : battle.winner
          ? "defeat"
          : "active";
    const next = { ...record, battle, status, updatedAt: new Date().toISOString() };
    set({ record: next });
    void saveGame(client, next);
    if (record.mode === "multi" && client && record.hostId) {
      void putSharedGame(
        client,
        record.hostId === undefined ? undefined : record.hostId,
        record.id,
        next,
      );
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
    if (shared?.status === "lobby") {
      const current = get().record;
      if (!current || shared.updatedAt >= current.updatedAt) {
        const local = shared.participants.find(
          (p) => p.userId === userId || (userId === hostId && p.host),
        );
        set({
          record: { ...shared, playerId: local?.id ?? shared.playerId },
          participants: shared.participants,
        });
      }
      return;
    }
    if (shared?.battle) {
      const mine = userId === hostId ? shared.hostFaction : shared.guestFaction;
      startAmbience();
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
