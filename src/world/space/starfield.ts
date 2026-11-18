/**
 * Starfield - the drifting stars outside the windows (D2).
 *
 * The ship never moves: during travel the stars slide past it instead.
 * Star placement and drift are pure functions over a Float32Array so the
 * wrap-around logic is unit-testable; the Starfield class is the thin
 * Three.js wrapper that owns the Points object.
 */
import * as THREE from 'three';
import { gameConfig } from '../../config/gameConfig';
import { mulberry32 } from '../../core/random';
import { createStarAttributes, createStarGeometry, createStarMaterial } from './starLook';

/** Re-exported: the seeded random source now lives in core/random.ts. */
export { mulberry32 };

/**
 * Generate star positions in a cube of half-size `extent`, keeping a clear
 * sphere of `clearRadius` around the origin (stars there would sit inside
 * the ship). Returns xyz triplets.
 */
export function createStarPositions(
  count: number,
  extent: number,
  clearRadius: number,
  random: () => number,
): Float32Array {
  if (count <= 0 || extent <= 0 || clearRadius >= extent) {
    throw new Error('createStarPositions: need count > 0 and 0 <= clearRadius < extent');
  }
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    let x: number;
    let y: number;
    let z: number;
    // Rejection-sample the clear zone; the zone is a tiny fraction of the
    // cube, so this terminates almost immediately.
    do {
      x = (random() * 2 - 1) * extent;
      y = (random() * 2 - 1) * extent;
      z = (random() * 2 - 1) * extent;
    } while (x * x + y * y + z * z < clearRadius * clearRadius);
    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;
  }
  return positions;
}

/**
 * Drift every star by `dz` along +Z (the ship flies toward -Z), wrapping
 * within [-extent, extent) so the field is endless. Mutates in place.
 */
export function advanceStars(positions: Float32Array, dz: number, extent: number): void {
  if (extent <= 0) {
    throw new Error('advanceStars: extent must be positive');
  }
  const size = 2 * extent;
  for (let i = 2; i < positions.length; i += 3) {
    const z = (positions[i] ?? 0) + dz;
    // True modulo (never negative) keeps z in [-extent, extent).
    positions[i] = ((((z + extent) % size) + size) % size) - extent;
  }
}

export class Starfield {
  readonly points: THREE.Points;

  private readonly geometry: THREE.BufferGeometry;
  private readonly material: THREE.ShaderMaterial;
  private readonly positions: Float32Array;
  private readonly extent: number;

  constructor() {
    const cfg = gameConfig.space;
    this.extent = cfg.starExtent;
    const random = mulberry32(cfg.starSeed);
    this.positions = createStarPositions(
      cfg.starCount,
      cfg.starExtent,
      cfg.starClearRadius,
      random,
    );

    this.geometry = createStarGeometry(
      this.positions,
      createStarAttributes(cfg.starCount, cfg.starMinSize, cfg.starMaxSize, random),
    );
    this.material = createStarMaterial();
    this.points = new THREE.Points(this.geometry, this.material);
    // The field surrounds the camera; never let Three cull it away.
    this.points.frustumCulled = false;
  }

  /** Keep star sizes true to the viewport (see starLook.projectionScale). */
  setProjectionScale(scale: number): void {
    this.material.uniforms.uProjectionScale!.value = scale;
  }

  /** `driftSpeed` is 0..1 of full cruise speed (from the TravelDirector). */
  update(dt: number, driftSpeed: number, elapsed: number): void {
    this.material.uniforms.uTime!.value = elapsed;
    if (driftSpeed <= 0) return;
    advanceStars(this.positions, driftSpeed * gameConfig.space.cruiseStarSpeed * dt, this.extent);
    this.geometry.getAttribute('position').needsUpdate = true;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}
