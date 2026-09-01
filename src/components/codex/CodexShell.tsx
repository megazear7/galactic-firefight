import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function CodexShell({
  background,
  kicker,
  title,
  lede,
  backTo,
  backLabel,
  children,
}: {
  background: string;
  kicker: string;
  title: string;
  lede: string;
  backTo: "/" | "/forces";
  backLabel: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative min-h-dvh overflow-hidden bg-bg text-fg">
      <img
        src={background}
        alt=""
        className="absolute inset-0 size-full object-cover"
        crossOrigin="anonymous"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-bg/80 via-bg/75 to-bg" />
      <div className="absolute inset-0 bg-gradient-to-r from-bg/50 via-transparent to-bg/40" />
      <div className="relative z-10 mx-auto flex min-h-dvh max-w-6xl flex-col px-5 py-8 pt-[max(1.5rem,env(safe-area-inset-top))] sm:px-8 sm:py-10">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <p className="text-xs uppercase tracking-[0.32em] text-muted">{kicker}</p>
            <h1 className="mt-2 font-display text-5xl font-semibold leading-[0.95] tracking-tight sm:text-6xl">
              {title}
            </h1>
            <p className="mt-4 max-w-xl text-sm text-muted sm:text-base">{lede}</p>
          </div>
          <Button variant="ghost" className="pointer-events-auto shrink-0" asChild>
            <Link to={backTo}>{backLabel}</Link>
          </Button>
        </header>
        <div className={cn("mt-10 flex-1")}>{children}</div>
      </div>
    </div>
  );
}
