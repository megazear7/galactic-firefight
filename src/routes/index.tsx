import { lazy, Suspense, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Hud } from "@/components/game/Hud";
import { ArmyBuilder } from "@/components/menu/ArmyBuilder";
import { JoinScreen } from "@/components/menu/JoinScreen";
import { MainMenu } from "@/components/menu/MainMenu";
import { ResumeScreen } from "@/components/menu/ResumeScreen";
import { SettingsPanel } from "@/components/menu/SettingsPanel";
import { SetupScreen } from "@/components/menu/SetupScreen";
import { useGame } from "@/game/store";
import { useIdentity } from "@/lib/identity/provider";
import { unlockAudio } from "@/game/audio";

const BattleCanvas = lazy(() =>
  import("@/components/game/BattleCanvas").then((m) => ({ default: m.BattleCanvas })),
);

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const screen = useGame((s) => s.screen);
  const persist = useGame((s) => s.persist);
  const battle = useGame((s) => s.battle);
  const settings = useGame((s) => s.settings);
  const identity = useIdentity();

  useEffect(() => {
    const onFirst = () => unlockAudio(settings);
    window.addEventListener("pointerdown", onFirst, { once: true });
    return () => window.removeEventListener("pointerdown", onFirst);
  }, [settings]);

  useEffect(() => {
    if (!battle) return;
    const id = window.setInterval(() => persist(identity.client), 8000);
    const flush = () => persist(identity.client);
    document.addEventListener("visibilitychange", flush);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", flush);
    };
  }, [battle, identity.client, persist]);

  return (
    <div className="relative min-h-dvh bg-bg text-fg">
      {screen === "menu" && <MainMenu />}
      {screen === "setup" && <SetupScreen />}
      {screen === "army" && <ArmyBuilder />}
      {screen === "resume" && <ResumeScreen />}
      {screen === "join" && <JoinScreen />}
      {screen === "battle" && (
        <div className="relative h-dvh w-full overflow-hidden">
          <Suspense fallback={<div className="size-full bg-bg" />}>
            <BattleCanvas />
          </Suspense>
          <Hud />
        </div>
      )}
      <SettingsPanel />
    </div>
  );
}
