import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useGame } from "@/game/store";
import { FACTION_BLURB, FACTION_NAME, defaultLoadout } from "@/game/units";
import type { Faction } from "@/game/types";
import { useIdentity } from "@/lib/identity/provider";
import {
  getSharedGame,
  grantGuestAcl,
  putSharedGame,
  readHostLobby,
  type MpLobby,
} from "@/game/persistence";
import { createBattle, defaultEnemyArmy } from "@/game/battle";
import { cn } from "@/lib/utils";

export function JoinScreen() {
  const identity = useIdentity();
  const hostId = useGame((s) => s.joinHostId);
  const gameId = useGame((s) => s.joinGameId);
  const faction = useGame((s) => s.faction);
  const setFaction = useGame((s) => s.setFaction);
  const army = useGame((s) => s.army);
  const points = useGame((s) => s.points);
  const setPoints = useGame((s) => s.setPoints);
  const setMapSize = useGame((s) => s.setMapSize);
  const setArmy = useGame((s) => s.setArmy);
  const setScreen = useGame((s) => s.setScreen);
  const [lobby, setLobby] = useState<MpLobby | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!identity.client || !hostId || !gameId) return;
    void readHostLobby(identity.client, hostId, gameId).then((l) => {
      setLobby(l);
      if (l) {
        setPoints(l.points);
        if (l.mapSize) setMapSize(l.mapSize);
        const taken = l.hostFaction;
        const pick: Faction = taken === "empire" ? "brood" : taken === "brood" ? "empire" : "brood";
        setFaction(pick);
        setArmy(defaultLoadout(pick, l.points));
      }
    });
  }, [identity.client, hostId, gameId, setArmy, setFaction, setPoints, setMapSize]);

  async function join() {
    if (!identity.client || !identity.user || !hostId || !gameId) return;
    setBusy(true);
    setError(null);
    try {
      const existing = await getSharedGame(identity.client, hostId, gameId);
      if (!existing) {
        setError("The host save is not reachable yet. Ask them to admit your email, then retry.");
        return;
      }
      const hostFaction = existing.hostFaction ?? existing.playerFaction;
      const guestFaction: Faction = hostFaction === "empire" ? "brood" : "empire";
      const first = Math.random() < 0.5 ? "empire" : "brood";
      const battle = createBattle({
        seed: existing.seed,
        playerFaction: guestFaction,
        playerArmy: army,
        enemyArmy: existing.hostArmy ?? defaultEnemyArmy(hostFaction, existing.points),
        mode: "multi",
        first,
        mapSize: existing.mapSize ?? lobby?.mapSize ?? "medium",
      });
      battle.playerFaction = guestFaction;
      const next = {
        ...existing,
        guestId: identity.user.id,
        guestEmail: identity.user.email,
        guestFaction,
        guestArmy: army,
        status: "active" as const,
        battle: { ...battle, playerFaction: guestFaction, mode: "multi" as const },
      };
      await putSharedGame(identity.client, hostId, gameId, next);
      useGame.setState({
        record: { ...next, playerFaction: guestFaction },
        battle: { ...battle, playerFaction: guestFaction },
        faction: guestFaction,
        screen: "battle",
        mode: "multi",
      });
    } catch {
      setError(
        `Could not write to the host save. Tell the host your email (${identity.user.email ?? "unknown"}) so they can admit you.`,
      );
    } finally {
      setBusy(false);
    }
  }

  if (!identity.configured) {
    return (
      <div className="mx-auto max-w-md px-5 py-16 text-sm text-muted">
        Megazear identity is not configured in this preview, so invites cannot be claimed here.
        <Button className="mt-4" onClick={() => setScreen("menu")}>
          Menu
        </Button>
      </div>
    );
  }

  if (!identity.isAuthenticated) {
    return (
      <div className="mx-auto max-w-md px-5 py-16">
        <h1 className="font-display text-3xl font-semibold">Join firefight</h1>
        <p className="mt-2 text-sm text-muted">Sign in to pick a faction and take the other side of the field.</p>
        <Button className="mt-6" onClick={identity.login}>
          Sign in
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col gap-6 px-5 py-8">
      <div>
        <p className="text-xs uppercase tracking-[0.28em] text-muted">Invitation</p>
        <h1 className="font-display text-4xl font-semibold">Take a side</h1>
        <p className="mt-2 text-sm text-muted">
          Host {lobby?.hostName ?? "commander"} · {lobby?.points ?? points} points
        </p>
      </div>
      <div className="grid gap-3">
        {(["empire", "brood"] as Faction[]).map((f) => {
          const taken = lobby?.hostFaction === f;
          return (
            <button
              key={f}
              type="button"
              disabled={taken}
              onClick={() => {
                setFaction(f);
                setArmy(defaultLoadout(f, lobby?.points ?? points));
              }}
              className={cn(
                "rounded-[var(--radius-lg)] border p-4 text-left disabled:opacity-40",
                faction === f ? "border-accent bg-surface-2" : "border-border bg-surface",
              )}
            >
              <p className="font-display text-2xl">{FACTION_NAME[f]}</p>
              <p className="text-sm text-muted">{taken ? "Held by the host" : FACTION_BLURB[f]}</p>
            </button>
          );
        })}
      </div>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      {identity.user?.id && hostId === identity.user.id ? (
        <HostAdmit hostId={hostId} gameId={gameId ?? ""} />
      ) : null}
      <div className="mt-auto flex gap-3">
        <Button variant="ghost" onClick={() => setScreen("menu")}>
          Menu
        </Button>
        <Button className="flex-1" disabled={busy} onClick={() => void join()}>
          Confirm and deploy
        </Button>
      </div>
    </div>
  );
}

function HostAdmit({ hostId, gameId }: { hostId: string; gameId: string }) {
  const identity = useIdentity();
  const [email, setEmail] = useState("");
  if (!identity.client || identity.user?.id !== hostId) return null;
  return (
    <div className="rounded-[var(--radius-md)] border border-border bg-surface p-4">
      <p className="text-sm text-muted">Admit a guest by email so they can write turns into your save.</p>
      <div className="mt-3 flex gap-2">
        <input
          className="h-11 flex-1 rounded-[var(--radius-sm)] border border-border bg-bg-elevated px-3 text-sm"
          value={email}
          placeholder="guest@email"
          onChange={(e) => setEmail(e.target.value)}
        />
        <Button
          variant="secondary"
          onClick={() => {
            if (!identity.client || !identity.user) return;
            void grantGuestAcl(identity.client, identity.user.id, gameId, { email });
          }}
        >
          Admit
        </Button>
      </div>
    </div>
  );
}
