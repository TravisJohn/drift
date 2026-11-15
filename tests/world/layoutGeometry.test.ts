import { describe, expect, it } from 'vitest';
import type { RoomSpec } from '../../src/content/shipLayout';
import {
  exteriorSpans,
  segmentWall,
  sharedEdge,
  subtractIntervals,
} from '../../src/world/ship/layoutGeometry';

const room = (id: string, minX: number, maxX: number, minZ: number, maxZ: number): RoomSpec =>
  ({ id, name: id, minX, maxX, minZ, maxZ }) as unknown as RoomSpec;

describe('sharedEdge', () => {
  it('finds a z-axis edge between east-west neighbors with the overlap span', () => {
    const a = room('a', -4, 0, 0, 6);
    const b = room('b', 0, 4, 2, 10);
    expect(sharedEdge(a, b)).toEqual({ axis: 'z', at: 0, span: { start: 2, end: 6 } });
  });

  it('finds an x-axis edge between north-south neighbors, in either order', () => {
    const a = room('a', -5, 5, -10, -4);
    const b = room('b', -2, 2, -4, 0);
    expect(sharedEdge(a, b)).toEqual({ axis: 'x', at: -4, span: { start: -2, end: 2 } });
    expect(sharedEdge(b, a)).toEqual({ axis: 'x', at: -4, span: { start: -2, end: 2 } });
  });

  it('returns null for rooms that only touch at a corner', () => {
    const a = room('a', 0, 4, 0, 4);
    const b = room('b', 4, 8, 4, 8);
    expect(sharedEdge(a, b)).toBeNull();
  });

  it('returns null for separated rooms', () => {
    const a = room('a', 0, 4, 0, 4);
    const b = room('b', 10, 14, 0, 4);
    expect(sharedEdge(a, b)).toBeNull();
  });
});

describe('subtractIntervals', () => {
  const span = { start: 0, end: 10 };

  it('returns the whole span with no holes', () => {
    expect(subtractIntervals(span, [])).toEqual([{ start: 0, end: 10 }]);
  });

  it('splits around a middle hole', () => {
    expect(subtractIntervals(span, [{ start: 4, end: 6 }])).toEqual([
      { start: 0, end: 4 },
      { start: 6, end: 10 },
    ]);
  });

  it('handles holes at the edges and clamps holes beyond the span', () => {
    expect(
      subtractIntervals(span, [
        { start: -5, end: 2 },
        { start: 8, end: 15 },
      ]),
    ).toEqual([{ start: 2, end: 8 }]);
  });

  it('handles multiple unsorted holes', () => {
    expect(
      subtractIntervals(span, [
        { start: 7, end: 8 },
        { start: 1, end: 2 },
      ]),
    ).toEqual([
      { start: 0, end: 1 },
      { start: 2, end: 7 },
      { start: 8, end: 10 },
    ]);
  });

  it('returns nothing when a hole covers the span', () => {
    expect(subtractIntervals(span, [{ start: 0, end: 10 }])).toEqual([]);
  });
});

describe('segmentWall', () => {
  const span = { start: -5, end: 5 };
  const H = 3.2;

  it('a wall without openings is one full piece', () => {
    expect(segmentWall(span, H, [])).toEqual([{ start: -5, end: 5, bottom: 0, top: H }]);
  });

  it('a door opening makes left + right pieces and a lintel (no sill)', () => {
    const pieces = segmentWall(span, H, [{ center: 0, width: 1.6, bottom: 0, top: 2.3 }]);
    expect(pieces).toContainEqual({ start: -5, end: -0.8, bottom: 0, top: H });
    expect(pieces).toContainEqual({ start: 0.8, end: 5, bottom: 0, top: H });
    expect(pieces).toContainEqual({ start: -0.8, end: 0.8, bottom: 2.3, top: H });
    expect(pieces).toHaveLength(3);
  });

  it('a window opening makes left + right + sill + lintel', () => {
    const pieces = segmentWall(span, H, [{ center: 1, width: 3, bottom: 0.9, top: 2.4 }]);
    expect(pieces).toHaveLength(4);
    expect(pieces).toContainEqual({ start: -0.5, end: 2.5, bottom: 0, top: 0.9 });
    expect(pieces).toContainEqual({ start: -0.5, end: 2.5, bottom: 2.4, top: H });
  });

  it('handles two disjoint openings', () => {
    const pieces = segmentWall(span, H, [
      { center: -2.5, width: 1.6, bottom: 0, top: 2.3 },
      { center: 2.5, width: 1.6, bottom: 0.9, top: 2.4 },
    ]);
    // solids: left, middle, right + door lintel + window sill + window lintel
    expect(pieces).toHaveLength(6);
  });

  it('an opening flush with the span start produces no zero-width piece', () => {
    const pieces = segmentWall(span, H, [{ center: -4.2, width: 1.6, bottom: 0, top: 2.3 }]);
    for (const p of pieces) {
      expect(p.end - p.start).toBeGreaterThan(1e-6);
      expect(p.top - p.bottom).toBeGreaterThan(1e-6);
    }
  });
});

describe('exteriorSpans', () => {
  // corridor flanked by lab (west, partial) - like the real ship.
  const corridor = room('corridor', -1.5, 1.5, -10, 6);
  const lab = room('lab', -9.5, -1.5, -8, -2);
  const cryo = room('cryo', -9.5, -1.5, 0, 6);

  it('subtracts shared edges, leaving the exterior parts', () => {
    const spans = exteriorSpans(corridor, 'west', [corridor, lab, cryo]);
    expect(spans).toEqual([
      { start: -10, end: -8 },
      { start: -2, end: 0 },
    ]);
  });

  it('a fully exterior side is returned whole', () => {
    const spans = exteriorSpans(lab, 'west', [corridor, lab, cryo]);
    expect(spans).toEqual([{ start: -8, end: -2 }]);
  });

  it('a fully shared side has no exterior spans', () => {
    const bridge = room('bridge', -1.5, 1.5, -14, -10);
    const spans = exteriorSpans(bridge, 'south', [bridge, corridor]);
    expect(spans).toEqual([]);
  });
});
