import { lazy, Suspense, useEffect, useState } from "react";
import { Hud } from "./Hud";
import { AssetLoadingScreen } from "./AssetLoadingScreen";
import { ensureGameAssets, subscribeAssets } from "@/game/preload";

const BattleCanvas = lazy(() =>
  import("./BattleCanvas").then((m) => ({ default: m.BattleCanvas })),
);

export function BattleStage() {
  const [progress, setProgress] = useState(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const unsub = subscribeAssets((p, ok) => {
      setProgress(p);
      setReady(ok);
    });
    void ensureGameAssets();
    return unsub;
  }, []);

  if (!ready) return <AssetLoadingScreen progress={progress} />;

  return (
    <div className="relative h-dvh w-full overflow-hidden">
      <Suspense fallback={<AssetLoadingScreen progress={1} />}>
        <BattleCanvas />
      </Suspense>
      <Hud />
    </div>
  );
}
