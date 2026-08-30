import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useGame } from "@/game/store";
import { deleteGame, listGames } from "@/game/persistence";
import type { GameRecord } from "@/game/types";
import { FACTION_NAME } from "@/game/units";
import { useIdentity } from "@/lib/identity/provider";

export function ResumeScreen() {
  const identity = useIdentity();
  const setScreen = useGame((s) => s.setScreen);
  const loadRecord = useGame((s) => s.loadRecord);
  const [games, setGames] = useState<GameRecord[]>([]);

  useEffect(() => {
    void listGames(identity.client).then(setGames);
  }, [identity.client]);

  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-6 px-5 py-8">
      <div>
        <p className="text-xs uppercase tracking-[0.28em] text-muted">Archives</p>
        <h1 className="font-display text-4xl font-semibold">Resume</h1>
      </div>
      {games.length === 0 ? (
        <p className="text-sm text-muted">No saved firefights on this device.</p>
      ) : (
        <ul className="space-y-2">
          {games.map((g) => (
            <li
              key={g.id}
              className="flex items-center gap-3 rounded-[var(--radius-lg)] border border-border bg-surface p-3"
            >
              <div className="min-w-0 flex-1">
                <p className="font-display text-lg font-semibold">{g.name}</p>
                <p className="text-xs text-muted">
                  {FACTION_NAME[g.playerFaction]} · {g.points} pts · {g.status}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  void deleteGame(identity.client, g.id).then(() =>
                    listGames(identity.client).then(setGames),
                  );
                }}
              >
                Delete
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  loadRecord(g);
                  if (g.battle) setScreen("battle");
                }}
              >
                Continue
              </Button>
            </li>
          ))}
        </ul>
      )}
      <Button variant="ghost" className="mt-auto w-fit" onClick={() => setScreen("menu")}>
        Back
      </Button>
    </div>
  );
}
