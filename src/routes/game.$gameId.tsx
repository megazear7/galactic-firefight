import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AppSurface } from "@/components/AppSurface";
import { getGame } from "@/game/persistence";
import { useGame } from "@/game/store";
import { useIdentity } from "@/lib/identity/provider";

export const Route = createFileRoute("/game/$gameId")({ component: GameRoute });

export function GameRoute({ roster = false }: { roster?: boolean }) {
  const { gameId } = Route.useParams();
  const identity = useIdentity();
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void getGame(identity.client, gameId).then((game) => {
      if (!active) return;
      if (!game) {
        setMissing(true);
      } else {
        useGame.getState().loadRecord(game);
        useGame.getState().setScreen(roster || !game.battle ? "lobby" : "battle");
        setMissing(false);
      }
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [gameId, identity.client, roster]);

  if (loading) {
    return <div className="flex min-h-dvh items-center justify-center text-sm text-muted">Loading firefight...</div>;
  }
  if (missing) {
    return <div className="flex min-h-dvh items-center justify-center text-sm text-muted">That firefight could not be found.</div>;
  }
  return <AppSurface />;
}