import { createFileRoute, notFound } from "@tanstack/react-router";
import { CodexShell } from "@/components/codex/CodexShell";
import { UnitStatCard } from "@/components/codex/UnitStatCard";
import {
  FACTION_BLURB,
  FACTION_DOCTRINE,
  FACTION_LORE,
  FACTION_MOTTO,
  FACTION_NAME,
  factionUnits,
  isFaction,
  UNIT_STATS,
} from "@/game/units";
import type { Faction } from "@/game/types";

const ART: Record<Faction, string> = {
  empire: "/assets/empire-bg.jpg",
  brood: "/assets/brood-bg.jpg",
};

const KICKER: Record<Faction, string> = {
  empire: "Imperial order of battle",
  brood: "Swarm order of battle",
};

const LEDE: Record<Faction, string> = {
  empire:
    "A short list, each name a job. Spend points on the line you can actually keep — not the one you wish you had.",
  brood:
    "Nothing here waits. Read the claws, the spit, and the siege beast, then decide how close you are willing to let them get.",
};

export const Route = createFileRoute("/forces/$faction")({
  beforeLoad: ({ params }) => {
    if (!isFaction(params.faction)) throw notFound();
  },
  head: ({ params }) => {
    const faction = params.faction as Faction;
    const name = FACTION_NAME[faction];
    return {
      meta: [
        { title: `${name} · Known Forces · Galactic Firefight` },
        {
          name: "description",
          content: `${name}: ${FACTION_MOTTO[faction]} ${FACTION_BLURB[faction]}`,
        },
      ],
    };
  },
  component: FactionRoster,
});

function FactionRoster() {
  const params = Route.useParams();
  if (!isFaction(params.faction)) return null;
  const faction = params.faction;
  const roster = factionUnits(faction);
  const points = roster.reduce((n, type) => n + UNIT_STATS[type].cost, 0);

  return (
    <CodexShell
      background={ART[faction]}
      kicker={KICKER[faction]}
      title={FACTION_NAME[faction]}
      lede={LEDE[faction]}
      backTo="/forces"
      backLabel="All forces"
    >
      <div className="mb-8 grid gap-4 rounded-[var(--radius-xl)] border border-border bg-surface/80 p-5 shadow-[var(--shadow-panel)] backdrop-blur-md sm:grid-cols-3 sm:p-6">
        <div className="sm:col-span-2">
          <p className="font-display text-2xl font-semibold tracking-wide">{FACTION_MOTTO[faction]}</p>
          <p className="mt-3 text-sm leading-relaxed text-muted">{FACTION_LORE[faction]}</p>
        </div>
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-1">
          <div>
            <dt className="text-[10px] uppercase tracking-[0.2em] text-subtle">Roster</dt>
            <dd className="mt-1 font-mono tabular-nums">{roster.length} types</dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-[0.2em] text-subtle">Full kit</dt>
            <dd className="mt-1 font-mono tabular-nums">{points} pts if you take one of each</dd>
          </div>
        </dl>
      </div>
      <section className="mb-8">
        <h2 className="font-display text-2xl font-semibold">How they fight</h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted">{FACTION_DOCTRINE[faction]}</p>
      </section>
      <section className="flex flex-col gap-6">
        <div>
          <h2 className="font-display text-2xl font-semibold">Units</h2>
          <p className="mt-1 text-sm text-muted">
            Plates for every pattern still in the archive. Idle field models play where a 3D scan exists; the rest keep their painted likeness.
          </p>
        </div>
        {roster.map((type) => (
          <UnitStatCard key={type} type={type} faction={faction} />
        ))}
      </section>
    </CodexShell>
  );
}
