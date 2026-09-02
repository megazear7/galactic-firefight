import { useEffect, useRef, useState } from "react";
import { Flag, Menu, RefreshCw, SkipForward, Swords, Target, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { actOptions, useGame } from "@/game/store";
import { UNIT_STATS, SPRITE_SRC } from "@/game/units";
import { activationsCap, activationsDone, localParticipant, whyImmobile } from "@/game/battle";
import { colorHex } from "@/game/lobby";
import { Minimap } from "./Minimap";
import { cn } from "@/lib/utils";
import type { BattleState, UnitState, UnitStats } from "@/game/types";
import { useIdentity } from "@/lib/identity/provider";

const CARD_SLIDE_MS = 320;

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
  const compactBtn = "sm:h-7 sm:px-2 sm:text-[11px]";
  return (
    <div className="flex flex-wrap items-center gap-1.5 sm:gap-1.5">
      {!selected.acted && (
        <div className="flex rounded-[var(--radius-sm)] border border-border bg-surface-2 p-0.5">
          <button
            type="button"
            disabled={selected.moved}
            onClick={() => setMode("move")}
            className={cn(
              "h-11 rounded-[calc(var(--radius-sm)-2px)] px-3 text-xs font-medium sm:h-7 sm:px-2.5",
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
              "h-11 rounded-[calc(var(--radius-sm)-2px)] px-3 text-xs font-medium sm:h-7 sm:px-2.5",
              battle.actMode === "fire" ? "bg-accent text-accent-fg" : "text-muted hover:text-fg",
            )}
          >
            Fire
          </button>
        </div>
      )}
      {battle.phase === "aimFacing" && (
        <Button className={compactBtn} onClick={confirmFacing}>
          <Flag className="size-4 sm:size-3.5" />
          <span className="sm:hidden">Confirm</span>
          <span className="hidden sm:inline">Confirm move</span>
        </Button>
      )}
      {(battle.phase === "act" || battle.phase === "aimShoot" || battle.actMode === "fire") && (
        <>
          <span title="You are too close to enemey units to shoot">
            <Button className={compactBtn} onClick={shoot} disabled={opts.ranged.length === 0}>
              <Target className="size-4 sm:size-3.5" /> Fire
            </Button>
          </span>
          {opts.melee[0] ? (
            <Button
              variant="secondary"
              className={compactBtn}
              onClick={() => melee(opts.melee[0].id)}
            >
              <Swords className="size-4 sm:size-3.5" /> Melee
            </Button>
          ) : null}
          <Button variant="ghost" className={compactBtn} onClick={skip}>
            Wait
          </Button>
        </>
      )}
    </div>
  );
}

function DeselectButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Deselect"
      className="flex size-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)] text-muted hover:bg-surface-2 hover:text-fg sm:size-6"
    >
      <X className="size-4 sm:size-3.5" />
    </button>
  );
}

function SelectedCard({
  selected,
  stats,
  battle,
  yours,
  open,
  onDeselect,
}: {
  selected: UnitState;
  stats: UnitStats;
  battle: BattleState;
  yours: boolean;
  open: boolean;
  onDeselect: () => void;
}) {
  const reason = whyImmobile(battle, selected);
  return (
    <aside
      className={cn(
        "pointer-events-auto flex min-h-0 min-w-0 flex-col gap-1.5 overflow-hidden rounded-[var(--radius-md)] border border-border bg-surface/95 p-2 shadow-[var(--shadow-panel)] backdrop-blur-md sm:w-80 sm:max-w-[calc(100%-14rem)] sm:shrink-0 sm:gap-1.5 sm:px-2.5 sm:py-2",
        "max-sm:h-full max-sm:flex-1",
        "sm:origin-bottom sm:transition-transform sm:duration-300 sm:ease-[cubic-bezier(0.22,1,0.36,1)]",
        open
          ? "sm:translate-y-0"
          : "max-sm:hidden sm:pointer-events-none sm:translate-y-[calc(100%+1.25rem)]",
      )}
    >
      <div className="flex min-h-0 flex-1 items-center gap-2 sm:hidden">
        <img
          src={SPRITE_SRC[selected.type]}
          alt=""
          className="size-12 shrink-0 object-contain"
          crossOrigin="anonymous"
        />
        <h2 className="min-w-0 flex-1 truncate font-display text-lg font-semibold leading-none">
          {stats.name}
        </h2>
        <DeselectButton onClick={onDeselect} />
      </div>
      <div className="hidden min-w-0 items-start gap-2 sm:flex">
        <img
          src={SPRITE_SRC[selected.type]}
          alt=""
          className="size-11 shrink-0 object-contain"
          crossOrigin="anonymous"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <h2 className="min-w-0 truncate font-display text-lg font-semibold leading-none">
              {stats.name}
            </h2>
            <div className="flex shrink-0 items-center gap-1">
              <p className="font-mono text-[11px] tabular-nums text-muted">
                {selected.hp}/{selected.maxHp}
              </p>
              <DeselectButton onClick={onDeselect} />
            </div>
          </div>
          <p className="mt-0.5 truncate text-xs leading-snug text-muted" title={stats.description}>
            {stats.description}
          </p>
          <p className="mt-0.5 truncate text-[11px] leading-none text-fg/80">
            <span className="uppercase tracking-wider text-subtle">{stats.role}</span>
            <span className="mx-1 text-subtle">·</span>
            <span className="font-mono tabular-nums">Mv {stats.move}</span>
            <span className="mx-1 text-subtle">·</span>
            <span className="font-mono tabular-nums">Rng {stats.range || "—"}</span>
            <span className="mx-1 text-subtle">·</span>
            <span className="font-mono tabular-nums">Fire {stats.damage || "—"}</span>
            <span className="mx-1 text-subtle">·</span>
            <span className="font-mono tabular-nums">Arc {stats.arc}°</span>
          </p>
          {reason ? <p className="mt-0.5 truncate text-[11px] text-muted">{reason}</p> : null}
        </div>
      </div>
      <UnitActions battle={battle} selected={selected} yours={yours} />
    </aside>
  );
}

export function Hud() {
  const battle = useGame((s) => s.battle);
  const syncMulti = useGame((s) => s.syncMulti);
  const identity = useIdentity();
  const refreshTimer = useRef<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const setSettingsOpen = useGame((s) => s.setSettingsOpen);
  const end = useGame((s) => s.end);
  const surrender = useGame((s) => s.surrender);
  const startHotseat = useGame((s) => s.startHotseat);
  const setScreen = useGame((s) => s.setScreen);
  const deselect = useGame((s) => s.deselect);
  const selected = battle?.units.find((u) => u.id === battle.selectedId) ?? null;
  const stats = selected ? UNIT_STATS[selected.type] : null;
  const over = battle?.phase === "gameOver";
  const showCard = Boolean(
    battle && selected && stats && !over && selected.playerId === battle.playerId,
  );
  const [cardOpen, setCardOpen] = useState(false);
  const [held, setHeld] = useState<{ selected: UnitState; stats: UnitStats } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (showCard && selected && stats) {
      setHeld({ selected, stats });
      let id2 = 0;
      const id1 = requestAnimationFrame(() => {
        id2 = requestAnimationFrame(() => setCardOpen(true));
      });
      return () => {
        cancelAnimationFrame(id1);
        cancelAnimationFrame(id2);
      };
    }
    setCardOpen(false);
    const t = window.setTimeout(() => setHeld(null), CARD_SLIDE_MS);
    return () => window.clearTimeout(t);
  }, [showCard]); // eslint-disable-line react-hooks/exhaustive-deps -- slide on show/hide only

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      const {
        settingsOpen: settings,
        setSettingsOpen,
        battle: current,
        deselect: clear,
      } = useGame.getState();
      if (settings) {
        e.preventDefault();
        setSettingsOpen(false);
        return;
      }
      if (!current?.selectedId) return;
      e.preventDefault();
      clear();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!battle) return null;

  function refresh() {
    if (!identity.client || !identity.user?.id || refreshing) return;
    if (refreshTimer.current !== null) window.clearTimeout(refreshTimer.current);
    setRefreshing(true);
    refreshTimer.current = window.setTimeout(() => {
      void syncMulti(identity.client!, identity.user!.id).finally(() => {
        setRefreshing(false);
        refreshTimer.current = null;
      });
    }, 1000);
  }

  const me = localParticipant(battle);
  const hold = battle.hotseatPending;
  const yours = Boolean(me && battle.turnTeam === me.team && !hold);
  const used = activationsDone(battle);
  const cap = activationsCap(battle);
  const cardSelected = showCard && selected && stats ? selected : (held?.selected ?? null);
  const cardStats = showCard && selected && stats ? stats : (held?.stats ?? null);

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
          <p className="mt-3 text-sm text-muted">
            Start your turn when the previous commander has looked away.
          </p>
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
            <p className="font-display text-lg font-semibold leading-tight">
              Team {battle.turnTeam}
            </p>
            <p className="text-xs text-subtle">
              {battle.mode === "single" ? "Opposing force" : "Waiting on opponent"}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {battle.mode === "multi" && (
            <Button
              variant="secondary"
              size="icon"
              className="pointer-events-auto"
              onClick={refresh}
              disabled={refreshing}
              aria-label="Refresh game state"
              title="Refresh game state"
            >
              <RefreshCw className={cn("size-4", refreshing && "animate-spin")} />
            </Button>
          )}
          {yours && !over && (
            <Button variant="outline" className="pointer-events-auto" onClick={end}>
              <SkipForward className="size-4" />
              <span className="sm:hidden">End</span>
              <span className="hidden sm:inline">End turn</span>
            </Button>
          )}
          <Button
            variant="secondary"
            size="icon"
            className="pointer-events-auto"
            onClick={() => setMenuOpen(true)}
            aria-label="Game menu"
          >
            <Menu className="size-4" />
          </Button>
        </div>
      </header>

      {menuOpen && (
        <div
          className="pointer-events-auto absolute inset-0 z-40 flex items-center justify-center bg-bg/75 p-5 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="game-menu-title"
        >
          <div className="w-full max-w-sm rounded-[var(--radius-xl)] border border-border bg-surface p-5 shadow-[var(--shadow-panel)]">
            <h2 id="game-menu-title" className="font-display text-2xl font-semibold">
              Game menu
            </h2>
            <div className="mt-5 grid gap-2">
              <Button
                variant="danger"
                onClick={() => {
                  surrender();
                  setMenuOpen(false);
                }}
              >
                Surrender
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setMenuOpen(false);
                  setSettingsOpen(true);
                }}
              >
                Settings
              </Button>
              <Button variant="secondary" onClick={() => setMenuOpen(false)}>
                Return to game
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="pointer-events-none mx-4 mt-1 hidden max-w-sm text-xs text-muted sm:block">
        {battle.log[0] ? (
          <p className="rounded-[var(--radius-md)] bg-bg/70 px-3 py-2">{battle.log[0].text}</p>
        ) : null}
      </div>

      <div className="mt-auto" />

      {over && (
        <div className="pointer-events-auto mx-auto mb-8 w-[min(92vw,420px)] rounded-[var(--radius-xl)] border border-border bg-surface p-6 text-center shadow-[var(--shadow-panel)]">
          <p className="font-display text-3xl font-semibold tracking-tight">
            {battle.winner === me?.team
              ? "Field secured"
              : battle.winner === "draw"
                ? "Mutual ruin"
                : "Line broken"}
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
        <div className="flex h-32 items-stretch gap-2 p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:h-auto sm:items-end sm:p-4 sm:pt-0">
          {cardSelected && cardStats && (
            <SelectedCard
              selected={cardSelected}
              stats={cardStats}
              battle={battle}
              yours={yours}
              open={cardOpen}
              onDeselect={deselect}
            />
          )}
          <div className="ml-auto aspect-[196/148] h-full shrink-0 sm:h-[148px] sm:w-[196px]">
            <Minimap />
          </div>
        </div>
      )}
    </div>
  );
}
