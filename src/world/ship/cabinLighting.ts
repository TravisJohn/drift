import { MathUtils } from 'three';
import { gameConfig } from '../../config/gameConfig';

const settings = gameConfig.interior.powerSave;
const cycleDuration = settings.fadeDownSeconds + settings.dimSeconds + settings.fadeUpSeconds;
// Two seconds for "Power cooldown cycle in", then five spoken beats.
export const COUNTDOWN_SECONDS = 7;

export interface CabinPowerStatus {
  readonly automatic: boolean;
  readonly voice: boolean;
  readonly busy: boolean;
  readonly status: string;
}

export class CabinPowerCycle {
  private seconds = 0;
  private startAt: number | null = settings.intervalSeconds;
  private automatic = true;
  voice = true;

  advance(dt: number): void {
    this.seconds += dt;
    if (this.startAt !== null && this.seconds - this.startAt >= cycleDuration) {
      if (this.automatic) {
        const completed =
          1 + Math.floor((this.seconds - this.startAt - cycleDuration) / settings.intervalSeconds);
        this.startAt += completed * settings.intervalSeconds;
      } else this.startAt = null;
    }
  }

  private get untilStart(): number {
    return this.startAt === null ? Infinity : this.startAt - this.seconds;
  }

  private get busy(): boolean {
    return this.untilStart <= COUNTDOWN_SECONDS;
  }

  setAutomatic(enabled: boolean): void {
    if (this.automatic === enabled) return;
    this.automatic = enabled;
    // Finish any countdown already announced, including a manual cycle.
    if (!this.busy) this.startAt = enabled ? this.seconds + settings.intervalSeconds : null;
  }

  startNow(): void {
    if (!this.busy) this.startAt = this.seconds + COUNTDOWN_SECONDS;
  }

  get level(): number {
    return this.untilStart > 0 ? 1 : cabinLightLevel(settings.intervalSeconds - this.untilStart);
  }

  get voiceOffset(): number | null {
    const left = this.untilStart;
    return this.voice && left > 0 && left <= COUNTDOWN_SECONDS ? COUNTDOWN_SECONDS - left : null;
  }

  get snapshot(): CabinPowerStatus {
    const left = this.untilStart;
    let status = 'Full lighting';
    if (left <= 0)
      status =
        -left < cycleDuration - settings.fadeUpSeconds ? 'Conserving power' : 'Restoring lights';
    else if (Number.isFinite(left)) status = `Cooldown in ${Math.ceil(left)}s`;
    return { automatic: this.automatic, voice: this.voice, busy: this.busy, status };
  }
}

/** Common dimmer for room lighting. The first cycle begins two minutes into play. */
export function cabinLightLevel(playingSeconds: number): number {
  const { intervalSeconds, fadeDownSeconds, dimSeconds, fadeUpSeconds, minimumLight } =
    gameConfig.interior.powerSave;
  if (playingSeconds < intervalSeconds) return 1;

  const phase = playingSeconds % intervalSeconds;
  const riseStart = fadeDownSeconds + dimSeconds;
  const dim =
    MathUtils.smoothstep(phase, 0, fadeDownSeconds) *
    (1 - MathUtils.smoothstep(phase, riseStart, riseStart + fadeUpSeconds));
  return MathUtils.lerp(1, minimumLight, dim);
}
