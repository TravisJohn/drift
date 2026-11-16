/**
 * IntercomEffect - makes the music sound as if it is coming out of the
 * ship's intercom rather than out of nowhere.
 *
 * A small speaker in a metal room has no deep bass and no airy top, a
 * slightly nasal middle, a touch of overdrive and a faint bed of static.
 * Music elements are routed through a filter chain that does exactly that;
 * every other sound (engine, hum, effects) stays untouched, so the ship
 * itself still sounds full and close while the music sounds piped in.
 *
 * Browser-only (Web Audio). Where Web Audio is missing the music simply
 * plays unprocessed, and says so once in the console.
 */
import { gameConfig } from '../config/gameConfig';

/** Tuning for the effect; the defaults live in gameConfig.audio.intercom. */
export interface IntercomSettings {
  readonly enabled: boolean;
  readonly highpassHz: number;
  readonly lowpassHz: number;
  readonly presenceHz: number;
  readonly presenceDb: number;
  readonly drive: number;
  readonly staticLevel: number;
  readonly dryMix: number;
  readonly outputGain: number;
}

/**
 * Soft-clipping curve for the speaker's overdrive: a straight line that
 * bends over near full volume. `drive` 1 is nearly clean; higher is
 * grittier. Pure, so the shape is testable.
 */
export function makeSaturationCurve(drive: number, samples = 1024): Float32Array {
  if (drive <= 0 || samples < 2) {
    throw new Error('makeSaturationCurve: need drive > 0 and at least 2 samples');
  }
  const curve = new Float32Array(samples);
  const normalise = Math.tanh(drive);
  for (let i = 0; i < samples; i++) {
    const x = (i / (samples - 1)) * 2 - 1;
    curve[i] = Math.tanh(drive * x) / normalise;
  }
  return curve;
}

interface Graph {
  readonly context: AudioContext;
  readonly input: GainNode;
  readonly staticGain: GainNode;
}

export class IntercomEffect {
  private graph: Graph | null = null;
  private unavailable = false;
  /** An element can only ever be wired into Web Audio once. */
  private readonly routed = new WeakSet<HTMLMediaElement>();

  constructor(private readonly settings: IntercomSettings = gameConfig.audio.intercom) {}

  /** Route an element through the intercom. Safe to call repeatedly. */
  connect(element: HTMLMediaElement): void {
    if (!this.settings.enabled || this.routed.has(element)) return;
    const graph = this.ensureGraph();
    if (!graph) return;
    this.routed.add(element);
    graph.context.createMediaElementSource(element).connect(graph.input);
  }

  /** Call from a user gesture: browsers start audio contexts suspended. */
  resume(): void {
    this.graph?.context.resume().catch((error: unknown) => {
      console.warn('Drift audio: could not start the intercom effect', error);
    });
  }

  /** Static follows the music: `level` is how loud the music is, 0..1. */
  setLevel(level: number): void {
    if (!this.graph) return;
    const clamped = Math.min(1, Math.max(0, level));
    this.graph.staticGain.gain.setTargetAtTime(
      clamped * this.settings.staticLevel,
      this.graph.context.currentTime,
      0.15,
    );
  }

  dispose(): void {
    this.graph?.context.close().catch((error: unknown) => {
      console.warn('Drift audio: could not close the intercom effect', error);
    });
    this.graph = null;
  }

  private ensureGraph(): Graph | null {
    if (this.graph || this.unavailable) return this.graph;
    if (typeof AudioContext === 'undefined') {
      this.unavailable = true;
      console.warn(
        'Drift audio: Web Audio is unavailable - music plays without the intercom effect',
      );
      return null;
    }
    const s = this.settings;
    const context = new AudioContext();
    const input = context.createGain();
    const output = context.createGain();
    output.gain.value = s.outputGain;
    output.connect(context.destination);

    // The speaker: band-limit, add a nasal peak, then overdrive gently.
    const highpass = context.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.value = s.highpassHz;
    const lowpass = context.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = s.lowpassHz;
    const presence = context.createBiquadFilter();
    presence.type = 'peaking';
    presence.frequency.value = s.presenceHz;
    presence.gain.value = s.presenceDb;
    presence.Q.value = 1.1;
    const speaker = context.createWaveShaper();
    speaker.curve = makeSaturationCurve(s.drive) as Float32Array<ArrayBuffer>;
    speaker.oversample = '2x';
    const wet = context.createGain();
    wet.gain.value = 1 - s.dryMix;
    input.connect(highpass).connect(lowpass).connect(presence).connect(speaker).connect(wet);
    wet.connect(output);

    // A little of the untouched signal keeps it from sounding like a phone.
    const dry = context.createGain();
    dry.gain.value = s.dryMix;
    input.connect(dry).connect(output);

    // Static: looping noise through a narrow band, silent until setLevel.
    const noise = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
    const samples = noise.getChannelData(0);
    for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
    const hiss = context.createBufferSource();
    hiss.buffer = noise;
    hiss.loop = true;
    const hissBand = context.createBiquadFilter();
    hissBand.type = 'bandpass';
    hissBand.frequency.value = 2200;
    hissBand.Q.value = 0.5;
    const staticGain = context.createGain();
    staticGain.gain.value = 0;
    hiss.connect(hissBand).connect(staticGain).connect(output);
    hiss.start();

    this.graph = { context, input, staticGain };
    return this.graph;
  }
}
