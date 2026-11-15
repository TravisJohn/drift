/**
 * boxesGeometry - merge many axis-aligned boxes into one mesh geometry
 * whose texture coordinates follow world space.
 *
 * Reasons this exists:
 * - a tiling panel texture must not stretch with each wall's size, and its
 *   seams must line up from one wall piece to the next - so UVs are world
 *   metres divided by the tile size, not 0..1 per box;
 * - one geometry per surface kind means one draw call instead of one per
 *   wall piece;
 * - faces can be split into a grid of small cells, giving baked lighting
 *   (see bakedLighting.ts) enough vertices to show soft shadow edges.
 */
import * as THREE from 'three';
import type { Vec3 } from '../../physics/vec3';

export interface WorldBox {
  readonly center: Vec3;
  readonly size: Vec3;
}

export interface BoxesGeometryOptions {
  /**
   * Split every face so no cell is larger than this many metres. Omit for
   * one quad per face.
   */
  readonly maxCell?: number;
  /**
   * Which faces to build: a floor only ever shows its top, a ceiling its
   * underside; everything else needs all six.
   */
  readonly faces?: 'all' | 'top' | 'bottom';
}

type Axis = readonly [number, number, number];

/**
 * The six faces of a box: outward normal, then the two in-plane axes that
 * the texture runs along. u x v = normal, so each quad winds
 * counter-clockwise seen from outside.
 */
const FACES: readonly { readonly n: Axis; readonly u: Axis; readonly v: Axis }[] = [
  { n: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0] },
  { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
  { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1] },
  { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] },
  { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] },
  { n: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0] },
];

const dot = (a: Axis, b: Axis): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

function wantsFace(normal: Axis, faces: 'all' | 'top' | 'bottom'): boolean {
  if (faces === 'top') return normal[1] === 1;
  if (faces === 'bottom') return normal[1] === -1;
  return true;
}

/**
 * Build one geometry from `boxes`. `tileSize` is how many world metres one
 * repeat of the texture covers.
 */
export function buildBoxesGeometry(
  boxes: readonly WorldBox[],
  tileSize: number,
  options: BoxesGeometryOptions = {},
): THREE.BufferGeometry {
  const maxCell = options.maxCell ?? Infinity;
  const faces = options.faces ?? 'all';
  if (tileSize <= 0 || maxCell <= 0) {
    throw new Error('buildBoxesGeometry: tileSize and maxCell must be positive');
  }
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (const box of boxes) {
    const center: Axis = [box.center.x, box.center.y, box.center.z];
    const half: Axis = [box.size.x / 2, box.size.y / 2, box.size.z / 2];
    for (const face of FACES) {
      if (!wantsFace(face.n, faces)) continue;
      // Half-extents of this face along its normal and texture axes.
      const hn = Math.abs(dot(face.n, half));
      const hu = Math.abs(dot(face.u, half));
      const hv = Math.abs(dot(face.v, half));
      const cellsU = Math.max(1, Math.ceil((2 * hu) / maxCell));
      const cellsV = Math.max(1, Math.ceil((2 * hv) / maxCell));
      const first = positions.length / 3;

      for (let j = 0; j <= cellsV; j++) {
        for (let i = 0; i <= cellsU; i++) {
          const su = -hu + (2 * hu * i) / cellsU;
          const sv = -hv + (2 * hv * j) / cellsV;
          const p: Axis = [
            center[0] + face.n[0] * hn + face.u[0] * su + face.v[0] * sv,
            center[1] + face.n[1] * hn + face.u[1] * su + face.v[1] * sv,
            center[2] + face.n[2] * hn + face.u[2] * su + face.v[2] * sv,
          ];
          positions.push(...p);
          normals.push(...face.n);
          uvs.push(dot(p, face.u) / tileSize, dot(p, face.v) / tileSize);
        }
      }
      const row = cellsU + 1;
      for (let j = 0; j < cellsV; j++) {
        for (let i = 0; i < cellsU; i++) {
          const a = first + j * row + i;
          indices.push(a, a + 1, a + row + 1, a, a + row + 1, a + row);
        }
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}
