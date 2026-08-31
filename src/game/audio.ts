import { Howl, Howler } from "howler";
import type { Settings } from "./types";

type Buses = {
  ctx: AudioContext;
  master: GainNode;
  music: GainNode;
  sfx: GainNode;
};

type SfxName =
  | "ui"
  | "confirm"
  | "move"
  | "shot"
  | "sniper"
  | "mg"
  | "melee"
  | "hit"
  | "win"
  | "lose"
  | "alien";

const FILES: Record<SfxName, { src: string; gain: number }> = {
  ui: { src: "/assets/sfx/ui.mp3", gain: 0.42 },
  confirm: { src: "/assets/sfx/confirm.mp3", gain: 0.48 },
  move: { src: "/assets/sfx/move.mp3", gain: 0.38 },
  shot: { src: "/assets/sfx/shot.mp3", gain: 0.7 },
  sniper: { src: "/assets/sfx/sniper.mp3", gain: 0.74 },
  mg: { src: "/assets/sfx/mg.mp3", gain: 0.62 },
  melee: { src: "/assets/sfx/melee.mp3", gain: 0.68 },
  hit: { src: "/assets/sfx/hit.mp3", gain: 0.55 },
  win: { src: "/assets/sfx/win.mp3", gain: 0.58 },
  lose: { src: "/assets/sfx/lose.mp3", gain: 0.58 },
  alien: { src: "/assets/sfx/alien.mp3", gain: 0.7 },
};

let buses: Buses | null = null;
let musicNodes: OscillatorNode[] = [];
let unlocked = false;
let sfxLevel = 1;
const howls = new Map<SfxName, Howl>();
const failed = new Set<SfxName>();

function curve(v: number) {
  const x = Math.max(0, Math.min(1, v));
  return x * x;
}

function getCtx() {
  if (buses) return buses;
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx({ latencyHint: "interactive" });
  const master = ctx.createGain();
  const music = ctx.createGain();
  const sfx = ctx.createGain();
  music.connect(master);
  sfx.connect(master);
  master.connect(ctx.destination);
  buses = { ctx, master, music, sfx };
  return buses;
}

export function applyVolumes(settings: Settings) {
  sfxLevel = curve(settings.sfx);
  Howler.volume(curve(settings.master));
  for (const [name, clip] of howls) {
    clip.volume(sfxLevel * FILES[name].gain);
  }
  if (!buses) return;
  const t = buses.ctx.currentTime;
  buses.master.gain.setTargetAtTime(curve(settings.master), t, 0.04);
  buses.music.gain.setTargetAtTime(curve(settings.music) * 0.35, t, 0.04);
  buses.sfx.gain.setTargetAtTime(sfxLevel, t, 0.04);
}

function getHowl(name: SfxName) {
  let clip = howls.get(name);
  if (clip) return clip;
  const spec = FILES[name];
  clip = new Howl({
    src: [spec.src],
    volume: sfxLevel * spec.gain,
    preload: true,
  });
  clip.once("loaderror", () => failed.add(name));
  howls.set(name, clip);
  return clip;
}

function playFile(name: SfxName, fallback: () => void) {
  if (failed.has(name)) {
    fallback();
    return;
  }
  const clip = getHowl(name);
  if (clip.state() === "unloaded") {
    fallback();
    return;
  }
  clip.volume(sfxLevel * FILES[name].gain);
  if (clip.state() === "loaded") {
    clip.play();
    return;
  }
  clip.once("load", () => clip.play());
}

export function unlockAudio(settings: Settings) {
  const b = getCtx();
  if (b.ctx.state === "suspended") void b.ctx.resume();
  applyVolumes(settings);
  if (!unlocked) {
    unlocked = true;
    startMusic();
    (Object.keys(FILES) as SfxName[]).forEach(getHowl);
  }
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && buses?.ctx.state === "suspended") {
      void buses.ctx.resume();
    }
  });
}

function startMusic() {
  if (!buses || musicNodes.length) return;
  const { ctx, music } = buses;
  const notes = [55, 82.4, 110, 164.8];
  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    const f = ctx.createBiquadFilter();
    osc.type = i % 2 === 0 ? "sine" : "triangle";
    osc.frequency.value = freq;
    f.type = "lowpass";
    f.frequency.value = 240 + i * 40;
    g.gain.value = 0.04 + i * 0.01;
    osc.connect(f);
    f.connect(g);
    g.connect(music);
    osc.start();
    musicNodes.push(osc);
  });
}

function noiseBurst(duration: number, gain: number, hp: number) {
  if (!buses) return;
  const { ctx, sfx } = buses;
  const n = Math.floor(ctx.sampleRate * duration);
  const buffer = ctx.createBuffer(1, n, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = "highpass";
  filter.frequency.value = hp;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
  src.connect(filter);
  filter.connect(g);
  g.connect(sfx);
  src.start();
  src.stop(ctx.currentTime + duration + 0.05);
}

function tone(freq: number, duration: number, type: OscillatorType, gain: number) {
  if (!buses) return;
  const { ctx, sfx } = buses;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq * 0.45), ctx.currentTime + duration);
  g.gain.setValueAtTime(gain, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
  osc.connect(g);
  g.connect(sfx);
  osc.start();
  osc.stop(ctx.currentTime + duration + 0.02);
}

export const sfx = {
  ui: () => playFile("ui", () => tone(420, 0.08, "sine", 0.08)),
  confirm: () => playFile("confirm", () => tone(620, 0.12, "triangle", 0.1)),
  move: () => playFile("move", () => tone(180, 0.16, "sine", 0.06)),
  shot: () =>
    playFile("shot", () => {
      noiseBurst(0.12, 0.22, 800);
      tone(320, 0.1, "square", 0.05);
    }),
  sniper: () =>
    playFile("sniper", () => {
      noiseBurst(0.18, 0.16, 1400);
      tone(880, 0.14, "sawtooth", 0.04);
    }),
  mg: () =>
    playFile("mg", () => {
      noiseBurst(0.22, 0.2, 500);
      tone(220, 0.16, "square", 0.05);
    }),
  melee: () =>
    playFile("melee", () => {
      noiseBurst(0.1, 0.18, 200);
      tone(90, 0.14, "sawtooth", 0.08);
    }),
  hit: () => playFile("hit", () => tone(140, 0.12, "triangle", 0.1)),
  win: () =>
    playFile("win", () => {
      tone(523, 0.2, "sine", 0.1);
      setTimeout(() => tone(659, 0.25, "sine", 0.1), 120);
    }),
  lose: () => playFile("lose", () => tone(90, 0.5, "sine", 0.12)),
  alien: () =>
    playFile("alien", () => {
      noiseBurst(0.16, 0.2, 900);
      tone(240, 0.14, "sawtooth", 0.06);
    }),
};
