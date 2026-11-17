/**
 * ShipHum - the ship's own sound, synthesized live (no audio file).
 *
 * A real ship is never silent. Three layers, all built from oscillators
 * and noise with Web Audio:
 * - **electrical**: a mains-style hum, a low fundamental plus a few
 *   harmonics, two slightly detuned copies beating slowly against each
 *   other so it never sounds like a test tone;
 * - **air**: life support moving air through ducts - deep filtered noise
 *   whose filter drifts slowly, like breathing;
 * - **rumble**: the drive - a sub-bass tone and very low noise, quiet when
 *   docked, swelling with the engines during a journey.
 *
 * It sits beside the author's ambience files rather than replacing them:
 * the amb_ship_hum folder still plays (or stays silent with its warning)
 * exactly as before. Where Web Audio is missing, the ship hum is simply
 * absent and says so once in the console.
 */
import { gameConfig } from '../config/gameConfig';

export interface ShipHumSettings {
  readonly enabled: boolean;
  /** Overall level, 0..1. */
  readonly level: number;
  /** Fundamental of the electrical hum, Hz (50 or 60 sound like mains). */
  readonly baseHz: number;
  readonly electricalLevel: number;
  readonly airLevel: number;
  /** Rumble when docked, and at full burn. */
  readonly rumbleIdle: number;
  readonly rumbleCruise: number;
  /** How much louder everything is at the engine end of the ship, 0..1. */
  readonly engineRoomBoost: number;
}

export interface HumState {
  /** Engine output, 0 docked .. 1 full cruise. */
  readonly engine: number;
  /** Where the listener is: 0 at the bow, 1 at the engine room. */
  readonly nearEngine: number;
}

export interface HumMix {
  readonly electrical: number;
  readonly air: number;
  readonly rumble: number;
  /** Cutoff of the air layer's filter, Hz: brighter when the engine works. */
  readonly airCutoffHz: number;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/**
 * The gain of each layer for a moment of play. Pure, so the mix can be
 * tested without Web Audio.
 */
export function humMix(state: HumState, s: ShipHumSettings = gameConfig.audio.shipHum): HumMix {
  const engine = clamp01(state.engine);
  const room = 1 + s.engineRoomBoost * clamp01(state.nearEngine);
  const level = s.enabled ? s.level : 0;
  return {
    electrical: level * s.electricalLevel * room,
    air: level * s.airLevel,
    rumble: level * (s.rumbleIdle + (s.rumbleCruise - s.rumbleIdle) * engine) * room,
    airCutoffHz: 320 + 260 * engine,
  };
}

/** Brown noise: random steps, leaky-integrated - a deep, soft rush. */
function brownNoise(context: BaseAudioContext, seconds: number): AudioBuffer {
  const length = Math.floor(context.sampleRate * seconds);
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < length; i++) {
    last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
    data[i] = last * 3.5;
  }
  // Fade the loop seam: the last samples lead back to the first.
  const fade = Math.min(length, 2048);
  for (let i = 0; i < fade; i++) {
    const t = i / fade;
    data[length - fade + i] = data[length - fade + i]! * (1 - t) + data[i]! * t;
  }
  return buffer;
}

interface Graph {
  readonly context: AudioContext;
  readonly electrical: GainNode;
  readonly air: GainNode;
  readonly airFilter: BiquadFilterNode;
  readonly rumble: GainNode;
}

/** Seconds for a level change to settle most of the way (no clicks). */
const SMOOTHING = 0.4;

export class ShipHum {
  private graph: Graph | null = null;
  private unavailable = false;

  constructor(private readonly settings: ShipHumSettings = gameConfig.audio.shipHum) {}

  /**
   * Call from a user gesture (browsers start audio suspended). Builds the
   * sound on first call; later calls just wake it.
   */
  resume(): void {
    if (!this.settings.enabled || this.unavailable) return;
    const graph = this.graph ?? this.build();
    graph?.context.resume().catch((error: unknown) => {
      console.warn('Drift audio: could not start the ship hum', error);
    });
  }

  /** Follow the game: call each update with the engine and listener state. */
  update(state: HumState): void {
    if (!this.graph) return;
    const mix = humMix(state, this.settings);
    const { context, electrical, air, airFilter, rumble } = this.graph;
    const now = context.currentTime;
    electrical.gain.setTargetAtTime(mix.electrical, now, SMOOTHING);
    air.gain.setTargetAtTime(mix.air, now, SMOOTHING);
    rumble.gain.setTargetAtTime(mix.rumble, now, SMOOTHING);
    airFilter.frequency.setTargetAtTime(mix.airCutoffHz, now, SMOOTHING * 3);
  }

  dispose(): void {
    if (!this.graph) return;
    this.graph.context.close().catch((error: unknown) => {
      console.warn('Drift audio: could not close the ship hum', error);
    });
    this.graph = null;
  }

  private build(): Graph | null {
    const Context = globalThis.AudioContext;
    if (typeof Context !== 'function') {
      this.unavailable = true;
      console.warn('Drift audio: Web Audio is not available; the ship hum is off');
      return null;
    }
    const context = new Context();
    const out = context.createGain();
    out.connect(context.destination);

    const layer = () => {
      const gain = context.createGain();
      gain.gain.value = 0; // fades in on the first update
      gain.connect(out);
      return gain;
    };
    const electrical = layer();
    const air = layer();
    const rumble = layer();

    // Electrical: fundamental twice (slightly detuned, slow beating), then
    // the 2nd and 3rd harmonics, the 3rd buzzier but filtered soft.
    const base = this.settings.baseHz;
    const tone = (type: OscillatorType, hz: number, gain: number, into: AudioNode) => {
      const osc = context.createOscillator();
      osc.type = type;
      osc.frequency.value = hz;
      const g = context.createGain();
      g.gain.value = gain;
      osc.connect(g).connect(into);
      osc.start();
    };
    const buzzFilter = context.createBiquadFilter();
    buzzFilter.type = 'lowpass';
    buzzFilter.frequency.value = 420;
    buzzFilter.connect(electrical);
    tone('sine', base, 0.5, electrical);
    tone('sine', base * 1.006, 0.35, electrical);
    tone('triangle', base * 2, 0.22, electrical);
    tone('sawtooth', base * 3, 0.08, buzzFilter);

    // Air: brown noise through a drifting low-pass.
    const noise = brownNoise(context, 6);
    const source = (into: AudioNode) => {
      const src = context.createBufferSource();
      src.buffer = noise;
      src.loop = true;
      src.connect(into);
      src.start(0, Math.random() * 5);
    };
    const airFilter = context.createBiquadFilter();
    airFilter.type = 'lowpass';
    airFilter.frequency.value = 320;
    airFilter.Q.value = 0.7;
    // A very slow swell of +-25 % on the air: the ventilation breathing.
    // Its own stage, so the swell scales with whatever level air is set to.
    const breathing = context.createGain();
    breathing.gain.value = 1;
    airFilter.connect(breathing).connect(air);
    source(airFilter);
    const breath = context.createOscillator();
    breath.frequency.value = 0.07;
    const breathDepth = context.createGain();
    breathDepth.gain.value = 0.25;
    breath.connect(breathDepth).connect(breathing.gain);
    breath.start();

    // Rumble: a sub tone plus the same noise, filtered very low.
    const rumbleFilter = context.createBiquadFilter();
    rumbleFilter.type = 'lowpass';
    rumbleFilter.frequency.value = 95;
    rumbleFilter.connect(rumble);
    source(rumbleFilter);
    tone('sine', base * 0.7, 0.6, rumble);

    this.graph = { context, electrical, air, airFilter, rumble };
    return this.graph;
  }
}
