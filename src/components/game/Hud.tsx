import { Flag, Pause, SkipForward, Swords, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { actOptions, useGame } from "@/game/store";
import { UNIT_STATS, FACTION_NAME, SPRITE_SRC } from "@/game/units";
import { activationsCap, activationsDone, whyImmobile } from "@/game/battle";

export function Hud() {
  const battle = useGame((s) => s.battle);
  const settingsOpen = useGame((s) => s.setSettingsOpen);
  const shoot = useGame((s) => s.shoot);
  const skip = useGame((s) => s.skip);
  const end = useGame((s) => s.end);
  const melee = useGame((s) => s.melee);
  const confirmFacing = useGame((s) => s.confirmFacing);
  const setScreen = useGame((s) => s.setScreen);
  if (!battle) return null;

  const selected = battle.units.find((u) => u.id === battle.selectedId) ?? null;
  const stats = selected ? UNIT_STATS[selected.type] : null;
  const reason = selected ? whyImmobile(battle, selected) : null;
  const opts = selected ? actOptions(battle, selected) : { ranged: [], melee: [] };
  const yours = battle.turn === battle.playerFaction;
  const over = battle.phase === "gameOver";
  const used = activationsDone(battle);
  const cap = activationsCap(battle);

  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col">
      <header className="pointer-events-auto flex items-start justify-between gap-3 p-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:p-4">
        <div className="rounded-[var(--radius-lg)] border border-border bg-bg-elevated/90 px-3 py-2 backdrop-blur-sm">
          <p className="font-display text-[11px] uppercase tracking-[0.22em] text-muted">
            Round {battle.round} · {used}/{cap} activations
          </p>
          <p className="font-display text-lg font-semibold leading-tight">{FACTION_NAME[battle.turn]}</p>
          <p className="text-xs text-subtle">
            {yours
              ? "Click a point to move · right-drag pans · scroll zooms"
              : battle.mode === "single"
                ? "Opposing force"
                : "Waiting on opponent"}
          </p>
        </div>
        <Button variant="secondary" size="icon" onClick={() => settingsOpen(true)} aria-label="Settings">
          <Pause className="size-4" />
        </Button>
      </header>

      <div className="pointer-events-none mx-3 mt-1 max-w-sm text-xs text-muted sm:mx-4">
        {battle.log[0] ? <p className="rounded-[var(--radius-md)] bg-bg/70 px-3 py-2">{battle.log[0].text}</p> : null}
      </div>

      <div className="mt-auto" />

      {over && (
        <div className="pointer-events-auto mx-auto mb-8 w-[min(92vw,420px)] rounded-[var(--radius-xl)] border border-border bg-surface p-6 text-center shadow-[var(--shadow-panel)]">
          <p className="font-display text-3xl font-semibold tracking-tight">
            {battle.winner === battle.playerFaction ? "Field secured" : battle.winner === "draw" ? "Mutual ruin" : "Line broken"}
          </p>
          <p className="mt-2 text-sm text-muted">
            {battle.winner === battle.playerFaction
              ? "The last opposing unit is down."
              : "Gather what remains. The swarm — or the empire — will return."}
          </p>
          <Button className="mt-5 w-full" onClick={() => setScreen("menu")}>
            Return to menu
          </Button>
        </div>
      )}

      {selected && stats && !over && (
        <aside className="pointer-events-auto mx-auto w-full max-w-xl rounded-t-[var(--radius-xl)] border border-b-0 border-border bg-surface/95 p-4 shadow-[var(--shadow-panel)] backdrop-blur-md">
          <div className="flex gap-3">
            <img
              src={SPRITE_SRC[selected.type]}
              alt=""
              className="size-20 shrink-0 object-contain"
              crossOrigin="anonymous"
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="font-display text-2xl font-semibold leading-none">{stats.name}</h2>
                <p className="font-mono text-xs tabular-nums text-muted">
                  {selected.hp}/{selected.maxHp}
                </p>
              </div>
              <p className="mt-1 text-xs uppercase tracking-[0.16em] text-muted">{stats.role}</p>
              <p className="mt-2 text-sm text-muted">{stats.description}</p>
              <dl className="mt-3 grid grid-cols-4 gap-2 text-center text-xs">
                {[
                  ["Move", stats.move],
                  ["Range", stats.range || "—"],
                  ["Fire", stats.damage || "—"],
                  ["Arc", `${stats.arc}°`],
                ].map(([k, v]) => (
                  <div key={k} className="rounded-[var(--radius-sm)] bg-surface-2 px-1 py-1.5">
                    <dt className="text-[10px] uppercase tracking-wider text-subtle">{k}</dt>
                    <dd className="font-mono tabular-nums">{v}</dd>
                  </div>
                ))}
              </dl>
              {reason ? <p className="mt-3 text-sm text-muted">{reason}</p> : null}
            </div>
          </div>

          {yours && selected.faction === battle.playerFaction && (
            <div className="mt-4 flex flex-wrap gap-2">
              {battle.phase === "aimFacing" && (
                <Button onClick={confirmFacing}>
                  <Flag className="size-4" /> Confirm move
                </Button>
              )}
              {battle.phase === "aimMove" && (
                <Button variant="secondary" onClick={skip}>
                  Hold position
                </Button>
              )}
              {(battle.phase === "act" || battle.phase === "aimShoot") && (
                <>
                  <Button onClick={shoot} disabled={opts.ranged.length === 0}>
                    <Target className="size-4" /> Fire
                  </Button>
                  {opts.melee[0] ? (
                    <Button variant="secondary" onClick={() => melee(opts.melee[0].id)}>
                      <Swords className="size-4" /> Melee
                    </Button>
                  ) : null}
                  <Button variant="ghost" onClick={skip}>
                    Wait
                  </Button>
                </>
              )}
              <Button variant="outline" className="ml-auto" onClick={end}>
                <SkipForward className="size-4" /> End turn
              </Button>
            </div>
          )}
        </aside>
      )}

      {yours && !selected && !over && (
        <div className="pointer-events-auto mx-auto mb-4">
          <Button variant="outline" onClick={end}>
            End turn
          </Button>
        </div>
      )}
    </div>
  );
}
