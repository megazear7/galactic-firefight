import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { TILE, idx, inBounds, mulberry32, tileToWorld, worldToPoint } from "@/game/map";
import type { BattleMap, TerrainBlob, TileKind } from "@/game/types";
import type { ThreeEvent } from "@react-three/fiber";

const loader = new THREE.TextureLoader();

function useTileTexture(src: string, rx: number, ry: number) {
  const t = useMemo(() => {
    const tex = loader.load(src);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = 4;
    tex.repeat.set(rx, ry);
    return tex;
  }, [src, rx, ry]);
  useEffect(() => () => t.dispose(), [t]);
  return t;
}

const CELL = 32;
const WALL_GEO = new THREE.BoxGeometry(TILE * 0.92, 1.1, TILE * 0.92);
const STRUCT_GEO = new THREE.BoxGeometry(TILE * 0.92, 2.3, TILE * 0.92);
const DEBRIS_GEO = new THREE.BoxGeometry(TILE * 0.9, 0.55, TILE * 0.9);
const MOUND_GEO = new THREE.SphereGeometry(0.5, 12, 8);
const dummy = new THREE.Object3D();
const TEX = {
  plates: "/assets/ground/plates.jpg",
  grate: "/assets/ground/grate.jpg",
  rust: "/assets/ground/rust.jpg",
  hazard: "/assets/ground/hazard.jpg",
};

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(src));
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

function paintInfestationGround(map: BattleMap, imgs: Record<string, HTMLImageElement>) {
  const { cols, rows, seed, blobs } = map;
  const canvas = document.createElement("canvas");
  canvas.width = cols * CELL;
  canvas.height = rows * CELL;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  const rand = mulberry32((seed || 1) ^ 0x9e3779b9);
  const w = canvas.width;
  const h = canvas.height;

  ctx.fillStyle = "#7a6554";
  ctx.fillRect(0, 0, w, h);
  fillPattern(ctx, imgs.rust, 0.62, 12, 8, 0.38);

  for (let r = -1; r <= rows; r++) {
    for (let c = -1; c <= cols; c++) {
      const n = fbm(c * 0.16 + seed * 0.003, r * 0.16);
      const n2 = fbm(c * 0.38 + 6.1, r * 0.36);
      const h1 = hash2(c + 3, r + 11);
      const h2 = hash2(c + 17, r + 5);
      const cx = (c + 0.5) * CELL + (h1 - 0.5) * CELL * 0.72;
      const cy = (r + 0.5) * CELL + (h2 - 0.5) * CELL * 0.72;
      const rx = CELL * (0.38 + n * 0.85 + h1 * 0.2);
      const ry = CELL * (0.34 + n2 * 0.9 + h2 * 0.18);
      let color = "#8a6e58";
      if (n < 0.26) color = "#5c4a3c";
      else if (n < 0.42) color = "#7a5c48";
      else if (n < 0.58) color = "#9a7860";
      else if (n < 0.72) color = "#c49a70";
      else if (n < 0.84) color = "#b8a46a";
      else color = "#d0b090";
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, h1 * Math.PI, 0, Math.PI * 2);
      ctx.fill();
      if (n2 > 0.62 && n < 0.5) {
        ctx.fillStyle = "rgba(90, 48, 40, 0.28)";
        ctx.beginPath();
        ctx.ellipse(cx + (h2 - 0.5) * 10, cy, rx * 0.45, ry * 0.38, h2 * 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  ctx.save();
  ctx.globalCompositeOperation = "overlay";
  fillPattern(ctx, imgs.rust, 0.5, 40, 18, 0.28);
  ctx.restore();
  ctx.globalCompositeOperation = "source-over";

  const remnant = new Path2D();
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const n = fbm(c * 0.16 + seed * 0.003, r * 0.16);
      const n2 = fbm(c * 0.38 + 6.1, r * 0.36);
      if (n2 < 0.78 || n > 0.55) continue;
      const h1 = hash2(c + 41, r + 23);
      const x = c * CELL + h1 * 10;
      const y = r * CELL + hash2(c, r + 9) * 10;
      remnant.rect(x, y, CELL * (0.35 + h1 * 0.4), CELL * (0.28 + (1 - h1) * 0.35));
    }
  }
  ctx.save();
  ctx.clip(remnant);
  fillPattern(ctx, imgs.plates, 0.28, 8, 16, 0.55);
  fillPattern(ctx, imgs.grate, 0.4, 20, 4, 0.25);
  ctx.restore();

  ctx.strokeStyle = "rgba(62, 42, 32, 0.45)";
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  const cracks = 10 + Math.floor(rand() * 8);
  for (let i = 0; i < cracks; i++) {
    let x = rand() * w;
    let y = rand() * h;
    ctx.lineWidth = 1.4 + rand() * 4.2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    const steps = 14 + Math.floor(rand() * 22);
    for (let s = 0; s < steps; s++) {
      x += (rand() - 0.48) * 28;
      y += (rand() - 0.48) * 28;
      ctx.lineTo(x, y);
      if (rand() > 0.82) {
        ctx.lineTo(x + (rand() - 0.5) * 22, y + (rand() - 0.5) * 22);
        ctx.moveTo(x, y);
      }
    }
    ctx.stroke();
  }

  ctx.fillStyle = "rgba(140, 62, 48, 0.22)";
  const pools = 8 + Math.floor(rand() * 10);
  for (let i = 0; i < pools; i++) {
    ctx.beginPath();
    ctx.ellipse(rand() * w, rand() * h, 18 + rand() * 42, 12 + rand() * 28, rand() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }

  for (const blob of blobs) {
    const cx = (blob.col + 0.5) * CELL;
    const cy = (blob.row + 0.5) * CELL;
    const rad = Math.max(CELL, blob.radius * CELL * 1.15);
    const stain = ctx.createRadialGradient(cx, cy, rad * 0.15, cx, cy, rad);
    stain.addColorStop(0, "rgba(180, 110, 70, 0.0)");
    stain.addColorStop(0.55, "rgba(160, 90, 58, 0.18)");
    stain.addColorStop(1, "rgba(120, 80, 55, 0.0)");
    ctx.fillStyle = stain;
    ctx.beginPath();
    ctx.arc(cx, cy, rad, 0, Math.PI * 2);
    ctx.fill();
  }

  return canvas;
}

function paintWartornGround(map: BattleMap, imgs: Record<string, HTMLImageElement>) {
  const { cols, rows, seed, tiles } = map;
  const canvas = document.createElement("canvas");
  canvas.width = cols * CELL;
  canvas.height = rows * CELL;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  const w = canvas.width;
  const h = canvas.height;
  ctx.fillStyle = "#6a6460";
  ctx.fillRect(0, 0, w, h);
  fillPattern(ctx, imgs.plates, 0.32, 0, 0, 0.45);
  fillPattern(ctx, imgs.rust, 0.5, 24, 12, 0.35);
  for (let r = -1; r <= rows; r++) {
    for (let c = -1; c <= cols; c++) {
      const n = fbm(c * 0.18 + seed * 0.004, r * 0.18);
      const h1 = hash2(c + 2, r + 9);
      const h2 = hash2(c + 13, r + 4);
      ctx.fillStyle = n < 0.34 ? "#5a534c" : n < 0.55 ? "#7a7268" : n < 0.72 ? "#8a8074" : "#9a8e80";
      ctx.beginPath();
      ctx.ellipse(
        (c + 0.5) * CELL + (h1 - 0.5) * 16,
        (r + 0.5) * CELL + (h2 - 0.5) * 16,
        CELL * (0.4 + n * 0.7),
        CELL * (0.32 + h2 * 0.7),
        h1 * Math.PI,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
  }
  ctx.save();
  ctx.globalCompositeOperation = "multiply";
  fillPattern(ctx, imgs.rust, 0.4, 8, 30, 0.22);
  ctx.restore();
  ctx.globalCompositeOperation = "source-over";
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (tiles[r * cols + c] !== "door") continue;
      ctx.fillStyle = "#4a4640";
      ctx.fillRect(c * CELL + 4, r * CELL + 4, CELL - 8, CELL - 8);
    }
  }
  return canvas;
}

function paintGround(map: BattleMap, imgs: Record<string, HTMLImageElement>) {
  if (map.theme === "infestation") return paintInfestationGround(map, imgs);
  if (map.theme === "wartorn") return paintWartornGround(map, imgs);
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

  ctx.fillStyle = "#8a8680";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  fillPattern(ctx, imgs.plates, 0.38, 0, 0, 1);
  fillPattern(ctx, imgs.grate, 0.46, 80, 40, 0.22);
  fillPattern(ctx, imgs.plates, 0.2, 140, -60, 0.16);

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
      if (nearWall(c, r) || n > 0.62) rustPath.rect(x, y, CELL, CELL);
      if (n > 0.4 && n < 0.52) scuffPath.rect(x, y, CELL, CELL);
    }
  }

  ctx.save();
  ctx.clip(scuffPath);
  fillPattern(ctx, imgs.grate, 0.36, 24, 90, 0.35);
  ctx.restore();

  ctx.save();
  ctx.clip(aislePath);
  fillPattern(ctx, imgs.grate, 0.38, 0, 0, 0.92);
  ctx.restore();

  ctx.save();
  ctx.clip(spinePath);
  fillPattern(ctx, imgs.hazard, 0.44, 0, 0, 0.38);
  ctx.restore();

  ctx.save();
  ctx.clip(rustPath);
  ctx.globalCompositeOperation = "multiply";
  fillPattern(ctx, imgs.rust, 0.34, 18, 40, 0.22);
  ctx.restore();
  ctx.globalCompositeOperation = "source-over";

  ctx.strokeStyle = "rgba(28, 30, 34, 0.35)";
  ctx.lineWidth = 2;
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

function blobRevealed(blob: TerrainBlob, map: BattleMap, explored: boolean[]) {
  const reach = blob.radius + 0.55;
  const r2 = reach * reach;
  const c0 = Math.floor(blob.col - reach);
  const c1 = Math.ceil(blob.col + reach);
  const r0 = Math.floor(blob.row - reach);
  const r1 = Math.ceil(blob.row + reach);
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      if (!inBounds(c, r, map)) continue;
      const dx = c - blob.col;
      const dy = r - blob.row;
      if (dx * dx + dy * dy > r2) continue;
      if (explored[idx(c, r, map.cols)]) return true;
    }
  }
  return false;
}

function InfestationMound({
  blob,
  map,
  explored,
  rust,
}: {
  blob: TerrainBlob;
  map: BattleMap;
  explored: boolean[];
  rust: THREE.Texture;
}) {
  if (!blobRevealed(blob, map, explored)) return null;
  const p = tileToWorld(blob.col, blob.row, map);
  const tall = blob.kind === "structure";
  const h = tall ? 1.55 : 0.82;
  const span = Math.max(TILE * 0.9, blob.radius * TILE * 2.05);
  const jitter = hash2(Math.round(blob.col * 10), Math.round(blob.row * 10));
  return (
    <mesh
      geometry={MOUND_GEO}
      position={[p.x, h * 0.42, p.z]}
      scale={[span * (0.88 + jitter * 0.28), h, span * (0.92 + (1 - jitter) * 0.22)]}
      rotation={[0, jitter * Math.PI * 2, 0]}
      castShadow={false}
      receiveShadow
      renderOrder={5}
      onPointerDown={(e) => {
        e.stopPropagation();
      }}
    >
      <meshStandardMaterial
        map={rust}
        color={tall ? "#e0b07a" : "#d4a06c"}
        roughness={0.78}
        metalness={0.04}
      />
    </mesh>
  );
}

function collectKind(map: BattleMap, explored: boolean[], kind: TileKind) {
  const out: number[] = [];
  for (let i = 0; i < map.tiles.length; i++) {
    if (map.tiles[i] !== kind || !explored[i]) continue;
    out.push(i);
  }
  return out;
}

function InstancedCover({
  indexes,
  map,
  geometry,
  mapTex,
  color,
  roughness,
  metalness,
  place,
}: {
  indexes: number[];
  map: BattleMap;
  geometry: THREE.BufferGeometry;
  mapTex: THREE.Texture;
  color: string;
  roughness: number;
  metalness: number;
  place: (col: number, row: number, dummy: THREE.Object3D) => void;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    for (let i = 0; i < indexes.length; i++) {
      const idx = indexes[i];
      const col = idx % map.cols;
      const row = Math.floor(idx / map.cols);
      place(col, row, dummy);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [indexes, map.cols, place]);
  if (!indexes.length) return null;
  return (
    <instancedMesh
      key={indexes.length}
      ref={ref}
      args={[geometry, undefined, indexes.length]}
      castShadow={false}
      receiveShadow
      onPointerDown={(e) => {
        e.stopPropagation();
      }}
    >
      <meshStandardMaterial map={mapTex} color={color} roughness={roughness} metalness={metalness} />
    </instancedMesh>
  );
}

function CoverInstances({
  map,
  explored,
  crateTex,
  bulkheadTex,
}: {
  map: BattleMap;
  explored: boolean[];
  crateTex: THREE.Texture;
  bulkheadTex: THREE.Texture;
}) {
  const walls = useMemo(() => collectKind(map, explored, "wall"), [map, explored]);
  const structures = useMemo(() => collectKind(map, explored, "structure"), [map, explored]);
  const debris = useMemo(() => collectKind(map, explored, "difficult"), [map, explored]);
  return (
    <>
      <InstancedCover
        indexes={walls}
        map={map}
        geometry={WALL_GEO}
        mapTex={crateTex}
        color="#d8d4cc"
        roughness={0.72}
        metalness={0.22}
        place={(col, row, obj) => {
          const p = tileToWorld(col, row, map);
          obj.position.set(p.x, 0.55, p.z);
          obj.rotation.set(0, 0, 0);
          obj.scale.set(1, 1, 1);
        }}
      />
      <InstancedCover
        indexes={structures}
        map={map}
        geometry={STRUCT_GEO}
        mapTex={bulkheadTex}
        color="#d8d4cc"
        roughness={0.72}
        metalness={0.22}
        place={(col, row, obj) => {
          const p = tileToWorld(col, row, map);
          obj.position.set(p.x, 1.15, p.z);
          obj.rotation.set(0, 0, 0);
          obj.scale.set(1, 1, 1);
        }}
      />
      <InstancedCover
        indexes={debris}
        map={map}
        geometry={DEBRIS_GEO}
        mapTex={crateTex}
        color="#9a8b78"
        roughness={0.92}
        metalness={0.08}
        place={(col, row, obj) => {
          const p = tileToWorld(col, row, map);
          const j = hash2(col + 3, row + 11);
          obj.position.set(
            p.x + (j - 0.5) * 0.28,
            0.2,
            p.z + (hash2(col, row + 5) - 0.5) * 0.28,
          );
          obj.rotation.set(0.08 * (j - 0.5), j * 6.2, 0.06 * (j - 0.4));
          obj.scale.set(0.72 + j * 0.55, 0.42 + j * 0.2, 0.55 + (1 - j) * 0.5);
        }}
      />
    </>
  );
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
  const plates = useTileTexture("/assets/ground/plates.jpg", map.cols / 7, map.rows / 7);
  const crateTex = useTileTexture("/assets/ground/crate.jpg", 1, 1);
  const bulkheadTex = useTileTexture("/assets/ground/bulkhead.jpg", 1, 1.2);
  const rustTex = useTileTexture("/assets/ground/rust.jpg", 1.4, 1.4);

  useEffect(() => {
    let dead = false;
    let tex: THREE.CanvasTexture | null = null;
    Promise.all(Object.entries(TEX).map(([key, src]) => loadImage(src).then((img) => [key, img] as const)))
      .then((entries) => {
        if (dead) return;
        const imgs = Object.fromEntries(entries) as Record<string, HTMLImageElement>;
        const canvas = paintGround(map, imgs);
        tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 4;
        tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
        tex.needsUpdate = true;
        setGround(tex);
      })
      .catch(() => {
        setGround(null);
      });
    return () => {
      dead = true;
      tex?.dispose();
      setGround(null);
    };
  }, [map.seed, map.cols, map.rows, map.theme]);

  const w = map.cols * TILE;
  const h = map.rows * TILE;
  const infestation = map.theme === "infestation";
  const pick = (e: ThreeEvent<PointerEvent>) => worldToPoint(e.point.x, e.point.z, map);

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
        <meshStandardMaterial
          map={ground ?? plates}
          color={infestation ? "#d2c0a8" : "#c4c0b8"}
          roughness={infestation ? 0.9 : 0.82}
          metalness={infestation ? 0.04 : 0.18}
        />
      </mesh>
      {map.theme === "infestation"
        ? map.blobs.map((blob, i) => (
            <InfestationMound
              key={`${blob.col}:${blob.row}:${i}`}
              blob={blob}
              map={map}
              explored={explored}
              rust={rustTex}
            />
          ))
        : (
          <CoverInstances
            map={map}
            explored={explored}
            crateTex={crateTex}
            bulkheadTex={bulkheadTex}
          />
        )}
    </group>
  );
}
