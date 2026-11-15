import { describe, expect, it } from 'vitest';
import { advanceStars, createStarPositions, mulberry32 } from '../../src/world/space/starfield';

const EXTENT = 100;
const CLEAR = 20;

describe('mulberry32', () => {
  it('is deterministic for a given seed and yields values in [0,1)', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 100; i++) {
      const value = a();
      expect(value).toBe(b());
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('different seeds give different sequences', () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    const streamA = Array.from({ length: 8 }, () => a());
    const streamB = Array.from({ length: 8 }, () => b());
    expect(streamA).not.toEqual(streamB);
  });
});

describe('createStarPositions', () => {
  it('places every star inside the cube but outside the clear zone', () => {
    const positions = createStarPositions(500, EXTENT, CLEAR, mulberry32(7));
    expect(positions.length).toBe(1500);
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i] ?? NaN;
      const y = positions[i + 1] ?? NaN;
      const z = positions[i + 2] ?? NaN;
      expect(Math.abs(x)).toBeLessThanOrEqual(EXTENT);
      expect(Math.abs(y)).toBeLessThanOrEqual(EXTENT);
      expect(Math.abs(z)).toBeLessThanOrEqual(EXTENT);
      expect(Math.hypot(x, y, z)).toBeGreaterThanOrEqual(CLEAR);
    }
  });

  it('is deterministic: same seed, same sky', () => {
    const a = createStarPositions(50, EXTENT, CLEAR, mulberry32(9));
    const b = createStarPositions(50, EXTENT, CLEAR, mulberry32(9));
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it('rejects impossible inputs (fail loud)', () => {
    expect(() => createStarPositions(0, EXTENT, CLEAR, mulberry32(1))).toThrow();
    expect(() => createStarPositions(10, EXTENT, EXTENT, mulberry32(1))).toThrow();
  });
});

describe('advanceStars', () => {
  it('moves stars along +Z by dz', () => {
    const positions = new Float32Array([0, 0, 10, 5, -5, -30]);
    advanceStars(positions, 7, EXTENT);
    expect(positions[2]).toBeCloseTo(17, 4);
    expect(positions[5]).toBeCloseTo(-23, 4);
    // x and y untouched
    expect(positions[0]).toBe(0);
    expect(positions[3]).toBe(5);
  });

  it('wraps past the far edge back to the near edge (endless field)', () => {
    const positions = new Float32Array([0, 0, 95]);
    advanceStars(positions, 20, EXTENT);
    expect(positions[2]).toBeCloseTo(-85, 4);
  });

  it('stays within [-extent, extent) even after a huge jump', () => {
    const positions = createStarPositions(100, EXTENT, CLEAR, mulberry32(3));
    advanceStars(positions, 12345.6, EXTENT);
    for (let i = 2; i < positions.length; i += 3) {
      expect(positions[i]).toBeGreaterThanOrEqual(-EXTENT);
      expect(positions[i]).toBeLessThan(EXTENT);
    }
  });

  it('rejects a non-positive extent (fail loud)', () => {
    expect(() => advanceStars(new Float32Array(3), 1, 0)).toThrow();
  });
});
