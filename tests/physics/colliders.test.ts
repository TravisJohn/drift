import { describe, expect, it } from 'vitest';
import {
  boxFromCenterSize,
  closestPointOnBox,
  pointInsideBox,
  segmentEntersBoxAt,
} from '../../src/physics/colliders';
import { vec3 } from '../../src/physics/vec3';

describe('boxFromCenterSize', () => {
  it('builds min/max from center and size', () => {
    const box = boxFromCenterSize(vec3(1, 2, 3), vec3(2, 4, 6));
    expect(box.min).toEqual(vec3(0, 0, 0));
    expect(box.max).toEqual(vec3(2, 4, 6));
  });
});

describe('closestPointOnBox', () => {
  const box = boxFromCenterSize(vec3(0, 0, 0), vec3(2, 2, 2));

  it('returns the point itself when inside', () => {
    expect(closestPointOnBox(vec3(0.3, -0.2, 0.5), box)).toEqual(vec3(0.3, -0.2, 0.5));
  });

  it('clamps to the nearest face for an outside point', () => {
    expect(closestPointOnBox(vec3(5, 0, 0), box)).toEqual(vec3(1, 0, 0));
  });

  it('clamps to a corner when outside on all axes', () => {
    expect(closestPointOnBox(vec3(5, 5, 5), box)).toEqual(vec3(1, 1, 1));
  });
});

describe('pointInsideBox', () => {
  const box = boxFromCenterSize(vec3(0, 0, 0), vec3(2, 2, 2));

  it('is true strictly inside and false outside', () => {
    expect(pointInsideBox(vec3(0, 0, 0), box)).toBe(true);
    expect(pointInsideBox(vec3(2, 0, 0), box)).toBe(false);
  });

  it('treats the surface as outside (boundary is not penetration)', () => {
    expect(pointInsideBox(vec3(1, 0, 0), box)).toBe(false);
  });
});

describe('segmentEntersBoxAt (camera occlusion ray)', () => {
  const wall = boxFromCenterSize(vec3(0, 0, 5), vec3(10, 10, 1)); // z in [4.5, 5.5]

  it('returns entry t where the segment crosses the box', () => {
    const t = segmentEntersBoxAt(vec3(0, 0, 0), vec3(0, 0, 10), wall);
    expect(t).toBeCloseTo(0.45, 5);
  });

  it('returns null when the segment stops short of the box', () => {
    expect(segmentEntersBoxAt(vec3(0, 0, 0), vec3(0, 0, 4), wall)).toBeNull();
  });

  it('returns null when the segment misses sideways', () => {
    expect(segmentEntersBoxAt(vec3(20, 0, 0), vec3(20, 0, 10), wall)).toBeNull();
  });

  it('returns 0 when the segment starts inside the box', () => {
    expect(segmentEntersBoxAt(vec3(0, 0, 5), vec3(0, 0, 10), wall)).toBe(0);
  });

  it('handles axis-parallel segments inside the slab', () => {
    const t = segmentEntersBoxAt(vec3(-10, 0, 5), vec3(10, 0, 5), wall);
    expect(t).toBeCloseTo(0.25, 5); // enters at x = -5
  });
});
