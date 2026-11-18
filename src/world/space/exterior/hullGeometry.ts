/**
 * Hull geometry - turns the hull plan's sections and blocks into faceted
 * meshes, and scatters "greebles": the small boxes, stacks and pipes that
 * make a hull read as a real machine of great size.
 *
 * Every geometry here is non-indexed with flat normals (crisp facets, the
 * look of a physical studio model) and box-projected UVs measured in
 * metres, so one tiling panel texture lays evenly over every surface
 * without hand-made UV maps.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { DetailArea, HullBlock, HullSection } from './hullPlan';

/** A section that can sit off the centre line (blocks are offset in X). */
interface LoftSection extends HullSection {
  readonly cx: number;
}

/** The eight corners of a chamfered section, going round once. */
function ring(s: LoftSection): THREE.Vector3[] {
  // A tiny floor on the chamfer keeps triangles from collapsing to lines.
  const c = Math.max(0.02, s.chamfer);
  const { cx, halfWidth: hw, bottom: b, top: t, z } = s;
  return [
    [cx - hw + c, t],
    [cx + hw - c, t],
    [cx + hw, t - c],
    [cx + hw, b + c],
    [cx + hw - c, b],
    [cx - hw + c, b],
    [cx - hw, b + c],
    [cx - hw, t - c],
  ].map(([x, y]) => new THREE.Vector3(x, y, z));
}

/**
 * Collects triangles with flat normals. Each triangle is turned to face
 * away from `inside`, so callers need not get the winding right by hand.
 */
class TriangleSoup {
  private readonly positions: number[] = [];
  private readonly normals: number[] = [];
  private readonly ab = new THREE.Vector3();
  private readonly ac = new THREE.Vector3();
  private readonly n = new THREE.Vector3();
  private readonly out = new THREE.Vector3();

  add(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, inside: THREE.Vector3): void {
    this.ab.subVectors(b, a);
    this.ac.subVectors(c, a);
    this.n.crossVectors(this.ab, this.ac);
    if (this.n.lengthSq() < 1e-12) return; // degenerate: nothing to draw
    this.n.normalize();
    // Centroid minus the inside point: the way "out" for this triangle.
    this.out.copy(a).add(b).add(c).divideScalar(3).sub(inside);
    const [p, q] = this.n.dot(this.out) >= 0 ? [b, c] : [c, b];
    if (this.n.dot(this.out) < 0) this.n.negate();
    for (const v of [a, p, q]) {
      this.positions.push(v.x, v.y, v.z);
      this.normals.push(this.n.x, this.n.y, this.n.z);
    }
  }

  quad(
    a: THREE.Vector3,
    b: THREE.Vector3,
    c: THREE.Vector3,
    d: THREE.Vector3,
    inside: THREE.Vector3,
  ): void {
    this.add(a, b, c, inside);
    this.add(a, c, d, inside);
  }

  toGeometry(tileSize: number): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(this.normals, 3));
    return boxProjectUVs(geometry, tileSize);
  }
}

/**
 * Lofts chamfered sections into a closed hull: sides between neighbouring
 * sections, and caps on the first and last. Two sections at the same Z
 * make a flat shoulder where the hull steps in or out.
 */
export function loftGeometry(
  sections: readonly LoftSection[],
  tileSize: number,
): THREE.BufferGeometry {
  if (sections.length < 2) throw new Error('loftGeometry: need at least two sections');
  const soup = new TriangleSoup();
  const rings = sections.map(ring);
  const centre = (s: LoftSection) => new THREE.Vector3(s.cx, (s.bottom + s.top) / 2, s.z);

  for (let i = 0; i < sections.length - 1; i++) {
    const a = rings[i]!;
    const b = rings[i + 1]!;
    // Out is away from the hull's axis between the two sections.
    const inside = centre(sections[i]!).lerp(centre(sections[i + 1]!), 0.5);
    const shoulder = sections[i]!.z === sections[i + 1]!.z;
    for (let k = 0; k < a.length; k++) {
      const k2 = (k + 1) % a.length;
      if (shoulder) {
        // A flat step faces along Z, toward the narrower side.
        const narrowsGoingAft = sections[i]!.halfWidth > sections[i + 1]!.halfWidth;
        const hint = inside.clone().setZ(inside.z + (narrowsGoingAft ? -1 : 1));
        soup.quad(a[k]!, a[k2]!, b[k2]!, b[k]!, hint);
      } else {
        soup.quad(a[k]!, a[k2]!, b[k2]!, b[k]!, inside);
      }
    }
  }

  // Caps: fans facing forward on the first section, aft on the last.
  const capFan = (r: THREE.Vector3[], s: LoftSection, facing: number) => {
    const middle = centre(s);
    const inside = middle.clone().setZ(middle.z - facing);
    for (let k = 0; k < r.length; k++) soup.add(middle, r[k]!, r[(k + 1) % r.length]!, inside);
  };
  capFan(rings[0]!, sections[0]!, -1);
  capFan(rings[rings.length - 1]!, sections[sections.length - 1]!, 1);

  return soup.toGeometry(tileSize);
}

export const spineGeometry = (spine: readonly HullSection[], tileSize: number) =>
  loftGeometry(
    spine.map((s) => ({ ...s, cx: 0 })),
    tileSize,
  );

/** A block: the loft of one section, front and back, offset in X. */
export function blockGeometry(block: HullBlock, tileSize: number): THREE.BufferGeometry {
  const { center: c, size, chamfer } = block;
  const base = {
    cx: c.x,
    halfWidth: size.x / 2,
    bottom: c.y - size.y / 2,
    top: c.y + size.y / 2,
    chamfer,
  };
  return loftGeometry(
    [
      { ...base, z: c.z - size.z / 2 },
      { ...base, z: c.z + size.z / 2 },
    ],
    tileSize,
  );
}

/**
 * UVs from the position, per triangle, on the plane the triangle faces
 * most: a texture tiles every `tileSize` metres on every face.
 */
export function boxProjectUVs(
  geometry: THREE.BufferGeometry,
  tileSize: number,
): THREE.BufferGeometry {
  const position = geometry.attributes.position!;
  const normal = geometry.attributes.normal!;
  const uv = new Float32Array(position.count * 2);
  for (let i = 0; i < position.count; i += 3) {
    const nx = Math.abs(normal.getX(i));
    const ny = Math.abs(normal.getY(i));
    const nz = Math.abs(normal.getZ(i));
    for (let v = i; v < i + 3; v++) {
      const x = position.getX(v);
      const y = position.getY(v);
      const z = position.getZ(v);
      const [u, w] = nx >= ny && nx >= nz ? [z, y] : ny >= nz ? [x, z] : [x, y];
      uv[v * 2] = u / tileSize;
      uv[v * 2 + 1] = w / tileSize;
    }
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geometry;
}

/** A plain shape made flat-shaded and box-UV'd, ready to merge. */
export function prepare(geometry: THREE.BufferGeometry, tileSize: number): THREE.BufferGeometry {
  const flat = geometry.index ? geometry.toNonIndexed() : geometry;
  if (flat !== geometry) geometry.dispose();
  flat.deleteAttribute('uv');
  flat.computeVertexNormals();
  return boxProjectUVs(flat, tileSize);
}

/** One geometry from many; parts are disposed. Throws if they disagree. */
export function mergeParts(parts: THREE.BufferGeometry[], what: string): THREE.BufferGeometry {
  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  if (!merged) throw new Error(`Drift: could not merge the ${what} geometry`);
  return merged;
}

/**
 * Scatters surface detail over flat hull areas: low plates, stacked
 * boxes and pipe runs, all inside each area. `random` is a seeded source,
 * so the same ship is built every run.
 */
export function greebleGeometry(
  areas: readonly DetailArea[],
  perSquareMetre: number,
  random: () => number,
  tileSize: number,
): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const between = (min: number, max: number) => min + (max - min) * random();

  for (const area of areas) {
    const width = area.maxX - area.minX;
    const depth = area.maxZ - area.minZ;
    if (width <= 0.4 || depth <= 0.4) continue;
    const count = Math.round(width * depth * perSquareMetre);
    for (let i = 0; i < count; i++) {
      const kind = random();
      if (kind < 0.18) {
        // A pipe run along the hull's length.
        const radius = between(0.06, 0.14);
        const length = Math.min(depth, between(1.2, 3.6));
        const x = between(area.minX + radius, area.maxX - radius);
        const z = between(area.minZ + length / 2, area.maxZ - length / 2);
        const pipe = new THREE.CylinderGeometry(radius, radius, length, 8);
        pipe.rotateX(Math.PI / 2).translate(x, area.y + radius, z);
        parts.push(prepare(pipe, tileSize));
        continue;
      }
      const w = Math.min(width, between(0.25, 1.4));
      const d = Math.min(depth, between(0.25, 1.8));
      const h = between(0.06, 0.42);
      const x = between(area.minX + w / 2, area.maxX - w / 2);
      const z = between(area.minZ + d / 2, area.maxZ - d / 2);
      parts.push(prepare(new THREE.BoxGeometry(w, h, d).translate(x, area.y + h / 2, z), tileSize));
      if (kind > 0.7) {
        // A smaller box stacked on top: machinery, not just plates.
        const w2 = w * between(0.3, 0.7);
        const d2 = d * between(0.3, 0.7);
        const h2 = between(0.08, 0.3);
        parts.push(
          prepare(new THREE.BoxGeometry(w2, h2, d2).translate(x, area.y + h + h2 / 2, z), tileSize),
        );
      }
    }
  }
  if (parts.length === 0) return new THREE.BufferGeometry();
  return mergeParts(parts, 'hull detail');
}
