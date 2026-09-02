import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  listPublicDirectory,
  removePublicDirectory,
  upsertPublicDirectory,
} from "./lobby-directory.server.ts";
import type { PublicListing } from "./types.ts";

function listing(partial: Partial<PublicListing> & Pick<PublicListing, "id" | "hostId">): PublicListing {
  return {
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
    updatedAt: new Date().toISOString(),
    ...partial,
  };
}

describe("lobby directory file store", () => {
  it("publishes, lists, and removes a host listing", async () => {
    const dir = await mkdtemp(join(tmpdir(), "gff-lobbies-"));
    process.env.GFF_LOBBY_DIR = dir;
    const a = listing({ id: "game-a", hostId: "auth0|host-a", name: "Alpha" });
    await upsertPublicDirectory(a);
    const listed = await listPublicDirectory();
    assert.equal(listed.some((g) => g.id === "game-a" && g.name === "Alpha"), true);
    const raw = JSON.parse(await readFile(join(dir, "public-lobbies.json"), "utf8")) as {
      games: PublicListing[];
    };
    assert.equal(raw.games[0]?.id, "game-a");
    await removePublicDirectory("game-a", "auth0|other");
    assert.equal((await listPublicDirectory()).some((g) => g.id === "game-a"), true);
    await removePublicDirectory("game-a", "auth0|host-a");
    assert.equal((await listPublicDirectory()).some((g) => g.id === "game-a"), false);
    delete process.env.GFF_LOBBY_DIR;
  });
});
