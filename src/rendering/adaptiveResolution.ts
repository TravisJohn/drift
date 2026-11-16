/**
 * AdaptiveResolution - keeps the game smooth on any graphics hardware by
 * trading sharpness for speed.
 *
 * It watches how long frames take. When they run slow it lowers the
 * number of pixels drawn (the picture gets a little softer); when there is
 * clear headroom it raises it again, carefully. Pure logic: feed it frame
 * times, read back a scale. The caller applies the scale to the renderer.
 */
export interface AdaptiveResolutionOptions {
  readonly targetFps: number;
  /** Lowest and highest pixel ratio it may choose. */
  readonly minScale: number;
  readonly maxScale: number;
  /** Frames averaged before each decision. */
  readonly windowFrames: number;
  /** Seconds to wait after any change before trying to go sharper. */
  readonly holdSeconds: number;
}

/** A frame this slow is a stall (tab switch, load), not a slow GPU. */
const STALL_MS = 250;
/** Slower than target by this factor: drop resolution. */
const SLOW_FACTOR = 1.18;
/** Within this factor of target: fast enough to try sharper. */
const FAST_FACTOR = 1.06;
const STEP_DOWN = 0.85;
const STEP_UP = 1.1;
const MAX_HOLD_SECONDS = 120;

export class AdaptiveResolution {
  private current: number;
  private sum = 0;
  private frames = 0;
  private sinceChange = 0;
  private hold: number;
  /** True while a step up is on trial: a drop right after means it failed. */
  private trialUp = false;
  /** The sharpest setting worth trying; lowered by calibrate(). */
  private ceiling: number;

  constructor(private readonly options: AdaptiveResolutionOptions) {
    if (options.minScale <= 0 || options.maxScale < options.minScale || options.targetFps <= 0) {
      throw new Error('AdaptiveResolution: need 0 < minScale <= maxScale and targetFps > 0');
    }
    this.current = options.maxScale;
    this.ceiling = options.maxScale;
    this.hold = options.holdSeconds;
  }

  /**
   * Start from a measured setting (see renderScale.fitRenderScale). It
   * also becomes the ceiling: there is no point trying sharper than what
   * was just measured to be the limit, and every failed try is a hitch.
   */
  calibrate(scale: number): number {
    const { minScale, maxScale } = this.options;
    this.ceiling = Math.min(maxScale, Math.max(minScale, scale));
    this.current = this.ceiling;
    this.sum = 0;
    this.frames = 0;
    this.sinceChange = 0;
    this.hold = this.options.holdSeconds;
    this.trialUp = false;
    return this.current;
  }

  get scale(): number {
    return this.current;
  }

  /**
   * Record one frame's duration. Returns the new scale when it changed,
   * otherwise null.
   */
  sample(frameMs: number): number | null {
    if (frameMs <= 0 || frameMs > STALL_MS) {
      // Not a measurement of rendering speed: start the window over.
      this.sum = 0;
      this.frames = 0;
      return null;
    }
    this.sum += frameMs;
    this.frames++;
    this.sinceChange += frameMs / 1000;
    if (this.frames < this.options.windowFrames) return null;

    const average = this.sum / this.frames;
    this.sum = 0;
    this.frames = 0;
    const budget = 1000 / this.options.targetFps;

    if (average > budget * SLOW_FACTOR) {
      if (this.trialUp) {
        // The last step up could not be held: wait longer before retrying.
        this.hold = Math.min(MAX_HOLD_SECONDS, this.hold * 2);
      }
      this.trialUp = false;
      return this.change(Math.max(this.options.minScale, this.current * STEP_DOWN));
    }

    this.trialUp = false;
    if (average < budget * FAST_FACTOR && this.sinceChange >= this.hold) {
      const next = this.change(Math.min(this.ceiling, this.current * STEP_UP));
      if (next !== null) this.trialUp = true;
      return next;
    }
    return null;
  }

  private change(next: number): number | null {
    if (Math.abs(next - this.current) < 1e-6) return null;
    this.current = next;
    this.sinceChange = 0;
    return next;
  }
}
