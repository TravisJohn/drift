/**
 * DroneController - hover movement for the player drone.
 *
 * Pure TypeScript (no Three.js): consumes input axes + camera yaw, integrates
 * velocity with exponential acceleration/damping, resolves collisions, and
 * exposes visual state (facing, lean, idle bob) for droneVisual to apply.
 *
 * Feel model:
 * - velocity chases `input direction * maxSpeed` exponentially -> soft starts
 *   and stops with a floaty, inertial feel rather than instant arcade snap.
 * - the drone turns to face its direction of travel; the camera orbits
 *   independently.
 * - lean: pitches into motion and banks into turns (visual only).
 * - bob: a gentle sine hover when idle, fading out with speed.
 */
import { gameConfig } from '../config/gameConfig';
import type { InputActions } from '../core/input';
import type { BoxCollider } from '../physics/colliders';
import { resolveSphere } from '../physics/sphereCollision';
import { type Vec3, add, scale, vec3 } from '../physics/vec3';

/** Shortest signed difference from angle `a` to `b`, in (-PI, PI]. */
export function angleDelta(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d <= -Math.PI) d += Math.PI * 2;
  return d;
}

/** Exponential approach factor: fraction of the gap closed after dt. */
const approach = (rate: number, dt: number): number => 1 - Math.exp(-rate * dt);

export interface DroneSnapshot {
  readonly position: Vec3;
  /** Position at the previous step, for render interpolation. */
  readonly prevPosition: Vec3;
  readonly velocity: Vec3;
  /** Facing (radians around Y); the drone's nose points along -Z at yaw 0. */
  readonly yaw: number;
  /** Visual lean, radians. */
  readonly leanPitch: number;
  readonly leanRoll: number;
  /** Idle hover offset, applied to the visual's Y only (not collision). */
  readonly bobOffset: number;
}

export class DroneController {
  private readonly cfg = gameConfig.drone;

  private position: Vec3;
  private prevPosition: Vec3;
  private velocity: Vec3 = vec3();
  private yaw = 0;
  private leanPitch = 0;
  private leanRoll = 0;
  private bobPhase = 0;
  private bobOffset = 0;

  constructor(startPosition: Vec3) {
    this.position = startPosition;
    this.prevPosition = startPosition;
  }

  get snapshot(): DroneSnapshot {
    return {
      position: this.position,
      prevPosition: this.prevPosition,
      velocity: this.velocity,
      yaw: this.yaw,
      leanPitch: this.leanPitch,
      leanRoll: this.leanRoll,
      bobOffset: this.bobOffset,
    };
  }

  update(
    dt: number,
    input: InputActions,
    cameraYaw: number,
    colliders: readonly BoxCollider[],
  ): void {
    this.prevPosition = this.position;

    // --- Desired horizontal velocity from input, relative to the camera ---
    const fx = -Math.sin(cameraYaw);
    const fz = -Math.cos(cameraYaw);
    const rx = Math.cos(cameraYaw);
    const rz = -Math.sin(cameraYaw);
    let dirX = rx * input.moveX + fx * input.moveZ;
    let dirZ = rz * input.moveX + fz * input.moveZ;
    const dirLen = Math.hypot(dirX, dirZ);
    if (dirLen > 1) {
      // Normalize diagonals so W+D isn't faster than W.
      dirX /= dirLen;
      dirZ /= dirLen;
    }

    const hasMoveInput = dirLen > 1e-6;
    const hRate = hasMoveInput ? this.cfg.acceleration : this.cfg.damping;
    const hBlend = approach(hRate, dt);
    const targetVx = dirX * this.cfg.maxSpeed;
    const targetVz = dirZ * this.cfg.maxSpeed;

    // --- Vertical: same model, separate (gentler) rates ---
    const hasLiftInput = input.moveY !== 0;
    const vRate = hasLiftInput ? this.cfg.verticalAcceleration : this.cfg.damping;
    const vBlend = approach(vRate, dt);
    const targetVy = input.moveY * this.cfg.maxVerticalSpeed;

    this.velocity = vec3(
      this.velocity.x + (targetVx - this.velocity.x) * hBlend,
      this.velocity.y + (targetVy - this.velocity.y) * vBlend,
      this.velocity.z + (targetVz - this.velocity.z) * hBlend,
    );

    // --- Integrate and collide ---
    const resolved = resolveSphere(
      add(this.position, scale(this.velocity, dt)),
      this.cfg.radius,
      this.velocity,
      colliders,
    );
    this.position = resolved.position;
    this.velocity = resolved.velocity;

    // --- Facing: turn toward the direction of travel ---
    const hSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    if (hSpeed > 0.25) {
      const targetYaw = Math.atan2(-this.velocity.x, -this.velocity.z);
      const turn = angleDelta(this.yaw, targetYaw) * approach(this.cfg.faceTurnRate, dt);
      this.yaw += turn;
      // Bank into the turn (visual): roll follows how hard we are turning.
      const rollTarget = Math.max(-1, Math.min(1, turn / (dt * 3 + 1e-9))) * this.cfg.leanRollMax;
      this.leanRoll += (rollTarget - this.leanRoll) * approach(this.cfg.leanSmoothing, dt);
    } else {
      this.leanRoll += (0 - this.leanRoll) * approach(this.cfg.leanSmoothing, dt);
    }

    // Pitch into motion (nose dips with speed).
    const pitchTarget = -this.cfg.leanPitchMax * Math.min(1, hSpeed / this.cfg.maxSpeed);
    this.leanPitch += (pitchTarget - this.leanPitch) * approach(this.cfg.leanSmoothing, dt);

    // --- Idle bob, fading out with movement ---
    this.bobPhase += Math.PI * 2 * this.cfg.bobFrequency * dt;
    const speed3 = Math.hypot(hSpeed, this.velocity.y);
    const idleFactor = 1 - Math.min(1, speed3 / 0.8);
    this.bobOffset = Math.sin(this.bobPhase) * this.cfg.bobAmplitude * idleFactor;
  }
}
