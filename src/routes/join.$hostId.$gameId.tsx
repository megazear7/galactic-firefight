import { lazy, Suspense, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useGame } from "@/game/store";
import { JoinScreen } from "@/components/menu/JoinScreen";
import { SettingsPanel } from "@/components/menu/SettingsPanel";
import { Hud } from "@/components/game/Hud";

const BattleCanvas = lazy(() =>
  import("@/components/game/BattleCanvas").then((m) => ({ default: m.BattleCanvas })),
);

export const Route = createFileRoute("/join/$hostId/$gameId")({
  component: JoinRoute,
});

function JoinRoute() {
  const { hostId, gameId } = Route.useParams();
  const hydrateJoin = useGame((s) => s.hydrateJoin);
  const screen = useGame((s) => s.screen);

  useEffect(() => {
    hydrateJoin(decodeURIComponent(hostId), gameId);
  }, [hostId, gameId, hydrateJoin]);

  return (
    <div className="relative min-h-dvh bg-bg text-fg">
      {screen === "battle" ? (
        <div className="relative h-dvh w-full overflow-hidden">
          <Suspense fallback={<div className="size-full bg-bg" />}>
            <BattleCanvas />
          </Suspense>
          <Hud />
        </div>
      ) : (
        <JoinScreen />
      )}
      <SettingsPanel />
    </div>
  );
}
