import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useGame, publishLobby } from "@/game/store";
import {
  SPRITE_SRC,
  UNIT_STATS,
  armyCost,
  defaultLoadout,
  factionUnits,
  freeLeaders,
  leaderType,
  maxExtraLeaders,
  remainingPoints,
} from "@/game/units";
import type { UnitType } from "@/game/types";
import { useIdentity } from "@/lib/identity/provider";
import { grantGuestAcl, putSharedGame, saveGame } from "@/game/persistence";
import { useState } from "react";

export function ArmyBuilder() {
  const faction = useGame((s) => s.faction);
  const points = useGame((s) => s.points);
  const mapSize = useGame((s) => s.mapSize);
  const army = useGame((s) => s.army);
  const setArmy = useGame((s) => s.setArmy);
  const setScreen = useGame((s) => s.setScreen);
  const beginBattle = useGame((s) => s.beginBattle);
  const mode = useGame((s) => s.mode);
  const inviteEmail = useGame((s) => s.inviteEmail);
  const identity = useIdentity();
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const remain = remainingPoints(faction, points, army);
  const leader = leaderType(faction);
  const free = freeLeaders(faction, points);

  function bump(type: UnitType, dir: 1 | -1) {
    const stats = UNIT_STATS[type];
    const current = army[type] ?? 0;
    const next = current + dir;
    if (next < 0) return;
    if (type === leader && next < free) return;
    if (type === leader && next > free + maxExtraLeaders(faction)) return;
    if (dir > 0 && remain < stats.cost) return;
    setArmy({ ...army, [type]: next });
  }

  async function start() {
    if (mode === "single") {
      beginBattle();
      return;
    }
    if (!identity.client || !identity.user) return;
    setBusy(true);
    try {
      const lobby = await publishLobby(identity.client, identity.user, points, mapSize, inviteEmail);
      if (inviteEmail) {
        await grantGuestAcl(identity.client, identity.user.id, lobby.id, { email: inviteEmail });
      }
      const rec = {
        version: 1 as const,
        id: lobby.id,
        name: "Linked firefight",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: "setup" as const,
        mode: "multi" as const,
        points,
        mapSize,
        visibility: "private" as const,
        participants: [],
        teamOrder: [],
        playerId: "p-host",
        playerFaction: faction,
        hostId: identity.user.id,
        hostEmail: identity.user.email,
        hostFaction: faction,
        hostArmy: army,
        seed: (Math.random() * 1e9) | 0,
        battle: null,
      };
      useGame.setState({ record: rec });
      await saveGame(identity.client, rec);
      await putSharedGame(identity.client, identity.user.id, lobby.id, rec);
      const url = `${window.location.origin}/join/${encodeURIComponent(identity.user.id)}/${lobby.id}`;
      setInviteUrl(url);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-4xl flex-col gap-6 px-5 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-muted">Army</p>
          <h1 className="font-display text-4xl font-semibold">Spend your points</h1>
        </div>
        <p className="font-mono text-sm tabular-nums text-muted">
          {armyCost(faction, points, army)} / {points} · {remain} left
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {factionUnits(faction).map((type) => {
          const stats = UNIT_STATS[type];
          const count = army[type] ?? 0;
          const isLeader = type === leader;
          return (
            <div key={type} className="flex gap-3 rounded-[var(--radius-lg)] border border-border bg-surface p-3">
              <img src={SPRITE_SRC[type]} alt="" className="h-24 w-16 object-contain" crossOrigin="anonymous" />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between">
                  <h2 className="font-display text-xl font-semibold">{stats.name}</h2>
                  <span className="font-mono text-xs text-muted">
                    {isLeader ? `${stats.cost} extra` : `${stats.cost} pts`}
                  </span>
                </div>
                <p className="text-xs text-muted">{stats.description}</p>
                <div className="mt-3 flex items-center gap-2">
                  <Button variant="secondary" size="icon" className="size-9" onClick={() => bump(type, -1)}>
                    <Minus className="size-4" />
                  </Button>
                  <span className="w-8 text-center font-mono tabular-nums">{count}</span>
                  <Button variant="secondary" size="icon" className="size-9" onClick={() => bump(type, 1)}>
                    <Plus className="size-4" />
                  </Button>
                  {isLeader ? (
                    <span className="text-xs text-subtle">{free} issued free</span>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {inviteUrl && (
        <div className="rounded-[var(--radius-md)] border border-border bg-surface-2 p-4 text-sm">
          <p className="text-muted">Send this link. Your friend picks a faction on the other side. Turns write into your Megazear data.</p>
          <p className="mt-2 break-all font-mono text-xs">{inviteUrl}</p>
          <Button
            className="mt-3"
            variant="secondary"
            onClick={() => void navigator.clipboard.writeText(inviteUrl)}
          >
            Copy link
          </Button>
        </div>
      )}

      <div className="mt-auto flex flex-wrap gap-3">
        <Button variant="ghost" onClick={() => setScreen("setup")}>
          Back
        </Button>
        <Button variant="outline" onClick={() => setArmy(defaultLoadout(faction, points))}>
          Recommended
        </Button>
        <Button className="ml-auto" disabled={busy} onClick={() => void start()}>
          {mode === "multi" ? (inviteUrl ? "Waiting for guest" : "Create invite") : "Deploy"}
        </Button>
      </div>
    </div>
  );
}
