/**
 * ShipExterior - the hull seen from the cinematic camera (M4, D7 grey-box).
 *
 * Built from the same room rectangles as the interior, slightly inflated,
 * so the outside silhouette always matches the inside. Engines sit on the
 * aft (+Z) face; their glow follows the TravelDirector's engineIntensity.
 * Only visible during the cinematic exterior shot.
 */
import * as THREE from 'three';
import type { ShipLayout } from '../../content/shipLayout';
import { disposeObject3D } from '../../rendering/dispose';

/** How far the hull skin sits outside the interior walls. */
const HULL_INFLATE = 0.25;
const ENGINE_COUNT = 2;
const ENGINE_RADIUS = 0.8;
const ENGINE_LENGTH = 2.4;
/** Engine glow color (matches engineering's warm interior light). */
const GLOW_COLOR = 0xffb070;

export class ShipExterior {
  readonly group = new THREE.Group();

  private readonly glowMaterial: THREE.MeshBasicMaterial;
  private readonly glowLight: THREE.PointLight;

  constructor(layout: ShipLayout) {
    const hullMaterial = new THREE.MeshStandardMaterial({
      color: 0x2b313d,
      roughness: 0.85,
      metalness: 0.25,
    });

    // One inflated box per room; shared faces hide inside each other.
    let aftZ = -Infinity;
    for (const room of layout.rooms) {
      const width = room.maxX - room.minX + 2 * HULL_INFLATE;
      const depth = room.maxZ - room.minZ + 2 * HULL_INFLATE;
      const height = layout.ceilingHeight + 2 * HULL_INFLATE;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), hullMaterial);
      mesh.position.set(
        (room.minX + room.maxX) / 2,
        layout.ceilingHeight / 2,
        (room.minZ + room.maxZ) / 2,
      );
      this.group.add(mesh);
      aftZ = Math.max(aftZ, room.maxZ);
    }
    if (!Number.isFinite(aftZ)) {
      throw new Error('ShipExterior: layout has no rooms');
    }

    // Engines on the aft face, glowing while the autopilot burns.
    this.glowMaterial = new THREE.MeshBasicMaterial({
      color: GLOW_COLOR,
      transparent: true,
      opacity: 0,
    });
    const nozzleMaterial = new THREE.MeshStandardMaterial({
      color: 0x1b1f28,
      roughness: 0.6,
      metalness: 0.5,
    });
    for (let i = 0; i < ENGINE_COUNT; i++) {
      const x = (i - (ENGINE_COUNT - 1) / 2) * 3;
      const nozzle = new THREE.Mesh(
        new THREE.CylinderGeometry(ENGINE_RADIUS, ENGINE_RADIUS * 1.25, ENGINE_LENGTH, 12),
        nozzleMaterial,
      );
      nozzle.rotation.x = Math.PI / 2;
      nozzle.position.set(x, layout.ceilingHeight / 2, aftZ + HULL_INFLATE + ENGINE_LENGTH / 2);
      this.group.add(nozzle);

      const plume = new THREE.Mesh(
        new THREE.ConeGeometry(ENGINE_RADIUS * 0.85, ENGINE_LENGTH * 2.2, 12),
        this.glowMaterial,
      );
      plume.rotation.x = -Math.PI / 2; // cone tip pointing astern (+Z)
      plume.position.set(
        x,
        layout.ceilingHeight / 2,
        aftZ + HULL_INFLATE + ENGINE_LENGTH + ENGINE_LENGTH * 1.1,
      );
      this.group.add(plume);
    }

    this.glowLight = new THREE.PointLight(GLOW_COLOR, 0, 40, 1.6);
    this.glowLight.position.set(0, layout.ceilingHeight / 2, aftZ + 4);
    this.group.add(this.glowLight);
  }

  /** `intensity` is 0..1 from the TravelDirector. */
  setEngineIntensity(intensity: number): void {
    const clamped = Math.min(1, Math.max(0, intensity));
    this.glowMaterial.opacity = clamped * 0.85;
    this.glowLight.intensity = clamped * 60;
  }

  dispose(): void {
    disposeObject3D(this.group);
  }
}
