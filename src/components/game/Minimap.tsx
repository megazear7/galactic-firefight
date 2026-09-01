import { useEffect, useRef } from "react";
import { TILE, tileToWorld, worldToPoint } from "@/game/map";
import { useGame } from "@/game/store";
import { enemyVisible, localTeam, visionMask } from "@/game/vision";

const W = 196;
const H = 148;
const PAD = 6;

export function Minimap() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const dragging = useRef(false);
  const battle = useGame((s) => s.battle);
  const camView = useGame((s) => s.camView);
  const requestCam = useGame((s) => s.requestCam);

  useEffect(() => {
    const el = canvas.current;
    if (!el || !battle) return;
    const ctx = el.getContext("2d");
    if (!ctx) return;
    const { map } = battle;
    const vis = visionMask(battle, localTeam(battle));
    const scaleX = (W - PAD * 2) / map.cols;
    const scaleY = (H - PAD * 2) / map.rows;
    ctx.fillStyle = "#07080a";
    ctx.fillRect(0, 0, W, H);
    for (let row = 0; row < map.rows; row++) {
      for (let col = 0; col < map.cols; col++) {
        const i = row * map.cols + col;
        const x = PAD + col * scaleX;
        const y = PAD + row * scaleY;
        if (!battle.explored[i]) {
          ctx.fillStyle = "#050608";
          ctx.fillRect(x, y, scaleX + 0.5, scaleY + 0.5);
          continue;
        }
        const kind = map.tiles[i];
        if (kind === "wall" || kind === "structure") ctx.fillStyle = vis[i] ? "#7a808a" : "#3d4148";
        else ctx.fillStyle = vis[i] ? "#2a2e34" : "#16181c";
        ctx.fillRect(x, y, scaleX + 0.5, scaleY + 0.5);
      }
    }
    for (const u of battle.units) {
      if (!u.alive) continue;
      const friendly = u.team === localTeam(battle);
      if (!friendly && !enemyVisible(battle, u, vis)) continue;
      ctx.fillStyle = friendly ? "#6fbf7a" : "#c45c4a";
      ctx.beginPath();
      ctx.arc(PAD + (u.col + 0.5) * scaleX, PAD + (u.row + 0.5) * scaleY, Math.max(2.2, scaleX * 0.42), 0, Math.PI * 2);
      ctx.fill();
    }
    if (camView) {
      const a = worldToPoint(camView.x - camView.w / 2, camView.z - camView.h / 2, map);
      const b = worldToPoint(camView.x + camView.w / 2, camView.z + camView.h / 2, map);
      const x = PAD + Math.min(a.col, b.col) * scaleX;
      const y = PAD + Math.min(a.row, b.row) * scaleY;
      const w = Math.abs(b.col - a.col) * scaleX;
      const h = Math.abs(b.row - a.row) * scaleY;
      ctx.strokeStyle = "rgba(232,230,225,0.75)";
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, w, h);
    }
  }, [battle, camView]);

  const toWorld = (clientX: number, clientY: number) => {
    const el = canvas.current;
    if (!el || !battle) return null;
    const rect = el.getBoundingClientRect();
    const px = ((clientX - rect.left) / rect.width) * W;
    const py = ((clientY - rect.top) / rect.height) * H;
    const col = ((px - PAD) / (W - PAD * 2)) * battle.map.cols - 0.5;
    const row = ((py - PAD) / (H - PAD * 2)) * battle.map.rows - 0.5;
    return tileToWorld(col, row, battle.map);
  };

  const panTo = (e: React.PointerEvent) => {
    const w = toWorld(e.clientX, e.clientY);
    if (!w) return;
    requestCam(w.x, w.z);
  };

  if (!battle) return null;

  return (
    <div className="pointer-events-auto size-full overflow-hidden rounded-[var(--radius-md)] border border-border bg-bg-elevated/90 shadow-[var(--shadow-panel)] backdrop-blur-sm">
      <canvas
        ref={canvas}
        width={W}
        height={H}
        className="block size-full touch-none cursor-crosshair"
        onPointerDown={(e) => {
          e.preventDefault();
          (e.currentTarget as HTMLCanvasElement).setPointerCapture(e.pointerId);
          dragging.current = true;
          panTo(e);
        }}
        onPointerMove={(e) => {
          if (!dragging.current) return;
          panTo(e);
        }}
        onPointerUp={() => {
          dragging.current = false;
        }}
        onPointerCancel={() => {
          dragging.current = false;
        }}
      />
    </div>
  );
}
