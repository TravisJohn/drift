/**
 * Tether - keeps the drone within reach of the ship once it is outside.
 *
 * Distance is measured from the hull's bounding box, so it is the same
 * margin all round however long the ship is. Three distances (config
 * drone.tether):
 * - `warnDistance`: strain starts rising from 0 (the drone glows red);
 * - `pullDistance`: a spring starts drawing the drone back, harder the
 *   further it goes - a soft limit you feel rather than hit;
 * - `maxDistance`: the hard limit; the drone is held there and any speed
 *   further outward is taken away. Strain is 1.
 *
 * Pure (no Three.js): position and velocity in, corrected ones out.
 */
import { type Vec3, add, dot, length, scale, sub, vec3 } from './vec3';

export interface TetherBox {
  readonly min: Vec3;
  readonly max: Vec3;
}

export interface TetherSettings {
  readonly warnDistance: number;
  readonly pullDistance: number;
  readonly maxDistance: number;
  /** Spring strength: m/s of pull gained per second, per metre past `pullDistance`. */
  readonly pullStrength: number;
}

export interface TetherResult {
  readonly position: Vec3;
  readonly velocity: Vec3;
  /** 0 within `warnDistance`, rising to 1 at `maxDistance`. */
  readonly strain: number;
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** The point of `box` nearest to `p` (p itself when inside). */
export function closestPointOnBox(p: Vec3, box: TetherBox): Vec3 {
  return vec3(
    clamp(p.x, box.min.x, box.max.x),
    clamp(p.y, box.min.y, box.max.y),
    clamp(p.z, box.min.z, box.max.z),
  );
}

export function applyTether(
  position: Vec3,
  velocity: Vec3,
  box: TetherBox,
  s: TetherSettings,
  dt: number,
): TetherResult {
  if (!(s.warnDistance < s.pullDistance && s.pullDistance < s.maxDistance)) {
    throw new Error('applyTether: need warnDistance < pullDistance < maxDistance');
  }
  const anchor = closestPointOnBox(position, box);
  const offset = sub(position, anchor);
  const distance = length(offset);
  const strain = clamp((distance - s.warnDistance) / (s.maxDistance - s.warnDistance), 0, 1);
  if (distance <= s.pullDistance) return { position, velocity, strain };

  const out = scale(offset, 1 / distance);
  // The spring: a pull back toward the ship, growing with the overshoot.
  let v = add(velocity, scale(out, -s.pullStrength * (distance - s.pullDistance) * dt));
  let p = position;
  if (distance > s.maxDistance) {
    // Hard limit: hold the drone on the boundary, no further outward speed.
    p = add(anchor, scale(out, s.maxDistance));
    const outward = dot(v, out);
    if (outward > 0) v = sub(v, scale(out, outward));
  }
  return { position: p, velocity: v, strain };
}
