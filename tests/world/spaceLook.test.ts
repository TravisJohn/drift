import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { locations } from '../../src/content/destinations';
import { createHaloMaterial, createSpaceUniforms } from '../../src/world/space/bodyMaterials';
import { CelestialBodies } from '../../src/world/space/celestialBodies';
import { GALACTIC_POLE, createSkyStarPositions } from '../../src/world/space/skyDome';
import { createStarAttributes, projectionScale } from '../../src/world/space/starLook';
import { mulberry32 } from '../../src/world/space/starfield';
import type { TravelView } from '../../src/travel/travelDirector';

describe('createStarAttributes (what makes a sky read as a sky)', () => {
  const attrs = createStarAttributes(4000, 1, 10, mulberry32(3));

  it('keeps every size inside the requested range', () => {
    for (const size of attrs.sizes) {
      expect(size).toBeGreaterThanOrEqual(1);
      expect(size).toBeLessThanOrEqual(10);
    }
  });

  it('is mostly faint stars with a few bright ones, not uniform dots', () => {
    const sorted = [...attrs.sizes].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
    const big = sorted.filter((s) => s > 5.5).length;
    expect(median).toBeLessThan(2);
    expect(big).toBeGreaterThan(0);
    expect(big).toBeLessThan(sorted.length * 0.15);
  });

  it('varies star colour instead of painting them all one white', () => {
    const tints = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const r = attrs.colors[i * 3] ?? 0;
      const b = attrs.colors[i * 3 + 2] ?? 0;
      tints.add(r > b * 1.1 ? 'warm' : b > r * 1.1 ? 'cool' : 'white');
    }
    expect(tints.size).toBe(3);
  });

  it('the brightest stars exceed 1 so the bloom pass makes them glow', () => {
    expect(Math.max(...attrs.colors)).toBeGreaterThan(1);
  });

  it('is deterministic: same seed, same sky', () => {
    const again = createStarAttributes(4000, 1, 10, mulberry32(3));
    expect(Array.from(again.sizes)).toEqual(Array.from(attrs.sizes));
    expect(Array.from(again.phases)).toEqual(Array.from(attrs.phases));
  });

  it('rejects impossible inputs (fail loud)', () => {
    expect(() => createStarAttributes(0, 1, 2, Math.random)).toThrow();
    expect(() => createStarAttributes(5, 2, 1, Math.random)).toThrow();
  });
});

describe('projectionScale', () => {
  it('gives pixels per world unit at distance 1 for the camera', () => {
    // 600 px tall, 60 degree fov: 300 / tan(30 deg).
    expect(projectionScale(600, 60)).toBeCloseTo(519.615, 2);
  });
});

describe('createSkyStarPositions', () => {
  const RADIUS = 900;
  const positions = createSkyStarPositions(6000, RADIUS, 0.5, 0.16, mulberry32(11));
  const pole = new THREE.Vector3(...GALACTIC_POLE);

  it('puts every star on the sky sphere (too far to show parallax)', () => {
    for (let i = 0; i < positions.length; i += 3) {
      const r = Math.hypot(positions[i] ?? 0, positions[i + 1] ?? 0, positions[i + 2] ?? 0);
      expect(r).toBeCloseTo(RADIUS, 1);
    }
  });

  it('gathers stars into a galactic band rather than spreading them evenly', () => {
    let nearPlane = 0;
    const v = new THREE.Vector3();
    for (let i = 0; i < positions.length; i += 3) {
      v.set(positions[i] ?? 0, positions[i + 1] ?? 0, positions[i + 2] ?? 0).normalize();
      if (Math.abs(v.dot(pole)) < 0.25) nearPlane++;
    }
    // A uniform sky would put 25% of stars in this strip.
    expect(nearPlane / (positions.length / 3)).toBeGreaterThan(0.5);
  });

  it('is deterministic and rejects impossible inputs', () => {
    const again = createSkyStarPositions(6000, RADIUS, 0.5, 0.16, mulberry32(11));
    expect(Array.from(again.slice(0, 30))).toEqual(Array.from(positions.slice(0, 30)));
    expect(() => createSkyStarPositions(10, RADIUS, 1.5, 0.16, Math.random)).toThrow();
    expect(() => createSkyStarPositions(0, RADIUS, 0.5, 0.16, Math.random)).toThrow();
  });
});

describe('body materials', () => {
  const shared = createSpaceUniforms(new THREE.Vector3(3, 0, 0));

  it('normalises the light direction', () => {
    expect(shared.uLightDir.value.length()).toBeCloseTo(1, 6);
  });

  it('a halo fades to nothing exactly at the outer edge of its shell', () => {
    const halo = createHaloMaterial(shared, new THREE.Color(1, 1, 1), {
      shellRatio: 2,
      falloff: 2,
      strength: 1,
      allAround: false,
    });
    // On a shell twice the body's size the body's edge sits at sqrt(3)/2.
    expect(halo.uniforms.uInnerEdge?.value).toBeCloseTo(Math.sqrt(3) / 2, 6);
    halo.dispose();
  });

  it('a halo shell must be larger than its body (fail loud)', () => {
    expect(() =>
      createHaloMaterial(shared, new THREE.Color(1, 1, 1), {
        shellRatio: 1,
        falloff: 2,
        strength: 1,
        allAround: true,
      }),
    ).toThrow(/shellRatio/);
  });
});

describe('CelestialBodies', () => {
  const view = (over: Partial<TravelView>): TravelView =>
    ({
      driftSpeed: 0,
      engineIntensity: 0,
      currentBodyId: null,
      currentBodyPresence: 0,
      destinationBodyId: null,
      destinationBodyPresence: 0,
      ...over,
    }) as TravelView;

  const make = (): {
    bodies: CelestialBodies;
    uniforms: ReturnType<typeof createSpaceUniforms>;
  } => {
    const uniforms = createSpaceUniforms(new THREE.Vector3(1, 1, 0));
    return { bodies: new CelestialBodies(locations, uniforms), uniforms };
  };
  const visibleCount = (bodies: CelestialBodies): number =>
    bodies.group.children.filter((c) => c.visible).length;

  it('builds one body per location and shows none until placed', () => {
    const { bodies } = make();
    expect(bodies.group.children).toHaveLength(locations.length);
    expect(visibleCount(bodies)).toBe(0);
    bodies.dispose();
  });

  it('shows only the docked location at full size', () => {
    const { bodies } = make();
    bodies.apply(view({ currentBodyId: 'aurelia', currentBodyPresence: 1 }));
    expect(visibleCount(bodies)).toBe(1);
    const shown = bodies.group.children.find((c) => c.visible);
    expect(shown?.scale.x).toBeCloseTo(1, 6);
    bodies.dispose();
  });

  it("a ringed planet's ring shadow follows the planet as it moves and shrinks", () => {
    const { bodies } = make();
    const ringUniforms = (): { center: THREE.Vector3; radius: number } => {
      let found: { center: THREE.Vector3; radius: number } | null = null;
      bodies.group.traverse((obj) => {
        const material = (obj as THREE.Mesh).material as THREE.ShaderMaterial | undefined;
        const u = material?.uniforms;
        if (u?.uBodyCenter && u.uBodyRadius) {
          found = {
            center: (u.uBodyCenter.value as THREE.Vector3).clone(),
            radius: u.uBodyRadius.value as number,
          };
        }
      });
      if (!found) throw new Error('no ring material found');
      return found;
    };
    const spec = locations.find((l) => l.body.kind === 'ringed');
    if (!spec) throw new Error('the content has no ringed location');

    bodies.apply(view({ currentBodyId: spec.id, currentBodyPresence: 1 }));
    const docked = ringUniforms();
    expect(docked.radius).toBeCloseTo(spec.body.radius, 6);

    bodies.apply(view({ currentBodyId: spec.id, currentBodyPresence: 0.5 }));
    const leaving = ringUniforms();
    expect(leaving.radius).toBeCloseTo(spec.body.radius * 0.5, 6);
    expect(leaving.center.distanceTo(docked.center)).toBeGreaterThan(1);
    bodies.dispose();
  });

  it('update() drives the shared clock that animates every surface', () => {
    const { bodies, uniforms } = make();
    bodies.update(12.5);
    expect(uniforms.uTime.value).toBe(12.5);
    bodies.dispose();
  });
});
