import { defaultLoadout } from "./units";
import type {
  ArmyLoadout,
  Faction,
  GameRecord,
  MapSize,
  Participant,
  PointScale,
  PublicListing,
  SlotKind,
} from "./types";
import { MAP_SLOT_CAP, PLAYER_PALETTE } from "./types";

export function slotCap(size: MapSize) {
  return MAP_SLOT_CAP[size];
}

export function nextColor(used: number[]) {
  for (let i = 0; i < PLAYER_PALETTE.length; i++) {
    if (!used.includes(i)) return i;
  }
  return used.length % PLAYER_PALETTE.length;
}

export function nextTeam(existing: Participant[]) {
  const used = new Set(existing.map((p) => p.team));
  for (let t = 1; t <= 8; t++) {
    if (!used.has(t)) return t;
  }
  return Math.min(8, existing.length + 1);
}

export function nid(prefix = "p") {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

export function makeParticipant(partial: Partial<Participant> & Pick<Participant, "kind" | "faction">): Participant {
  const points = (partial.army ? 100 : 100) as PointScale;
  return {
    id: partial.id ?? nid(),
    kind: partial.kind,
    name:
      partial.name ??
      (partial.kind === "ai"
        ? "AI"
        : partial.kind === "open"
          ? "Open slot"
          : partial.kind === "invite"
            ? "Invite"
            : partial.kind === "local"
              ? "Player"
              : "Commander"),
    userId: partial.userId,
    email: partial.email,
    faction: partial.faction,
    team: partial.team ?? 1,
    color: partial.color ?? 0,
    army: partial.army ?? defaultLoadout(partial.faction, 100),
    ready: partial.ready ?? partial.kind === "ai",
    host: partial.host ?? false,
  };
}

export function defaultMatch(points: PointScale, local: { name: string; userId?: string; email?: string }): Participant[] {
  const host = makeParticipant({
    kind: "human",
    name: local.name,
    userId: local.userId,
    email: local.email,
    faction: "empire",
    team: 1,
    color: 0,
    army: defaultLoadout("empire", points),
    ready: false,
    host: true,
  });
  const ai = makeParticipant({
    kind: "ai",
    name: "Brood AI",
    faction: "brood",
    team: 2,
    color: 1,
    army: defaultLoadout("brood", points),
    ready: true,
    host: false,
  });
  return [host, ai];
}

export function isDevicePlayer(p: Participant) {
  return p.kind === "local" || p.host;
}

export function isSeatedHuman(p: Participant) {
  return p.kind === "human" || p.kind === "local";
}

export function playable(p: Participant) {
  return p.kind === "human" || p.kind === "local" || p.kind === "ai";
}

export function humansReady(participants: Participant[]) {
  const humans = participants.filter(isSeatedHuman);
  return humans.length > 0 && humans.every((p) => p.ready);
}

export function devicePlayers(participants: Participant[]) {
  return participants.filter(isDevicePlayer);
}

export function listingOf(rec: GameRecord): PublicListing {
  const play = rec.participants.filter(playable);
  const open = rec.participants.filter((p) => p.kind === "open").length;
  return {
    id: rec.id,
    hostId: rec.hostId ?? rec.participants.find((p) => p.host)?.userId ?? "",
    hostName: rec.participants.find((p) => p.host)?.name ?? "Host",
    name: rec.name,
    mapSize: rec.mapSize,
    points: rec.points,
    passcodeRequired: Boolean(rec.passcode),
    humanCount: rec.participants.filter(isSeatedHuman).length,
    aiCount: rec.participants.filter((p) => p.kind === "ai").length,
    slotCap: slotCap(rec.mapSize),
    openSlots: open,
    full: open === 0,
    updatedAt: rec.updatedAt,
  };
}

export function shuffleTeams(teams: number[], seed: number) {
  const a = [...new Set(teams)];
  let s = seed >>> 0 || 1;
  const rand = () => {
    s = (Math.imul(s ^ (s >>> 16), 0x45d9f3b) >>> 0);
    return (s >>> 0) / 4294967296;
  };
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function retuneArmies(participants: Participant[], points: PointScale): Participant[] {
  return participants.map((p) =>
    playable(p) ? { ...p, army: p.army && Object.keys(p.army).length ? p.army : defaultLoadout(p.faction, points) } : p,
  );
}

export function canAddSlot(participants: Participant[], size: MapSize) {
  return participants.length < slotCap(size);
}

export function claimOpenSlot(
  participants: Participant[],
  joiner: { id: string; name: string; userId?: string; email?: string },
  points: PointScale,
): Participant[] | null {
  const idx = participants.findIndex((p) => p.kind === "open");
  if (idx < 0) return null;
  const seat = participants[idx];
  const next = participants.slice();
  next[idx] = {
    ...seat,
    kind: "human",
    name: joiner.name,
    userId: joiner.userId,
    email: joiner.email,
    ready: false,
    army: seat.army && Object.keys(seat.army).length ? seat.army : defaultLoadout(seat.faction, points),
  };
  return next;
}

export function claimInviteSlot(
  participants: Participant[],
  joiner: { name: string; userId?: string; email?: string },
  points: PointScale,
): Participant[] | null {
  const email = joiner.email?.trim().toLowerCase();
  if (!email) return null;
  const idx = participants.findIndex((p) => p.kind === "invite" && p.email?.trim().toLowerCase() === email);
  if (idx < 0) return null;
  const seat = participants[idx];
  const next = participants.slice();
  next[idx] = {
    ...seat,
    kind: "human",
    name: joiner.name,
    userId: joiner.userId,
    email: joiner.email,
    ready: false,
    army: seat.army && Object.keys(seat.army).length ? seat.army : defaultLoadout(seat.faction, points),
  };
  return next;
}

export function passcodeOk(stored: string | undefined, attempt: string) {
  if (!stored) return true;
  return stored.trim().toLowerCase() === attempt.trim().toLowerCase();
}

export function colorHex(color: number) {
  return PLAYER_PALETTE[color % PLAYER_PALETTE.length]?.hex ?? "#c5ccd6";
}

export type { ArmyLoadout, Faction, SlotKind };
