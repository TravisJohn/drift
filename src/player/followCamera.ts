/**
 * FollowCamera - third-person orbit camera with wall avoidance.
 *
 * Pure TypeScript: computes a desired eye position orbiting the drone from
 * accumulated mouse input, pulls in toward the target when a wall would
 * block the view (segment-vs-AABB, D1 colliders), and smooths motion
 * exponentially. game.ts copies the result onto the Three.js camera.
 */
import { gameConfig } from '../config/gameConfig';
import type { LookDelta } from '../core/input';
import { type BoxCollider, segmentEntersBoxAt } from '../physics/colliders';
import { type Vec3, add, lerp, sub, vec3 } from '../physics/vec3';

export interface CameraPose {
  readonly position: Vec3;
  readonly lookAt: Vec3;
}

export class FollowCamera {
  private readonly cfg = gameConfig.camera;

  private _yaw: number;
  private pitch: number;
  private smoothedPosition: Vec3 | null = null;

  constructor(initialYaw = 0, initialPitch = 0.35) {
    this._yaw = initialYaw;
    this.pitch = this.clampPitch(initialPitch);
  }

  /** Orbit yaw, used by the drone controller to make input camera-relative. */
  get yaw(): number {
    return this._yaw;
  }

  /** Apply accumulated mouse movement (called once per fixed update). */
  applyLook(delta: LookDelta): void {
    this._yaw -= delta.dx * this.cfg.lookSensitivity;
    this.pitch = this.clampPitch(this.pitch + delta.dy * this.cfg.lookSensitivity);
  }

  /**
   * Compute the camera pose for this frame.
   *
   * The camera orbits `target` (the drone position). The view segment from
   * the look-at point out to the desired eye position is tested against the
   * colliders; on a hit the camera pulls in to just in front of the wall.
   */
  update(dt: number, target: Vec3, colliders: readonly BoxCollider[]): CameraPose {
    const lookAt = add(target, vec3(0, this.cfg.eyeHeight, 0));

    // Desired eye position on the orbit sphere behind the target.
    const cosPitch = Math.cos(this.pitch);
    const offset = vec3(
      Math.sin(this._yaw) * cosPitch * this.cfg.distance,
      Math.sin(this.pitch) * this.cfg.distance,
      Math.cos(this._yaw) * cosPitch * this.cfg.distance,
    );
    const desired = add(lookAt, offset);

    // Wall avoidance: pull in front of the first collider hit.
    let nearestT = 1;
    for (const box of colliders) {
      const t = segmentEntersBoxAt(lookAt, desired, box);
      if (t !== null && t < nearestT) nearestT = t;
    }
    let eye = desired;
    if (nearestT < 1) {
      const hit = lerp(lookAt, desired, nearestT);
      const back = sub(hit, lookAt);
      const hitDist = Math.hypot(back.x, back.y, back.z);
      const pulled = Math.max(this.cfg.minDistance, hitDist - this.cfg.collisionMargin);
      const t = hitDist > 1e-9 ? pulled / this.cfg.distance : 0;
      eye = lerp(lookAt, desired, Math.min(1, t));
    }

    // Exponential smoothing; occlusion pull-in snaps (no smoothing) so the
    // camera never lingers inside a wall while easing.
    if (this.smoothedPosition === null || nearestT < 1) {
      this.smoothedPosition = eye;
    } else {
      const blend = 1 - Math.exp(-this.cfg.positionSmoothing * dt);
      this.smoothedPosition = lerp(this.smoothedPosition, eye, blend);
    }

    return { position: this.smoothedPosition, lookAt };
  }

  private clampPitch(value: number): number {
    return Math.min(this.cfg.pitchMax, Math.max(this.cfg.pitchMin, value));
  }
}
