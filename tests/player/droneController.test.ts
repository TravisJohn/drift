import { describe, expect, it } from 'vitest';
import { gameConfig } from '../../src/config/gameConfig';
import { boxFromCenterSize } from '../../src/physics/colliders';
import { vec3 } from '../../src/physics/vec3';
import { DroneController, angleDelta } from '../../src/player/droneController';
import type { InputActions } from '../../src/core/input';

const DT = 1 / 60;
const IDLE: InputActions = { moveX: 0, moveZ: 0, moveY: 0 };
const FORWARD: InputActions = { moveX: 0, moveZ: 1, moveY: 0 };

function run(
  drone: DroneController,
  steps: number,
  input: InputActions,
  cameraYaw = 0,
  colliders: ReturnType<typeof boxFromCenterSize>[] = [],
): void {
  for (let i = 0; i < steps; i++) drone.update(DT, input, cameraYaw, colliders);
}

describe('angleDelta', () => {
  it('returns the shortest signed difference, wrapping across PI', () => {
    expect(angleDelta(0, Math.PI / 2)).toBeCloseTo(Math.PI / 2, 6);
    expect(angleDelta(Math.PI * 0.9, -Math.PI * 0.9)).toBeCloseTo(Math.PI * 0.2, 6);
    expect(angleDelta(-Math.PI * 0.9, Math.PI * 0.9)).toBeCloseTo(-Math.PI * 0.2, 6);
  });
});

describe('DroneController movement', () => {
  it('holding forward with camera yaw 0 moves along -Z', () => {
    const drone = new DroneController(vec3(0, 1, 0));
    run(drone, 60, FORWARD);
    expect(drone.snapshot.position.z).toBeLessThan(-1);
    expect(Math.abs(drone.snapshot.position.x)).toBeLessThan(1e-9);
  });

  it('camera yaw rotates the movement frame (yaw PI/2 -> forward is -X)', () => {
    const drone = new DroneController(vec3(0, 1, 0));
    run(drone, 60, FORWARD, Math.PI / 2);
    expect(drone.snapshot.position.x).toBeLessThan(-1);
    expect(Math.abs(drone.snapshot.position.z)).toBeLessThan(1e-6);
  });

  it('speed approaches maxSpeed but never exceeds it', () => {
    const drone = new DroneController(vec3(0, 1, 0));
    let maxObserved = 0;
    for (let i = 0; i < 400; i++) {
      drone.update(DT, FORWARD, 0, []);
      const v = drone.snapshot.velocity;
      maxObserved = Math.max(maxObserved, Math.hypot(v.x, v.z));
    }
    expect(maxObserved).toBeLessThanOrEqual(gameConfig.drone.maxSpeed + 1e-9);
    expect(maxObserved).toBeGreaterThan(gameConfig.drone.maxSpeed * 0.95);
  });

  it('diagonal input is not faster than a single axis', () => {
    const drone = new DroneController(vec3(0, 1, 0));
    run(drone, 400, { moveX: 1, moveZ: 1, moveY: 0 });
    const v = drone.snapshot.velocity;
    expect(Math.hypot(v.x, v.z)).toBeLessThanOrEqual(gameConfig.drone.maxSpeed + 1e-9);
  });

  it('damps to near rest after input is released', () => {
    const drone = new DroneController(vec3(0, 1, 0));
    run(drone, 120, FORWARD);
    run(drone, 180, IDLE);
    const v = drone.snapshot.velocity;
    expect(Math.hypot(v.x, v.z)).toBeLessThan(0.05);
  });

  it('ascends with moveY and stops at the ceiling instead of clipping through', () => {
    const ceiling = boxFromCenterSize(vec3(0, 4, 0), vec3(20, 1, 20)); // underside y=3.5
    const drone = new DroneController(vec3(0, 1, 0));
    run(drone, 300, { moveX: 0, moveZ: 0, moveY: 1 }, 0, [ceiling]);
    expect(drone.snapshot.position.y).toBeLessThanOrEqual(3.5 - gameConfig.drone.radius + 1e-6);
    expect(drone.snapshot.position.y).toBeGreaterThan(3);
  });

  it('cannot push through a wall; slides to a stop against it', () => {
    const wall = boxFromCenterSize(vec3(0, 1, -5), vec3(20, 4, 1)); // near face z=-4.5
    const drone = new DroneController(vec3(0, 1, 0));
    run(drone, 300, FORWARD, 0, [wall]);
    expect(drone.snapshot.position.z).toBeGreaterThanOrEqual(-4.5 + gameConfig.drone.radius - 1e-6);
  });

  it('turns to face its direction of travel', () => {
    const drone = new DroneController(vec3(0, 1, 0));
    run(drone, 120, FORWARD); // -Z travel -> yaw ~ 0
    expect(Math.abs(angleDelta(drone.snapshot.yaw, 0))).toBeLessThan(0.05);
    run(drone, 240, { moveX: 1, moveZ: 0, moveY: 0 }); // +X travel -> yaw ~ -PI/2
    expect(Math.abs(angleDelta(drone.snapshot.yaw, -Math.PI / 2))).toBeLessThan(0.1);
  });

  it('bobs when idle and suppresses the bob while moving fast', () => {
    const drone = new DroneController(vec3(0, 1, 0));
    let maxIdleBob = 0;
    for (let i = 0; i < 120; i++) {
      drone.update(DT, IDLE, 0, []);
      maxIdleBob = Math.max(maxIdleBob, Math.abs(drone.snapshot.bobOffset));
    }
    expect(maxIdleBob).toBeGreaterThan(gameConfig.drone.bobAmplitude * 0.8);

    run(drone, 90, FORWARD); // reach cruise speed first; bob fades on the way
    let maxMovingBob = 0;
    for (let i = 0; i < 120; i++) {
      drone.update(DT, FORWARD, 0, []);
      maxMovingBob = Math.max(maxMovingBob, Math.abs(drone.snapshot.bobOffset));
    }
    expect(maxMovingBob).toBeLessThan(gameConfig.drone.bobAmplitude * 0.2);
  });

  it('leans forward while moving and returns level at rest', () => {
    const drone = new DroneController(vec3(0, 1, 0));
    run(drone, 120, FORWARD);
    expect(drone.snapshot.leanPitch).toBeLessThan(-0.1);
    run(drone, 300, IDLE);
    expect(Math.abs(drone.snapshot.leanPitch)).toBeLessThan(0.02);
  });

  it('keeps prevPosition one step behind for render interpolation', () => {
    const drone = new DroneController(vec3(0, 1, 0));
    run(drone, 30, FORWARD);
    const before = drone.snapshot.position;
    drone.update(DT, FORWARD, 0, []);
    expect(drone.snapshot.prevPosition).toEqual(before);
    expect(drone.snapshot.position).not.toEqual(before);
  });
});

describe('DroneController tether (the drone cannot fly off into the void)', () => {
  const box = { min: vec3(-1, 0, -1), max: vec3(1, 3, 1) };

  it('never goes further than maxDistance from the hull, however long you hold forward', () => {
    const drone = new DroneController(vec3(0, 1, 0), box);
    run(drone, 60 * 20, FORWARD);
    const z = drone.snapshot.position.z;
    expect(z).toBeGreaterThanOrEqual(-1 - gameConfig.drone.tether.maxDistance - 1e-9);
    expect(drone.snapshot.tetherStrain).toBe(1);
  });

  it('drifts back inside the hard limit once you let go', () => {
    const drone = new DroneController(vec3(0, 1, 0), box);
    run(drone, 60 * 20, FORWARD);
    run(drone, 60 * 5, IDLE);
    expect(drone.snapshot.tetherStrain).toBeLessThan(1);
  });

  it('reports no strain without a tether (inside the ship nothing changes)', () => {
    const drone = new DroneController(vec3(0, 1, 0));
    run(drone, 60 * 5, FORWARD);
    expect(drone.snapshot.tetherStrain).toBe(0);
  });
});
