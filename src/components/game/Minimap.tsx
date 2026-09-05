import { useEffect, useRef } from "react";
import { tileToWorld } from "@/game/map";
import { useGame } from "@/game/store";
import { enemyVisible, localTeam, visionMask } from "@/game/vision";
import type { BattleMap } from "@/game/types";

const W = 196;
const H = 148;
const PAD = 6;

/** Match BattleCanvas CAM_OFFSET XZ (14, 16): camera sits on +X/+Z. */
const ISO_RIGHT = { x: 16, z: -14 };
const ISO_DOWN = { x: 14, z: 16 };
const ISO_LEN = Math.hypot(ISO_RIGHT.x, ISO_RIGHT.z);

function isoProject(x: number, z: number) {
  return {
    u: (x * ISO_RIGHT.x + z * ISO_RIGHT.z) / ISO_LEN,
    v: (x * ISO_DOWN.x + z * ISO_DOWN.z) / ISO_LEN,
  };
}

function isoUnproject(u: number, v: number) {
  return {
    x: (ISO_RIGHT.x * u + ISO_DOWN.x * v) / ISO_LEN,
    z: (ISO_RIGHT.z * u + ISO_DOWN.z * v) / ISO_LEN,
  };
}

function minimapFit(map: BattleMap) {
  const corners = [
    tileToWorld(-0.5, -0.5, map),
    tileToWorld(map.cols - 0.5, -0.5, map),
    tileToWorld(-0.5, map.rows - 0.5, map),
    tileToWorld(map.cols - 0.5, map.rows - 0.5, map),
  ].map((p) => isoProject(p.x, p.z));
  let minU = Infinity;
  let maxU = -Infinity;
  let minV = Infinity;
  let maxV = -Infinity;
  for (const p of corners) {
    minU = Math.min(minU, p.u);
    maxU = Math.max(maxU, p.u);
    minV = Math.min(minV, p.v);
    maxV = Math.max(maxV, p.v);
  }
  const scale = Math.min((W - PAD * 2) / (maxU - minU), (H - PAD * 2) / (maxV - minV));
  const cu = (minU + maxU) / 2;
  const cv = (minV + maxV) / 2;
  return {
    scale,
    toCanvas(x: number, z: number) {
      const p = isoProject(x, z);
      return { x: W / 2 + (p.u - cu) * scale, y: H / 2 + (p.v - cv) * scale };
    },
    toWorld(px: number, py: number) {
      const u = (px - W / 2) / scale + cu;
      const v = (py - H / 2) / scale + cv;
      return isoUnproject(u, v);
    },
  };
}

function fillTile(
  ctx: CanvasRenderingContext2D,
  map: BattleMap,
  col: number,
  row: number,
  toCanvas: (x: number, z: number) => { x: number; y: number },
) {
  const pts = [
    tileToWorld(col - 0.5, row - 0.5, map),
    tileToWorld(col + 0.5, row - 0.5, map),
    tileToWorld(col + 0.5, row + 0.5, map),
    tileToWorld(col - 0.5, row + 0.5, map),
  ].map((p) => toCanvas(p.x, p.z));
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  ctx.lineTo(pts[1].x, pts[1].y);
  ctx.lineTo(pts[2].x, pts[2].y);
  ctx.lineTo(pts[3].x, pts[3].y);
  ctx.closePath();
  ctx.fill();
}

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
    const { scale, toCanvas } = minimapFit(map);
    ctx.fillStyle = "#07080a";
    ctx.fillRect(0, 0, W, H);
    for (let row = 0; row < map.rows; row++) {
      for (let col = 0; col < map.cols; col++) {
        const i = row * map.cols + col;
        if (!battle.explored[i]) {
          ctx.fillStyle = "#050608";
        } else {
          const kind = map.tiles[i];
          if (kind === "wall" || kind === "structure")
            ctx.fillStyle = vis[i] ? "#7a808a" : "#3d4148";
          else if (kind === "difficult") ctx.fillStyle = vis[i] ? "#8a6e52" : "#4a3c30";
          else if (kind === "door") ctx.fillStyle = vis[i] ? "#3a342c" : "#1c1a16";
          else ctx.fillStyle = vis[i] ? "#2a2e34" : "#16181c";
        }
        fillTile(ctx, map, col, row, toCanvas);
      }
    }
    for (const u of battle.units) {
      if (!u.alive) continue;
      const friendly =
        battle.mode === "multi" ? u.playerId === battle.playerId : u.team === localTeam(battle);
      if (!friendly && !enemyVisible(battle, u, vis)) continue;
      const p = tileToWorld(u.col, u.row, map);
      const c = toCanvas(p.x, p.z);
      ctx.fillStyle = friendly ? "#6fbf7a" : "#c45c4a";
      ctx.beginPath();
      ctx.arc(c.x, c.y, Math.max(2.2, scale * 0.55), 0, Math.PI * 2);
      ctx.fill();
    }
    if (camView) {
      const c = toCanvas(camView.x, camView.z);
      const rw = camView.w * scale;
      const rh = camView.h * scale;
      ctx.strokeStyle = "rgba(232,230,225,0.75)";
      ctx.lineWidth = 1;
      ctx.strokeRect(c.x - rw / 2, c.y - rh / 2, rw, rh);
    }
  }, [battle, camView]);

  const toWorld = (clientX: number, clientY: number) => {
    const el = canvas.current;
    if (!el || !battle) return null;
    const rect = el.getBoundingClientRect();
    const px = ((clientX - rect.left) / rect.width) * W;
    const py = ((clientY - rect.top) / rect.height) * H;
    return minimapFit(battle.map).toWorld(px, py);
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
