import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useGame } from "@/game/store";
import { FACTION_BLURB, FACTION_NAME } from "@/game/units";
import { MAP_SIZE_LABEL } from "@/game/map";
import { cn } from "@/lib/utils";
import type { Faction, MapSize, PointScale } from "@/game/types";
import { useIdentity } from "@/lib/identity/provider";

export function SetupScreen() {
  const mode = useGame((s) => s.mode);
  const points = useGame((s) => s.points);
  const mapSize = useGame((s) => s.mapSize);
  const faction = useGame((s) => s.faction);
  const setPoints = useGame((s) => s.setPoints);
  const setMapSize = useGame((s) => s.setMapSize);
  const setFaction = useGame((s) => s.setFaction);
  const setScreen = useGame((s) => s.setScreen);
  const inviteEmail = useGame((s) => s.inviteEmail);
  const setInviteEmail = useGame((s) => s.setInviteEmail);
  const identity = useIdentity();

  return (
    <div className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-8 px-5 py-8">
      <div>
        <p className="text-xs uppercase tracking-[0.28em] text-muted">{mode === "multi" ? "Linked battle" : "Skirmish"}</p>
        <h1 className="mt-2 font-display text-4xl font-semibold">Muster</h1>
      </div>

      <section>
        <Label>Force size</Label>
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
        <Label>Field size</Label>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {(["small", "medium", "large"] as MapSize[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setMapSize(s)}
              className={cn(
                "h-14 rounded-[var(--radius-md)] border font-display text-xl",
                mapSize === s ? "border-accent bg-surface-2" : "border-border bg-surface",
              )}
            >
              {MAP_SIZE_LABEL[s]}
              <span className="block text-xs font-sans uppercase tracking-wider text-subtle">
                {s === "small" ? "24×18" : s === "medium" ? "32×24" : "44×32"}
              </span>
            </button>
          ))}
        </div>
      </section>

      <section>
        <Label>Faction</Label>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {(["empire", "brood"] as Faction[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFaction(f)}
              className={cn(
                "rounded-[var(--radius-lg)] border p-4 text-left",
                faction === f ? "border-accent bg-surface-2" : "border-border bg-surface",
              )}
            >
              <img
                src={f === "empire" ? "/assets/ui/empire.png" : "/assets/ui/brood.png"}
                alt=""
                className="mb-3 h-14 w-14 object-contain"
                crossOrigin="anonymous"
              />
              <p className="font-display text-2xl font-semibold">{FACTION_NAME[f]}</p>
              <p className="mt-1 text-sm text-muted">{FACTION_BLURB[f]}</p>
            </button>
          ))}
        </div>
      </section>

      {mode === "multi" && identity.isAuthenticated && (
        <section>
          <Label>Invite</Label>
          <p className="mt-1 text-sm text-muted">
            Optional: your friend’s email, so Megazear identity can admit them to the host save. You will still copy a link.
          </p>
          <Input
            className="mt-3"
            type="email"
            placeholder="friend@email"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
          />
        </section>
      )}

      <div className="mt-auto flex gap-3">
        <Button variant="ghost" onClick={() => setScreen("menu")}>
          Back
        </Button>
        <Button className="flex-1" onClick={() => setScreen("army")}>
          Build army
        </Button>
      </div>
    </div>
  );
}
