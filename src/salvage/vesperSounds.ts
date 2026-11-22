/**
 * VesperSounds - the blackout's score and effects, synthesized live.
 *
 * A fallback four-chord pad with sparse accents, a thruster hum that follows
 * actual movement, a rising collector tone during an extraction, a pulse
 * that quickens as a patroller closes in, and a two-note chime when a cell
 * is secured. The authored playlist takes over from the pad when playing.
 * The synth uses its own AudioContext, like the combat sounds.
 * `pulseInterval` and `noteHz` are pure so the timing and tuning
 * can be tested without Web Audio.
 *
 * Where Web Audio is missing it stays silent and says so once.
 */
import { gameConfig } from '../config/gameConfig';

export interface VesperSoundState {
  /** Score and effects audible (a live, unpaused, unmuted run). */
  readonly active: boolean;
  /** How hard the drone is flying, 0..1. */
  readonly speed: number;
  /** Extraction progress 0..1, or null when not tapping a socket. */
  readonly charge: number | null;
  /** Nearest patroller closeness, 0 (out of range) to 1 (on top of you). */
  readonly proximity: number;
}

export interface VesperSoundSettings {
  readonly enabled: boolean;
  readonly level: number;
}

/** [pad notes, accent notes] as MIDI numbers, one chord every CHORD_SECONDS. */
const SCORE: readonly (readonly [readonly number[], readonly number[]])[] = [
  [
    [38, 53, 57, 64],
    [69, 76],
  ],
  [
    [34, 53, 57, 62],
    [65, 74],
  ],
  [
    [43, 53, 58, 69],
    [67, 74],
  ],
  [
    [45, 52, 55, 62],
    [64, 72],
  ],
];
const CHORD_SECONDS = 6;

/** Equal-tempered frequency of a MIDI note (A4 = 69 = 440 Hz). */
export function noteHz(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

/** Seconds between warning pulses: 1.12 s far away down to 0.38 s up close. */
export function pulseInterval(proximity: number): number {
  return 1.12 - 0.74 * Math.min(1, Math.max(0, proximity));
}

interface Voice {
  readonly oscillator: OscillatorNode;
  readonly volume: GainNode;
}

export class VesperSounds {
  private context: AudioContext | null = null;
  private mix: GainNode | null = null;
  private score: GainNode | null = null;
  private thruster: Voice | null = null;
  private collector: Voice | null = null;
  private overtone: Voice | null = null;
  private readonly targets = new WeakMap<AudioParam, number>();
  private chord = 0;
  private nextChord = 0;
  private lastPulse = -Infinity;
  private unavailable = false;
  private _muted = false;

  constructor(
    private readonly settings: VesperSoundSettings = gameConfig.audio.salvageSounds,
    private readonly hasRecordedScore: () => boolean = () => false,
  ) {}

  get muted(): boolean {
    return this._muted;
  }

  /** Mute the score and effects together (the overlay's Sound button). */
  set muted(value: boolean) {
    this._muted = value;
    if (value) this.update({ active: false, speed: 0, charge: null, proximity: 0 });
  }

  /** Call from a user gesture (browsers start audio suspended). */
  resume(): void {
    const context = this.ensureContext();
    context?.resume().catch((error: unknown) => {
      console.warn('Drift audio: could not start the Vesper sounds', error);
    });
  }

  /** Ease every continuous voice toward the run's state; schedule score and pulses. */
  update(state: VesperSoundState): void {
    const context = this.context;
    const { mix, score, thruster, collector, overtone } = this;
    if (!context || !mix || !score || !thruster || !collector || !overtone) return;
    const active = state.active && !this._muted;
    const now = context.currentTime;
    const recorded = this.hasRecordedScore();
    this.ease(mix.gain, active ? this.settings.level : 0, now, 0.035);
    this.ease(score.gain, recorded ? 0 : 1, now, 0.15);
    this.ease(thruster.volume.gain, active ? 0.09 * state.speed : 0, now);
    this.ease(thruster.oscillator.frequency, 75 + 30 * state.speed, now);
    const charging = active && state.charge !== null;
    const pitch = 150 + 180 * (state.charge ?? 0);
    this.ease(collector.volume.gain, charging ? 0.09 : 0, now);
    this.ease(overtone.volume.gain, charging ? 0.026 : 0, now);
    this.ease(collector.oscillator.frequency, pitch, now);
    this.ease(overtone.oscillator.frequency, pitch * 2.01, now);
    if (!active || context.state !== 'running') return;

    if (!recorded && now >= this.nextChord) {
      const [pad, accents] = SCORE[this.chord] as (typeof SCORE)[number];
      pad.forEach((midi, i) =>
        this.note(i === 1 ? 'triangle' : 'sine', noteHz(midi), 0.038, now, 7.4, 1.6, 2.4, score),
      );
      accents.forEach((midi, i) =>
        this.note('sine', noteHz(midi), 0.025, now + 1.8 + i * 1.8, 1.6, 0.07, 1.45, score),
      );
      this.chord = (this.chord + 1) % SCORE.length;
      this.nextChord = now + CHORD_SECONDS;
    }
    const p = state.proximity;
    if (p <= 0) {
      this.lastPulse = -Infinity;
    } else if (now - this.lastPulse >= pulseInterval(p)) {
      this.note('triangle', 440 + 120 * p, 0.025 + 0.11 * p, now, 0.18, 0.016, 0.14);
      this.lastPulse = now;
    }
  }

  /** The two-note chime for a secured cell. */
  cellSecured(): void {
    const context = this.context;
    if (!context || this._muted || context.state !== 'running') return;
    const now = context.currentTime;
    this.note('sine', 660, 0.09, now, 0.26, 0.018, 0.21);
    this.note('sine', 880, 0.08, now + 0.11, 0.42, 0.018, 0.37);
  }

  breach(): void {
    const context = this.context;
    if (!context || this._muted || context.state !== 'running') return;
    const start = context.currentTime;
    for (let i = 0; i < 6; i++) {
      this.note('sawtooth', i % 2 === 0 ? 292 : 388, 0.26, start + i * 0.28, 0.27, 0.026, 0.09);
    }
  }

  freezeShot(): void {
    const context = this.context;
    if (!context || this._muted || context.state !== 'running') return;
    this.note('triangle', 1280, 0.12, context.currentTime, 0.16, 0.009, 0.14);
  }

  dispose(): void {
    this.context?.close().catch((error: unknown) => {
      console.warn('Drift audio: could not close the Vesper sounds', error);
    });
    this.context = null;
    this.mix = null;
    this.score = null;
    this.thruster = null;
    this.collector = null;
    this.overtone = null;
    this.chord = 0;
    this.nextChord = 0;
    this.lastPulse = -Infinity;
  }

  private ease(param: AudioParam, value: number, time: number, smoothing = 0.07): void {
    if (this.targets.get(param) === value) return;
    this.targets.set(param, value);
    param.cancelScheduledValues(time);
    param.setTargetAtTime(value, time, smoothing);
  }

  private voice(type: OscillatorType, frequency: number, output: AudioNode): Voice {
    const context = this.context as AudioContext;
    const oscillator = context.createOscillator();
    const volume = context.createGain();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    volume.gain.value = 0;
    oscillator.connect(volume).connect(output);
    return { oscillator, volume };
  }

  private note(
    type: OscillatorType,
    frequency: number,
    level: number,
    start: number,
    duration: number,
    attack: number,
    release: number,
    output = this.mix,
  ): void {
    if (!output) return;
    const { oscillator, volume } = this.voice(type, frequency, output);
    const end = start + duration;
    volume.gain.setValueAtTime(0, start);
    volume.gain.linearRampToValueAtTime(level, start + attack);
    volume.gain.setValueAtTime(level, end - release);
    volume.gain.linearRampToValueAtTime(0, end);
    oscillator.onended = () => {
      oscillator.disconnect();
      volume.disconnect();
    };
    oscillator.start(start);
    oscillator.stop(end);
  }

  private ensureContext(): AudioContext | null {
    if (!this.settings.enabled || this.unavailable) return null;
    if (this.context) return this.context;
    const Context = globalThis.AudioContext;
    if (typeof Context !== 'function') {
      this.unavailable = true;
      console.warn('Drift audio: Web Audio is not available; Vesper sounds are off');
      return null;
    }
    this.context = new Context();
    this.mix = this.context.createGain();
    this.mix.gain.value = 0;
    this.mix.connect(this.context.destination);
    this.score = this.context.createGain();
    this.score.gain.value = 0;
    this.score.connect(this.mix);
    const filter = this.context.createBiquadFilter();
    filter.frequency.value = 340;
    filter.Q.value = 0.6;
    filter.connect(this.mix);
    this.thruster = this.voice('sawtooth', 80, filter);
    this.collector = this.voice('sine', 150, this.mix);
    this.overtone = this.voice('triangle', 300, this.mix);
    for (const v of [this.thruster, this.collector, this.overtone]) v.oscillator.start();
    return this.context;
  }
}
