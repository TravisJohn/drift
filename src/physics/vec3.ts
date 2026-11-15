/**
 * Minimal immutable 3D vector math on plain objects.
 *
 * The physics and player modules are pure TypeScript (no Three.js imports)
 * so they can be unit-tested without a renderer; Three's Vector3 is only
 * used at the rendering boundary (game.ts / visuals).
 */

export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export const vec3 = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z });

export const add = (a: Vec3, b: Vec3): Vec3 => vec3(a.x + b.x, a.y + b.y, a.z + b.z);

export const sub = (a: Vec3, b: Vec3): Vec3 => vec3(a.x - b.x, a.y - b.y, a.z - b.z);

export const scale = (a: Vec3, s: number): Vec3 => vec3(a.x * s, a.y * s, a.z * s);

export const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;

export const lengthSq = (a: Vec3): number => dot(a, a);

export const length = (a: Vec3): number => Math.sqrt(lengthSq(a));

/** Returns the zero vector when the input is (near) zero length. */
export const normalize = (a: Vec3): Vec3 => {
  const len = length(a);
  return len < 1e-8 ? vec3() : scale(a, 1 / len);
};

export const lerp = (a: Vec3, b: Vec3, t: number): Vec3 =>
  vec3(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t);

export const distance = (a: Vec3, b: Vec3): number => length(sub(a, b));
