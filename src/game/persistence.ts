import type { BattleState, GameRecord, PublicListing, Settings, UnitState } from "./types";
import { listingOf } from "./lobby";
import { DEFAULT_SETTINGS, SAVE_VERSION } from "./types";
import { MEGAZEAR_APP } from "@/lib/identity/config";
import { UserDataClient, UserDataError } from "@/lib/identity/megazear-users";

const LOCAL_GAMES = "gff.games.v1";
const LOCAL_SETTINGS = "gff.settings.v1";
const LOCAL_PUBLIC = "gff.public-lobbies.v1";

function nowIso() {
  return new Date().toISOString();
}

export function newGameId() {
  const rand = Math.random().toString(36).slice(2, 8);
  return `skirmish-${Date.now().toString(36)}-${rand}`;
}

function migrateUnit(u: UnitState): UnitState {
  return {
    ...u,
    overwatchedThisTurn: u.overwatchedThisTurn ?? false,
    playerId: u.playerId ?? (u.faction === "empire" ? "p-host" : "p-ai"),
    team: u.team ?? (u.faction === "empire" ? 1 : 2),
    color: u.color ?? (u.faction === "empire" ? 0 : 1),
  };
}

function migrateBattle(raw: BattleState | null): BattleState | null {
  if (!raw) return null;
  const tiles = raw.map?.tiles?.length ?? 0;
  const explored =
    Array.isArray(raw.explored) && raw.explored.length === tiles
      ? raw.explored.map(Boolean)
      : Array.from({ length: tiles }, () => false);
  return {
    ...raw,
    version: SAVE_VERSION,
    fx: raw.fx ?? [],
    units: raw.units.map(migrateUnit),
    pendingMove: raw.pendingMove
      ? { ...raw.pendingMove, overwatchDone: raw.pendingMove.overwatchDone ?? false }
      : null,
    explored,
    actMode: raw.actMode === "fire" ? "fire" : "move",
    playerId: raw.playerId ?? "p-host",
    turnTeam: raw.turnTeam ?? (raw.turn === "brood" ? 2 : 1),
    teamOrder: raw.teamOrder?.length ? raw.teamOrder : [1, 2],
    participants: raw.participants ?? [],
    hotseatPending: raw.hotseatPending ?? null,
  };
}

function migrateGame(raw: GameRecord): GameRecord {
  return {
    version: SAVE_VERSION,
    id: raw.id,
    name: raw.name || "Untitled field",
    createdAt: raw.createdAt || nowIso(),
    updatedAt: raw.updatedAt || nowIso(),
    status:
      raw.status === "victory" || raw.status === "defeat" || raw.status === "setup" || raw.status === "lobby"
        ? raw.status
        : "active",
    mode: raw.mode === "multi" ? "multi" : "single",
    points: raw.points === 200 || raw.points === 300 ? raw.points : 100,
    mapSize: raw.mapSize === "small" || raw.mapSize === "large" ? raw.mapSize : "medium",
    visibility: raw.visibility === "public" ? "public" : "private",
    passcode: raw.passcode,
    participants: raw.participants ?? [],
    teamOrder: raw.teamOrder ?? [],
    playerId: raw.playerId ?? "p-host",
    playerFaction: raw.playerFaction === "brood" ? "brood" : "empire",
    hostId: raw.hostId,
    guestId: raw.guestId,
    hostEmail: raw.hostEmail,
    guestEmail: raw.guestEmail,
    hostFaction: raw.hostFaction,
    guestFaction: raw.guestFaction,
    hostArmy: raw.hostArmy,
    guestArmy: raw.guestArmy,
    seed: raw.seed ?? 1,
    battle: migrateBattle(raw.battle ?? null),
  };
}

function readLocal(): GameRecord[] {
  try {
    const raw = localStorage.getItem(LOCAL_GAMES);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { campaigns?: GameRecord[]; games?: GameRecord[] };
    const list = parsed.games ?? parsed.campaigns ?? [];
    return list.map(migrateGame).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } catch {
    return [];
  }
}

function writeLocal(games: GameRecord[]) {
  try {
    localStorage.setItem(LOCAL_GAMES, JSON.stringify({ version: SAVE_VERSION, games }));
  } catch {
    /* quota */
  }
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(LOCAL_SETTINGS);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Settings) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: Settings) {
  try {
    localStorage.setItem(LOCAL_SETTINGS, JSON.stringify(settings));
  } catch {
    /* ignore */
  }
}

export async function listGames(client: UserDataClient | null): Promise<GameRecord[]> {
  if (!client) return readLocal();
  try {
    const index = await client.get<{ games: GameRecord[] }>({
      app: MEGAZEAR_APP,
      visibility: "private",
      path: "games/index",
    });
    return (index.data.games ?? []).map(migrateGame);
  } catch (err) {
    if (err instanceof UserDataError && err.status === 404) return readLocal();
    console.warn("identity list failed, using local games", err);
    return readLocal();
  }
}

export async function getGame(client: UserDataClient | null, id: string): Promise<GameRecord | null> {
  if (!client) return readLocal().find((g) => g.id === id) ?? null;
  try {
    const rec = await client.get<GameRecord>({
      app: MEGAZEAR_APP,
      visibility: "private",
      path: `games/${id}`,
    });
    return migrateGame(rec.data);
  } catch (err) {
    if (err instanceof UserDataError && err.status === 404) {
      return readLocal().find((g) => g.id === id) ?? null;
    }
    return readLocal().find((g) => g.id === id) ?? null;
  }
}

export async function saveGame(client: UserDataClient | null, game: GameRecord): Promise<GameRecord> {
  const next: GameRecord = { ...migrateGame(game), updatedAt: nowIso() };
  const local = readLocal().filter((g) => g.id !== next.id);
  local.unshift(next);
  writeLocal(local);
  if (client) {
    try {
      await client.put({
        app: MEGAZEAR_APP,
        visibility: "private",
        path: `games/${next.id}`,
        data: next,
      });
      await client.put({
        app: MEGAZEAR_APP,
        visibility: "private",
        path: "games/index",
        data: { version: SAVE_VERSION, games: local },
      });
    } catch (err) {
      console.warn("identity save failed; kept local copy", err);
    }
  }
  return next;
}

export async function deleteGame(client: UserDataClient | null, id: string) {
  const local = readLocal().filter((g) => g.id !== id);
  writeLocal(local);
  if (!client) return;
  try {
    await client.delete({
      app: MEGAZEAR_APP,
      visibility: "private",
      path: `games/${id}`,
    });
    await client.put({
      app: MEGAZEAR_APP,
      visibility: "private",
      path: "games/index",
      data: { version: SAVE_VERSION, games: local },
    });
  } catch (err) {
    console.warn("identity delete failed", err);
  }
}

export type MpLobby = {
  version: number;
  id: string;
  hostId: string;
  hostName: string;
  hostEmail?: string;
  guestId?: string;
  guestEmail?: string;
  guestName?: string;
  points: 100 | 200 | 300;
  mapSize?: "small" | "medium" | "large";
  status: "waiting" | "setup" | "battle" | "done";
  hostFaction?: "empire" | "brood";
  guestFaction?: "empire" | "brood";
  updatedAt: string;
};

export async function putHostLobby(client: UserDataClient, lobby: MpLobby) {
  await client.put({
    app: MEGAZEAR_APP,
    visibility: "public",
    path: `games/${lobby.id}`,
    data: lobby,
  });
  await client.put({
    app: MEGAZEAR_APP,
    visibility: "shared",
    path: `games/${lobby.id}/state`,
    data: lobby,
  });
}

export async function readHostLobby(
  client: UserDataClient,
  hostId: string,
  gameId: string,
): Promise<MpLobby | null> {
  try {
    const rec = await client.get<MpLobby>({
      targetUserId: hostId,
      app: MEGAZEAR_APP,
      visibility: "public",
      path: `games/${gameId}`,
    });
    return rec.data;
  } catch {
    return null;
  }
}

export async function putSharedGame(
  client: UserDataClient,
  hostId: string | undefined,
  gameId: string,
  data: GameRecord,
) {
  await client.put({
    targetUserId: hostId,
    app: MEGAZEAR_APP,
    visibility: "shared",
    path: `games/${gameId}/state`,
    data,
  });
}

export async function getSharedGame(
  client: UserDataClient,
  hostId: string,
  gameId: string,
): Promise<GameRecord | null> {
  try {
    const rec = await client.get<GameRecord>({
      targetUserId: hostId,
      app: MEGAZEAR_APP,
      visibility: "shared",
      path: `games/${gameId}/state`,
    });
    return migrateGame(rec.data);
  } catch {
    return null;
  }
}

export type AclDoc = {
  version: 1;
  updatedAt: string;
  entries: Array<{
    id: string;
    principal: { type: "user" | "email"; id: string };
    permissions: Array<"create" | "read" | "write" | "delete">;
    paths: string[];
    createdAt: string;
    createdBy: string;
  }>;
};

export async function grantGuestAcl(
  client: UserDataClient,
  ownerId: string,
  gameId: string,
  guest: { userId?: string; email?: string },
) {
  let existing: AclDoc = { version: 1, updatedAt: nowIso(), entries: [] };
  try {
    const rec = await client.getAcl(MEGAZEAR_APP);
    existing = rec.data as AclDoc;
  } catch {
    /* empty */
  }
  const entries = existing.entries.filter((e) => !e.paths.some((p) => p.includes(gameId)));
  const ts = nowIso();
  if (guest.email) {
    entries.push({
      id: `acl_email_${gameId}`,
      principal: { type: "email", id: guest.email.trim().toLowerCase() },
      permissions: ["read", "write", "create"],
      paths: [`games/${gameId}`, `games/${gameId}/**`],
      createdAt: ts,
      createdBy: ownerId,
    });
  }
  if (guest.userId) {
    entries.push({
      id: `acl_user_${gameId}`,
      principal: { type: "user", id: guest.userId },
      permissions: ["read", "write", "create"],
      paths: [`games/${gameId}`, `games/${gameId}/**`],
      createdAt: ts,
      createdBy: ownerId,
    });
  }
  await client.putAcl(MEGAZEAR_APP, { version: 1, updatedAt: ts, entries });
}

function readLocalPublic(): PublicListing[] {
  try {
    const raw = localStorage.getItem(LOCAL_PUBLIC);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { games?: PublicListing[] };
    return parsed.games ?? [];
  } catch {
    return [];
  }
}

function writeLocalPublic(games: PublicListing[]) {
  try {
    localStorage.setItem(LOCAL_PUBLIC, JSON.stringify({ version: SAVE_VERSION, games }));
  } catch {
    /* quota */
  }
}

export async function listPublicLobbies(client: UserDataClient | null): Promise<PublicListing[]> {
  const local = readLocalPublic();
  if (!client) return local.filter((g) => g.openSlots >= 0);
  try {
    const rec = await client.get<{ games: PublicListing[] }>({
      app: MEGAZEAR_APP,
      visibility: "public",
      path: "lobbies/index",
    });
    const remote = rec.data.games ?? [];
    const byId = new Map<string, PublicListing>();
    for (const g of [...local, ...remote]) byId.set(g.id, g);
    return [...byId.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } catch {
    return local;
  }
}

export async function upsertPublicLobby(client: UserDataClient | null, rec: GameRecord) {
  if (rec.visibility !== "public" || rec.status !== "lobby") {
    await removePublicLobby(client, rec.id);
    return;
  }
  const listing = listingOf(rec);
  const local = readLocalPublic().filter((g) => g.id !== rec.id);
  local.unshift(listing);
  writeLocalPublic(local);
  if (!client) return;
  try {
    await client.put({
      app: MEGAZEAR_APP,
      visibility: "public",
      path: `lobbies/${rec.id}`,
      data: listing,
    });
    await client.put({
      app: MEGAZEAR_APP,
      visibility: "public",
      path: "lobbies/index",
      data: { version: SAVE_VERSION, games: local },
    });
  } catch (err) {
    console.warn("public lobby publish failed", err);
  }
}

export async function removePublicLobby(client: UserDataClient | null, id: string) {
  writeLocalPublic(readLocalPublic().filter((g) => g.id !== id));
  if (!client) return;
  try {
    const rec = await client.get<{ games: PublicListing[] }>({
      app: MEGAZEAR_APP,
      visibility: "public",
      path: "lobbies/index",
    });
    const games = (rec.data.games ?? []).filter((g) => g.id !== id);
    await client.put({
      app: MEGAZEAR_APP,
      visibility: "public",
      path: "lobbies/index",
      data: { version: SAVE_VERSION, games },
    });
  } catch {
    /* ignore */
  }
}
