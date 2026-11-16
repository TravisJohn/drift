import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { gameConfig } from '../../src/config/gameConfig';
import { shipLayout } from '../../src/content/shipLayout';
import { vec3 } from '../../src/physics/vec3';
import {
  READOUT_VARIANTS,
  generateScreenPixels,
  screenTexture,
} from '../../src/rendering/screenTextures';
import { dashboardPose } from '../../src/travel/dashboardCamera';
import { ShipHologram, hologramRooms, shipCentre } from '../../src/world/ship/shipHologram';
import { validateLayout } from '../../src/world/ship/validateLayout';

describe('the dashboard holo-table in the layout', () => {
  const table = shipLayout.props.find((p) => p.id === 'dashboard');

  it('exists on the bridge and the layout is still valid', () => {
    expect(table?.roomId).toBe('bridge');
    expect(table?.kind).toBe('holotable');
    expect(validateLayout(shipLayout)).toEqual([]);
  });

  it('is far enough from the helm that each has its own interaction zone', () => {
    const helm = shipLayout.props.find((p) => p.id === 'helm');
    if (!table || !helm) throw new Error('layout needs a helm and a dashboard');
    const apart = Math.hypot(table.center.x - helm.center.x, table.center.z - helm.center.z);
    // Standing at either one, it must be the nearer of the two.
    expect(apart).toBeGreaterThan(gameConfig.interaction.dashboardRadius);
    expect(apart).toBeGreaterThan(gameConfig.interaction.helmRadius);
  });
});

describe('hologramRooms (the ship drawn in light)', () => {
  const rooms = hologramRooms(shipLayout);

  it('has one compartment per room, the same size as the real one', () => {
    expect(rooms.map((r) => r.id)).toEqual(shipLayout.rooms.map((r) => r.id));
    const bridge = shipLayout.rooms.find((r) => r.id === 'bridge');
    const holo = rooms.find((r) => r.id === 'bridge');
    expect(holo?.size.x).toBe((bridge?.maxX ?? 0) - (bridge?.minX ?? 0));
    expect(holo?.size.y).toBe(shipLayout.ceilingHeight);
  });

  it('is centred on the deck plan, so it spins about its middle', () => {
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const r of rooms) {
      minX = Math.min(minX, r.center.x - r.size.x / 2);
      maxX = Math.max(maxX, r.center.x + r.size.x / 2);
      minZ = Math.min(minZ, r.center.z - r.size.z / 2);
      maxZ = Math.max(maxZ, r.center.z + r.size.z / 2);
    }
    expect(minX + maxX).toBeCloseTo(0, 6);
    expect(minZ + maxZ).toBeCloseTo(0, 6);
  });

  it('rejects a layout with no rooms (fail loud)', () => {
    expect(() => shipCentre({ ...shipLayout, rooms: [] })).toThrow(/no rooms/);
  });
});

describe('ShipHologram', () => {
  it('highlights one compartment at a time and can clear it', () => {
    const hologram = new ShipHologram(shipLayout);
    hologram.setHighlight('cryo');
    expect(hologram.highlightedRoom).toBe('cryo');
    hologram.setHighlight('lab');
    expect(hologram.highlightedRoom).toBe('lab');
    hologram.setHighlight(null);
    expect(hologram.highlightedRoom).toBeNull();
    hologram.dispose();
  });

  it('refuses to highlight a compartment that does not exist (fail loud)', () => {
    const hologram = new ShipHologram(shipLayout);
    expect(() => hologram.setHighlight('ballroom')).toThrow(/no compartment/);
    hologram.dispose();
  });

  it('takes its place, size and lean from a placement', () => {
    const hologram = new ShipHologram(shipLayout);
    hologram.setPlacement({ position: vec3(1, 2, 3), scale: 0.05, tilt: 0.4 });
    expect(hologram.group.position.toArray()).toEqual([1, 2, 3]);
    expect(hologram.group.scale.x).toBe(0.05);
    expect(hologram.group.rotation.x).toBe(0.4);
    hologram.dispose();
  });

  it('puts the drone marker where the drone really is, relative to the ship', () => {
    const hologram = new ShipHologram(shipLayout);
    const centre = shipCentre(shipLayout);
    hologram.setMarker(vec3(centre.x + 2, 1.1, centre.z - 5));
    let marker: THREE.Object3D | null = null;
    hologram.group.traverse((o) => {
      if ((o as THREE.Mesh).geometry instanceof THREE.SphereGeometry) marker = o;
    });
    expect((marker as THREE.Object3D | null)?.position.toArray()).toEqual([2, 1.1, -5]);
    hologram.dispose();
  });

  it('turns slowly over time', () => {
    const hologram = new ShipHologram(shipLayout);
    const spin = hologram.group.children[0];
    hologram.update(0);
    const before = spin?.rotation.y ?? 0;
    hologram.update(10);
    expect(spin?.rotation.y).toBeGreaterThan(before);
    hologram.dispose();
  });
});

describe('dashboardPose (the forward view from the bridge)', () => {
  const bridge = shipLayout.rooms.find((r) => r.id === 'bridge');
  if (!bridge) throw new Error('layout needs a bridge');

  it('stands inside the bridge at eye height', () => {
    const { position } = dashboardPose(bridge, 0);
    expect(position.x).toBeGreaterThan(bridge.minX);
    expect(position.x).toBeLessThan(bridge.maxX);
    expect(position.z).toBeGreaterThan(bridge.minZ);
    expect(position.z).toBeLessThan(bridge.maxZ);
    expect(position.y).toBeLessThan(shipLayout.ceilingHeight);
    expect(position.y).toBeGreaterThan(1);
  });

  it('looks ahead in the direction of travel, so stars come toward the viewer', () => {
    const { position, lookAt } = dashboardPose(bridge, 0);
    expect(lookAt.z).toBeLessThan(bridge.minZ); // through the north viewport
    expect(Math.abs(lookAt.x - position.x)).toBeLessThan(0.1); // dead ahead
  });

  it('only sways a few centimetres, never a lurch', () => {
    const rest = dashboardPose(bridge, 0).position;
    for (let t = 0; t < 60; t += 1.3) {
      const { position } = dashboardPose(bridge, t);
      expect(Math.abs(position.x - rest.x)).toBeLessThanOrEqual(gameConfig.dashboard.sway + 1e-9);
      expect(Math.abs(position.y - rest.y)).toBeLessThanOrEqual(gameConfig.dashboard.sway);
    }
  });

  it('rejects a bridge with no depth (fail loud)', () => {
    expect(() => dashboardPose({ ...bridge, maxZ: bridge.minZ }, 0)).toThrow(/no depth/);
  });
});

describe('screen textures (consoles that read as working displays)', () => {
  const SIZE = 64;
  const lit = (bytes: Uint8Array): number => {
    let count = 0;
    for (let i = 0; i < bytes.length; i += 4) {
      if ((bytes[i + 1] ?? 0) > 100) count++;
    }
    return count / (bytes.length / 4);
  };

  it('a readout is mostly dark with some lit elements (so only they glow)', () => {
    const share = lit(generateScreenPixels('readout', SIZE, 0));
    expect(share).toBeGreaterThan(0.03);
    expect(share).toBeLessThan(0.5);
  });

  it('different consoles show different readouts; the same one never changes', () => {
    const a = generateScreenPixels('readout', SIZE, 0);
    expect(Array.from(generateScreenPixels('readout', SIZE, 0))).toEqual(Array.from(a));
    expect(Array.from(generateScreenPixels('readout', SIZE, 1))).not.toEqual(Array.from(a));
  });

  it('the projector grid is symmetric about its centre', () => {
    const grid = generateScreenPixels('grid', SIZE, 0);
    const green = (x: number, y: number): number => grid[(y * SIZE + x) * 4 + 1] ?? 0;
    for (const [x, y] of [
      [5, 9],
      [20, 31],
      [13, 40],
    ] as const) {
      expect(green(x, y)).toBe(green(SIZE - 1 - x, SIZE - 1 - y));
    }
  });

  it('textures are shared between consoles showing the same variant', () => {
    expect(screenTexture('readout', 1)).toBe(screenTexture('readout', 1 + READOUT_VARIANTS));
    expect(screenTexture('readout', 1)).not.toBe(screenTexture('readout', 2));
    expect(screenTexture('grid')).toBe(screenTexture('grid', 7));
  });

  it('rejects a nonsensical size (fail loud)', () => {
    expect(() => generateScreenPixels('readout', 8, 0)).toThrow();
  });
});
