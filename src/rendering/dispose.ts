/**
 * Dispose helpers - release GPU resources of a Three.js subtree.
 */
import * as THREE from 'three';

type AnyMesh = THREE.Mesh<THREE.BufferGeometry, THREE.Material | THREE.Material[]>;

/** Dispose geometries and materials of every mesh under `root`. */
export function disposeObject3D(root: THREE.Object3D): void {
  root.traverse((obj) => {
    if (!(obj as THREE.Object3D & { isMesh?: boolean }).isMesh) return;
    const mesh = obj as AnyMesh;
    mesh.geometry.dispose();
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) material.dispose();
  });
}
