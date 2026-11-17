/**
 * Drone animation - how the drone's moving parts behave, as pure numbers.
 *
 * No Three.js here: droneVisual.ts reads these values each frame and puts
 * them onto the model built by droneModel.ts. Kept separate so the timing
 * of a blink or a beacon flash can be tested without a renderer.
 *
 * Everything is a function of time or of the controller's state, never of
 * frame count, so it looks the same at any frame rate.
 */
import { gameConfig } from '../config/gameConfig';
import type { Vec3 } from '../physics/vec3';

const look = gameConfig.droneLook;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

/**
 * A repeatable pseudo-random number in [0, 1) for an integer `n`. Same `n`
 * and `seed`, same answer, so blinks fall at the same moments every run
 * (tests rely on this) while still looking irregular.
 */
export function hash01(n: number, seed = 0): number {
  const s = Math.sin(n * 127.1 + seed * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * Lid closure for one blink, `x` seconds after it starts: 0 open, 1 shut.
 * Shuts quickly (first third) and opens more slowly, as real lids do.
 */
function lidCurve(x: number, duration: number): number {
  if (x < 0 || x > duration) return 0;
  const closeTime = duration * 0.35;
  return x < closeTime ? x / closeTime : 1 - (x - closeTime) / (duration - closeTime);
}

/**
 * How shut the eye is at time `t` seconds: 0 open, 1 shut. Time is cut
 * into windows of `cycleSeconds`; each window holds one blink at a
 * pseudo-random moment (sometimes a quick double), so the gaps between
 * blinks vary from a fraction of a second to almost two windows.
 */
export function blinkAmount(t: number, cfg = look.blink): number {
  const window = Math.floor(t / cfg.cycleSeconds);
  const local = t - window * cfg.cycleSeconds;
  const isDouble = hash01(window, cfg.seed + 1) < cfg.doubleChance;
  const gap = cfg.durationSeconds * 0.6;
  const span = isDouble ? cfg.durationSeconds * 2 + gap : cfg.durationSeconds;
  const start = hash01(window, cfg.seed) * (cfg.cycleSeconds - span);
  let amount = lidCurve(local - start, cfg.durationSeconds);
  if (isDouble) amount += lidCurve(local - start - cfg.durationSeconds - gap, cfg.durationSeconds);
  return clamp(amount, 0, 1);
}

/**
 * Beacon brightness at time `t`, 0..1: one smooth flash of
 * `beaconFlash` seconds at the start of every `beaconPeriod`.
 */
export function beaconLevel(
  t: number,
  period: number = look.beaconPeriod,
  flash: number = look.beaconFlash,
): number {
  const phase = ((t % period) + period) % period;
  return phase < flash ? Math.sin((Math.PI * phase) / flash) : 0;
}

/** How hard the thrusters are working, 0 idle to 1 at full speed. */
export function thrustLevel(velocity: Vec3, maxSpeed = gameConfig.drone.maxSpeed): number {
  const speed = Math.hypot(velocity.x, velocity.y, velocity.z);
  return clamp(speed / maxSpeed, 0, 1);
}

/** Exhaust glow for a thrust level: idle when still, brightest at speed. */
export function exhaustIntensity(level: number): number {
  return look.exhaustIdle + (look.exhaustMax - look.exhaustIdle) * clamp(level, 0, 1);
}

export interface ThrusterTilt {
  /** Rotation about the drone's X axis; negative tips the duct tops forward. */
  readonly pitch: number;
  /** Rotation about the drone's Z axis; negative tips the duct tops right. */
  readonly roll: number;
}

/**
 * Tilt for the thrusters so their exhaust points away from the way the
 * drone is travelling, as vectored thrust would. `velocity` is in world
 * space; `yaw` is the drone's facing (nose along -Z at yaw 0).
 */
export function thrusterTilt(velocity: Vec3, yaw: number): ThrusterTilt {
  const forward = -velocity.x * Math.sin(yaw) - velocity.z * Math.cos(yaw);
  const right = velocity.x * Math.cos(yaw) - velocity.z * Math.sin(yaw);
  const max = look.thrusterTiltMax;
  return {
    pitch: clamp(-forward * look.thrusterTiltPerSpeed, -max, max),
    roll: clamp(-right * look.thrusterTiltPerSpeed, -max, max),
  };
}

export interface EyeOffset {
  readonly x: number;
  readonly y: number;
}

/**
 * Where the eye sits on the visor, relative to its rest point (drone
 * space, metres). It slides into a turn - the drone looks where it is
 * going - and, while the drone is still, wanders slowly as if looking
 * around the empty room. `idle` is 1 when still and 0 when moving.
 */
export function eyeOffset(t: number, leanRoll: number, idle: number): EyeOffset {
  // A positive roll means turning left, and the drone's left is -X.
  const turn = clamp(leanRoll / gameConfig.drone.leanRollMax, -1, 1);
  const glanceX = -turn * look.glanceDistance;
  // Two slow, unrelated sine waves: a wander that never visibly repeats.
  const wander = look.idleGazeDistance * clamp(idle, 0, 1);
  return {
    x: glanceX + wander * Math.sin(t * 0.43) * Math.cos(t * 0.17),
    y: wander * 0.5 * Math.sin(t * 0.31 + 1.3),
  };
}
