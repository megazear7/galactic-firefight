import type { PublicListing } from "./types";

export const MAX_PUBLIC_LISTINGS = 80;
export const PUBLIC_LISTING_MAX_AGE_MS = 6 * 60 * 60 * 1000;

export function asListing(data: unknown): PublicListing | null {
  if (!data || typeof data !== "object") return null;
  const g = data as Partial<PublicListing>;
  if (typeof g.id !== "string" || !g.id) return null;
  if (typeof g.hostId !== "string") return null;
  if (typeof g.name !== "string") return null;
  if (g.mapSize !== "small" && g.mapSize !== "medium" && g.mapSize !== "large") return null;
  if (g.points !== 100 && g.points !== 200 && g.points !== 300) return null;
  if (typeof g.updatedAt !== "string" || !g.updatedAt) return null;
  return {
    id: g.id,
    hostId: g.hostId,
    hostName: typeof g.hostName === "string" && g.hostName ? g.hostName : "Host",
    name: g.name,
    mapSize: g.mapSize,
    points: g.points,
    passcodeRequired: Boolean(g.passcodeRequired),
    humanCount: Number.isFinite(g.humanCount) ? Number(g.humanCount) : 1,
    aiCount: Number.isFinite(g.aiCount) ? Number(g.aiCount) : 0,
    slotCap: Number.isFinite(g.slotCap) ? Number(g.slotCap) : 6,
    openSlots: Number.isFinite(g.openSlots) ? Number(g.openSlots) : 0,
    full: Boolean(g.full),
    updatedAt: g.updatedAt,
  };
}

export function isStaleListing(g: PublicListing, now = Date.now()) {
  const t = Date.parse(g.updatedAt);
  if (!Number.isFinite(t)) return true;
  return now - t > PUBLIC_LISTING_MAX_AGE_MS;
}

export function mergeListings(groups: PublicListing[][], now = Date.now()): PublicListing[] {
  const byId = new Map<string, PublicListing>();
  for (const group of groups) {
    for (const raw of group) {
      const g = asListing(raw);
      if (!g || isStaleListing(g, now)) continue;
      const prev = byId.get(g.id);
      if (!prev || g.updatedAt >= prev.updatedAt) byId.set(g.id, g);
    }
  }
  return [...byId.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, MAX_PUBLIC_LISTINGS);
}
