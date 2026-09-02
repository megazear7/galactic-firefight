import { useGame } from "./store";

export function gameBlocksUpdate() {
  return useGame.getState().screen === "battle";
}

export function applyWaitingWorker(reg: ServiceWorkerRegistration) {
  const waiting = reg.waiting;
  if (!waiting) return;
  waiting.postMessage("SKIP_WAITING");
}

export function registerGameServiceWorker(opts: {
  onApplying: (v: boolean) => void;
  onPrecache?: (done: number, total: number) => void;
}) {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return () => undefined;
  }
  if (!import.meta.env.PROD) return () => undefined;

  let applying = false;
  let pending = false;
  const unsub = useGame.subscribe((state, prev) => {
    if (pending && prev?.screen === "battle" && state.screen !== "battle") {
      void navigator.serviceWorker.getRegistration().then((reg) => {
        if (reg?.waiting) startApply(reg);
      });
    }
  });

  function startApply(reg: ServiceWorkerRegistration) {
    if (applying) return;
    applying = true;
    opts.onApplying(true);
    applyWaitingWorker(reg);
  }

  function maybeApply(reg: ServiceWorkerRegistration) {
    if (!reg.waiting) return;
    if (gameBlocksUpdate()) {
      pending = true;
      return;
    }
    startApply(reg);
  }

  const onControllerChange = () => {
    if (applying) window.location.reload();
  };
  navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

  const onMessage = (event: MessageEvent) => {
    const data = event.data;
    if (data && data.type === "PRECACHE" && typeof data.done === "number") {
      opts.onPrecache?.(data.done, data.total ?? data.done);
    }
  };
  navigator.serviceWorker.addEventListener("message", onMessage);

  void navigator.serviceWorker.register("/sw.js", { scope: "/" }).then((reg) => {
    if (reg.waiting) maybeApply(reg);
    reg.addEventListener("updatefound", () => {
      const sw = reg.installing;
      if (!sw) return;
      sw.addEventListener("statechange", () => {
        if (sw.state === "installed") {
          if (!navigator.serviceWorker.controller) {
            sw.postMessage("SKIP_WAITING");
            return;
          }
          maybeApply(reg);
        }
      });
    });
    setInterval(() => void reg.update(), 60_000);
  });

  return () => {
    unsub();
    navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    navigator.serviceWorker.removeEventListener("message", onMessage);
  };
}
