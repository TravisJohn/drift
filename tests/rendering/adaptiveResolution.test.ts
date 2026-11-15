import { describe, expect, it } from 'vitest';
import { AdaptiveResolution } from '../../src/rendering/adaptiveResolution';

const OPTIONS = { targetFps: 60, minScale: 0.6, maxScale: 1, windowFrames: 10, holdSeconds: 2 };
const FAST = 1000 / 60;
const SLOW = 1000 / 35;

/** Feed `count` frames of `ms`; return every scale change reported. */
function feed(r: AdaptiveResolution, ms: number, count: number): number[] {
  const changes: number[] = [];
  for (let i = 0; i < count; i++) {
    const next = r.sample(ms);
    if (next !== null) changes.push(next);
  }
  return changes;
}

describe('AdaptiveResolution (smooth on any graphics hardware)', () => {
  it('starts sharp and stays sharp while frames are on time', () => {
    const r = new AdaptiveResolution(OPTIONS);
    expect(r.scale).toBe(1);
    expect(feed(r, FAST, 600)).toEqual([]);
    expect(r.scale).toBe(1);
  });

  it('lowers the resolution when frames run slow', () => {
    const r = new AdaptiveResolution(OPTIONS);
    const changes = feed(r, SLOW, 10);
    expect(changes).toHaveLength(1);
    expect(r.scale).toBeLessThan(1);
  });

  it('never goes below the minimum, however slow the machine', () => {
    const r = new AdaptiveResolution(OPTIONS);
    feed(r, SLOW, 1000);
    expect(r.scale).toBe(0.6);
  });

  it('judges a whole window of frames, not one hiccup', () => {
    const r = new AdaptiveResolution(OPTIONS);
    feed(r, FAST, 9);
    expect(r.sample(40)).toBeNull(); // one slow frame in ten: average still fine
    expect(r.scale).toBe(1);
  });

  it('ignores stalls such as a tab switch: they say nothing about the GPU', () => {
    const r = new AdaptiveResolution(OPTIONS);
    for (let i = 0; i < 50; i++) expect(r.sample(900)).toBeNull();
    expect(r.scale).toBe(1);
  });

  it('sharpens again once there is headroom, but only after holding steady', () => {
    const r = new AdaptiveResolution(OPTIONS);
    feed(r, SLOW, 10);
    const lowered = r.scale;
    // Under the 2 s hold: fast frames must not raise it yet.
    feed(r, FAST, 60);
    expect(r.scale).toBe(lowered);
    feed(r, FAST, 120);
    expect(r.scale).toBeGreaterThan(lowered);
  });

  it('stops hunting: a step up that cannot be held makes it wait longer next time', () => {
    const r = new AdaptiveResolution(OPTIONS);
    feed(r, SLOW, 10); // drop
    feed(r, FAST, 130); // hold passes -> step up (trial)
    const raised = r.scale;
    feed(r, SLOW, 10); // the step up failed -> drop, hold doubles to 4 s
    expect(r.scale).toBeLessThan(raised);
    const dropped = r.scale;
    feed(r, FAST, 180); // 3 s: longer than the old hold, shorter than the new
    expect(r.scale).toBe(dropped);
    feed(r, FAST, 120); // past 4 s
    expect(r.scale).toBeGreaterThan(dropped);
  });

  it('rejects impossible settings (fail loud)', () => {
    expect(() => new AdaptiveResolution({ ...OPTIONS, minScale: 0 })).toThrow();
    expect(() => new AdaptiveResolution({ ...OPTIONS, minScale: 2 })).toThrow();
    expect(() => new AdaptiveResolution({ ...OPTIONS, targetFps: 0 })).toThrow();
  });
});
