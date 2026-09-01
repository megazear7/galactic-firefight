import { Howl, Howler } from "howler";
import type { Faction, Settings, UnitType } from "./types";

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

/** `{faction}-{unit-type}-command-NN` stems. Underscores in UnitType become hyphens. */
const COMMAND_FILES = [
  "empire-captain-command-01",
  "empire-captain-command-02",
  "empire-captain-command-03",
  "empire-soldier-command-01",
  "empire-soldier-command-02",
  "empire-soldier-command-03",
  "empire-soldier-command-04",
  "empire-soldier-command-05",
  "empire-soldier-command-06",
  "empire-soldier-command-07",
  "empire-soldier-command-08",
  "empire-soldier-command-09",
  "empire-soldier-command-10",
  "empire-soldier-command-11",
  "empire-soldier-command-12",
  "empire-machine-gunner-command-01",
  "empire-machine-gunner-command-02",
  "empire-sniper-command-01",
  "empire-sniper-command-02",
];

/** `{faction}-{unit-type}-ranged-attack-NN` stems. */
const ATTACK_FILES = [
  "empire-captain-ranged-attack-01",
  "empire-soldier-ranged-attack-01",
  "empire-soldier-ranged-attack-02",
  "empire-soldier-ranged-attack-03",
  "empire-soldier-ranged-attack-04",
  "empire-machine-gunner-ranged-attack-01",
  "empire-machine-gunner-ranged-attack-02",
  "empire-machine-gunner-ranged-attack-03",
  "empire-sniper-ranged-attack-01",
  "empire-sniper-ranged-attack-02",
  "empire-sniper-ranged-attack-03",
  "empire-sniper-ranged-attack-04",
];

const COMMAND_GAIN = 0.72;
const ATTACK_GAIN = 0.7;

const AMBIENCE_SRC = "/assets/sfx/ambience.mp3";
const AMBIENCE_GAIN = 0.16;

let buses: Buses | null = null;
let musicNodes: OscillatorNode[] = [];
let unlocked = false;
let sfxLevel = 1;
let musicLevel = 1;
let ambience: Howl | null = null;
const howls = new Map<SfxName, Howl>();
const clipHowls = new Map<string, Howl>();
const clipGain = new Map<string, number>();
const failed = new Set<string>();

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
  musicLevel = curve(settings.music);
  Howler.volume(curve(settings.master));
  for (const [name, clip] of howls) {
    clip.volume(sfxLevel * FILES[name].gain);
  }
  for (const [src, clip] of clipHowls) {
    clip.volume(sfxLevel * (clipGain.get(src) ?? COMMAND_GAIN));
  }
  ambience?.volume(musicLevel * AMBIENCE_GAIN);
  if (!buses) return;
  const t = buses.ctx.currentTime;
  buses.master.gain.setTargetAtTime(curve(settings.master), t, 0.04);
  buses.music.gain.setTargetAtTime(musicLevel * 0.22, t, 0.04);
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

function unitClipSrcs(files: string[], kind: "command" | "ranged-attack", type: UnitType, faction: Faction) {
  const prefix = `${faction}-${type.replaceAll("_", "-")}-${kind}-`;
  return files.filter((name) => name.startsWith(prefix)).map((name) => `/assets/sfx/${name}.mp3`);
}

function getClipHowl(src: string, gain: number) {
  let clip = clipHowls.get(src);
  if (clip) return clip;
  clipGain.set(src, gain);
  clip = new Howl({ src: [src], volume: sfxLevel * gain, preload: true });
  clip.once("loaderror", () => failed.add(src));
  clipHowls.set(src, clip);
  return clip;
}

let commandBusy = false;

function commandIsPlaying() {
  if (commandBusy) return true;
  for (const [src, clip] of clipHowls) {
    if (!src.includes("-command-")) continue;
    if (clip.playing()) return true;
  }
  return false;
}

function releaseCommand() {
  commandBusy = false;
}

function playClip(src: string, gain: number, onDone?: () => void) {
  if (failed.has(src)) {
    onDone?.();
    return false;
  }
  const clip = getClipHowl(src, gain);
  if (clip.state() === "unloaded") {
    onDone?.();
    return false;
  }
  clip.volume(sfxLevel * gain);
  if (onDone) {
    clip.once("end", onDone);
    clip.once("stop", onDone);
    clip.once("playerror", onDone);
  }
  if (clip.state() === "loaded") {
    clip.play();
    return true;
  }
  clip.once("load", () => {
    if (clip.playing()) return;
    clip.play();
  });
  return true;
}

function playRandomClip(files: string[], kind: "command" | "ranged-attack", type: UnitType, faction: Faction, gain: number) {
  const srcs = unitClipSrcs(files, kind, type, faction);
  if (!srcs.length) return false;
  const src = srcs[Math.floor(Math.random() * srcs.length)];
  return playClip(src, gain);
}

export function playCommand(type: UnitType, faction: Faction) {
  const srcs = unitClipSrcs(COMMAND_FILES, "command", type, faction);
  if (!srcs.length) return false;
  if (commandIsPlaying()) return true;
  commandBusy = true;
  const src = srcs[Math.floor(Math.random() * srcs.length)];
  return playClip(src, COMMAND_GAIN, releaseCommand);
}

export function playAttack(type: UnitType, faction: Faction) {
  return playRandomClip(ATTACK_FILES, "ranged-attack", type, faction, ATTACK_GAIN);
}

function getAmbience() {
  if (ambience) return ambience;
  ambience = new Howl({
    src: [AMBIENCE_SRC],
    loop: true,
    volume: musicLevel * AMBIENCE_GAIN,
    preload: true,
  });
  ambience.once("loaderror", () => {
    failed.add(AMBIENCE_SRC);
    ambience = null;
  });
  return ambience;
}

export function startAmbience() {
  if (failed.has(AMBIENCE_SRC)) return;
  const clip = getAmbience();
  clip.volume(musicLevel * AMBIENCE_GAIN);
  if (!clip.playing()) clip.play();
}

export function stopAmbience() {
  if (!ambience) return;
  ambience.stop();
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

export function allAudioUrls() {
  return [
    ...Object.values(FILES).map((f) => f.src),
    AMBIENCE_SRC,
    ...COMMAND_FILES.map((name) => `/assets/sfx/${name}.mp3`),
    ...ATTACK_FILES.map((name) => `/assets/sfx/${name}.mp3`),
  ];
}

function waitHowl(clip: Howl) {
  if (clip.state() === "loaded") return Promise.resolve();
  return new Promise<void>((resolve) => {
    clip.once("load", () => resolve());
    clip.once("loaderror", () => resolve());
  });
}

export async function warmAudioBank() {
  (Object.keys(FILES) as SfxName[]).forEach(getHowl);
  getAmbience();
  for (const name of COMMAND_FILES) getClipHowl(`/assets/sfx/${name}.mp3`, COMMAND_GAIN);
  for (const name of ATTACK_FILES) getClipHowl(`/assets/sfx/${name}.mp3`, ATTACK_GAIN);
  const clips: Howl[] = [...howls.values(), ...clipHowls.values()];
  if (ambience) clips.push(ambience);
  await Promise.all(clips.map(waitHowl));
}

export function unlockAudio(settings: Settings) {
  const b = getCtx();
  if (b.ctx.state === "suspended") void b.ctx.resume();
  applyVolumes(settings);
  if (!unlocked) {
    unlocked = true;
    startMusic();
    void warmAudioBank();
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
  command: (type: UnitType, faction: Faction) => playCommand(type, faction),
  attack: (type: UnitType, faction: Faction) => {
    if (playAttack(type, faction)) return true;
    if (faction === "brood") sfx.alien();
    else if (type === "sniper") sfx.sniper();
    else if (type === "machine_gunner") sfx.mg();
    else sfx.shot();
    return true;
  },
};
