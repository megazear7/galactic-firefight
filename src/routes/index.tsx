import { useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { BattleStage } from "@/components/game/BattleStage";
import { ArmyBuilder } from "@/components/menu/ArmyBuilder";
import { JoinScreen } from "@/components/menu/JoinScreen";
import { LobbyScreen } from "@/components/menu/LobbyScreen";
import { BrowseScreen } from "@/components/menu/BrowseScreen";
import { MainMenu } from "@/components/menu/MainMenu";
import { ResumeScreen } from "@/components/menu/ResumeScreen";
import { SettingsPanel } from "@/components/menu/SettingsPanel";
import { SetupScreen } from "@/components/menu/SetupScreen";
import { useGame } from "@/game/store";
import { useIdentity } from "@/lib/identity/provider";
import { unlockAudio } from "@/game/audio";
import { ensureGameAssets } from "@/game/preload";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const screen = useGame((s) => s.screen);
  const persist = useGame((s) => s.persist);
  const battle = useGame((s) => s.battle);
  const settings = useGame((s) => s.settings);
  const identity = useIdentity();

  useEffect(() => {
    void ensureGameAssets();
    const onFirst = () => {
      unlockAudio(settings);
      void ensureGameAssets();
    };
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
      {(screen === "setup" || screen === "create") && <SetupScreen />}
      {screen === "lobby" && <LobbyScreen />}
      {screen === "browse" && <BrowseScreen />}
      {screen === "army" && <ArmyBuilder />}
      {screen === "resume" && <ResumeScreen />}
      {screen === "join" && <JoinScreen />}
      {screen === "battle" && <BattleStage />}
      <SettingsPanel />
    </div>
  );
}
