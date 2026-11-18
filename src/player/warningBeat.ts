/**
 * WarningBeat - the rhythm of the drone's tether alarm.
 *
 * One beat drives both the antenna flash and the beep, so they always land
 * together. Beats come slowly when the drone first strains at its tether
 * and faster as it nears the limit, like a parking sensor. The first beat
 * fires the moment the strain begins, so the warning is never late.
 *
 * Pure (no Three.js, no Web Audio): the game steps it, droneVisual reads
 * `flash`, and the beep plays whenever `update` reports a beat.
 */
import { gameConfig } from '../config/gameConfig';

export interface WarningBeatSettings {
  /** Seconds between beats when the strain has just begun. */
  readonly slowInterval: number;
  /** Seconds between beats at the tether limit. */
  readonly fastInterval: number;
  /** How long each antenna flash takes to fade, seconds. */
  readonly flashSeconds: number;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Seconds between beats for a strain of 0..1 (strain 0 never beats). */
export function beatInterval(strain: number, s: WarningBeatSettings): number {
  return s.slowInterval + (s.fastInterval - s.slowInterval) * clamp01(strain);
}

export class WarningBeat {
  /** Seconds since the last beat; null while there is no strain. */
  private sinceBeat: number | null = null;

  constructor(private readonly settings: WarningBeatSettings = gameConfig.droneLook.warningBeat) {
    if (!(settings.fastInterval > 0 && settings.fastInterval <= settings.slowInterval)) {
      throw new Error('WarningBeat: need 0 < fastInterval <= slowInterval');
    }
  }

  /** Advance by `dt` seconds at this strain; true when a beat (a beep) falls in this step. */
  update(dt: number, strain: number): boolean {
    if (strain <= 0) {
      this.sinceBeat = null;
      return false;
    }
    if (this.sinceBeat === null) {
      this.sinceBeat = 0;
      return true;
    }
    this.sinceBeat += dt;
    if (this.sinceBeat >= beatInterval(strain, this.settings)) {
      this.sinceBeat = 0;
      return true;
    }
    return false;
  }

  /** Antenna flash, 0..1: full at each beat, fading over `flashSeconds`. */
  get flash(): number {
    if (this.sinceBeat === null) return 0;
    const t = clamp01(1 - this.sinceBeat / this.settings.flashSeconds);
    return t * t;
  }
}
