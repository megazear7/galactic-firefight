import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { TILE, mulberry32, tileToWorld, worldToPoint } from "@/game/map";
import type { BattleMap } from "@/game/types";
import type { ThreeEvent } from "@react-three/fiber";

const loader = new THREE.TextureLoader();
loader.setCrossOrigin("anonymous");

function useTileTexture(src: string, rx: number, ry: number) {
  return useMemo(() => {
    const t = loader.load(src);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    t.repeat.set(rx, ry);
    return t;
  }, [src, rx, ry]);
}

const CELL = 64;
const TEX = {
  plates: "/assets/ground/plates.jpg",
  grate: "/assets/ground/grate.jpg",
  rust: "/assets/ground/rust.jpg",
  hazard: "/assets/ground/hazard.jpg",
};

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function hash2(x: number, y: number) {
  let n = Math.imul(x * 374761393 + y * 668265263, 1);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function fbm(x: number, y: number) {
  const n = (ix: number, iy: number) => {
    const x0 = Math.floor(ix);
    const y0 = Math.floor(iy);
    const fx = ix - x0;
    const fy = iy - y0;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const a = hash2(x0, y0);
    const b = hash2(x0 + 1, y0);
    const c = hash2(x0, y0 + 1);
    const d = hash2(x0 + 1, y0 + 1);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
  return n(x, y) * 0.5 + n(x * 2.07, y * 2.07) * 0.3 + n(x * 4.13, y * 4.13) * 0.2;
}

function fillPattern(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  scale: number,
  ox: number,
  oy: number,
  alpha = 1,
) {
  const tmp = document.createElement("canvas");
  tmp.width = Math.max(64, Math.round(img.width * scale));
  tmp.height = Math.max(64, Math.round(img.height * scale));
  const tctx = tmp.getContext("2d");
  if (!tctx) return;
  tctx.drawImage(img, 0, 0, tmp.width, tmp.height);
  const pat = ctx.createPattern(tmp, "repeat");
  if (!pat) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(ox, oy);
  ctx.fillStyle = pat;
  ctx.fillRect(-ox, -oy, ctx.canvas.width, ctx.canvas.height);
  ctx.restore();
}

function paintGround(map: BattleMap, imgs: Record<string, HTMLImageElement>) {
  const { cols, rows, tiles, seed } = map;
  const canvas = document.createElement("canvas");
  canvas.width = cols * CELL;
  canvas.height = rows * CELL;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  const rand = mulberry32(seed || 1);

  const vAisles = new Set([3, Math.floor(cols / 2), cols - 4]);
  const hAisles = new Set([3, Math.floor(rows / 2), rows - 4]);
  let wc = 5 + Math.floor(rand() * Math.max(1, cols - 10));
  let wr = 3 + Math.floor(rand() * Math.max(1, rows - 6));
  const wander = new Set<string>();
  for (let i = 0; i < cols + rows; i++) {
    wander.add(`${wc},${wr}`);
    wander.add(`${wc + 1},${wr}`);
    if (rand() > 0.45) wc = Math.max(3, Math.min(cols - 5, wc + (rand() > 0.5 ? 1 : -1)));
    else wr = Math.max(2, Math.min(rows - 3, wr + (rand() > 0.5 ? 1 : -1)));
  }
  const aisleAt = (c: number, r: number) =>
    vAisles.has(c) || hAisles.has(r) || wander.has(`${c},${r}`);

  const nearWall = (c: number, r: number) => {
    for (let dc = -1; dc <= 1; dc++) {
      for (let dr = -1; dr <= 1; dr++) {
        const cc = c + dc;
        const rr = r + dr;
        if (cc < 0 || rr < 0 || cc >= cols || rr >= rows) continue;
        const kind = tiles[rr * cols + cc];
        if (kind === "wall" || kind === "structure") return true;
      }
    }
    return false;
  };

  fillPattern(ctx, imgs.plates, 0.42, 0, 0, 1);
  fillPattern(ctx, imgs.grate, 0.5, 80, 40, 0.28);
  fillPattern(ctx, imgs.plates, 0.22, 140, -60, 0.22);

  const aislePath = new Path2D();
  const spinePath = new Path2D();
  const rustPath = new Path2D();
  const scuffPath = new Path2D();
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = c * CELL;
      const y = r * CELL;
      if (aisleAt(c, r)) {
        aislePath.rect(x, y, CELL, CELL);
        if (vAisles.has(c) || hAisles.has(r)) spinePath.rect(x, y, CELL, CELL);
      }
      const n = fbm(c * 0.19 + seed * 0.002, r * 0.19);
      if (nearWall(c, r) || n > 0.58) rustPath.rect(x, y, CELL, CELL);
      if (n > 0.4 && n < 0.52) scuffPath.rect(x, y, CELL, CELL);
    }
  }

  ctx.save();
  ctx.clip(scuffPath);
  fillPattern(ctx, imgs.grate, 0.38, 24, 90, 0.45);
  ctx.restore();

  ctx.save();
  ctx.clip(aislePath);
  fillPattern(ctx, imgs.grate, 0.4, 0, 0, 1);
  ctx.restore();

  ctx.save();
  ctx.clip(spinePath);
  fillPattern(ctx, imgs.hazard, 0.48, 0, 0, 0.55);
  ctx.restore();

  ctx.save();
  ctx.clip(rustPath);
  ctx.globalCompositeOperation = "multiply";
  fillPattern(ctx, imgs.rust, 0.36, 18, 40, 0.55);
  ctx.restore();
  ctx.globalCompositeOperation = "source-over";

  ctx.strokeStyle = "rgba(8, 10, 12, 0.55)";
  ctx.lineWidth = 3;
  ctx.lineJoin = "round";
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const here = aisleAt(c, r);
      if (c + 1 < cols && aisleAt(c + 1, r) !== here) {
        ctx.beginPath();
        ctx.moveTo((c + 1) * CELL, r * CELL);
        ctx.lineTo((c + 1) * CELL, (r + 1) * CELL);
        ctx.stroke();
      }
      if (r + 1 < rows && aisleAt(c, r + 1) !== here) {
        ctx.beginPath();
        ctx.moveTo(c * CELL, (r + 1) * CELL);
        ctx.lineTo((c + 1) * CELL, (r + 1) * CELL);
        ctx.stroke();
      }
    }
  }

  return canvas;
}

export function Ground({
  map,
  explored,
  onPoint,
  onHover,
  onRelease,
}: {
  map: BattleMap;
  explored: boolean[];
  onPoint: (col: number, row: number) => void;
  onHover: (col: number | null, row: number | null) => void;
  onRelease?: (col: number, row: number) => void;
}) {
  const [ground, setGround] = useState<THREE.CanvasTexture | null>(null);

  useEffect(() => {
    let dead = false;
    let tex: THREE.CanvasTexture | null = null;
    Promise.all(
      Object.entries(TEX).map(([key, src]) => loadImage(src).then((img) => [key, img] as const)),
    )
      .then((entries) => {
        if (dead) return;
        const imgs = Object.fromEntries(entries) as Record<string, HTMLImageElement>;
        const canvas = paintGround(map, imgs);
        tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 8;
        tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
        tex.needsUpdate = true;
        setGround(tex);
      })
      .catch(() => {
        /* keep fallback color */
      });
    return () => {
      dead = true;
      tex?.dispose();
    };
  }, [map.seed, map.cols, map.rows]);

  const w = map.cols * TILE;
  const h = map.rows * TILE;
  const pick = (e: ThreeEvent<PointerEvent>) => worldToPoint(e.point.x, e.point.z, map);

  const crateTex = useTileTexture("/assets/ground/crate.jpg", 1, 1);
  const bulkheadTex = useTileTexture("/assets/ground/bulkhead.jpg", 1, 1.35);
  const rustTex = useTileTexture("/assets/ground/rust.jpg", 1.2, 1.2);

  return (
    <group>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.stopPropagation();
          const target = e.nativeEvent.target as HTMLElement | undefined;
          target?.setPointerCapture?.(e.pointerId);
          const p = pick(e);
          onPoint(p.col, p.row);
        }}
        onPointerMove={(e) => {
          e.stopPropagation();
          const p = pick(e);
          onHover(p.col, p.row);
        }}
        onPointerUp={(e) => {
          if (e.button !== 0) return;
          const p = pick(e);
          onRelease?.(p.col, p.row);
        }}
        onPointerOut={(e) => {
          if (e.buttons) return;
          onHover(null, null);
        }}
      >
        <planeGeometry args={[w + TILE, h + TILE]} />
        {ground ? (
          <meshStandardMaterial
            map={ground}
            color="#d4d0c8"
            roughness={0.72}
            metalness={0.42}
          />
        ) : (
          <meshStandardMaterial color="#6a6762" roughness={0.92} metalness={0.28} />
        )}
      </mesh>
      {map.tiles.map((kind, i) => {
        if (kind === "floor") return null;
        if (!explored[i]) return null;
        const col = i % map.cols;
        const row = Math.floor(i / map.cols);
        const p = tileToWorld(col, row, map);
        const tall = kind === "structure";
        return (
          <mesh
            key={i}
            position={[p.x, tall ? 1.15 : 0.55, p.z]}
            castShadow
            receiveShadow
            onPointerDown={(e) => {
              e.stopPropagation();
            }}
          >
            <boxGeometry args={[TILE * 0.92, tall ? 2.3 : 1.1, TILE * 0.92]} />
            <meshStandardMaterial
              map={tall ? bulkheadTex : crateTex}
              roughnessMap={rustTex}
              color={tall ? "#c8ccd2" : "#d2cec6"}
              roughness={0.62}
              metalness={0.38}
            />
          </mesh>
        );
      })}
    </group>
  );
}
