import { UnitPortrait } from "./UnitPortrait";
import { UNIT_STATS, unitSpecials } from "@/game/units";
import { hasUnitModel } from "@/game/models";
import type { Faction, UnitType } from "@/game/types";

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-[var(--radius-sm)] bg-surface-2/80 px-2.5 py-2">
      <dt className="text-[10px] uppercase tracking-[0.18em] text-subtle">{label}</dt>
      <dd className="mt-0.5 font-mono text-sm tabular-nums">{value}</dd>
    </div>
  );
}

export function UnitStatCard({ type, faction }: { type: UnitType; faction: Faction }) {
  const stats = UNIT_STATS[type];
  const specials = unitSpecials(stats);
  const modeled = hasUnitModel(type, faction);
  return (
    <article className="overflow-hidden rounded-[var(--radius-xl)] border border-border bg-surface/90 shadow-[var(--shadow-panel)] backdrop-blur-md">
      <div className="grid gap-0 lg:grid-cols-[minmax(16rem,22rem)_1fr]">
        <UnitPortrait type={type} faction={faction} className="min-h-[18rem] lg:min-h-full" />
        <div className="flex min-w-0 flex-col gap-4 p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.28em] text-muted">{stats.role}</p>
              <h2 className="mt-1 font-display text-4xl font-semibold leading-none">{stats.name}</h2>
            </div>
            <div className="text-right">
              <p className="font-mono text-lg tabular-nums">{stats.cost}</p>
              <p className="text-[10px] uppercase tracking-[0.2em] text-subtle">points</p>
            </div>
          </div>
          <p className="text-sm leading-relaxed text-muted">{stats.description}</p>
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="HP" value={stats.hp} />
            <Stat label="Move" value={stats.move} />
            <Stat label="Range" value={stats.range || "—"} />
            <Stat label="Fire" value={stats.damage || "—"} />
            <Stat label="Arc" value={`${stats.arc}°`} />
            <Stat label="Melee" value={stats.meleeDamage} />
            <Stat label="Overwatch" value={stats.overwatchDamage || "—"} />
            <Stat label="Speed" value={stats.speed} />
          </dl>
          {specials.length > 0 && (
            <ul className="flex flex-wrap gap-1.5">
              {specials.map((s) => (
                <li
                  key={s}
                  className="rounded-full border border-border bg-bg-elevated/70 px-2.5 py-1 text-[11px] text-muted"
                >
                  {s}
                </li>
              ))}
            </ul>
          )}
          {modeled ? (
            <p className="text-[11px] uppercase tracking-[0.18em] text-subtle">Field model · idle loop</p>
          ) : (
            <p className="text-[11px] uppercase tracking-[0.18em] text-subtle">Archive plate · 3D pending</p>
          )}
        </div>
      </div>
    </article>
  );
}
