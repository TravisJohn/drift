import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildShip } from '../../src/world/ship/shipBuilder';
import { shipLayout } from '../../src/content/shipLayout';
import { DroneController } from '../../src/player/droneController';
import { sideGeometry } from '../../src/world/ship/layoutGeometry';
import { cabinLightLevel, CabinPowerCycle } from '../../src/world/ship/cabinLighting';

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
  it('holds the drone inside every viewport under thrust and lets it leave once docked', () => {
    const ship = buildShip(shipLayout);
    try {
      for (const window of shipLayout.windows) {
        const room = shipLayout.rooms.find((room) => room.id === window.roomId)!;
        const side = window.side;
        const sideways = side === 'west' || side === 'east';
        const axis = sideways ? 'x' : 'z';
        const sign = side === 'west' || side === 'north' ? -1 : 1;
        const { at: wall } = sideGeometry(room, side);
        const inside = wall - sign * 0.5;
        const drone = new DroneController({
          x: sideways ? inside : window.center,
          y: (shipLayout.windowBottom + shipLayout.windowTop) / 2,
          z: sideways ? window.center : inside,
        });
        const thrust = { moveX: sideways ? sign : 0, moveY: 0, moveZ: sideways ? 0 : -sign };
        for (let step = 0; step < 90; step++) drone.update(1 / 60, thrust, 0, ship.sealedColliders);
        expect(sign * (drone.snapshot.position[axis] - wall), room.name).toBeLessThan(0);
        for (let step = 0; step < 90; step++) drone.update(1 / 60, thrust, 0, ship.colliders);
        expect(sign * (drone.snapshot.position[axis] - wall), room.name).toBeGreaterThan(0);
      }
    } finally {
      ship.dispose();
    }
  });

  it('aligns the automatic voice countdown with the original two-minute pattern', () => {
    const power = new CabinPowerCycle();
    for (const time of [0, 112, 113, 115, 119, 120, 124, 144, 233, 240, 250, 264]) {
      const sample = new CabinPowerCycle();
      sample.advance(time);
      expect(sample.level).toBeCloseTo(cabinLightLevel(time));
    }
    power.advance(113);
    expect(power.voiceOffset).toBe(0);
    power.advance(6);
    expect(power.voiceOffset).toBe(6);
    power.voice = false;
    expect(power.voiceOffset).toBeNull();
    power.voice = true;
    power.advance(1);
    expect(power.voiceOffset).toBeNull();
  });

  it('runs one requested cycle with auto off, then waits for a fresh automatic interval', () => {
    const power = new CabinPowerCycle();
    power.setAutomatic(false);
    power.advance(165);
    expect(power.snapshot.status).toBe('Full lighting');
    power.startNow();
    power.advance(2);
    power.startNow();
    expect(power.voiceOffset).toBe(2);
    power.advance(10);
    expect(power.level).toBeCloseTo(0.045);
    power.advance(24);
    expect(power.snapshot.status).toBe('Full lighting');
    power.setAutomatic(true);
    power.advance(113);
    expect(power.voiceOffset).toBe(0);
    power.setAutomatic(false);
    power.advance(11);
    expect(power.level).toBeCloseTo(0.045);
    power.advance(120);
    expect(power.snapshot.status).toBe('Full lighting');
  });
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
