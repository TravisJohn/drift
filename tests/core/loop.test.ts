import { describe, expect, it, vi } from 'vitest';
import { GameLoop, type LoopCallbacks } from '../../src/core/loop';

/**
 * Drives the loop with hand-crafted frame timestamps instead of
 * requestAnimationFrame, so simulated time is fully controlled.
 */
function makeHarness(options: { updateHz?: number; maxCatchUpSteps?: number } = {}) {
  let pending: ((timeMs: number) => void) | null = null;
  const update = vi.fn();
  const render = vi.fn();
  const callbacks: LoopCallbacks = { update, render };

  const loop = new GameLoop(callbacks, {
    ...options,
    schedule: (cb) => {
      pending = cb;
      return 1;
    },
    cancel: () => {
      pending = null;
    },
  });

  /** Fire the next scheduled frame at an absolute timestamp (ms). */
  function frame(timeMs: number): void {
    const cb = pending;
    pending = null;
    if (!cb) throw new Error('no frame scheduled');
    cb(timeMs);
  }

  return { loop, frame, update, render, hasPending: () => pending !== null };
}

describe('GameLoop fixed timestep', () => {
  it('runs zero updates on the first frame because no time has elapsed yet', () => {
    const h = makeHarness();
    h.loop.start();
    h.frame(1000);
    expect(h.update).not.toHaveBeenCalled();
    expect(h.render).toHaveBeenCalledOnce(); // still draws the initial state
  });

  it('runs exactly one update per 60Hz step of elapsed time', () => {
    const h = makeHarness({ updateHz: 60 });
    h.loop.start();
    h.frame(1000);
    h.frame(1000 + 1000 / 60); // exactly one step later
    expect(h.update).toHaveBeenCalledTimes(1);
    expect(h.update).toHaveBeenCalledWith(1 / 60);
  });

  it('accumulates fractional frames until a full step is reached (144Hz display)', () => {
    const h = makeHarness({ updateHz: 60 });
    h.loop.start();
    h.frame(0);
    // ~6.94ms frames: after two frames (13.9ms) still < 16.67ms -> 0 updates
    h.frame(6.94);
    h.frame(13.88);
    expect(h.update).not.toHaveBeenCalled();
    // third frame crosses the step boundary -> exactly 1 update
    h.frame(20.82);
    expect(h.update).toHaveBeenCalledTimes(1);
  });

  it('runs multiple updates after a slow frame (30Hz display keeps 60Hz logic)', () => {
    const h = makeHarness({ updateHz: 60 });
    h.loop.start();
    h.frame(0);
    h.frame(33.34); // one 30Hz frame = two 60Hz steps
    expect(h.update).toHaveBeenCalledTimes(2);
  });

  it('caps catch-up updates after a long stall instead of spiraling', () => {
    const h = makeHarness({ updateHz: 60, maxCatchUpSteps: 5 });
    h.loop.start();
    h.frame(0);
    h.frame(5000); // tab was backgrounded for 5s = 300 steps of debt
    expect(h.update).toHaveBeenCalledTimes(5); // capped, excess time dropped
  });

  it('passes render an interpolation alpha in [0, 1)', () => {
    const h = makeHarness({ updateHz: 60 });
    h.loop.start();
    h.frame(0);
    h.frame(25); // 1.5 steps -> 1 update, 0.5 steps left over
    const alpha = h.render.mock.calls.at(-1)?.[0] as number;
    expect(alpha).toBeGreaterThanOrEqual(0);
    expect(alpha).toBeLessThan(1);
    expect(alpha).toBeCloseTo(0.5, 1);
  });

  it('stop() cancels the scheduled frame and halts updates', () => {
    const h = makeHarness();
    h.loop.start();
    h.frame(0);
    expect(h.hasPending()).toBe(true);
    h.loop.stop();
    expect(h.hasPending()).toBe(false);
    expect(h.loop.isRunning).toBe(false);
  });

  it('start() is idempotent while running', () => {
    const h = makeHarness();
    h.loop.start();
    h.loop.start();
    h.frame(0);
    expect(h.render).toHaveBeenCalledTimes(1);
  });

  it('restarting after stop() re-establishes the time base (no giant dt)', () => {
    const h = makeHarness({ updateHz: 60, maxCatchUpSteps: 5 });
    h.loop.start();
    h.frame(0);
    h.frame(16.67);
    expect(h.update).toHaveBeenCalledTimes(1);
    h.loop.stop();
    h.loop.start();
    h.frame(99999); // long wall-clock gap while stopped
    expect(h.update).toHaveBeenCalledTimes(1); // no catch-up burst from the gap
  });

  it('rejects a non-positive updateHz', () => {
    expect(() => new GameLoop({ update: () => {}, render: () => {} }, { updateHz: 0 })).toThrow(
      /updateHz/,
    );
  });
});
