/**
 * WarningBeep - the drone's tether alarm, a short electronic beep.
 *
 * Synthesized live (no audio file): two sine tones a fifth apart with a
 * fast attack and a quick decay, so it reads as a device chirp rather
 * than a test tone. Pitch climbs a little as the strain grows. The beep
 * comes from the drone itself, so it is heard even out in vacuum.
 *
 * Where Web Audio is missing it stays silent and says so once.
 */
import { gameConfig } from '../config/gameConfig';

export interface WarningBeepSettings {
  readonly enabled: boolean;
  /** Peak level, 0..1. */
  readonly level: number;
  /** Pitch at the first sign of strain, and at the limit, Hz. */
  readonly lowHz: number;
  readonly highHz: number;
  readonly durationSeconds: number;
}

export interface BeepTone {
  readonly frequencyHz: number;
  readonly gain: number;
  readonly durationSeconds: number;
}

/** The beep for a strain of 0..1. Pure, so it can be tested without Web Audio. */
export function beepTone(
  strain: number,
  s: WarningBeepSettings = gameConfig.audio.warningBeep,
): BeepTone {
  const k = Math.min(1, Math.max(0, strain));
  return {
    frequencyHz: s.lowHz + (s.highHz - s.lowHz) * k,
    gain: s.enabled ? s.level * (0.75 + 0.25 * k) : 0,
    durationSeconds: s.durationSeconds,
  };
}

/** Second partial, a fifth above: gives the beep its "device" colour. */
const FIFTH = 1.5;

export class WarningBeep {
  private context: AudioContext | null = null;
  private unavailable = false;

  constructor(private readonly settings: WarningBeepSettings = gameConfig.audio.warningBeep) {}

  /** Call from a user gesture (browsers start audio suspended). */
  resume(): void {
    const context = this.ensureContext();
    context?.resume().catch((error: unknown) => {
      console.warn('Drift audio: could not start the warning beep', error);
    });
  }

  /** Play one beep for this strain. */
  beep(strain: number): void {
    const tone = beepTone(strain, this.settings);
    if (tone.gain <= 0) return;
    const context = this.ensureContext();
    if (!context || context.state !== 'running') return;

    const start = context.currentTime;
    const end = start + tone.durationSeconds;
    const envelope = context.createGain();
    envelope.gain.setValueAtTime(0, start);
    envelope.gain.linearRampToValueAtTime(tone.gain, start + 0.004);
    envelope.gain.exponentialRampToValueAtTime(0.0001, end);
    envelope.connect(context.destination);

    // Both partials stop together; the first to end tidies the whole beep.
    const nodes: AudioNode[] = [envelope];
    for (const [ratio, share] of [
      [1, 1],
      [FIFTH, 0.35],
    ] as const) {
      const osc = context.createOscillator();
      const partGain = context.createGain();
      osc.type = 'sine';
      osc.frequency.value = tone.frequencyHz * ratio;
      partGain.gain.value = share;
      osc.connect(partGain).connect(envelope);
      osc.start(start);
      osc.stop(end + 0.02);
      nodes.push(osc, partGain);
      osc.onended = () => {
        for (const node of nodes) node.disconnect();
      };
    }
  }

  dispose(): void {
    this.context?.close().catch((error: unknown) => {
      console.warn('Drift audio: could not close the warning beep', error);
    });
    this.context = null;
  }

  private ensureContext(): AudioContext | null {
    if (!this.settings.enabled || this.unavailable) return null;
    if (this.context) return this.context;
    const Context = globalThis.AudioContext;
    if (typeof Context !== 'function') {
      this.unavailable = true;
      console.warn('Drift audio: Web Audio is not available; the warning beep is off');
      return null;
    }
    this.context = new Context();
    return this.context;
  }
}
