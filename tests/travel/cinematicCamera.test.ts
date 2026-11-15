import { beforeEach, describe, expect, it } from 'vitest';
import { CinematicCamera } from '../../src/travel/cinematicCamera';
import { gameConfig } from '../../src/config/gameConfig';

describe('CinematicCamera', () => {
  let camera: CinematicCamera;

  beforeEach(() => {
    camera = new CinematicCamera();
    camera.reset();
  });

  it('orbits at the configured radius', () => {
    for (let i = 0; i < 10; i++) {
      const pose = camera.update(1);
      const r = Math.hypot(pose.position.x, pose.position.z);
      expect(r).toBeCloseTo(gameConfig.cinematic.orbitRadius, 6);
    }
  });

  it('always looks at the ship, not at empty space', () => {
    const pose = camera.update(0.5);
    expect(pose.lookAt).toEqual({ x: 0, y: 2, z: 0 });
  });

  it('slowly advances around the ship over time', () => {
    const a = camera.update(1);
    for (let i = 0; i < 60; i++) camera.update(1);
    const b = camera.update(1);
    const angleA = Math.atan2(a.position.x, a.position.z);
    const angleB = Math.atan2(b.position.x, b.position.z);
    expect(angleA).not.toBeCloseTo(angleB, 2);
  });

  it('height breathes around the configured orbit height', () => {
    const { orbitHeight, bobAmplitude } = gameConfig.cinematic;
    for (let i = 0; i < 200; i++) {
      const pose = camera.update(0.25);
      expect(pose.position.y).toBeGreaterThanOrEqual(orbitHeight - bobAmplitude - 1e-9);
      expect(pose.position.y).toBeLessThanOrEqual(orbitHeight + bobAmplitude + 1e-9);
    }
  });

  it('reset returns the shot to its opening angle', () => {
    const first = camera.update(1 / 60);
    for (let i = 0; i < 300; i++) camera.update(1);
    camera.reset();
    const again = camera.update(1 / 60);
    expect(again.position.x).toBeCloseTo(first.position.x, 6);
    expect(again.position.z).toBeCloseTo(first.position.z, 6);
  });
});
