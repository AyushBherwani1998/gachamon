/**
 * Chiptune sound effects, synthesized at play time so there are no audio files
 * to load. Browsers keep audio locked until a user gesture, so nothing plays
 * until `unlockAudio` has run from one; calls before that are silently dropped.
 */

const MUTE_KEY = "gachamon:muted";
const MASTER_GAIN = 0.4;
const NOISE_SECONDS = 1;
/** Holding each noise sample for a few frames gives the crunchy 8-bit texture. */
const NOISE_HOLD_SAMPLES = 4;

const NOTE = {
  C4: 261.63,
  E4: 329.63,
  C5: 523.25,
  E5: 659.25,
  G5: 783.99,
  B5: 987.77,
  C6: 1046.5,
  E6: 1318.51,
  G6: 1567.98,
} as const;

let context: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuffer: AudioBuffer | null = null;

let mutedLoaded = false;
let muted = false;
const listeners = new Set<() => void>();

function loadMuted(): boolean {
  if (mutedLoaded) return muted;
  mutedLoaded = true;
  try {
    muted = window.localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    muted = false;
  }
  return muted;
}

export function isMuted(): boolean {
  return loadMuted();
}

export function subscribeMuted(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setMuted(next: boolean): void {
  loadMuted();
  muted = next;
  try {
    window.localStorage.setItem(MUTE_KEY, next ? "1" : "0");
  } catch {
    // Private windows can refuse storage; the choice still lasts this visit.
  }
  listeners.forEach((listener) => listener());
}

/** Call from a user gesture. Also recovers audio a phone suspended mid-session. */
export function unlockAudio(): void {
  if (typeof window.AudioContext === "undefined") return;
  if (!context) {
    context = new AudioContext();
    master = context.createGain();
    master.gain.value = MASTER_GAIN;
    // Overlapping effects stay clean instead of clipping.
    const limiter = context.createDynamicsCompressor();
    master.connect(limiter);
    limiter.connect(context.destination);

    const length = context.sampleRate * NOISE_SECONDS;
    noiseBuffer = context.createBuffer(1, length, context.sampleRate);
    const samples = noiseBuffer.getChannelData(0);
    let held = 0;
    for (let i = 0; i < length; i += 1) {
      if (i % NOISE_HOLD_SAMPLES === 0) held = Math.random() * 2 - 1;
      samples[i] = held;
    }
  }
  if (context.state !== "running") void context.resume().catch(() => {});
}

/**
 * Null when nothing should sound. A suspended context would queue sounds and
 * play them all at once on resume, so they're dropped instead.
 */
function output(): { ctx: AudioContext; out: GainNode; now: number } | null {
  if (!context || !master || isMuted()) return null;
  if (context.state !== "running") {
    void context.resume().catch(() => {});
    return null;
  }
  return { ctx: context, out: master, now: context.currentTime };
}

type ToneOptions = {
  wave?: OscillatorType;
  gain?: number;
  /** Glide to this frequency over the note. */
  glideTo?: number;
};

function tone(
  ctx: AudioContext,
  out: AudioNode,
  frequency: number,
  at: number,
  duration: number,
  { wave = "square", gain = 0.2, glideTo }: ToneOptions = {},
): void {
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  osc.type = wave;
  osc.frequency.setValueAtTime(frequency, at);
  if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, at + duration);
  env.gain.setValueAtTime(gain, at);
  env.gain.exponentialRampToValueAtTime(0.0001, at + duration);
  osc.connect(env);
  env.connect(out);
  osc.start(at);
  osc.stop(at + duration);
}

type NoiseOptions = {
  gain?: number;
  filter?: BiquadFilterType;
  frequency?: number;
  sweepTo?: number;
};

function noise(
  ctx: AudioContext,
  out: AudioNode,
  at: number,
  duration: number,
  { gain = 0.2, filter = "bandpass", frequency = 3000, sweepTo }: NoiseOptions = {},
): void {
  if (!noiseBuffer) return;
  const source = ctx.createBufferSource();
  const shape = ctx.createBiquadFilter();
  const env = ctx.createGain();
  source.buffer = noiseBuffer;
  shape.type = filter;
  shape.frequency.setValueAtTime(frequency, at);
  if (sweepTo) shape.frequency.exponentialRampToValueAtTime(sweepTo, at + duration);
  env.gain.setValueAtTime(gain, at);
  env.gain.exponentialRampToValueAtTime(0.0001, at + duration);
  source.connect(shape);
  shape.connect(env);
  env.connect(out);
  // A random start point keeps repeated rips and rattles from sounding identical.
  source.start(at, Math.random() * (NOISE_SECONDS - duration), duration);
}

function arpeggio(
  ctx: AudioContext,
  out: AudioNode,
  start: number,
  notes: readonly number[],
  stepSeconds: number,
  gain: number,
): number {
  notes.forEach((frequency, index) => {
    tone(ctx, out, frequency, start + index * stepSeconds, stepSeconds * 1.6, { gain });
  });
  return start + notes.length * stepSeconds;
}

export const sfx = {
  /** Confirms a toggle or similar small action. */
  blip(): void {
    const audio = output();
    if (!audio) return;
    tone(audio.ctx, audio.out, NOTE.C6, audio.now, 0.07, { gain: 0.14 });
  },

  /** The pull went through and the machine took the coin. */
  coin(): void {
    const audio = output();
    if (!audio) return;
    const { ctx, out, now } = audio;
    tone(ctx, out, NOTE.B5, now, 0.08, { gain: 0.18 });
    tone(ctx, out, NOTE.E6, now + 0.08, 0.32, { gain: 0.18 });
  },

  /** The pack lands in the tray. Timed to the visual landing of gm-packDrop. */
  drop(legendary: boolean): void {
    const audio = output();
    if (!audio) return;
    const { ctx, out, now } = audio;
    const land = now + 0.16;
    tone(ctx, out, 190, land, 0.14, { wave: "triangle", gain: 0.5, glideTo: 60 });
    noise(ctx, out, land, 0.07, { filter: "lowpass", frequency: 900, gain: 0.25 });
    if (legendary) {
      arpeggio(ctx, out, land + 0.1, [NOTE.E6, NOTE.G6, NOTE.E6, NOTE.G6], 0.06, 0.08);
    }
  },

  /** Foil crinkling on each swing of the idle wobble. */
  rattle(swings: number, swingSeconds: number, loudness: number): void {
    const audio = output();
    if (!audio) return;
    const { ctx, out, now } = audio;
    for (let index = 0; index < swings; index += 1) {
      noise(ctx, out, now + (index + 1) * swingSeconds, 0.035, {
        frequency: 3600,
        gain: 0.22 * loudness,
      });
    }
  },

  /** One tooth of the tear line giving way; pitch climbs along the tear. */
  rip(progress: number): void {
    const audio = output();
    if (!audio) return;
    noise(audio.ctx, audio.out, audio.now, 0.03, {
      frequency: 1800 + progress * 3200,
      gain: 0.2,
    });
  },

  /** The strip comes off. */
  tearDone(): void {
    const audio = output();
    if (!audio) return;
    noise(audio.ctx, audio.out, audio.now, 0.16, {
      filter: "highpass",
      frequency: 5200,
      sweepTo: 1400,
      gain: 0.3,
    });
  },

  reveal(legendary: boolean): void {
    const audio = output();
    if (!audio) return;
    const { ctx, out, now } = audio;
    const start = now + 0.12;
    if (!legendary) {
      const end = arpeggio(ctx, out, start, [NOTE.C5, NOTE.E5, NOTE.G5], 0.075, 0.16);
      tone(ctx, out, NOTE.C6, end, 0.3, { gain: 0.16 });
      return;
    }
    const end = arpeggio(
      ctx,
      out,
      start,
      [NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C6, NOTE.E6, NOTE.G6],
      0.07,
      0.14,
    );
    tone(ctx, out, NOTE.C6, end, 0.9, { gain: 0.1 });
    tone(ctx, out, NOTE.E6, end, 0.9, { gain: 0.1 });
    tone(ctx, out, NOTE.G6, end, 0.9, { gain: 0.1 });
  },

  error(): void {
    const audio = output();
    if (!audio) return;
    const { ctx, out, now } = audio;
    tone(ctx, out, NOTE.E4, now, 0.12, { gain: 0.16 });
    tone(ctx, out, NOTE.C4, now + 0.12, 0.24, { gain: 0.16 });
  },
};
