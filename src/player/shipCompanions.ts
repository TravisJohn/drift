import * as THREE from 'three';
import { disposeObject3D } from '../rendering/dispose';
import { companionColor, companionName, companionPose } from './companionPatrol';
import { buildDroneModel, type DroneModel } from './droneModel';

interface Companion {
  readonly since: number;
  readonly model: DroneModel;
  readonly beam: THREE.Mesh<THREE.ConeGeometry, THREE.MeshBasicMaterial>;
}

/** The crew scouts fly the ship's inspection route on their own. */
export class ShipCompanions {
  readonly group = new THREE.Group();
  private readonly companions = new Map<number, Companion>();
  private readonly scanAxis = new THREE.Vector3();

  add(id: number, time: number): void {
    if (this.companions.has(id)) return;
    const color = companionColor(id);
    const model = buildDroneModel('vesper-scout', color);
    model.root.name = companionName(id);
    const beam = new THREE.Mesh(
      new THREE.ConeGeometry(0.23, 1, 18, 1, true),
      new THREE.MeshBasicMaterial({
        color,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.15,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    const companion = { since: time, model, beam };
    this.companions.set(id, companion);
    this.group.add(model.root, beam);
    this.place(id, companion, time);
  }

  update(time: number): void {
    for (const [id, companion] of this.companions) this.place(id, companion, time);
  }

  private place(id: number, { since, model, beam }: Companion, time: number): void {
    const flightTime = Math.max(0, time - since);
    const { position, yaw, scan } = companionPose(id, flightTime);
    const altitude = ((id - 1) % 3) * 0.16 + Math.sin(flightTime * 4 + id) * 0.035;
    const origin = model.root.position;
    origin.set(position.x, position.y + altitude, position.z);
    model.root.rotation.y = yaw;
    model.exhaustMaterial.emissiveIntensity = scan ? 0.63 : 1.1;
    beam.visible = scan !== undefined;
    if (scan) {
      beam.position.set(scan.x, scan.y, scan.z);
      this.scanAxis.copy(origin).sub(beam.position);
      beam.position.lerp(origin, 0.5);
      beam.scale.y = this.scanAxis.length();
      beam.quaternion.setFromUnitVectors(THREE.Object3D.DEFAULT_UP, this.scanAxis.normalize());
      beam.material.opacity = 0.13 + 0.04 * Math.sin(flightTime * 8);
    }
  }

  dispose(): void {
    disposeObject3D(this.group);
    this.group.clear();
    this.companions.clear();
  }
}
