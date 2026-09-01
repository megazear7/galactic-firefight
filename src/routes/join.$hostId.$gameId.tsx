import { useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useGame } from "@/game/store";
import { JoinScreen } from "@/components/menu/JoinScreen";
import { SettingsPanel } from "@/components/menu/SettingsPanel";
import { BattleStage } from "@/components/game/BattleStage";
import { ensureGameAssets } from "@/game/preload";

export const Route = createFileRoute("/join/$hostId/$gameId")({
  component: JoinRoute,
});

function JoinRoute() {
  const { hostId, gameId } = Route.useParams();
  const hydrateJoin = useGame((s) => s.hydrateJoin);
  const screen = useGame((s) => s.screen);

  useEffect(() => {
    void ensureGameAssets();
    hydrateJoin(decodeURIComponent(hostId), gameId);
  }, [hostId, gameId, hydrateJoin]);

  return (
    <div className="relative min-h-dvh bg-bg text-fg">
      {screen === "battle" ? (
        <BattleStage />
      ) : (
        <JoinScreen />
      )}
      <SettingsPanel />
    </div>
  );
}
