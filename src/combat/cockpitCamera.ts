/**
 * The cockpit view's geometry: seeing the flat (2D) fight from the pilot's
 * seat, and turning a mouse position into a gun bearing (and back).
 *
 * The fight happens on a plane. The pilot's eye sits a little above it at
 * the ship's position, looking along the ship's heading; things can also
 * have a purely visual height (debris above and below, a raider's bob).
 * Projection is STARFALL's: camera space, then x·focal/z.
 *
 * Camera space: +x right of the nose, +y up, +z ahead.
 */
import { type Vec2, dot, sub, vec2 } from './vec2';

export interface CameraPoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface CockpitCamera {
  readonly pos: Vec2;
  readonly heading: number;
  /** Eye height above the fight's plane. */
  readonly eye: number;
}

export interface ScreenFrame {
  /** Screen centre of the view (the reticle), CSS pixels. */
  readonly cx: number;
  readonly cy: number;
  /** Pixels per unit at a distance of one unit. */
  readonly focal: number;
}

export interface Projected {
  readonly x: number;
  readonly y: number;
  /** Distance ahead. */
  readonly z: number;
  /** Pixels per world unit at that distance. */
  readonly scale: number;
}

/** Nothing closer than this is drawn (it would blow up to fill the screen). */
export const NEAR = 6;

/** The camera's forward and right directions on the plane. */
export function cockpitBasis(heading: number): { forward: Vec2; right: Vec2 } {
  return {
    forward: vec2(Math.cos(heading), Math.sin(heading)),
    // Headings grow clockwise on the map, so "right" is a quarter turn more.
    right: vec2(-Math.sin(heading), Math.cos(heading)),
  };
}

/** A point on the plane (plus a visual height) in camera space. */
export function toCamera(cam: CockpitCamera, point: Vec2, height = 0): CameraPoint {
  const { forward, right } = cockpitBasis(cam.heading);
  const q = sub(point, cam.pos);
  return { x: dot(q, right), y: height - cam.eye, z: dot(q, forward) };
}

/**
 * A direction in the sky (stars, the planet, the sun) in camera space:
 * `azimuth` is a map heading, `elevation` radians above the plane.
 */
export function skyToCamera(heading: number, azimuth: number, elevation: number): CameraPoint {
  const rel = azimuth - heading;
  const flat = Math.cos(elevation);
  return { x: flat * Math.sin(rel), y: Math.sin(elevation), z: flat * Math.cos(rel) };
}

/** Screen position of a camera-space point; null when behind the near plane. */
export function project(q: CameraPoint, frame: ScreenFrame, near = NEAR): Projected | null {
  if (q.z < near) return null;
  const scale = frame.focal / q.z;
  return { x: frame.cx + q.x * scale, y: frame.cy - q.y * scale, z: q.z, scale };
}

/**
 * The part of segment a→b in front of the near plane, or null if none is.
 * Lets a laser bolt that starts beside the pilot be drawn from the edge
 * of the view rather than vanishing.
 */
export function clipToNear(
  a: CameraPoint,
  b: CameraPoint,
  near = NEAR,
): [CameraPoint, CameraPoint] | null {
  if (a.z < near && b.z < near) return null;
  if (a.z >= near && b.z >= near) return [a, b];
  const t = (near - a.z) / (b.z - a.z);
  const cut = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: near };
  return a.z < near ? [cut, b] : [a, cut];
}

/**
 * Where `target` lies relative to the nose: 0 dead ahead, positive to the
 * right, ±π behind.
 */
export function bearing(cam: CockpitCamera, target: Vec2): number {
  const q = toCamera(cam, target);
  return Math.atan2(q.x, q.z);
}

/**
 * The bearing (radians right of straight ahead) of screen column `x`: the
 * inverse of projecting a point on the horizon. Used to aim the guns with
 * the mouse in the cockpit.
 */
export function screenBearing(x: number, frame: ScreenFrame): number {
  return Math.atan2(x - frame.cx, frame.focal);
}

/** The screen column of a bearing (radians right of ahead, within ±90°). */
export function bearingToScreenX(angle: number, frame: ScreenFrame): number {
  return frame.cx + Math.tan(angle) * frame.focal;
}
