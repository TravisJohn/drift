import { describe, expect, it } from 'vitest';
import { boxFromCenterSize } from '../../src/physics/colliders';
import { resolveSphere, sphereBoxContact } from '../../src/physics/sphereCollision';
import { length, vec3 } from '../../src/physics/vec3';

const RADIUS = 0.35;

describe('sphereBoxContact', () => {
  const wall = boxFromCenterSize(vec3(5, 0, 0), vec3(1, 10, 10)); // x in [4.5, 5.5]

  it('returns null when clearly separated', () => {
    expect(sphereBoxContact(vec3(0, 0, 0), RADIUS, wall)).toBeNull();
  });

  it('returns a face contact with the correct normal and depth', () => {
    const contact = sphereBoxContact(vec3(4.3, 0, 0), RADIUS, wall);
    expect(contact).not.toBeNull();
    expect(contact?.normal).toEqual(vec3(-1, 0, 0)); // pushes away from the wall
    expect(contact?.depth).toBeCloseTo(RADIUS - 0.2, 5); // overlapping by 0.15
  });

  it('returns a rounded contact at a corner (diagonal normal)', () => {
    const box = boxFromCenterSize(vec3(0, 0, 0), vec3(2, 2, 2));
    const contact = sphereBoxContact(vec3(1.2, 1.2, 0), RADIUS, box);
    expect(contact).not.toBeNull();
    const n = contact?.normal ?? vec3();
    expect(n.x).toBeCloseTo(Math.SQRT1_2, 4);
    expect(n.y).toBeCloseTo(Math.SQRT1_2, 4);
    expect(length(n)).toBeCloseTo(1, 6);
  });

  it('pushes out through the nearest face when the center is inside the box', () => {
    const box = boxFromCenterSize(vec3(0, 0, 0), vec3(4, 4, 4));
    const contact = sphereBoxContact(vec3(1.8, 0, 0), RADIUS, box); // nearest +x face
    expect(contact?.normal).toEqual(vec3(1, 0, 0));
    expect(contact?.depth).toBeCloseTo(RADIUS + 0.2, 5);
  });
});

describe('resolveSphere (collide and slide)', () => {
  const floor = boxFromCenterSize(vec3(0, -0.5, 0), vec3(20, 1, 20)); // top at y=0

  it('leaves position and velocity untouched in open space', () => {
    const result = resolveSphere(vec3(0, 2, 0), RADIUS, vec3(1, 0, 0), [floor]);
    expect(result.collided).toBe(false);
    expect(result.position).toEqual(vec3(0, 2, 0));
    expect(result.velocity).toEqual(vec3(1, 0, 0));
  });

  it('pushes the sphere up out of the floor and zeroes downward velocity', () => {
    const result = resolveSphere(vec3(0, 0.2, 0), RADIUS, vec3(0, -3, 0), [floor]);
    expect(result.collided).toBe(true);
    expect(result.position.y).toBeCloseTo(RADIUS, 5);
    expect(result.velocity.y).toBe(0);
  });

  it('preserves tangential velocity when hitting a wall head-on at an angle (slide)', () => {
    const wall = boxFromCenterSize(vec3(5, 0, 0), vec3(1, 10, 10)); // face at x=4.5
    const result = resolveSphere(vec3(4.3, 0, 0), RADIUS, vec3(2, 0, 3), [wall]);
    expect(result.collided).toBe(true);
    expect(result.position.x).toBeCloseTo(4.5 - RADIUS, 5);
    expect(result.velocity.x).toBe(0); // into-wall component removed
    expect(result.velocity.z).toBe(3); // sliding component kept
  });

  it('does not remove velocity moving away from a surface', () => {
    const wall = boxFromCenterSize(vec3(5, 0, 0), vec3(1, 10, 10));
    const result = resolveSphere(vec3(4.3, 0, 0), RADIUS, vec3(-2, 0, 0), [wall]);
    expect(result.velocity.x).toBe(-2); // already leaving; untouched
  });

  it('settles into an inside corner by resolving both contacts', () => {
    const wallX = boxFromCenterSize(vec3(5, 0, 0), vec3(1, 10, 10)); // face at x=4.5
    const wallZ = boxFromCenterSize(vec3(0, 0, 5), vec3(10, 10, 1)); // face at z=4.5
    const result = resolveSphere(vec3(4.4, 0, 4.4), RADIUS, vec3(2, 0, 2), [wallX, wallZ]);
    expect(result.position.x).toBeLessThanOrEqual(4.5 - RADIUS + 1e-6);
    expect(result.position.z).toBeLessThanOrEqual(4.5 - RADIUS + 1e-6);
    expect(result.velocity.x).toBe(0);
    expect(result.velocity.z).toBe(0);
  });

  it('a fast shallow overlap cannot end up on the far side of a wall', () => {
    const wall = boxFromCenterSize(vec3(5, 0, 0), vec3(1, 10, 10));
    // Deep overlap from the -x side: center still on the near half.
    const result = resolveSphere(vec3(4.6, 0, 0), RADIUS, vec3(10, 0, 0), [wall]);
    expect(result.position.x).toBeLessThanOrEqual(4.5 - RADIUS + 1e-6);
  });
});
