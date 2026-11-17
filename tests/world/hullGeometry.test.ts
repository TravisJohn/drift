import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { shipLayout } from '../../src/content/shipLayout';
import { mulberry32 } from '../../src/core/random';
import { vec3 } from '../../src/physics/vec3';
import {
  blockGeometry,
  greebleGeometry,
  spineGeometry,
} from '../../src/world/space/exterior/hullGeometry';
import { planHull } from '../../src/world/space/exterior/hullPlan';

/**
 * Signed volume of a closed triangle mesh (divergence theorem). Positive
 * only when every face's winding - and so its normal - points outward.
 */
function signedVolume(geometry: THREE.BufferGeometry): number {
  const p = geometry.attributes.position!;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  let volume = 0;
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i);
    b.fromBufferAttribute(p, i + 1);
    c.fromBufferAttribute(p, i + 2);
    volume += a.dot(b.clone().cross(c)) / 6;
  }
  return volume;
}

/** Every stored normal agrees with its triangle's winding. */
function normalsMatchWinding(geometry: THREE.BufferGeometry): boolean {
  const p = geometry.attributes.position!;
  const n = geometry.attributes.normal!;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const stored = new THREE.Vector3();
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i);
    b.fromBufferAttribute(p, i + 1).sub(a);
    c.fromBufferAttribute(p, i + 2).sub(a);
    const face = b.cross(c).normalize();
    stored.fromBufferAttribute(n, i);
    if (face.dot(stored) < 0.99) return false;
  }
  return true;
}

describe('blockGeometry (a chamfered box)', () => {
  const block = { center: vec3(2, 1, -3), size: vec3(4, 2, 6), chamfer: 0.3 };
  const geometry = blockGeometry(block, 6);

  it('is closed with outward faces, holding the box minus its cut corners', () => {
    const full = 4 * 2 * 6;
    const corners = ((4 * (0.3 * 0.3)) / 2) * 6;
    expect(signedVolume(geometry)).toBeCloseTo(full - corners, 3);
  });

  it('stores flat normals that match each face', () => {
    expect(normalsMatchWinding(geometry)).toBe(true);
  });

  it('has texture coordinates for every vertex', () => {
    expect(geometry.attributes.uv!.count).toBe(geometry.attributes.position!.count);
  });
});

describe('spineGeometry (the lofted hull)', () => {
  const plan = planHull(shipLayout);
  const geometry = spineGeometry(plan.spine, 6);

  it('is a closed solid with every face pointing outward', () => {
    expect(signedVolume(geometry)).toBeGreaterThan(100);
    expect(normalsMatchWinding(geometry)).toBe(true);
  });
});

describe('greebleGeometry (surface detail)', () => {
  const areas = [{ minX: -2, maxX: 2, minZ: -3, maxZ: 3, y: 4 }];

  it('keeps all detail inside its area, standing on the surface', () => {
    const geometry = greebleGeometry(areas, 2, mulberry32(1), 6);
    geometry.computeBoundingBox();
    const box = geometry.boundingBox!;
    expect(box.min.x).toBeGreaterThanOrEqual(-2 - 1e-6);
    expect(box.max.x).toBeLessThanOrEqual(2 + 1e-6);
    expect(box.min.z).toBeGreaterThanOrEqual(-3 - 1e-6);
    expect(box.max.z).toBeLessThanOrEqual(3 + 1e-6);
    expect(box.min.y).toBeGreaterThanOrEqual(4 - 1e-6);
  });

  it('places the same detail for the same seed', () => {
    const a = greebleGeometry(areas, 2, mulberry32(5), 6).attributes.position!.array;
    const b = greebleGeometry(areas, 2, mulberry32(5), 6).attributes.position!.array;
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it('skips areas too small to hold anything', () => {
    const geometry = greebleGeometry(
      [{ minX: 0, maxX: 0.2, minZ: 0, maxZ: 5, y: 0 }],
      4,
      mulberry32(1),
      6,
    );
    expect(geometry.attributes.position).toBeUndefined();
  });
});
