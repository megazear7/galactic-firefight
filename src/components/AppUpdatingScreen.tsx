import { useEffect, useState } from "react";
import { registerGameServiceWorker } from "@/game/sw-client";

export function AppUpdatingScreen() {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(0);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    return registerGameServiceWorker({
      onApplying: setOpen,
      onPrecache: (d, t) => {
        setDone(d);
        setTotal(t);
      },
    });
  }, []);

  if (!open) return null;
  const pct = total > 0 ? Math.max(0, Math.min(100, Math.round((done / total) * 100))) : null;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-bg px-6 text-fg">
      <p className="text-xs uppercase tracking-[0.32em] text-muted">Please wait</p>
      <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight sm:text-5xl">App updating</h1>
      <p className="mt-4 max-w-sm text-center text-sm text-subtle">
        A new version is installing. The field is locked until this finishes so your match is not interrupted.
      </p>
      {pct != null && (
        <>
          <div className="mt-8 h-1.5 w-full max-w-sm overflow-hidden rounded-full bg-surface-2">
            <div className="h-full rounded-full bg-accent transition-[width] duration-200" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-3 font-mono text-xs tabular-nums text-muted">{pct}%</p>
        </>
      )}
    </div>
  );
}
