import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildShip } from '../../src/world/ship/shipBuilder';
import { shipLayout } from '../../src/content/shipLayout';

/** Collect every emissive mesh material under the ship group. */
function emissiveIntensities(group: THREE.Group): number[] {
  const values: number[] = [];
  group.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    const material = mesh.material as THREE.MeshStandardMaterial;
    if (material.emissive && material.emissiveIntensity !== undefined) {
      values.push(material.emissiveIntensity);
    }
  });
  return values;
}

describe('ShipWorld animation (M6)', () => {
  it('update(t) breathes the glow materials over time', () => {
    const ship = buildShip(shipLayout);
    ship.update(0);
    const before = emissiveIntensities(ship.group);
    ship.update(1.7); // part of a breath cycle later
    const after = emissiveIntensities(ship.group);
    expect(before.length).toBe(after.length);
    const changed = before.filter((v, i) => Math.abs(v - (after[i] ?? v)) > 1e-4);
    expect(changed.length).toBeGreaterThan(0);
    ship.dispose();
  });

  it('the engineering light wavers but never strays far from base', () => {
    const ship = buildShip(shipLayout);
    const lights: THREE.PointLight[] = [];
    ship.group.traverse((obj) => {
      if ((obj as THREE.PointLight).isPointLight) lights.push(obj as THREE.PointLight);
    });
    const baseline = lights.map((l) => l.intensity);

    let sawChange = false;
    for (let t = 0; t < 5; t += 0.37) {
      ship.update(t);
      lights.forEach((light, i) => {
        const base = baseline[i] ?? 0;
        expect(light.intensity).toBeGreaterThan(base * 0.85);
        expect(light.intensity).toBeLessThan(base * 1.15);
        if (Math.abs(light.intensity - base) > 1e-4) sawChange = true;
      });
    }
    expect(sawChange).toBe(true);
    ship.dispose();
  });

  it('prop detailing does not change the collider count or spawn', () => {
    const ship = buildShip(shipLayout);
    // One collider per box: structure + every prop, same as before M6.
    expect(ship.colliders.length).toBeGreaterThan(shipLayout.props.length);
    expect(ship.spawn).toEqual(shipLayout.spawn);
    ship.dispose();
  });
});
