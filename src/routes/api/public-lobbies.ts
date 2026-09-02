import { createFileRoute } from "@tanstack/react-router";
import {
  listPublicDirectory,
  removePublicDirectory,
  upsertPublicDirectory,
} from "@/game/lobby-directory.server";
import { asListing } from "@/game/listings";
import { identityCallerFromRequest } from "@/lib/identity/verify-access.server";

function json(status: number, body: unknown) {
  return Response.json(body, { status });
}

export const Route = createFileRoute("/api/public-lobbies")({
  server: {
    handlers: {
      GET: async () => {
        const games = await listPublicDirectory();
        return json(200, { games });
      },
      PUT: async ({ request }) => {
        const caller = await identityCallerFromRequest(request);
        if (!caller) return json(401, { error: "unauthorized", message: "Sign in to list a public table." });
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return json(400, { error: "bad_request", message: "Body must be JSON." });
        }
        const listing = asListing(body);
        if (!listing?.hostId) return json(400, { error: "bad_request", message: "Invalid listing." });
        if (listing.hostId !== caller.userId) {
          return json(403, { error: "forbidden", message: "Only the host can publish this table." });
        }
        const games = await upsertPublicDirectory(listing);
        return json(200, { games });
      },
      DELETE: async ({ request }) => {
        const caller = await identityCallerFromRequest(request);
        if (!caller) return json(401, { error: "unauthorized", message: "Sign in to unlist a table." });
        const url = new URL(request.url);
        const id = url.searchParams.get("id")?.trim() ?? "";
        if (!id) return json(400, { error: "bad_request", message: "id is required." });
        const games = await removePublicDirectory(id, caller.userId);
        return json(200, { games });
      },
    },
  },
});
