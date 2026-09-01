import { Flag, Pause, SkipForward, Swords, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { actOptions, useGame } from "@/game/store";
import { UNIT_STATS, FACTION_NAME, SPRITE_SRC } from "@/game/units";
import { activationsCap, activationsDone, localParticipant, whyImmobile } from "@/game/battle";
import { colorHex } from "@/game/lobby";
import { Minimap } from "./Minimap";
import { cn } from "@/lib/utils";
import type { BattleState, UnitState, UnitStats } from "@/game/types";

function UnitActions({
  battle,
  selected,
  yours,
}: {
  battle: BattleState;
  selected: UnitState;
  yours: boolean;
}) {
  const shoot = useGame((s) => s.shoot);
  const skip = useGame((s) => s.skip);
  const setMode = useGame((s) => s.setMode);
  const melee = useGame((s) => s.melee);
  const confirmFacing = useGame((s) => s.confirmFacing);
  const opts = actOptions(battle, selected);
  if (!yours || selected.playerId !== battle.playerId) return null;
  return (
    <div className="mt-auto flex flex-wrap items-center gap-1.5 sm:gap-2">
      {!selected.acted && (
        <div className="flex rounded-[var(--radius-sm)] border border-border bg-surface-2 p-0.5">
          <button
            type="button"
            disabled={selected.moved}
            onClick={() => setMode("move")}
            className={cn(
              "h-11 rounded-[calc(var(--radius-sm)-2px)] px-3 text-xs font-medium sm:h-9",
              battle.actMode === "move" ? "bg-accent text-accent-fg" : "text-muted hover:text-fg",
              selected.moved && "opacity-40",
            )}
          >
            Move
          </button>
          <button
            type="button"
            onClick={() => setMode("fire")}
            className={cn(
              "h-11 rounded-[calc(var(--radius-sm)-2px)] px-3 text-xs font-medium sm:h-9",
              battle.actMode === "fire" ? "bg-accent text-accent-fg" : "text-muted hover:text-fg",
            )}
          >
            Fire
          </button>
        </div>
      )}
      {battle.phase === "aimFacing" && (
        <Button onClick={confirmFacing}>
          <Flag className="size-4" />
          <span className="sm:hidden">Confirm</span>
          <span className="hidden sm:inline">Confirm move</span>
        </Button>
      )}
      {(battle.phase === "act" || battle.phase === "aimShoot" || battle.actMode === "fire") && (
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
    </div>
  );
}

function SelectedCard({
  selected,
  stats,
  battle,
  yours,
}: {
  selected: UnitState;
  stats: UnitStats;
  battle: BattleState;
  yours: boolean;
}) {
  const reason = whyImmobile(battle, selected);
  return (
    <aside className="pointer-events-auto flex h-full min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface/95 p-2 shadow-[var(--shadow-panel)] backdrop-blur-md sm:gap-3 sm:p-3">
      <div className="flex min-h-0 flex-1 items-center gap-2 sm:hidden">
        <img
          src={SPRITE_SRC[selected.type]}
          alt=""
          className="size-12 shrink-0 object-contain"
          crossOrigin="anonymous"
        />
        <h2 className="min-w-0 truncate font-display text-lg font-semibold leading-none">{stats.name}</h2>
      </div>
      <div className="hidden min-h-0 flex-1 gap-3 sm:flex">
        <img
          src={SPRITE_SRC[selected.type]}
          alt=""
          className="size-16 shrink-0 self-start object-contain sm:size-20"
          crossOrigin="anonymous"
        />
        <div className="min-w-0 flex-1 overflow-hidden">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="font-display text-2xl font-semibold leading-none">{stats.name}</h2>
            <p className="font-mono text-xs tabular-nums text-muted">
              {selected.hp}/{selected.maxHp}
            </p>
          </div>
          <p className="mt-1 text-xs uppercase tracking-widest text-muted">{stats.role}</p>
          <p className="mt-1 line-clamp-2 text-sm text-muted">{stats.description}</p>
          <dl className="mt-2 grid grid-cols-4 gap-2 text-center text-xs">
            {[
              ["Move", stats.move],
              ["Range", stats.range || "—"],
              ["Fire", stats.damage || "—"],
              ["Arc", `${stats.arc}°`],
            ].map(([k, v]) => (
              <div key={k} className="rounded-[var(--radius-sm)] bg-surface-2 px-1 py-1.5">
                <dt className="text-xs uppercase tracking-wider text-subtle">{k}</dt>
                <dd className="font-mono tabular-nums">{v}</dd>
              </div>
            ))}
          </dl>
          {reason ? <p className="mt-2 truncate text-sm text-muted">{reason}</p> : null}
        </div>
      </div>
      <UnitActions battle={battle} selected={selected} yours={yours} />
    </aside>
  );
}

export function Hud() {
  const battle = useGame((s) => s.battle);
  const settingsOpen = useGame((s) => s.setSettingsOpen);
  const end = useGame((s) => s.end);
  const startHotseat = useGame((s) => s.startHotseat);
  const setScreen = useGame((s) => s.setScreen);
  if (!battle) return null;

  const selected = battle.units.find((u) => u.id === battle.selectedId) ?? null;
  const stats = selected ? UNIT_STATS[selected.type] : null;
  const me = localParticipant(battle);
  const hold = battle.hotseatPending;
  const yours = Boolean(me && battle.turnTeam === me.team && !hold);
  const over = battle.phase === "gameOver";
  const used = activationsDone(battle);
  const cap = activationsCap(battle);
  const showCard = Boolean(
    selected && stats && !over && selected.playerId === battle.playerId,
  );

  if (hold) {
    return (
      <div className="pointer-events-auto absolute inset-0 z-30 flex items-center justify-center bg-bg/95 p-6 backdrop-blur-md">
        <div className="w-full max-w-sm rounded-[var(--radius-xl)] border border-border bg-surface p-6 text-center shadow-[var(--shadow-panel)]">
          <div
            className="mx-auto mb-4 size-10 rounded-full border-2 border-fg"
            style={{ background: colorHex(hold.color) }}
          />
          <p className="text-xs uppercase tracking-[0.28em] text-muted">Pass the device</p>
          <h2 className="mt-2 font-display text-4xl font-semibold">{hold.name}</h2>
          <p className="mt-3 text-sm text-muted">Start your turn when the previous commander has looked away.</p>
          <Button className="mt-6 w-full" onClick={startHotseat}>
            Start turn
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col">
      <header className="flex items-start justify-between gap-2 p-2 pt-[max(0.5rem,env(safe-area-inset-top))] sm:gap-3 sm:p-4">
        <div className="pointer-events-auto rounded-[var(--radius-md)] border border-border bg-bg-elevated/90 px-2 py-1 backdrop-blur-sm sm:rounded-[var(--radius-lg)] sm:px-3 sm:py-2">
          <p className="font-display text-xs font-medium uppercase tracking-widest text-muted sm:hidden">
            {used}/{cap} · Team {battle.turnTeam}
          </p>
          <div className="hidden sm:block">
            <p className="font-display text-xs uppercase tracking-widest text-muted">
              Round {battle.round} · {used}/{cap} activations
            </p>
            <p className="font-display text-lg font-semibold leading-tight">Team {battle.turnTeam}</p>
            <p className="text-xs text-subtle">
              {yours
                ? "WASD pan · click-drag to face · or click twice"
                : battle.mode === "single"
                  ? "Opposing force"
                  : "Waiting on opponent"}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {yours && !over && (
            <Button variant="outline" className="pointer-events-auto" onClick={end}>
              <SkipForward className="size-4" />
              <span className="sm:hidden">End</span>
              <span className="hidden sm:inline">End turn</span>
            </Button>
          )}
          <Button variant="secondary" size="icon" className="pointer-events-auto" onClick={() => settingsOpen(true)} aria-label="Settings">
            <Pause className="size-4" />
          </Button>
        </div>
      </header>

      <div className="pointer-events-none mx-4 mt-1 hidden max-w-sm text-xs text-muted sm:block">
        {battle.log[0] ? <p className="rounded-[var(--radius-md)] bg-bg/70 px-3 py-2">{battle.log[0].text}</p> : null}
      </div>

      <div className="mt-auto" />

      {over && (
        <div className="pointer-events-auto mx-auto mb-8 w-[min(92vw,420px)] rounded-[var(--radius-xl)] border border-border bg-surface p-6 text-center shadow-[var(--shadow-panel)]">
          <p className="font-display text-3xl font-semibold tracking-tight">
            {battle.winner === me?.team ? "Field secured" : battle.winner === "draw" ? "Mutual ruin" : "Line broken"}
          </p>
          <p className="mt-2 text-sm text-muted">
            {battle.winner === me?.team
              ? "The last opposing unit is down."
              : "Gather what remains. The swarm — or the empire — will return."}
          </p>
          <Button className="mt-5 w-full" onClick={() => setScreen("menu")}>
            Return to menu
          </Button>
        </div>
      )}

      {!over && (
        <div className="flex h-32 items-stretch gap-2 p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:h-56 sm:p-4 sm:pt-0">
          {showCard && selected && stats && (
            <SelectedCard selected={selected} stats={stats} battle={battle} yours={yours} />
          )}
          <div
            className={cn(
              "aspect-[196/148] h-full shrink-0",
              !showCard && "ml-auto",
            )}
          >
            <Minimap />
          </div>
        </div>
      )}
    </div>
  );
}
