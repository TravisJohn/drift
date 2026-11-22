/**
 * bakedLighting - the ship's room lights and their shadows, worked out
 * once at startup and stored on the geometry.
 *
 * Why: nothing that lights the ship or blocks its light ever moves, yet a
 * live light is paid for on every pixel of every frame, and a live shadow
 * costs far more (measured on integrated graphics: eight shadowed room
 * lights took longer than the whole 60 fps frame budget). So each vertex
 * is given the light it receives - colour, distance falloff, facing, and
 * whether a wall or prop stands in the way - and the GPU only blends the
 * result. Lights no longer leak through walls, corners darken naturally,
 * and the per-frame cost is zero.
 *
 * The maths mirrors Three.js point lights, so a baked light matches the
 * live one it replaces. Only what moves (the drone's own lights) stays
 * live.
 */
import * as THREE from 'three';
import type { BoxCollider } from '../../physics/colliders';
import type { Vec3 } from '../../physics/vec3';

export interface BakeLight {
  readonly position: Vec3;
  /** Linear RGB already multiplied by the light's intensity. */
  readonly color: readonly [number, number, number];
  /** Range: no light reaches beyond this. */
  readonly distance: number;
  /** Falloff exponent (2 = physical). */
  readonly decay: number;
  /**
   * The fixture's size, in metres. A real ceiling light is a strip, not a
   * point: surfaces closer than this are lit as if they were this far
   * away, which stops the ceiling right beside the fixture burning white.
   */
  readonly softRadius: number;
  /** True for a light whose brightness wavers at run time. */
  readonly wavers: boolean;
}

/** RGB irradiance per vertex, split by whether its lights waver. */
export interface BakedLight {
  readonly steady: Float32Array;
  readonly wavering: Float32Array;
}

/** Lift the ray start off the surface so it cannot hit its own face. */
const SURFACE_OFFSET = 0.02;
/** Segment overlap shorter than this is a graze, not a blocker. */
const GRAZE = 1e-6;

/** Flatten boxes to [minX, minY, minZ, maxX, maxY, maxZ, ...] for speed. */
function flattenBoxes(boxes: readonly BoxCollider[]): Float32Array {
  const flat = new Float32Array(boxes.length * 6);
  boxes.forEach((box, i) => {
    flat.set([box.min.x, box.min.y, box.min.z, box.max.x, box.max.y, box.max.z], i * 6);
  });
  return flat;
}

/** Does the straight line from `o` to `t` pass through any box? */
function isBlocked(
  ox: number,
  oy: number,
  oz: number,
  tx: number,
  ty: number,
  tz: number,
  flat: Float32Array,
  skip: number,
): boolean {
  const origin = [ox, oy, oz];
  const delta = [tx - ox, ty - oy, tz - oz];
  for (let b = 0; b < flat.length; b += 6) {
    if (b === skip * 6) continue;
    // Slab test: clip the segment's 0..1 range against each axis pair.
    let enter = 0;
    let exit = 1;
    for (let axis = 0; axis < 3 && enter <= exit; axis++) {
      const o = origin[axis] ?? 0;
      const d = delta[axis] ?? 0;
      const min = flat[b + axis] ?? 0;
      const max = flat[b + 3 + axis] ?? 0;
      if (Math.abs(d) < 1e-9) {
        if (o <= min || o >= max) exit = -1; // parallel, outside or just touching: a miss
        continue;
      }
      const t1 = (min - o) / d;
      const t2 = (max - o) / d;
      enter = Math.max(enter, Math.min(t1, t2));
      exit = Math.min(exit, Math.max(t1, t2));
    }
    if (exit - enter > GRAZE) return true;
  }
  return false;
}

/** True when the line between two points is blocked by a box. */
export function segmentBlocked(from: Vec3, to: Vec3, boxes: readonly BoxCollider[]): boolean {
  return isBlocked(from.x, from.y, from.z, to.x, to.y, to.z, flattenBoxes(boxes), -1);
}

/** Three.js point-light falloff (lights_pars_begin: getDistanceAttenuation). */
export function distanceAttenuation(distance: number, cutoff: number, decay: number): number {
  let falloff = 1 / Math.max(Math.pow(distance, decay), 0.01);
  if (cutoff > 0) {
    const edge = Math.min(1, Math.max(0, 1 - Math.pow(distance / cutoff, 4)));
    falloff *= edge * edge;
  }
  return falloff;
}

/**
 * Light arriving at each vertex. `positions` and `normals` are world-space
 * xyz triplets. `skipOccluder` is the index of a box to ignore - a prop
 * must not be shadowed by its own collider, which it sits inside.
 */
export function bakeVertexLight(
  positions: Float32Array,
  normals: Float32Array,
  lights: readonly BakeLight[],
  occluders: readonly BoxCollider[],
  skipOccluder = -1,
): BakedLight {
  if (positions.length !== normals.length || positions.length % 3 !== 0) {
    throw new Error('bakeVertexLight: positions and normals must be matching xyz triplets');
  }
  const flat = flattenBoxes(occluders);
  const steady = new Float32Array(positions.length);
  const wavering = new Float32Array(positions.length);

  for (let i = 0; i < positions.length; i += 3) {
    const nx = normals[i] ?? 0;
    const ny = normals[i + 1] ?? 0;
    const nz = normals[i + 2] ?? 0;
    const px = (positions[i] ?? 0) + nx * SURFACE_OFFSET;
    const py = (positions[i + 1] ?? 0) + ny * SURFACE_OFFSET;
    const pz = (positions[i + 2] ?? 0) + nz * SURFACE_OFFSET;

    for (const light of lights) {
      const lx = light.position.x - px;
      const ly = light.position.y - py;
      const lz = light.position.z - pz;
      // Most lights are out of range of most vertices (the ribs' small
      // glows above all): reject those before the square root.
      const squared = lx * lx + ly * ly + lz * lz;
      if (squared <= 0 || (light.distance > 0 && squared >= light.distance * light.distance)) {
        continue;
      }
      const distance = Math.sqrt(squared);
      const facing = (nx * lx + ny * ly + nz * lz) / distance;
      if (facing <= 0) continue; // surface faces away from this light
      if (
        isBlocked(
          px,
          py,
          pz,
          light.position.x,
          light.position.y,
          light.position.z,
          flat,
          skipOccluder,
        )
      ) {
        continue;
      }
      const amount =
        facing *
        distanceAttenuation(Math.max(distance, light.softRadius), light.distance, light.decay);
      const out = light.wavers ? wavering : steady;
      out[i] = (out[i] ?? 0) + light.color[0] * amount;
      out[i + 1] = (out[i + 1] ?? 0) + light.color[1] * amount;
      out[i + 2] = (out[i + 2] ?? 0) + light.color[2] * amount;
    }
  }
  return { steady, wavering };
}

/** Store a bake on a geometry, where the patched material reads it. */
export function setBakedLight(geometry: THREE.BufferGeometry, baked: BakedLight): void {
  geometry.setAttribute('bakedLight', new THREE.BufferAttribute(baked.steady, 3));
  geometry.setAttribute('bakedWaver', new THREE.BufferAttribute(baked.wavering, 3));
}

/** World-space positions and normals of a mesh's vertices. */
export function worldVertices(mesh: THREE.Mesh): {
  positions: Float32Array;
  normals: Float32Array;
} {
  const position = mesh.geometry.getAttribute('position');
  const normal = mesh.geometry.getAttribute('normal');
  if (!position || !normal) {
    throw new Error('worldVertices: geometry needs position and normal attributes');
  }
  mesh.updateWorldMatrix(true, false);
  const normalMatrix = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
  const positions = new Float32Array(position.count * 3);
  const normals = new Float32Array(position.count * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    v.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
    positions.set([v.x, v.y, v.z], i * 3);
    v.fromBufferAttribute(normal, i).applyMatrix3(normalMatrix).normalize();
    normals.set([v.x, v.y, v.z], i * 3);
  }
  return { positions, normals };
}

/**
 * Make a material add the baked light to its shading. `waver` is a shared
 * multiplier for the wavering part (1 = nominal), changed at run time for
 * the flicker of a tired fixture.
 *
 * Done by inserting three lines into Three's standard shader at named
 * include points. If a future Three.js renames them the insertion would
 * silently do nothing, so it is checked and fails loudly instead.
 */
export function useBakedLight(
  material: THREE.MeshStandardMaterial,
  waver: { value: number },
  roomLevel: { value: number } = { value: 1 },
): void {
  material.onBeforeCompile = (shader) => {
    const insert = (source: string, anchor: string, addition: string): string => {
      if (!source.includes(anchor)) {
        throw new Error(`useBakedLight: shader anchor "${anchor}" not found in this Three.js`);
      }
      return source.replace(anchor, `${anchor}\n${addition}`);
    };
    shader.uniforms.uLightWaver = waver;
    shader.uniforms.uRoomLevel = roomLevel;
    shader.vertexShader = insert(
      insert(
        shader.vertexShader,
        '#include <common>',
        'attribute vec3 bakedLight;\nattribute vec3 bakedWaver;\nuniform float uLightWaver;\nuniform float uRoomLevel;\nvarying vec3 vBakedLight;',
      ),
      '#include <begin_vertex>',
      'vBakedLight = (bakedLight + bakedWaver * uLightWaver) * uRoomLevel;',
    );
    shader.fragmentShader = insert(
      insert(shader.fragmentShader, '#include <common>', 'varying vec3 vBakedLight;'),
      '#include <lights_fragment_maps>',
      // Joins the ambient/indirect diffuse term, so it is tinted by the
      // surface colour exactly as a live light's diffuse would be.
      '#if defined( RE_IndirectDiffuse )\n\tirradiance += vBakedLight;\n#endif',
    );
  };
  // Keeps Three from reusing an unpatched program for this material.
  material.customProgramCacheKey = () => 'drift-baked-light';
  material.needsUpdate = true;
}
