/**
 * Sphere-vs-box collision with resolve-and-slide (architecture decision D1).
 *
 * The drone is a sphere; the world is AABBs. Each resolution step finds the
 * deepest penetration, pushes the sphere out along the contact normal, and
 * removes the velocity component into the surface so the drone slides along
 * walls instead of sticking to them.
 */
import { type BoxCollider, closestPointOnBox, pointInsideBox } from './colliders';
import { type Vec3, add, dot, lengthSq, scale, sub, vec3 } from './vec3';

export interface Contact {
  /** Unit normal pointing from the surface toward the sphere center. */
  readonly normal: Vec3;
  /** How far the sphere must move along `normal` to stop overlapping. */
  readonly depth: number;
}

/** Deepest contact between a sphere and one box, or null when separated. */
export function sphereBoxContact(center: Vec3, radius: number, box: BoxCollider): Contact | null {
  if (pointInsideBox(center, box)) {
    // Degenerate case: center is inside the box. Push out through the
    // nearest face (smallest distance), with depth radius + that distance.
    const faces: Array<{ dist: number; normal: Vec3 }> = [
      { dist: center.x - box.min.x, normal: vec3(-1, 0, 0) },
      { dist: box.max.x - center.x, normal: vec3(1, 0, 0) },
      { dist: center.y - box.min.y, normal: vec3(0, -1, 0) },
      { dist: box.max.y - center.y, normal: vec3(0, 1, 0) },
      { dist: center.z - box.min.z, normal: vec3(0, 0, -1) },
      { dist: box.max.z - center.z, normal: vec3(0, 0, 1) },
    ];
    let nearest = faces[0] as { dist: number; normal: Vec3 };
    for (const face of faces) {
      if (face.dist < nearest.dist) nearest = face;
    }
    return { normal: nearest.normal, depth: radius + nearest.dist };
  }

  const closest = closestPointOnBox(center, box);
  const delta = sub(center, closest);
  const distSq = lengthSq(delta);
  if (distSq >= radius * radius) return null;

  const dist = Math.sqrt(distSq);
  if (dist < 1e-9) {
    // Center exactly on the surface; treat as inside-face case via +Y.
    return { normal: vec3(0, 1, 0), depth: radius };
  }
  return { normal: scale(delta, 1 / dist), depth: radius - dist };
}

export interface ResolveResult {
  readonly position: Vec3;
  readonly velocity: Vec3;
  /** True when any contact was resolved this call. */
  readonly collided: boolean;
}

/**
 * Resolve a sphere against all colliders, sliding along surfaces.
 *
 * Iterates because resolving one contact can create another (corners,
 * floor+wall). `maxIterations` bounds the work; typical cases settle in 1-2.
 */
export function resolveSphere(
  position: Vec3,
  radius: number,
  velocity: Vec3,
  colliders: readonly BoxCollider[],
  maxIterations = 4,
): ResolveResult {
  let pos = position;
  let vel = velocity;
  let collided = false;

  for (let i = 0; i < maxIterations; i++) {
    // Find the deepest contact this iteration.
    let deepest: Contact | null = null;
    for (const box of colliders) {
      const contact = sphereBoxContact(pos, radius, box);
      if (contact && (!deepest || contact.depth > deepest.depth)) {
        deepest = contact;
      }
    }
    if (!deepest) break;

    collided = true;
    pos = add(pos, scale(deepest.normal, deepest.depth));

    // Slide: remove the velocity component pressing into the surface.
    const into = dot(vel, deepest.normal);
    if (into < 0) {
      vel = sub(vel, scale(deepest.normal, into));
    }
  }

  return { position: pos, velocity: vel, collided };
}
