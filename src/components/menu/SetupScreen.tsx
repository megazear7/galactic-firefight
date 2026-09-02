import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useGame } from "@/game/store";
import { MAP_SIZE_LABEL } from "@/game/map";
import { MAP_SLOT_CAP } from "@/game/types";
import { cn } from "@/lib/utils";
import type { MapSize, PointScale } from "@/game/types";
import { useIdentity } from "@/lib/identity/provider";
import { useNavigate } from "@tanstack/react-router";

export function SetupScreen() {
  const points = useGame((s) => s.points);
  const mapSize = useGame((s) => s.mapSize);
  const setPoints = useGame((s) => s.setPoints);
  const setMapSize = useGame((s) => s.setMapSize);
  const gameName = useGame((s) => s.gameName);
  const setGameName = useGame((s) => s.setGameName);
  const passcode = useGame((s) => s.passcode);
  const setPasscode = useGame((s) => s.setPasscode);
  const visibility = useGame((s) => s.visibility);
  const setVisibility = useGame((s) => s.setVisibility);
  const confirmCreate = useGame((s) => s.confirmCreate);
  const identity = useIdentity();
  const navigate = useNavigate();

  return (
    <div className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-8 px-5 py-8">
      <div>
        <p className="text-xs uppercase tracking-[0.28em] text-muted">New match</p>
        <h1 className="mt-2 font-display text-4xl font-semibold">Create game</h1>
      </div>

      <section>
        <Label>Game name</Label>
        <Input className="mt-3" value={gameName} onChange={(e) => setGameName(e.target.value)} placeholder="Firefight" />
      </section>

      <section>
        <Label>Pass code (optional)</Label>
        <p className="mt-1 text-sm text-muted">Joining a public game will require this if you set one.</p>
        <Input className="mt-3" value={passcode} onChange={(e) => setPasscode(e.target.value)} placeholder="Leave blank for none" />
      </section>

      <section>
        <Label>Map size</Label>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {(["small", "medium", "large"] as MapSize[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setMapSize(s)}
              className={cn(
                "h-16 rounded-[var(--radius-md)] border font-display text-xl",
                mapSize === s ? "border-accent bg-surface-2" : "border-border bg-surface",
              )}
            >
              {MAP_SIZE_LABEL[s]}
              <span className="block text-xs font-sans uppercase tracking-wider text-subtle">
                {MAP_SLOT_CAP[s]} players
              </span>
            </button>
          ))}
        </div>
      </section>

      <section>
        <Label>Points</Label>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {([100, 200, 300] as PointScale[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPoints(p)}
              className={cn(
                "h-14 rounded-[var(--radius-md)] border font-display text-xl",
                points === p ? "border-accent bg-surface-2" : "border-border bg-surface",
              )}
            >
              {p}
              <span className="block text-xs font-sans uppercase tracking-wider text-subtle">points</span>
            </button>
          ))}
        </div>
      </section>

      <section>
        <Label>Visibility</Label>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {(["private", "public"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setVisibility(v)}
              className={cn(
                "h-14 rounded-[var(--radius-md)] border capitalize",
                visibility === v ? "border-accent bg-surface-2" : "border-border bg-surface",
              )}
            >
              {v}
              <span className="block text-xs text-subtle">
                {v === "public" ? "Listed for others to join" : "Invite only / local"}
              </span>
            </button>
          ))}
        </div>
        {visibility === "public" && !identity.isAuthenticated && (
          <p className="mt-2 text-xs text-subtle">Public listing stays on this device unless you sign in.</p>
        )}
      </section>

      <div className="mt-auto flex gap-3">
        <Button variant="ghost" onClick={() => void navigate({ to: "/" })}>
          Back
        </Button>
        <Button
          className="flex-1"
          onClick={() => {
            confirmCreate(identity.user, identity.client);
            const id = useGame.getState().record?.id;
            if (id) void navigate({ to: "/game/$gameId/roster", params: { gameId: id } });
          }}
        >
          Continue to roster
        </Button>
      </div>
    </div>
  );
}
