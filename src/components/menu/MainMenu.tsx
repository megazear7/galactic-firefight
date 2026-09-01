import { useEffect, useState } from "react";
import { Settings, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useGame } from "@/game/store";
import { listGames } from "@/game/persistence";
import { useIdentity } from "@/lib/identity/provider";
import { unlockAudio } from "@/game/audio";

export function MainMenu() {
  const startSetup = useGame((s) => s.startSetup);
  const setScreen = useGame((s) => s.setScreen);
  const setOpen = useGame((s) => s.setSettingsOpen);
  const settings = useGame((s) => s.settings);
  const identity = useIdentity();
  const [saves, setSaves] = useState(0);

  useEffect(() => {
    void listGames(identity.client).then((g) => setSaves(g.length));
  }, [identity.client]);

  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden">
      <img
        src="/assets/menu-bg.jpg"
        alt=""
        className="absolute inset-0 size-full object-cover"
        crossOrigin="anonymous"
      />
      <div className="absolute inset-0 bg-gradient-to-r from-bg via-bg/80 to-bg/30" />
      <div className="relative z-10 flex min-h-dvh flex-col justify-between p-5 pt-[max(1.25rem,env(safe-area-inset-top))] sm:p-10">
        <header className="flex items-center justify-between gap-3">
          <p className="text-xs uppercase tracking-[0.28em] text-muted">Megazear</p>
          <div className="flex items-center gap-2">
            {identity.configured && identity.ready && (
              identity.isAuthenticated ? (
                <Button variant="ghost" size="sm" onClick={identity.logout}>
                  <User className="size-3.5" />
                  {identity.user?.name ?? identity.user?.email ?? "Signed in"}
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    unlockAudio(settings);
                    identity.login();
                  }}
                >
                  Sign in
                </Button>
              )
            )}
            <Button variant="ghost" size="icon" onClick={() => setOpen(true)} aria-label="Settings">
              <Settings className="size-4" />
            </Button>
          </div>
        </header>

        <div className="max-w-xl">
          <p className="font-display text-sm uppercase tracking-[0.32em] text-muted">Turn-based tactics</p>
          <h1 className="mt-2 font-display text-5xl font-semibold leading-[0.95] tracking-tight sm:text-7xl">
            Galactic Firefight
          </h1>
          <p className="mt-4 max-w-md text-sm text-muted sm:text-base">
            Steel captains against a living tide. Build a force, take the field, and spend each activation like it is the last.
          </p>
          <div className="mt-8 flex max-w-sm flex-col gap-3">
            <Button
              size="lg"
              onClick={() => {
                unlockAudio(settings);
                startSetup();
              }}
            >
              Create game
            </Button>
            <Button size="lg" variant="secondary" onClick={() => setScreen("browse")}>
              Browse games
            </Button>
            <Button
              size="lg"
              variant="outline"
              disabled={saves === 0}
              onClick={() => setScreen("resume")}
            >
              Resume saved game
            </Button>
          </div>
        </div>

        <p className="text-xs text-subtle">
          {identity.isAuthenticated ? "Saves sync to Megazear identity." : "Saves stay in this browser until you sign in."}
        </p>
      </div>
    </div>
  );
}
