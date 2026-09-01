export function AssetLoadingScreen({ progress }: { progress: number }) {
  const pct = Math.max(0, Math.min(100, Math.round(progress * 100)));
  return (
    <div className="flex h-dvh w-full flex-col items-center justify-center bg-bg px-6">
      <p className="text-xs uppercase tracking-[0.32em] text-muted">Preparing the field</p>
      <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight sm:text-5xl">Loading</h1>
      <div className="mt-8 h-1.5 w-full max-w-sm overflow-hidden rounded-full bg-surface-2">
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-200 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-3 font-mono text-xs tabular-nums text-muted">{pct}%</p>
      <p className="mt-6 max-w-sm text-center text-sm text-subtle">
        Caching audio, 3D models, and textures so the match stays smooth.
      </p>
    </div>
  );
}
