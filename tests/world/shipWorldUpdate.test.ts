import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildShip } from '../../src/world/ship/shipBuilder';
import { shipLayout } from '../../src/content/shipLayout';
import { cabinLightLevel } from '../../src/world/ship/cabinLighting';

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
  it('waits two minutes, fades down, holds, fades up and repeats', () => {
    expect(cabinLightLevel(0)).toBe(1);
    expect(cabinLightLevel(10)).toBe(1);
    for (const start of [120, 240]) {
      const level = (offset: number) => cabinLightLevel(start + offset);
      expect(level(-1)).toBe(1);
      expect(level(0)).toBe(1);
      expect(level(2)).toBeLessThan(1);
      expect(level(2)).toBeGreaterThan(level(4));
      expect(level(4)).toBeCloseTo(0.045);
      expect(level(18)).toBe(level(4));
      expect(level(21)).toBeGreaterThan(level(18));
      expect(level(21)).toBeLessThan(1);
      expect(level(24)).toBe(1);
    }
  });

  it('dims the fixtures while preserving the floor guides and restores their original glow', () => {
    const ship = buildShip(shipLayout);
    const lamp = (name: string) =>
      (
        ship.group.getObjectByName(name) as THREE.Mesh<
          THREE.BufferGeometry,
          THREE.MeshStandardMaterial
        >
      ).material;
    const accent = lamp('trim:accent:bridge');
    const guide = lamp('trim:guideLight:bridge');
    const accentBase = accent.emissiveIntensity;
    const guideBase = guide.emissiveIntensity;
    ship.update(130, cabinLightLevel(130));
    expect(accent.emissiveIntensity).toBeCloseTo(accentBase * 0.045);
    expect(guide.emissiveIntensity).toBe(guideBase);
    ship.update(144, cabinLightLevel(144));
    expect(accent.emissiveIntensity).toBe(accentBase);
    ship.dispose();
  });

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
    let sawChange = false;
    for (let t = 0; t < 5; t += 0.37) {
      ship.update(t);
      // 1 is nominal brightness for the wavering (engineering) fixture.
      expect(ship.lightWaver.value).toBeGreaterThan(0.85);
      expect(ship.lightWaver.value).toBeLessThan(1.15);
      if (Math.abs(ship.lightWaver.value - 1) > 1e-4) sawChange = true;
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
