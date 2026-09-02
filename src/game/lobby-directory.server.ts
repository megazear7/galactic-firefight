import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { PublicListing } from "./types.ts";
import { asListing, mergeListings } from "./listings.ts";

const STORE_NAME = "galactic-firefight";
const BLOB_KEY = "public-lobbies";

type DirectoryDoc = { games: PublicListing[] };

function filePath() {
  const override = process.env.GFF_LOBBY_DIR?.trim();
  const root = override || join(process.cwd(), ".data");
  return join(root, "public-lobbies.json");
}

function blobsAvailable() {
  return Boolean(
    process.env.NETLIFY || process.env.NETLIFY_DEV || process.env.NETLIFY_BLOBS_CONTEXT,
  );
}

async function netlifyStore() {
  if (!blobsAvailable()) return null;
  try {
    const { getStore } = await import("@netlify/blobs");
    return getStore(STORE_NAME);
  } catch (err) {
    console.warn("public lobby directory: netlify blobs unavailable", err);
    return null;
  }
}

function parseDoc(raw: unknown): PublicListing[] {
  if (!raw || typeof raw !== "object") return [];
  const games = (raw as { games?: unknown }).games;
  if (!Array.isArray(games)) return [];
  return games.map(asListing).filter((g): g is PublicListing => Boolean(g));
}

async function readFileDoc(): Promise<PublicListing[]> {
  try {
    const raw = await readFile(filePath(), "utf8");
    return parseDoc(JSON.parse(raw) as unknown);
  } catch {
    return [];
  }
}

async function writeFileDoc(games: PublicListing[]) {
  const path = filePath();
  await mkdir(dirname(path), { recursive: true });
  const doc: DirectoryDoc = { games };
  await writeFile(path, JSON.stringify(doc), "utf8");
}

let fileQueue: Promise<unknown> = Promise.resolve();

function enqueueFile<T>(fn: () => Promise<T>): Promise<T> {
  const next = fileQueue.then(fn, fn);
  fileQueue = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

async function readBlobsDoc(): Promise<PublicListing[] | null> {
  const store = await netlifyStore();
  if (!store) return null;
  try {
    const raw = await store.get(BLOB_KEY, { type: "json" });
    return parseDoc(raw);
  } catch {
    return [];
  }
}

async function writeBlobsDoc(games: PublicListing[]) {
  const store = await netlifyStore();
  if (!store) return false;
  const doc: DirectoryDoc = { games };
  if (typeof store.setJSON === "function") {
    await store.setJSON(BLOB_KEY, doc);
  } else {
    await store.set(BLOB_KEY, JSON.stringify(doc));
  }
  return true;
}

export async function listPublicDirectory(): Promise<PublicListing[]> {
  const fromBlobs = await readBlobsDoc();
  if (fromBlobs) return mergeListings([fromBlobs]);
  return mergeListings([await readFileDoc()]);
}

export async function upsertPublicDirectory(listing: PublicListing): Promise<PublicListing[]> {
  const incoming = asListing(listing);
  if (!incoming?.hostId) throw new Error("invalid listing");
  const apply = (current: PublicListing[]) => mergeListings([[incoming], current]);

  const fromBlobs = await readBlobsDoc();
  if (fromBlobs) {
    const next = apply(fromBlobs);
    await writeBlobsDoc(next);
    return next;
  }
  return enqueueFile(async () => {
    const next = apply(await readFileDoc());
    await writeFileDoc(next);
    return next;
  });
}

export async function removePublicDirectory(id: string, hostId: string): Promise<PublicListing[]> {
  const apply = (current: PublicListing[]) =>
    mergeListings([current.filter((g) => !(g.id === id && g.hostId === hostId))]);

  const fromBlobs = await readBlobsDoc();
  if (fromBlobs) {
    const next = apply(fromBlobs);
    await writeBlobsDoc(next);
    return next;
  }
  return enqueueFile(async () => {
    const next = apply(await readFileDoc());
    await writeFileDoc(next);
    return next;
  });
}
