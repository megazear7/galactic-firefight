import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Hud } from "./Hud";
import { AssetLoadingScreen } from "./AssetLoadingScreen";
import { ensureBattleModels, ensureGameAssets, subscribeAssets } from "@/game/preload";
import { useGame } from "@/game/store";

const BattleCanvas = lazy(() =>
  import("./BattleCanvas").then((m) => ({ default: m.BattleCanvas })),
);

export function BattleStage() {
  const units = useGame((s) => s.battle?.units);
  const graphics = useGame((s) => s.settings.graphics);
  const [progress, setProgress] = useState(0);
  const [bootReady, setBootReady] = useState(false);
  const rosterKey = useMemo(
    () =>
      (units ?? [])
        .map((u) => `${u.type}:${u.faction}`)
        .sort()
        .join("|"),
    [units],
  );

  useEffect(() => {
    const unsub = subscribeAssets((p, ok) => {
      setProgress(p);
      setBootReady(ok);
    });
    void ensureGameAssets();
    return unsub;
  }, []);

  useEffect(() => {
    if (graphics === "sprites") return;
    const roster = useGame.getState().battle?.units;
    if (roster?.length) void ensureBattleModels(roster);
  }, [graphics, rosterKey]);

  if (!bootReady) return <AssetLoadingScreen progress={progress} />;

  return (
    <div className="relative h-dvh w-full overflow-hidden">
      <Suspense fallback={<AssetLoadingScreen progress={1} />}>
        <BattleCanvas />
      </Suspense>
      <Hud />
    </div>
  );
}
