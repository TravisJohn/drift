/**
 * Combat geometry: leading a moving target, swept hit tests, turning.
 *
 * Ported from the STARFALL prototype's 3D versions and reduced to 2D.
 * Pure functions; the simulation and its tests share them.
 */
import { type Vec2, add, dot, length, scale, sub } from './vec2';

export const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/**
 * Where to aim a shot fired from `origin` at `speed` so it meets a target
 * at `target` moving with `velocity`.
 *
 * Solves |target + velocity·t − origin| = speed·t for the earliest t > 0
 * (a quadratic in t). If the shot can never catch the target, falls back
 * to the plain flight time to where the target is now. The lead is capped
 * at `maxLeadSeconds` so a near-miss solution cannot aim absurdly far ahead.
 */
export function intercept(
  origin: Vec2,
  target: Vec2,
  velocity: Vec2,
  speed: number,
  maxLeadSeconds = 3,
): Vec2 {
  const q = sub(target, origin);
  const a = dot(velocity, velocity) - speed * speed;
  const b = 2 * dot(q, velocity);
  const c = dot(q, q);
  let t = length(q) / speed;
  if (Math.abs(a) > 1e-6) {
    const disc = b * b - 4 * a * c;
    if (disc >= 0) {
      const root = Math.sqrt(disc);
      const t1 = (-b - root) / (2 * a);
      const t2 = (-b + root) / (2 * a);
      const earliest = Math.min(t1, t2);
      const latest = Math.max(t1, t2);
      if (earliest > 0) t = earliest;
      else if (latest > 0) t = latest;
    }
  } else if (Math.abs(b) > 1e-6) {
    // Target as fast as the shot: the quadratic is linear.
    const linear = -c / b;
    if (linear > 0) t = linear;
  }
  return add(target, scale(velocity, Math.min(t, maxLeadSeconds)));
}

/**
 * Shortest distance from point `p` to the segment a→b.
 *
 * Used as a swept hit test: a fast shot that moved from a to b this step
 * hit anything within (radius) of that segment, so it cannot skip
 * through a small ship between two steps.
 */
export function segmentDistance(p: Vec2, a: Vec2, b: Vec2): number {
  const ab = sub(b, a);
  const lenSq = dot(ab, ab);
  const t = lenSq > 0 ? clamp(dot(sub(p, a), ab) / lenSq, 0, 1) : 0;
  return length(sub(p, add(a, scale(ab, t))));
}

/** An angle wrapped into (−π, π]. */
export function wrapAngle(angle: number): number {
  const twoPi = Math.PI * 2;
  let a = angle % twoPi;
  if (a <= -Math.PI) a += twoPi;
  else if (a > Math.PI) a -= twoPi;
  return a;
}

/** Signed smallest turn from `from` to `to`, radians in (−π, π]. */
export const angleBetween = (from: number, to: number): number => wrapAngle(to - from);

/** Turn `current` toward `target` by at most `maxStep` radians. */
export function turnToward(current: number, target: number, maxStep: number): number {
  const diff = angleBetween(current, target);
  if (Math.abs(diff) <= maxStep) return wrapAngle(target);
  return wrapAngle(current + Math.sign(diff) * maxStep);
}

/** Exponential approach factor for rate `rate` over `dt` (0..1). */
export const approach = (rate: number, dt: number): number => 1 - Math.exp(-rate * dt);
