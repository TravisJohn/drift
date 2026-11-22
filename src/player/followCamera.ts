/**
 * FollowCamera - third-person orbit camera with wall avoidance.
 *
 * Pure TypeScript: computes a desired eye position orbiting the drone from
 * accumulated mouse input, pulls in toward the target when a wall would
 * block the view (segment-vs-AABB, D1 colliders), and smooths motion
 * exponentially. game.ts copies the result onto the Three.js camera.
 *
 * Looking is a drag with the right mouse button held (see core/input.ts).
 * Which way the view turns for a given drag is the look style:
 * - 'grab': as if you had taken hold of the scene. Drag right and the
 *   scene comes with it, showing what was on your left; drag down to see
 *   the ceiling, up to see the floor.
 * - 'turn': the view follows the mouse instead. Drag right to look right,
 *   down to look down.
 */
import { gameConfig } from '../config/gameConfig';
import type { LookDelta } from '../core/input';
import { type BoxCollider, segmentEntersBoxAt } from '../physics/colliders';
import { type Vec3, add, lerp, sub, vec3 } from '../physics/vec3';

export type LookStyle = 'grab' | 'turn';

export interface CameraPose {
  readonly position: Vec3;
  readonly lookAt: Vec3;
}

export class FollowCamera {
  private readonly cfg = gameConfig.camera;

  private _yaw: number;
  private pitch: number;
  private smoothedPosition: Vec3 | null = null;

  constructor(
    initialYaw = 0,
    initialPitch = 0.35,
    private readonly lookStyle: LookStyle = gameConfig.camera.lookStyle,
  ) {
    this._yaw = initialYaw;
    this.pitch = this.clampPitch(initialPitch);
  }

  /** Orbit yaw, used by the drone controller to make input camera-relative. */
  get yaw(): number {
    return this._yaw;
  }

  /** Frame the forward viewport as control returns from navigation. */
  faceBow(): void {
    this._yaw = 0;
    this.pitch = 0;
    this.smoothedPosition = null;
  }

  /** Apply an accumulated look drag (called once per fixed update). */
  applyLook(delta: LookDelta): void {
    // 'turn' swings the view the way the mouse went; 'grab' the other way.
    const sense = (this.lookStyle === 'grab' ? -1 : 1) * this.cfg.lookSensitivity;
    // A larger yaw looks further left; a larger pitch lifts the camera,
    // which tips the view down.
    this._yaw -= delta.dx * sense;
    this.pitch = this.clampPitch(this.pitch + delta.dy * sense);
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
