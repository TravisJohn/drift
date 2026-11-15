/**
 * greyRoom - M1's single grey-box test room.
 *
 * TEMPORARY: replaced in M2 by the data-driven ship layout (shipBuilder).
 * One room with a floor, ceiling, four walls and a few crates, returned as
 * matching render meshes + physics colliders built from the same box specs
 * so visuals and collision can never drift apart.
 */
import * as THREE from 'three';
import { type BoxCollider, boxFromCenterSize } from '../physics/colliders';
import { type Vec3, vec3 } from '../physics/vec3';
import { disposeObject3D } from '../rendering/dispose';

interface BoxSpec {
  center: Vec3;
  size: Vec3;
  color: number;
}

const WALL = 0x3d434d;
const FLOOR = 0x343a42;
const CRATE = 0x4a5261;

// Interior space: x in [-7, 7], z in [-5, 5], ceiling at y = 3.6.
const SPECS: readonly BoxSpec[] = [
  { center: vec3(0, -0.25, 0), size: vec3(14.8, 0.5, 10.8), color: FLOOR }, // floor (top y=0)
  { center: vec3(0, 3.85, 0), size: vec3(14.8, 0.5, 10.8), color: WALL }, // ceiling (bottom y=3.6)
  { center: vec3(0, 1.8, -5.2), size: vec3(14.8, 3.6, 0.4), color: WALL }, // north wall
  { center: vec3(0, 1.8, 5.2), size: vec3(14.8, 3.6, 0.4), color: WALL }, // south wall
  { center: vec3(-7.2, 1.8, 0), size: vec3(0.4, 3.6, 10.8), color: WALL }, // west wall
  { center: vec3(7.2, 1.8, 0), size: vec3(0.4, 3.6, 10.8), color: WALL }, // east wall
  // Crates to fly around / test sliding.
  { center: vec3(-3, 0.5, -2), size: vec3(1, 1, 1), color: CRATE },
  { center: vec3(-2.4, 0.4, 2.2), size: vec3(0.8, 0.8, 0.8), color: CRATE },
  { center: vec3(3.5, 0.75, 1.5), size: vec3(1.5, 1.5, 1.5), color: CRATE },
  { center: vec3(4.2, 0.5, -2.8), size: vec3(2, 1, 1), color: CRATE },
];

export interface GreyRoom {
  readonly group: THREE.Group;
  readonly colliders: readonly BoxCollider[];
  dispose(): void;
}

export function buildGreyRoom(): GreyRoom {
  const group = new THREE.Group();
  const colliders: BoxCollider[] = [];

  for (const spec of SPECS) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(spec.size.x, spec.size.y, spec.size.z),
      new THREE.MeshStandardMaterial({ color: spec.color, roughness: 0.9, metalness: 0.05 }),
    );
    mesh.position.set(spec.center.x, spec.center.y, spec.center.z);
    group.add(mesh);
    colliders.push(boxFromCenterSize(spec.center, spec.size));
  }

  // Mood lighting: dim blue ambient + a warm key light + a cool fill.
  const ambient = new THREE.AmbientLight(0x202838, 1.2);
  const key = new THREE.PointLight(0xffd9a0, 30, 18, 1.8);
  key.position.set(2, 3.1, 0);
  const fill = new THREE.PointLight(0x4a6a9a, 12, 16, 1.8);
  fill.position.set(-5, 2.6, 3);
  group.add(ambient, key, fill);

  return {
    group,
    colliders,
    dispose() {
      disposeObject3D(group);
    },
  };
}
