/**
 * Forward flight: the author's design after playtesting.
 *
 * The hull always faces FORWARD and never rotates, and the ship is always
 * moving forward. The pilot sets notches rather than holding keys: W/S
 * step the forward speed (slow, cruise, fast; never zero), A/D step a
 * sideways drift that stays until changed. The engines then bring the
 * actual motion round to those settings at a limited rate, so a change
 * takes a moment and a knock (a rock, a ram) is flown out of.
 *
 * Boost (limited by its energy) goes the way the pilot is drifting: with
 * a drift set it throws the ship hard to that side, for dodging rocks and
 * missiles; with no drift it adds forward speed. The engines answer a
 * boost faster than a notch change, so the dodge is sharp.
 *
 * Pure functions over the settings; the simulation owns the ship.
 */
import { angleBetween, clamp } from './combatMath';
import { type CombatSettings, FORWARD, type Side } from './combatTypes';
import { type Vec2, add, angleOf, fromAngle, length, scale, sub, vec2 } from './vec2';

type ShipSettings = CombatSettings['ship'];

/** Unit vectors for the hull, which never turns. */
export const AHEAD: Vec2 = fromAngle(FORWARD);
export const STARBOARD: Vec2 = vec2(-AHEAD.y, AHEAD.x); // right of the nose

/** The throttle notch after `steps` taps (W +1, S −1); never below slow. */
export function stepThrottle(notch: number, steps: number, s: ShipSettings): number {
  return clamp(Math.round(notch + steps), 0, s.forwardSpeeds.length - 1);
}

/** The drift notch after `steps` taps (D +1, A −1). */
export function stepStrafe(notch: number, steps: number, s: ShipSettings): number {
  return clamp(Math.round(notch + steps), -s.strafeNotches, s.strafeNotches);
}

/**
 * The motion the pilot has set: forward at the notch speed, plus the drift.
 * Boost adds to the drift's side when one is set, otherwise forward.
 */
export function setVelocity(
  throttle: number,
  strafe: number,
  boosting: boolean,
  s: ShipSettings,
): Vec2 {
  const sideways = boosting && strafe !== 0;
  const forward = (s.forwardSpeeds[throttle] ?? 0) + (boosting && !sideways ? s.boostExtra : 0);
  const side = strafe * s.strafeStep + (sideways ? Math.sign(strafe) * s.boostSide : 0);
  return add(scale(AHEAD, forward), scale(STARBOARD, side));
}

/** How fast the engines change the motion: sharper while boosting. */
export function engineAccel(boosting: boolean, s: ShipSettings): number {
  return boosting ? s.boostAccel : s.accel;
}

/** Move `vel` toward `target`, changing it by at most `accel * dt`. */
export function approachVelocity(vel: Vec2, target: Vec2, accel: number, dt: number): Vec2 {
  const gap = sub(target, vel);
  const room = length(gap);
  const most = accel * dt;
  return room <= most ? target : add(vel, scale(gap, most / room));
}

/**
 * Which side of the ship `point` is on: within 45 degrees of the nose is
 * ahead, within 45 of the tail behind, otherwise left or right.
 */
export function sideOf(point: Vec2, shipPos: Vec2): Side {
  const off = angleBetween(FORWARD, angleOf(sub(point, shipPos)));
  const quarter = Math.PI / 4;
  if (Math.abs(off) <= quarter) return 'ahead';
  if (Math.abs(off) >= Math.PI - quarter) return 'behind';
  return off > 0 ? 'right' : 'left';
}
