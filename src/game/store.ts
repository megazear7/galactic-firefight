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

export type Screen = "menu" | "create" | "lobby" | "browse" | "setup" | "army" | "battle" | "resume" | "join";

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
  setScreen: (s: Screen) => void;
  setSettingsOpen: (v: boolean) => void;
  patchSettings: (p: Partial<Settings>) => void;
  startSetup: (mode?: PlayMode) => void;
  setPoints: (p: PointScale) => void;
  setMapSize: (s: MapSize) => void;
  setFaction: (f: Faction) => void;
  setArmy: (a: ArmyLoadout) => void;
  setInviteEmail: (v: string) => void;
  setGameName: (v: string) => void;
  setPasscode: (v: string) => void;
  setVisibility: (v: GameVisibility) => void;
  confirmCreate: (user?: { id?: string; name?: string; email?: string } | null) => void;
  addSlot: (kind: SlotKind, email?: string) => void;
  removeSlot: (id: string) => void;
  patchParticipant: (id: string, patch: Partial<Participant>) => void;
  toggleReady: (id: string) => void;
  startMatch: () => void;
  startHotseat: () => void;
  joinListing: (listing: PublicListing, passcode: string, user?: { id?: string; name?: string; email?: string } | null) => string | null;
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
  setGameName: (gameName) => set({ gameName }),
  setPasscode: (passcode) => set({ passcode }),
  setVisibility: (visibility) => {
    sfx.ui();
    set({ visibility });
  },
  confirmCreate: (user) => {
    const { points, mapSize, gameName, passcode, visibility, faction } = get();
    const participants = defaultMatch(points, {
      name: user?.name || user?.email || "You",
      userId: user?.id,
      email: user?.email,
    }).map((p) => (p.host ? { ...p, faction, army: defaultLoadout(faction, points) } : { ...p, army: defaultLoadout(p.faction, points) }));
    const rec = blankRecord({
      name: gameName.trim() || "Firefight",
      points,
      mapSize,
      visibility,
      passcode: passcode.trim() || undefined,
      participants,
      playerId: participants[0].id,
      playerFaction: participants[0].faction,
      hostId: user?.id,
      hostEmail: user?.email,
      status: "lobby",
      mode: visibility === "public" || participants.some((p) => p.kind === "open" || p.kind === "invite") ? "multi" : "single",
    });
    sfx.confirm();
    set({ record: rec, participants, screen: "lobby", faction: participants[0].faction, army: participants[0].army });
    void saveGame(null, rec);
    void upsertPublicLobby(null, rec);
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
    const rec = get().record ? { ...get().record!, participants: next, updatedAt: new Date().toISOString() } : get().record;
    set({ participants: next, record: rec });
    if (rec) {
      void saveGame(null, rec);
      void upsertPublicLobby(null, rec);
    }
  },
  removeSlot: (id) => {
    const { participants, record } = get();
    const target = participants.find((p) => p.id === id);
    if (!target || target.host) return;
    sfx.ui();
    const next = participants.filter((p) => p.id !== id);
    set({ participants: next, record: record ? { ...record, participants: next } : record });
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
    set({ participants: next, record: record ? { ...record, participants: next } : record });
  },
  toggleReady: (id) => {
    const { participants, record } = get();
    sfx.ui();
    const next = participants.map((p) => (p.id === id ? { ...p, ready: !p.ready } : p));
    set({ participants: next, record: record ? { ...record, participants: next } : record });
  },
  startHotseat: () => {
    const battle = get().battle;
    if (!battle?.hotseatPending) return;
    sfx.confirm();
    set({ battle: beginHotseat(battle) });
  },
  startMatch: () => {
    const { record, participants, points, mapSize, mode } = get();
    if (!humansReady(participants)) return;
    const play = participants.filter(playable);
    if (play.length < 2) return;
    const seed = record?.seed ?? ((Math.random() * 1e9) | 0);
    const teamOrder = shuffleTeams(play.map((p) => p.team), seed);
    const localId = record?.playerId ?? play.find((p) => p.host)?.id ?? play[0].id;
    const battle = createBattle({
      seed,
      mapSize,
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
    };
    sfx.confirm();
    startAmbience();
    set({ battle, record: rec, screen: "battle", participants });
    void saveGame(null, rec);
    void removePublicLobby(null, rec.id);
  },
  joinListing: (listing, code, user) => {
    const recs = typeof window === "undefined" ? [] : [];
    const record = get().record;
    // Prefer the matching local save
    const local = record?.id === listing.id ? record : null;
    let game = local;
    if (!game) {
      try {
        const raw = localStorage.getItem("gff.games.v1");
        const parsed = raw ? (JSON.parse(raw) as { games?: GameRecord[] }) : { games: [] };
        game = (parsed.games ?? []).find((g) => g.id === listing.id) ?? null;
      } catch {
        game = null;
      }
    }
    if (!game) return "Could not find that game on this device. Ask the host for an invite link.";
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
    const playerId = claimed.find((p) => p.userId === user?.id || p.name === (user?.name || user?.email || "Guest"))?.id;
    const next = { ...game, participants: claimed, playerId: playerId ?? game.playerId, status: "lobby" as const };
    sfx.confirm();
    set({ record: next, participants: claimed, screen: "lobby", points: next.points, mapSize: next.mapSize, visibility: next.visibility, gameName: next.name });
    void saveGame(null, next);
    void upsertPublicLobby(null, next);
    return null;
  },
  beginBattle: (opts) => {
    const { participants } = get();
    if (participants.filter(playable).length >= 2) {
      get().startMatch();
      return;
    }
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
    startAmbience();
    set({ battle, record: rec, screen: "battle", statusMessage: null });
    void saveGame(null, rec);
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
          (u) => u.overwatchedThisTurn && !battle.units.find((p) => p.id === u.id)?.overwatchedThisTurn,
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
        const extra =
          next.phase === "moving" ? 0 : next.phase === "resolving" ? 0.35 : 0.5;
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
  persist: (client) => {
    const { record, battle } = get();
    if (!record || !battle) return;
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
