/**
 * CinematicCamera - the slow exterior orbit shot during travel (M4).
 *
 * Pure TypeScript: produces a CameraPose circling the ship (which sits at
 * the origin of the space scene, D2). game.ts copies the pose onto the
 * space camera while PlayerMode is 'cinematic'.
 */
import { gameConfig } from '../config/gameConfig';
import type { CameraPose } from '../player/followCamera';
import { vec3 } from '../physics/vec3';

/** Where the orbit looks: roughly the ship's heart, not the exact origin. */
const LOOK_AT = vec3(0, 2, 0);

export class CinematicCamera {
  private readonly cfg = gameConfig.cinematic;

  private yaw = 0;
  private elapsed = 0;

  /** Reset to a pleasing three-quarter view each time the shot begins. */
  reset(): void {
    this.yaw = Math.PI * 0.72;
    this.elapsed = 0;
  }

  update(dt: number): CameraPose {
    this.yaw += this.cfg.yawRate * dt;
    this.elapsed += dt;

    const height =
      this.cfg.orbitHeight +
      Math.sin(this.elapsed * this.cfg.bobFrequency * Math.PI * 2) * this.cfg.bobAmplitude;

    return {
      position: vec3(
        Math.sin(this.yaw) * this.cfg.orbitRadius,
        height,
        Math.cos(this.yaw) * this.cfg.orbitRadius,
      ),
      lookAt: LOOK_AT,
    };
  }
}
