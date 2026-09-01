import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { useGame } from "@/game/store";
import { unlockAudio } from "@/game/audio";
import { cn } from "@/lib/utils";

export function SettingsPanel() {
  const open = useGame((s) => s.settingsOpen);
  const setOpen = useGame((s) => s.setSettingsOpen);
  const settings = useGame((s) => s.settings);
  const patch = useGame((s) => s.patchSettings);
  const setScreen = useGame((s) => s.setScreen);
  const screen = useGame((s) => s.screen);
  if (!open) return null;

  return (
    <div className="absolute inset-0 z-40 flex items-end justify-center bg-bg/60 p-3 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-md rounded-[var(--radius-xl)] border border-border bg-surface p-5 shadow-[var(--shadow-panel)]">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-2xl font-semibold">Settings</h2>
          <Button variant="ghost" size="icon" onClick={() => setOpen(false)} aria-label="Close">
            <X className="size-4" />
          </Button>
        </div>

        <div className="mt-5 space-y-5">
          <div>
            <Label>Graphics</Label>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {(["sprites", "models"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => patch({ graphics: mode })}
                  className={cn(
                    "h-11 rounded-[var(--radius-sm)] border text-sm",
                    settings.graphics === mode
                      ? "border-accent bg-surface-2 text-fg"
                      : "border-border text-muted",
                  )}
                >
                  {mode === "sprites" ? "Image sprites" : "3D models"}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-subtle">
              3D uses glTF clips when a unit has them, and the image sprite otherwise.
            </p>
          </div>

          {(
            [
              ["master", "Master volume"],
              ["music", "Music"],
              ["sfx", "Sound effects"],
            ] as const
          ).map(([key, label]) => (
            <div key={key}>
              <div className="mb-2 flex justify-between">
                <Label>{label}</Label>
                <span className="font-mono text-xs tabular-nums text-muted">
                  {Math.round(settings[key] * 100)}
                </span>
              </div>
              <Slider
                min={0}
                max={1}
                step={0.01}
                value={[settings[key]]}
                onValueChange={(v: number[]) => {
                  unlockAudio({ ...settings, [key]: v[0] ?? 0 });
                  patch({ [key]: v[0] ?? 0 });
                }}
              />
            </div>
          ))}
        </div>

        {screen === "battle" && (
          <Button
            variant="secondary"
            className="mt-6 w-full"
            onClick={() => {
              setOpen(false);
              setScreen("menu");
            }}
          >
            Abandon field
          </Button>
        )}
      </div>
    </div>
  );
}
