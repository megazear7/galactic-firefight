import { useEffect, useState } from "react";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useGame } from "@/game/store";
import { listPublicLobbies } from "@/game/persistence";
import type { PublicListing } from "@/game/types";
import { MAP_SIZE_LABEL } from "@/game/map";
import { useIdentity } from "@/lib/identity/provider";

export function BrowseScreen() {
  const setScreen = useGame((s) => s.setScreen);
  const joinListing = useGame((s) => s.joinListing);
  const identity = useIdentity();
  const [games, setGames] = useState<PublicListing[]>([]);
  const [codes, setCodes] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void listPublicLobbies(identity.client).then(setGames);
  }, [identity.client]);

  return (
    <div className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-6 px-5 py-8">
      <div>
        <p className="text-xs uppercase tracking-[0.28em] text-muted">Open tables</p>
        <h1 className="mt-1 font-display text-4xl font-semibold">Browse games</h1>
        <p className="mt-2 text-sm text-muted">Public matches that have not started. Full tables are listed but cannot be joined.</p>
      </div>

      <div className="grid gap-3">
        {games.length === 0 && <p className="text-sm text-muted">No open public games right now.</p>}
        {games.map((g) => (
          <div key={g.id} className="rounded-[var(--radius-lg)] border border-border bg-surface p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-2xl font-semibold leading-tight">{g.name}</h2>
                <p className="mt-1 text-sm text-muted">
                  {MAP_SIZE_LABEL[g.mapSize]} · {g.points} pts · {g.humanCount} human · {g.aiCount} AI
                  {g.passcodeRequired ? " · pass code" : ""}
                </p>
              </div>
              {g.passcodeRequired && <Lock className="size-4 text-muted" />}
            </div>
            {g.full ? (
              <p className="mt-3 text-sm text-subtle">Full</p>
            ) : (
              <div className="mt-3 flex flex-wrap gap-2">
                {g.passcodeRequired && (
                  <Input
                    className="max-w-[10rem]"
                    placeholder="Pass code"
                    value={codes[g.id] ?? ""}
                    onChange={(e) => setCodes((c) => ({ ...c, [g.id]: e.target.value }))}
                  />
                )}
                <Button
                  onClick={() => {
                    const err = joinListing(g, codes[g.id] ?? "", identity.user);
                    setError(err);
                  }}
                >
                  Join
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <Button variant="ghost" className="mt-auto self-start" onClick={() => setScreen("menu")}>
        Back
      </Button>
    </div>
  );
}
