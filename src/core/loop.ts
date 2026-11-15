/**
 * Fixed-timestep game loop (architecture decision D8).
 *
 * Logic updates at a fixed rate (default 60 Hz) regardless of display frame
 * rate; rendering runs once per animation frame and receives an interpolation
 * factor `alpha` in [0, 1) describing how far we are between the previous and
 * next logic step. Movement therefore behaves identically on a 30 Hz laptop
 * and a 144 Hz monitor, and logic is deterministic under test.
 */

export interface LoopCallbacks {
  /** Advance simulation by a fixed dt, in seconds. */
  update: (dtSeconds: number) => void;
  /** Draw the current state. `alpha` interpolates between logic steps. */
  render: (alpha: number) => void;
}

export interface LoopOptions {
  updateHz?: number;
  maxCatchUpSteps?: number;
  /** Frame scheduler; defaults to requestAnimationFrame. Injectable for tests. */
  schedule?: (cb: (timeMs: number) => void) => number;
  /** Cancels a scheduled frame; defaults to cancelAnimationFrame. */
  cancel?: (id: number) => void;
}

export class GameLoop {
  private readonly callbacks: LoopCallbacks;
  private readonly stepMs: number;
  private readonly maxCatchUpSteps: number;
  private readonly schedule: (cb: (timeMs: number) => void) => number;
  private readonly cancel: (id: number) => void;

  private running = false;
  private frameId: number | null = null;
  private lastTimeMs: number | null = null;
  private accumulatorMs = 0;

  constructor(callbacks: LoopCallbacks, options: LoopOptions = {}) {
    const updateHz = options.updateHz ?? 60;
    if (updateHz <= 0) {
      throw new Error(`GameLoop: updateHz must be positive, got ${updateHz}`);
    }
    this.callbacks = callbacks;
    this.stepMs = 1000 / updateHz;
    this.maxCatchUpSteps = options.maxCatchUpSteps ?? 5;
    this.schedule = options.schedule ?? ((cb) => requestAnimationFrame(cb));
    this.cancel = options.cancel ?? ((id) => cancelAnimationFrame(id));
  }

  get isRunning(): boolean {
    return this.running;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTimeMs = null; // first frame establishes the time base
    this.accumulatorMs = 0;
    this.frameId = this.schedule(this.tick);
  }

  stop(): void {
    this.running = false;
    if (this.frameId !== null) {
      this.cancel(this.frameId);
      this.frameId = null;
    }
  }

  private readonly tick = (timeMs: number): void => {
    if (!this.running) return;

    if (this.lastTimeMs === null) {
      // First frame: no elapsed time yet, just establish the base and draw.
      this.lastTimeMs = timeMs;
      this.callbacks.render(0);
      this.frameId = this.schedule(this.tick);
      return;
    }

    this.accumulatorMs += timeMs - this.lastTimeMs;
    this.lastTimeMs = timeMs;

    // Cap catch-up work after a stall (e.g. backgrounded tab): beyond the
    // cap we drop the excess time rather than freezing in a catch-up spiral.
    const maxAccumulatedMs = this.stepMs * this.maxCatchUpSteps;
    if (this.accumulatorMs > maxAccumulatedMs) {
      this.accumulatorMs = maxAccumulatedMs;
    }

    // Epsilon absorbs float error at exact step boundaries (a frame that is
    // a few ULPs short of a full step still counts as one).
    const EPSILON_MS = 1e-6;
    const steps = Math.floor((this.accumulatorMs + EPSILON_MS) / this.stepMs);
    const dtSeconds = this.stepMs / 1000;
    for (let i = 0; i < steps; i++) {
      this.callbacks.update(dtSeconds);
    }
    this.accumulatorMs = Math.max(0, this.accumulatorMs - steps * this.stepMs);

    this.callbacks.render(this.accumulatorMs / this.stepMs);
    this.frameId = this.schedule(this.tick);
  };
}
