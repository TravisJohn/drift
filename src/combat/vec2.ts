/**
 * Small immutable 2D vectors for the tactical combat view.
 *
 * Plain objects, like physics/vec3.ts: cheap to create, easy to compare in
 * tests. +x is right, +y is down the screen; angle 0 points along +x and
 * angles grow clockwise on screen (canvas convention).
 */

export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

export const vec2 = (x = 0, y = 0): Vec2 => ({ x, y });
export const add = (a: Vec2, b: Vec2): Vec2 => vec2(a.x + b.x, a.y + b.y);
export const sub = (a: Vec2, b: Vec2): Vec2 => vec2(a.x - b.x, a.y - b.y);
export const scale = (a: Vec2, s: number): Vec2 => vec2(a.x * s, a.y * s);
export const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y;
export const length = (a: Vec2): number => Math.hypot(a.x, a.y);
export const distance = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);

/** Unit vector in the same direction; the zero vector stays zero. */
export function normalize(a: Vec2): Vec2 {
  const len = length(a);
  return len > 0 ? scale(a, 1 / len) : vec2();
}

/** Unit vector pointing along `angle` (radians). */
export const fromAngle = (angle: number): Vec2 => vec2(Math.cos(angle), Math.sin(angle));

/** Direction of `a` as an angle (radians). */
export const angleOf = (a: Vec2): number => Math.atan2(a.y, a.x);

/** `a` limited to at most `max` long. */
export function clampLength(a: Vec2, max: number): Vec2 {
  const len = length(a);
  return len > max && len > 0 ? scale(a, max / len) : a;
}
