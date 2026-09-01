import { createFileRoute, Link } from "@tanstack/react-router";
import { CodexShell } from "@/components/codex/CodexShell";
import {
  FACTION_BLURB,
  FACTION_LORE,
  FACTION_MOTTO,
  FACTION_NAME,
  FACTIONS,
  factionUnits,
} from "@/game/units";
import type { Faction } from "@/game/types";

export const Route = createFileRoute("/forces/")({
  head: () => ({
    meta: [
      { title: "Known Forces · Galactic Firefight" },
      {
        name: "description",
        content:
          "Field archive of the Galactic Empire and the Brood Swarm — doctrine, mottos, and every unit that still walks the ruins.",
      },
    ],
  }),
  component: ForcesIndex,
});

const ART: Record<Faction, string> = {
  empire: "/assets/empire-bg.jpg",
  brood: "/assets/brood-bg.jpg",
};

const TONE: Record<Faction, string> = {
  empire: "text-empire",
  brood: "text-brood",
};

function ForcesIndex() {
  return (
    <CodexShell
      background="/assets/codex-bg.jpg"
      kicker="Field archive"
      title="Known Forces"
      lede="Two doctrines share the same ruins. Study their orders of battle before you spend a single activation — steel on one side of the plaza, a living tide on the other."
      backTo="/"
      backLabel="Back to menu"
    >
      <p className="mb-6 max-w-2xl text-sm text-muted">
        This is not a recruitment poster. It is the brief every commander reads when the dust settles long enough to count what still stands. Open a faction to inspect each unit, its cost, and how it actually fights.
      </p>
      <div className="grid gap-5 lg:grid-cols-2">
        {FACTIONS.map((faction) => {
          const roster = factionUnits(faction);
          return (
            <Link
              key={faction}
              to="/forces/$faction"
              params={{ faction }}
              className="group relative min-h-[22rem] overflow-hidden rounded-[var(--radius-xl)] border border-border bg-surface shadow-[var(--shadow-panel)] outline-none ring-accent/40 transition hover:border-border-strong focus-visible:ring-2"
            >
              <img
                src={ART[faction]}
                alt=""
                className="absolute inset-0 size-full object-cover transition duration-500 group-hover:scale-[1.03]"
                crossOrigin="anonymous"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/55 to-bg/10" />
              <div className="relative z-10 flex h-full min-h-[22rem] flex-col justify-end p-6 sm:p-7">
                <p className={`text-[11px] uppercase tracking-[0.28em] ${TONE[faction]}`}>
                  {roster.length} unit types
                </p>
                <h2 className="mt-1 font-display text-4xl font-semibold leading-none sm:text-5xl">
                  {FACTION_NAME[faction]}
                </h2>
                <p className="mt-3 font-display text-lg tracking-wide text-fg/90">{FACTION_MOTTO[faction]}</p>
                <p className="mt-3 max-w-md text-sm leading-relaxed text-muted">{FACTION_BLURB[faction]}</p>
                <p className="mt-4 line-clamp-3 text-xs leading-relaxed text-subtle">{FACTION_LORE[faction]}</p>
                <p className="mt-5 text-[11px] uppercase tracking-[0.22em] text-accent">Open roster →</p>
              </div>
            </Link>
          );
        })}
      </div>
    </CodexShell>
  );
}
