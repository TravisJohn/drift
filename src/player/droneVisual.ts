/**
 * DroneVisual - placeholder look for the maintenance drone (replaced by a
 * CC0 model in M6). A rounded body with a sensor "eye" and a soft cyan
 * glow light, nose pointing -Z to match DroneController's yaw convention.
 */
import * as THREE from 'three';
import type { DroneSnapshot } from './droneController';
import { lerp } from '../physics/vec3';
import { disposeObject3D } from '../rendering/dispose';

export class DroneVisual {
  readonly group: THREE.Group;
  private readonly glow: THREE.PointLight;

  constructor() {
    this.group = new THREE.Group();

    const body = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 24, 16),
      new THREE.MeshStandardMaterial({ color: 0x9aa7b4, roughness: 0.5, metalness: 0.55 }),
    );
    body.scale.set(1, 0.75, 1.15);
    this.group.add(body);

    // Sensor eye on the nose (-Z).
    const eye = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 16, 12),
      new THREE.MeshStandardMaterial({
        color: 0x111418,
        emissive: 0x33e0ff,
        emissiveIntensity: 1.6,
        roughness: 0.3,
      }),
    );
    eye.position.set(0, 0.02, -0.22);
    this.group.add(eye);

    // Thin equator ring, slightly metallic.
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.26, 0.025, 10, 32),
      new THREE.MeshStandardMaterial({ color: 0x6b7683, roughness: 0.35, metalness: 0.7 }),
    );
    ring.rotation.x = Math.PI / 2;
    this.group.add(ring);

    // Soft glow so the drone reads in dim rooms and lights nearby walls.
    this.glow = new THREE.PointLight(0x55d5ff, 0.9, 4, 2);
    this.glow.position.set(0, -0.05, 0);
    this.group.add(this.glow);
  }

  /** Apply controller state; `alpha` interpolates between fixed steps. */
  apply(snapshot: DroneSnapshot, alpha: number): void {
    const p = lerp(snapshot.prevPosition, snapshot.position, alpha);
    this.group.position.set(p.x, p.y + snapshot.bobOffset, p.z);
    this.group.rotation.set(snapshot.leanPitch, snapshot.yaw, snapshot.leanRoll, 'YXZ');
  }

  dispose(): void {
    disposeObject3D(this.group);
  }
}
