import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import * as THREE from 'three';
import {
  type ArtFetch,
  type SurfaceArt,
  connectArt,
  normalFromColor,
} from '../../src/art/surfaceArt';
import { gameConfig } from '../../src/config/gameConfig';
import { classifySurfaceFiles } from '../../src/content/artManifest';
import { shipLayout } from '../../src/content/shipLayout';
import { buildShip } from '../../src/world/ship/shipBuilder';

describe('classifySurfaceFiles (file names are free; a few words mean something)', () => {
  it('a single picture is the colour map', () => {
    expect(classifySurfaceFiles(['art/wall/My%20Wall%20v3.png?v=1'])).toEqual({
      color: 'art/wall/My%20Wall%20v3.png?v=1',
      normal: null,
      emissive: null,
    });
  });

  it('picks out relief and glow maps by name, whatever the order', () => {
    const files = classifySurfaceFiles([
      'art/wall/panel_emissive.png',
      'art/wall/panel_normal.png',
      'art/wall/panel.png',
    ]);
    expect(files.color).toBe('art/wall/panel.png');
    expect(files.normal).toBe('art/wall/panel_normal.png');
    expect(files.emissive).toBe('art/wall/panel_emissive.png');
  });

  it('understands the other common names for those maps', () => {
    expect(classifySurfaceFiles(['a/Wall_NRM.jpg']).normal).toBe('a/Wall_NRM.jpg');
    expect(classifySurfaceFiles(['a/wall glow.webp']).emissive).toBe('a/wall glow.webp');
  });

  it('judges the file name, not the folder it sits in', () => {
    // A folder called "lighting" must not turn every file into a glow map.
    expect(classifySurfaceFiles(['art/lighting/deck.png']).color).toBe('art/lighting/deck.png');
  });

  it('keeps the first of each kind when there are extras', () => {
    const files = classifySurfaceFiles(['a/one.png', 'a/two.png']);
    expect(files.color).toBe('a/one.png');
  });

  it('an empty folder has nothing', () => {
    expect(classifySurfaceFiles([])).toEqual({ color: null, normal: null, emissive: null });
  });
});

describe('normalFromColor (relief derived from the picture)', () => {
  const image = (
    width: number,
    height: number,
    level: (x: number, y: number) => number,
  ): Uint8Array => {
    const pixels = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const v = level(x, y);
        pixels.set([v, v, v, 255], (y * width + x) * 4);
      }
    }
    return pixels;
  };

  it('a flat picture gives a flat surface', () => {
    const normal = normalFromColor(
      image(4, 4, () => 120),
      4,
      4,
      2,
    );
    for (let i = 0; i < normal.length; i += 4) {
      expect([normal[i], normal[i + 1], normal[i + 2]]).toEqual([128, 128, 255]);
    }
  });

  it('a dark seam in a bright plate tilts the surface on both sides of it', () => {
    // Bright everywhere except a dark vertical line at x = 4.
    const normal = normalFromColor(
      image(8, 2, (x) => (x === 4 ? 0 : 255)),
      8,
      2,
      2,
    );
    const red = (x: number): number => normal[x * 4] ?? 0;
    expect(red(3)).toBeGreaterThan(160); // slopes down into the seam
    expect(red(5)).toBeLessThan(96); // and back up out of it
    expect(red(1)).toBe(128); // flat away from it
  });

  it('wraps at the edges so a tiling picture gives a tiling normal map', () => {
    // A seam on the left edge must tilt the right edge too.
    const normal = normalFromColor(
      image(8, 1, (x) => (x === 0 ? 0 : 255)),
      8,
      1,
      2,
    );
    expect(normal[7 * 4]).not.toBe(128);
  });

  it('rejects pixel data that does not match the size (fail loud)', () => {
    expect(() => normalFromColor(new Uint8Array(10), 4, 4, 1)).toThrow(/does not match/);
  });
});

describe('connectArt (art is optional; the game never depends on it)', () => {
  let warn: MockInstance<(...args: unknown[]) => void>;
  const respond =
    (body: unknown, status = 200): ArtFetch =>
    () =>
      Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });
  const fakeArt = (): SurfaceArt => ({
    map: new THREE.Texture(),
    normalMap: null,
    emissiveMap: null,
  });

  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warn.mockRestore();
  });

  it('loads only the surfaces that have files, and hands each over', async () => {
    const load = vi.fn(() => Promise.resolve(fakeArt()));
    const got: string[] = [];
    await connectArt(
      (surface) => got.push(surface),
      2,
      respond({ wall: ['art/wall/a.png'], floor: [] }),
      load,
    );
    expect(got).toEqual(['wall']);
    expect(load).toHaveBeenCalledTimes(1);
    expect(warn).not.toHaveBeenCalled();
  });

  it('a broken picture is reported and the other surfaces still load', async () => {
    const load = vi.fn((urls: readonly string[]) =>
      urls[0]?.includes('wall')
        ? Promise.reject(new Error('bad image'))
        : Promise.resolve(fakeArt()),
    );
    const got: string[] = [];
    await connectArt(
      (surface) => got.push(surface),
      2,
      respond({ wall: ['art/wall/a.png'], ceiling: ['art/ceiling/c.png'] }),
      load,
    );
    expect(got).toEqual(['ceiling']);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain('"wall"');
  });

  it('no listing at all (plain static host) means the built-in look, with one warning', async () => {
    const got: string[] = [];
    await connectArt((surface) => got.push(surface), 2, respond({}, 404), vi.fn());
    expect(got).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe('ShipWorld.applySurfaceArt', () => {
  const wallMaterial = (
    ship: ReturnType<typeof buildShip>,
    art: SurfaceArt,
  ): THREE.MeshStandardMaterial => {
    let found: THREE.MeshStandardMaterial | null = null;
    ship.group.traverse((obj) => {
      const material = (obj as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
      if (material?.map === art.map) found = material;
    });
    if (!found) throw new Error('no material carries the supplied picture');
    return found;
  };

  it('puts the picture on the surface, untinted, at the configured size', () => {
    const ship = buildShip(shipLayout);
    const art: SurfaceArt = {
      map: new THREE.Texture(),
      normalMap: new THREE.Texture(),
      emissiveMap: null,
    };
    ship.applySurfaceArt('wall', art);
    const material = wallMaterial(ship, art);
    expect(material.normalMap).toBe(art.normalMap);
    expect(material.color.getHex()).toBe(0xffffff);
    // The wall picture is meant to run floor to ceiling exactly once.
    expect(gameConfig.art.tileSize.wall).toBe(shipLayout.ceilingHeight);
    expect(art.map.repeat.x).toBeCloseTo(1, 6);
    ship.dispose();
  });

  it('a glow map makes the surface emit light where it is painted', () => {
    const ship = buildShip(shipLayout);
    const art: SurfaceArt = {
      map: new THREE.Texture(),
      normalMap: null,
      emissiveMap: new THREE.Texture(),
    };
    ship.applySurfaceArt('floor', art);
    const material = wallMaterial(ship, art);
    expect(material.emissiveMap).toBe(art.emissiveMap);
    expect(material.emissiveIntensity).toBe(gameConfig.art.emissiveLevel);
    ship.dispose();
  });

  it('keeps the baked room lighting, so the art is lit like the built-in panels', () => {
    const ship = buildShip(shipLayout);
    const art: SurfaceArt = { map: new THREE.Texture(), normalMap: null, emissiveMap: null };
    ship.applySurfaceArt('ceiling', art);
    let baked = false;
    ship.group.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if ((mesh.material as THREE.MeshStandardMaterial | undefined)?.map === art.map) {
        baked = mesh.geometry.getAttribute('bakedLight') !== undefined;
      }
    });
    expect(baked).toBe(true);
    ship.dispose();
  });
});
