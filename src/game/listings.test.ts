import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { asListing, isStaleListing, mergeListings, PUBLIC_LISTING_MAX_AGE_MS } from "./listings.ts";
import type { PublicListing } from "./types.ts";

function listing(partial: Partial<PublicListing> & Pick<PublicListing, "id">): PublicListing {
  return {
    hostId: "auth0|host",
    hostName: "Host",
    name: "Firefight",
    mapSize: "medium",
    points: 100,
    passcodeRequired: false,
    humanCount: 1,
    aiCount: 1,
    slotCap: 6,
    openSlots: 1,
    full: false,
    updatedAt: "2026-09-01T00:00:00.000Z",
    ...partial,
  };
}

describe("asListing", () => {
  it("keeps local listings that have not been published under a host id", () => {
    const g = asListing({ ...listing({ id: "a" }), hostId: "" });
    assert.equal(g?.id, "a");
    assert.equal(g?.hostId, "");
  });

  it("accepts a complete listing", () => {
    const g = asListing(listing({ id: "skirmish-1", openSlots: 2 }));
    assert.equal(g?.id, "skirmish-1");
    assert.equal(g?.openSlots, 2);
  });
});

describe("mergeListings", () => {
  it("keeps the newest copy of each id and sorts newest first", () => {
    const older = listing({ id: "a", updatedAt: "2026-09-01T01:00:00.000Z", name: "Old" });
    const newer = listing({ id: "a", updatedAt: "2026-09-01T02:00:00.000Z", name: "New" });
    const other = listing({ id: "b", updatedAt: "2026-09-01T01:30:00.000Z" });
    const merged = mergeListings([[older, other], [newer]], Date.parse("2026-09-01T03:00:00.000Z"));
    assert.deepEqual(
      merged.map((g) => g.id),
      ["a", "b"],
    );
    assert.equal(merged[0]?.name, "New");
  });

  it("drops stale listings", () => {
    const now = Date.parse("2026-09-01T12:00:00.000Z");
    const stale = listing({
      id: "old",
      updatedAt: new Date(now - PUBLIC_LISTING_MAX_AGE_MS - 1).toISOString(),
    });
    const fresh = listing({
      id: "new",
      updatedAt: new Date(now - 60_000).toISOString(),
    });
    assert.equal(isStaleListing(stale, now), true);
    const merged = mergeListings([[stale, fresh]], now);
    assert.deepEqual(
      merged.map((g) => g.id),
      ["new"],
    );
  });
});
