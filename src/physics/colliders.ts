/**
 * Axis-aligned box colliders (architecture decision D1).
 *
 * The ship is built from grid-aligned boxes, so AABBs are the only collider
 * shape in the game. Colliders are pure data built once from the layout.
 */
import { type Vec3, vec3 } from './vec3';

export interface BoxCollider {
  readonly min: Vec3;
  readonly max: Vec3;
}

/** Create a box from its center and full size on each axis. */
export function boxFromCenterSize(center: Vec3, size: Vec3): BoxCollider {
  return {
    min: vec3(center.x - size.x / 2, center.y - size.y / 2, center.z - size.z / 2),
    max: vec3(center.x + size.x / 2, center.y + size.y / 2, center.z + size.z / 2),
  };
}

/** Closest point on/in the box to `point` (clamp on each axis). */
export function closestPointOnBox(point: Vec3, box: BoxCollider): Vec3 {
  return vec3(
    Math.min(Math.max(point.x, box.min.x), box.max.x),
    Math.min(Math.max(point.y, box.min.y), box.max.y),
    Math.min(Math.max(point.z, box.min.z), box.max.z),
  );
}

export function pointInsideBox(point: Vec3, box: BoxCollider): boolean {
  return (
    point.x > box.min.x &&
    point.x < box.max.x &&
    point.y > box.min.y &&
    point.y < box.max.y &&
    point.z > box.min.z &&
    point.z < box.max.z
  );
}

/**
 * Segment-vs-box intersection (slab method).
 *
 * Returns the parametric `t` in [0, 1] at which the segment from `start` to
 * `end` first enters the box, or null when it misses. Used by the follow
 * camera to pull in front of walls that would block the view.
 */
export function segmentEntersBoxAt(start: Vec3, end: Vec3, box: BoxCollider): number | null {
  const dir = { x: end.x - start.x, y: end.y - start.y, z: end.z - start.z };
  let tEnter = 0;
  let tExit = 1;

  const axes: ReadonlyArray<'x' | 'y' | 'z'> = ['x', 'y', 'z'];
  for (const axis of axes) {
    const s = start[axis];
    const d = dir[axis];
    const lo = box.min[axis];
    const hi = box.max[axis];
    if (Math.abs(d) < 1e-10) {
      if (s < lo || s > hi) return null; // parallel and outside the slab
      continue;
    }
    let t0 = (lo - s) / d;
    let t1 = (hi - s) / d;
    if (t0 > t1) [t0, t1] = [t1, t0];
    tEnter = Math.max(tEnter, t0);
    tExit = Math.min(tExit, t1);
    if (tEnter > tExit) return null;
  }
  return tEnter;
}
