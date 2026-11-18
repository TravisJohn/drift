/**
 * CombatSounds - the fight's sound effects, synthesized live.
 *
 * The recipes are STARFALL's (a falling sawtooth zap for the lasers, a
 * steady ping for a lock, a rising whoosh for a missile, filtered noise
 * for an explosion), played the same way as the warning beep: no audio
 * files, one AudioContext of its own. `recipeFor` is pure so the sound
 * choices can be tested without Web Audio.
 *
 * Where Web Audio is missing it stays silent and says so once.
 */
import { gameConfig } from '../config/gameConfig';
import type { CombatEvent } from './combatTypes';

export interface ToneRecipe {
  readonly kind: 'tone';
  readonly fromHz: number;
  readonly toHz: number;
  readonly seconds: number;
  /** Share of the effects level, 0..1. */
  readonly volume: number;
  readonly wave: OscillatorType;
}

export interface NoiseRecipe {
  readonly kind: 'noise';
  readonly seconds: number;
  readonly volume: number;
  /** Low-pass cutoff: lower is a deeper boom. */
  readonly cutoffHz: number;
}

export type SoundRecipe = ToneRecipe | NoiseRecipe;

const tone = (
  fromHz: number,
  toHz: number,
  seconds: number,
  volume: number,
  wave: OscillatorType = 'sine',
): ToneRecipe => ({ kind: 'tone', fromHz, toHz, seconds, volume, wave });

/** What an event sounds like (several layers play together); empty = silent. */
export function recipeFor(event: CombatEvent): readonly SoundRecipe[] {
  switch (event.type) {
    case 'laserFired':
      return [tone(800, 140, 0.13, 0.22, 'sawtooth')];
    case 'enemyFired':
      return [tone(420, 90, 0.16, 0.12, 'square')];
    case 'enemyMissileLaunched':
      // A warning warble: loud enough to turn the pilot's head.
      return [tone(1000, 700, 0.28, 0.3, 'square'), tone(500, 350, 0.28, 0.15, 'sawtooth')];
    case 'enemyMissileDown':
      return [
        { kind: 'noise', seconds: 0.3, volume: 0.6, cutoffHz: 900 },
        tone(600, 200, 0.15, 0.2, 'triangle'),
      ];
    case 'lockAcquired':
      return [tone(950, 950, 0.08, 0.25)];
    case 'missileFired':
      return [tone(130, 650, 0.4, 0.3, 'sawtooth')];
    case 'missileDenied':
      return [tone(220, 180, 0.1, 0.15, 'square')];
    case 'hit':
      return event.on === 'raider' ? [tone(1400, 600, 0.05, 0.12, 'triangle')] : [];
    case 'raiderDestroyed':
      return [
        { kind: 'noise', seconds: event.commander ? 0.8 : 0.45, volume: 1, cutoffHz: 650 },
        tone(90, 25, 0.4, 0.45),
      ];
    case 'playerDamaged':
      return [tone(110, 40, 0.16, 0.5, 'triangle')];
    case 'overheated':
      return [tone(300, 120, 0.35, 0.2, 'square')];
    case 'waveStarted':
      return [tone(300, 600, 0.3, 0.25)];
    case 'won':
      return [tone(390, 780, 0.7, 0.35)];
    case 'lost':
      return [{ kind: 'noise', seconds: 1.2, volume: 1, cutoffHz: 400 }, tone(80, 20, 1, 0.5)];
    default:
      return [];
  }
}

export interface CombatSoundSettings {
  readonly enabled: boolean;
  readonly level: number;
}

export class CombatSounds {
  private context: AudioContext | null = null;
  private output: GainNode | null = null;
  private unavailable = false;

  constructor(private readonly settings: CombatSoundSettings = gameConfig.audio.combatSounds) {}

  /** Call from a user gesture (browsers start audio suspended). */
  resume(): void {
    const context = this.ensureContext();
    context?.resume().catch((error: unknown) => {
      console.warn('Drift audio: could not start the combat sounds', error);
    });
  }

  /** Play whatever this step's events sound like. */
  play(events: readonly CombatEvent[]): void {
    if (events.length === 0) return;
    const context = this.ensureContext();
    if (!context || !this.output || context.state !== 'running') return;
    for (const event of events) {
      for (const recipe of recipeFor(event)) {
        if (recipe.kind === 'tone') this.playTone(context, this.output, recipe);
        else this.playNoise(context, this.output, recipe);
      }
    }
  }

  dispose(): void {
    this.context?.close().catch((error: unknown) => {
      console.warn('Drift audio: could not close the combat sounds', error);
    });
    this.context = null;
    this.output = null;
  }

  private playTone(context: AudioContext, out: AudioNode, r: ToneRecipe): void {
    const t = context.currentTime;
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = r.wave;
    osc.frequency.setValueAtTime(r.fromHz, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, r.toHz), t + r.seconds);
    gain.gain.setValueAtTime(r.volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + r.seconds);
    osc.connect(gain).connect(out);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
    osc.start(t);
    osc.stop(t + r.seconds + 0.02);
  }

  private playNoise(context: AudioContext, out: AudioNode, r: NoiseRecipe): void {
    const size = Math.max(1, Math.floor(context.sampleRate * r.seconds));
    const buffer = context.createBuffer(1, size, context.sampleRate);
    const data = buffer.getChannelData(0);
    // White noise fading out over the buffer: the crack of a breakup.
    for (let i = 0; i < size; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / size);
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    source.buffer = buffer;
    filter.type = 'lowpass';
    filter.frequency.value = r.cutoffHz;
    gain.gain.value = r.volume;
    source.connect(filter).connect(gain).connect(out);
    source.onended = () => {
      source.disconnect();
      filter.disconnect();
      gain.disconnect();
    };
    source.start();
  }

  private ensureContext(): AudioContext | null {
    if (!this.settings.enabled || this.unavailable) return null;
    if (this.context) return this.context;
    const Context = globalThis.AudioContext;
    if (typeof Context !== 'function') {
      this.unavailable = true;
      console.warn('Drift audio: Web Audio is not available; combat sounds are off');
      return null;
    }
    this.context = new Context();
    this.output = this.context.createGain();
    this.output.gain.value = this.settings.level;
    this.output.connect(this.context.destination);
    return this.context;
  }
}
