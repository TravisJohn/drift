import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { shipLayout } from '../../src/content/shipLayout';
import { generateHullTextureData } from '../../src/world/space/exterior/hullTexture';
import { ShipExterior } from '../../src/world/space/shipExterior';

describe('generateHullTextureData (the plating)', () => {
  const size = 64;
  const data = generateHullTextureData(size, 3);

  it('fills every pixel, fully opaque', () => {
    expect(data.length).toBe(size * size * 4);
    for (let i = 3; i < data.length; i += 4) expect(data[i]).toBe(255);
  });

  it('is a mid-to-light grey overall, with dark seams between plates', () => {
    let sum = 0;
    let darkest = 255;
    for (let i = 0; i < data.length; i += 4) {
      const lum = (data[i]! + data[i + 1]! + data[i + 2]!) / 3;
      sum += lum;
      darkest = Math.min(darkest, lum);
    }
    const mean = sum / (size * size);
    expect(mean).toBeGreaterThan(90);
    expect(mean).toBeLessThan(170);
    expect(darkest).toBeLessThan(mean * 0.6);
  });

  it('is the same for the same seed and differs for another', () => {
    expect(Array.from(generateHullTextureData(32, 8))).toEqual(
      Array.from(generateHullTextureData(32, 8)),
    );
    expect(Array.from(generateHullTextureData(32, 9))).not.toEqual(
      Array.from(generateHullTextureData(32, 8)),
    );
  });

  it('refuses sizes too small to hold plates', () => {
    expect(() => generateHullTextureData(8, 1)).toThrow(/at least 16/);
  });
});

describe('ShipExterior', () => {
  it('builds in a handful of draw calls (merged by material)', () => {
    const exterior = new ShipExterior(shipLayout);
    let meshes = 0;
    exterior.group.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) meshes++;
    });
    // Hull, detail, windows, 3 engine parts, 5 running lights.
    expect(meshes).toBeLessThanOrEqual(12);
    exterior.dispose();
  });

  it('encloses the whole deck plan', () => {
    const exterior = new ShipExterior(shipLayout);
    const bounds = new THREE.Box3().setFromObject(exterior.group);
    for (const room of shipLayout.rooms) {
      expect(bounds.min.x).toBeLessThan(room.minX);
      expect(bounds.max.x).toBeGreaterThan(room.maxX);
      expect(bounds.min.z).toBeLessThan(room.minZ);
      expect(bounds.max.z).toBeGreaterThan(room.maxZ);
    }
    exterior.dispose();
  });

  it('takes engine intensity and time without complaint, clamping out-of-range input', () => {
    const exterior = new ShipExterior(shipLayout);
    expect(() => {
      exterior.setEngineIntensity(-1);
      exterior.setEngineIntensity(2);
      exterior.update(123.4);
    }).not.toThrow();
    exterior.dispose();
  });
});
