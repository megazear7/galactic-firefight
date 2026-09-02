import { Minus, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useGame } from "@/game/store";
import { FACTION_NAME, SPRITE_SRC, UNIT_STATS, armyCost, factionUnits, freeLeaders, leaderType, maxExtraLeaders, remainingPoints } from "@/game/units";
import { MAP_SIZE_LABEL, TERRAIN_DENSITY_LABEL, TERRAIN_SIZE_LABEL, TERRAIN_THEME_LABEL } from "@/game/map";
import { PLAYER_PALETTE, type Faction, type Participant, type TerrainBias, type UnitType } from "@/game/types";
import { humansReady, playable, slotCap } from "@/game/lobby";
import { cn } from "@/lib/utils";
import { useIdentity } from "@/lib/identity/provider";

function SlotCard({ p, host, localId, points }: { p: Participant; host: boolean; localId: string; points: number }) {
  const patch = useGame((s) => s.patchParticipant);
  const toggleReady = useGame((s) => s.toggleReady);
  const removeSlot = useGame((s) => s.removeSlot);
  const remote = p.kind === "human" && !p.host;
  const mine = p.id === localId || (p.kind === "ai" && host) || (p.kind === "local" && host);
  const canEdit = mine || (host && !remote);

  function bump(type: UnitType, dir: 1 | -1) {
    if (!canEdit || p.kind === "open" || p.kind === "invite") return;
    const stats = UNIT_STATS[type];
    const current = p.army[type] ?? 0;
    const next = current + dir;
    if (next < 0) return;
    const leader = leaderType(p.faction);
    const free = freeLeaders(p.faction, points as 100 | 200 | 300);
    if (type === leader && next < free) return;
    if (type === leader && next > free + maxExtraLeaders(p.faction)) return;
    if (dir > 0 && remainingPoints(p.faction, points as 100 | 200 | 300, p.army) < stats.cost) return;
    patch(p.id, { army: { ...p.army, [type]: next }, ready: p.kind === "ai" });
  }

  return (
    <div className="rounded-[var(--radius-lg)] border border-border bg-surface p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-display text-lg font-semibold leading-tight">{p.name}</p>
          <p className="text-xs uppercase tracking-wider text-muted">
            {p.kind === "human"
              ? p.host
                ? "Host"
                : "Human"
              : p.kind === "local"
                ? "This device"
                : p.kind === "ai"
                  ? "AI"
                  : p.kind === "open"
                    ? "Open slot"
                    : `Invite ${p.email ?? ""}`}
          </p>
        </div>
        {host && !p.host && (
          <Button variant="ghost" size="icon" className="size-8" onClick={() => removeSlot(p.id)} aria-label="Remove">
            <Trash2 className="size-3.5" />
          </Button>
        )}
      </div>

      {p.kind === "local" && canEdit && (
        <Input
          className="mt-3"
          value={p.name}
          onChange={(e) => patch(p.id, { name: e.target.value })}
          placeholder="Player name"
        />
      )}
      {p.kind !== "open" && p.kind !== "invite" && (
        <>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {(["empire", "brood"] as Faction[]).map((f) => (
              <button
                key={f}
                type="button"
                disabled={!canEdit}
                onClick={() => patch(p.id, { faction: f })}
                className={cn(
                  "rounded-[var(--radius-sm)] border px-2 py-1.5 text-left text-sm",
                  p.faction === f ? "border-accent bg-surface-2" : "border-border",
                )}
              >
                {FACTION_NAME[f]}
              </button>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-xs text-subtle">Team</span>
            {Array.from({ length: 8 }, (_, i) => i + 1).map((t) => (
              <button
                key={t}
                type="button"
                disabled={!canEdit}
                onClick={() => patch(p.id, { team: t })}
                className={cn(
                  "size-8 rounded-[var(--radius-sm)] border text-xs",
                  p.team === t ? "border-accent bg-surface-2" : "border-border",
                )}
              >
                {t}
              </button>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {PLAYER_PALETTE.map((c) => (
              <button
                key={c.id}
                type="button"
                disabled={!canEdit}
                aria-label={c.name}
                onClick={() => patch(p.id, { color: c.id })}
                className={cn("size-7 rounded-full border-2", p.color === c.id ? "border-fg" : "border-transparent")}
                style={{ background: c.hex }}
              />
            ))}
          </div>
          <p className="mt-3 font-mono text-xs text-muted">
            {armyCost(p.faction, points as 100 | 200 | 300, p.army)} / {points} pts
          </p>
          {canEdit && (
            <div className="mt-2 grid gap-1">
              {factionUnits(p.faction).map((type) => (
                <div key={type} className="flex items-center gap-2">
                  <img src={SPRITE_SRC[type]} alt="" className="h-8 w-6 object-contain" crossOrigin="anonymous" />
                  <span className="flex-1 truncate text-sm">{UNIT_STATS[type].name}</span>
                  <Button variant="secondary" size="icon" className="size-7" onClick={() => bump(type, -1)}>
                    <Minus className="size-3" />
                  </Button>
                  <span className="w-5 text-center font-mono text-xs">{p.army[type] ?? 0}</span>
                  <Button variant="secondary" size="icon" className="size-7" onClick={() => bump(type, 1)}>
                    <Plus className="size-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {(p.kind === "human" || p.kind === "local") && (
        <Button className="mt-3 w-full" variant={p.ready ? "secondary" : "default"} onClick={() => toggleReady(p.id)}>
          {p.ready ? "Ready" : "Mark ready"}
        </Button>
      )}
    </div>
  );
}

function ScaleRow({
  label,
  hint,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string;
  hint: string;
  value: TerrainBias;
  options: Record<TerrainBias, string>;
  disabled: boolean;
  onChange: (n: TerrainBias) => void;
}) {
  return (
    <section>
      <Label>{label}</Label>
      <p className="mt-1 text-sm text-muted">{hint}</p>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {([1, 2, 3] as const).map((n) => (
          <button
            key={n}
            type="button"
            disabled={disabled}
            onClick={() => onChange(n)}
            className={cn(
              "h-16 rounded-[var(--radius-md)] border font-display text-xl",
              value === n ? "border-accent bg-surface-2" : "border-border bg-surface",
              disabled && "cursor-default opacity-80",
            )}
          >
            {n}
            <span className="block text-xs font-sans uppercase tracking-wider text-subtle">{options[n]}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

export function LobbyScreen() {
  const record = useGame((s) => s.record);
  const participants = useGame((s) => s.participants);
  const mapSize = useGame((s) => s.mapSize);
  const points = useGame((s) => s.points);
  const terrainDensity = useGame((s) => s.terrainDensity);
  const terrainSize = useGame((s) => s.terrainSize);
  const terrainTheme = useGame((s) => s.terrainTheme);
  const setTerrainDensity = useGame((s) => s.setTerrainDensity);
  const setTerrainSize = useGame((s) => s.setTerrainSize);
  const setTerrainTheme = useGame((s) => s.setTerrainTheme);
  const visibility = useGame((s) => s.visibility);
  const addSlot = useGame((s) => s.addSlot);
  const startMatch = useGame((s) => s.startMatch);
  const setScreen = useGame((s) => s.setScreen);
  const identity = useIdentity();
  const [invite, setInvite] = useState("");
  const localId = record?.playerId ?? participants.find((p) => p.host)?.id ?? "";
  const host = participants.find((p) => p.host)?.id === localId;
  const cap = slotCap(mapSize);
  const ready = humansReady(participants);
  const playCount = participants.filter(playable).length;

  return (
    <div className="mx-auto flex min-h-dvh max-w-5xl flex-col gap-6 px-5 py-8">
      <div>
        <p className="text-xs uppercase tracking-[0.28em] text-muted">Roster</p>
        <h1 className="mt-1 font-display text-4xl font-semibold">{record?.name ?? "Firefight"}</h1>
        <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted">
          <div>{MAP_SIZE_LABEL[mapSize]} map</div>
          <div>{points} points</div>
          <div className="capitalize">{visibility}</div>
          <div>{record?.passcode ? "Pass code required" : "No pass code"}</div>
          <div>
            {participants.length}/{cap} slots
          </div>
          <div>
            {TERRAIN_THEME_LABEL[terrainTheme]} · {TERRAIN_DENSITY_LABEL[terrainDensity]} density ·{" "}
            {TERRAIN_SIZE_LABEL[terrainSize]} cover
          </div>
        </dl>
      </div>

      <section>
        <Label>Terrain theme</Label>
        <p className="mt-1 text-sm text-muted">Steel decks, hive growth, or a ruined street.</p>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {(["spaceship", "infestation", "wartorn"] as const).map((theme) => (
            <button
              key={theme}
              type="button"
              disabled={!host}
              onClick={() => setTerrainTheme(theme)}
              className={cn(
                "h-[4.5rem] rounded-[var(--radius-md)] border px-3 text-left",
                terrainTheme === theme ? "border-accent bg-surface-2" : "border-border bg-surface",
                !host && "cursor-default opacity-80",
              )}
            >
              <span className="font-display text-lg leading-tight">{TERRAIN_THEME_LABEL[theme]}</span>
              <span className="block text-[11px] leading-snug text-subtle">
                {theme === "spaceship"
                  ? "Cargo crates and bulkheads"
                  : theme === "infestation"
                    ? "Overlapping bug masses"
                    : "Debris fields, walls, and doors"}
              </span>
            </button>
          ))}
        </div>
      </section>

      <div className="grid gap-6 sm:grid-cols-2">
        <ScaleRow
          label="Terrain density"
          hint="Tilts how much cover appears. Always a bit random."
          value={terrainDensity}
          options={TERRAIN_DENSITY_LABEL}
          disabled={!host}
          onChange={setTerrainDensity}
        />
        <ScaleRow
          label="Terrain size"
          hint="Tilts toward small bits or large masses. Always a mix."
          value={terrainSize}
          options={TERRAIN_SIZE_LABEL}
          disabled={!host}
          onChange={setTerrainSize}
        />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {participants.map((p) => (
          <SlotCard key={p.id} p={p} host={host} localId={localId} points={points} />
        ))}
      </div>

      {host && participants.length < cap && (
        <div className="flex flex-wrap items-end gap-2">
          <Button variant="secondary" onClick={() => addSlot("ai")}>
            Add AI
          </Button>
          <Button variant="secondary" onClick={() => addSlot("local")}>
            Add player on this device
          </Button>
          {visibility === "public" && (
            <Button variant="secondary" onClick={() => addSlot("open")}>
              Add open slot
            </Button>
          )}
          <div className="flex min-w-[16rem] flex-1 gap-2">
            <Input placeholder="Invite email" value={invite} onChange={(e) => setInvite(e.target.value)} />
            <Button
              variant="secondary"
              disabled={!invite.trim()}
              onClick={() => {
                addSlot("invite", invite.trim());
                setInvite("");
              }}
            >
              Invite
            </Button>
          </div>
        </div>
      )}

      <div className="mt-auto flex flex-wrap gap-3">
        <Button variant="ghost" onClick={() => setScreen("menu")}>
          Leave
        </Button>
        {host && (
          <Button className="ml-auto" disabled={!ready || playCount < 2} onClick={startMatch}>
            {ready ? "Start game" : "Waiting on ready"}
          </Button>
        )}
        {!host && <p className="ml-auto text-sm text-muted">Waiting for the host to start.</p>}
      </div>
    </div>
  );
}
