import { describe, expect, it } from 'vitest';
import { gameConfig } from '../../src/config/gameConfig';
import { vec3 } from '../../src/physics/vec3';
import {
  beaconLevel,
  blinkAmount,
  exhaustIntensity,
  eyeOffset,
  hash01,
  thrustLevel,
  thrusterTilt,
} from '../../src/player/droneAnimation';

const look = gameConfig.droneLook;

/** Sample `fn` every `step` seconds over [0, seconds). */
function sample(fn: (t: number) => number, seconds: number, step = 0.01): number[] {
  const out: number[] = [];
  for (let t = 0; t < seconds; t += step) out.push(fn(t));
  return out;
}

/** Number of separate times a sampled signal rises above `threshold`. */
function countRises(values: number[], threshold: number): number {
  let count = 0;
  for (let i = 1; i < values.length; i++) {
    if (values[i]! > threshold && values[i - 1]! <= threshold) count++;
  }
  return count;
}

describe('hash01 (repeatable randomness for blink timing)', () => {
  it('stays in [0, 1) and gives the same answer for the same input', () => {
    for (let n = -50; n < 50; n++) {
      const v = hash01(n, 3);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      expect(hash01(n, 3)).toBe(v);
    }
  });
});

describe('blinkAmount (the eye blinks like something alive, not a metronome)', () => {
  const values = sample((t) => blinkAmount(t), 120);

  it('is always between open (0) and shut (1)', () => {
    for (const v of values) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('keeps the eye open almost all the time', () => {
    const open = values.filter((v) => v === 0).length / values.length;
    expect(open).toBeGreaterThan(0.9);
  });

  it('blinks about once per window, counting doubles, over two minutes', () => {
    const windows = 120 / look.blink.cycleSeconds;
    const blinks = countRises(values, 0.5);
    expect(blinks).toBeGreaterThanOrEqual(Math.floor(windows));
    expect(blinks).toBeLessThanOrEqual(Math.ceil(windows * 2));
  });

  it('closes fully during a blink', () => {
    expect(Math.max(...sample((t) => blinkAmount(t), 60, 0.002))).toBeGreaterThan(0.95);
  });

  it('spaces blinks irregularly (gaps differ by more than a second)', () => {
    const starts: number[] = [];
    let prev = 0;
    for (let t = 0; t < 120; t += 0.005) {
      const v = blinkAmount(t);
      if (v > 0.5 && prev <= 0.5) starts.push(t);
      prev = v;
    }
    const gaps = starts.slice(1).map((s, i) => s - starts[i]!);
    expect(Math.max(...gaps) - Math.min(...gaps)).toBeGreaterThan(1);
  });
});

describe('beaconLevel (the antenna beacon: a short flash, then dark)', () => {
  it('is lit for about flash/period of the time', () => {
    const values = sample((t) => beaconLevel(t), look.beaconPeriod * 20, 0.002);
    const lit = values.filter((v) => v > 0).length / values.length;
    expect(lit).toBeCloseTo(look.beaconFlash / look.beaconPeriod, 2);
  });

  it('peaks at full brightness mid-flash and repeats every period', () => {
    const mid = look.beaconFlash / 2;
    expect(beaconLevel(mid)).toBeCloseTo(1, 6);
    expect(beaconLevel(mid + look.beaconPeriod * 7)).toBeCloseTo(1, 6);
    expect(beaconLevel(look.beaconFlash + 0.01)).toBe(0);
  });
});

describe('thrust glow (thrusters work harder the faster the drone goes)', () => {
  it('is idle when still and capped at full speed', () => {
    expect(thrustLevel(vec3())).toBe(0);
    expect(thrustLevel(vec3(0, 0, -gameConfig.drone.maxSpeed * 3))).toBe(1);
    expect(exhaustIntensity(0)).toBe(look.exhaustIdle);
    expect(exhaustIntensity(1)).toBe(look.exhaustMax);
  });

  it('brightens steadily with speed', () => {
    let last = -Infinity;
    for (let speed = 0; speed <= gameConfig.drone.maxSpeed; speed += 0.2) {
      const glow = exhaustIntensity(thrustLevel(vec3(speed, 0, 0)));
      expect(glow).toBeGreaterThanOrEqual(last);
      last = glow;
    }
  });
});

describe('thrusterTilt (exhaust points away from the direction of travel)', () => {
  it('tips duct tops forward when flying nose-first', () => {
    // Yaw 0: the nose is -Z, so flying along -Z is forward.
    const tilt = thrusterTilt(vec3(0, 0, -2), 0);
    expect(tilt.pitch).toBeLessThan(0);
    expect(tilt.roll).toBeCloseTo(0, 9);
  });

  it('tips duct tops right when sliding right, whatever the facing', () => {
    // Facing +X (yaw -PI/2), the drone's right is +Z.
    const tilt = thrusterTilt(vec3(0, 0, 2), -Math.PI / 2);
    expect(tilt.roll).toBeLessThan(0);
    expect(Math.abs(tilt.pitch)).toBeLessThan(1e-9);
  });

  it('never tilts past the limit, however fast', () => {
    const tilt = thrusterTilt(vec3(50, 0, -50), 0.3);
    expect(Math.abs(tilt.pitch)).toBeLessThanOrEqual(look.thrusterTiltMax);
    expect(Math.abs(tilt.roll)).toBeLessThanOrEqual(look.thrusterTiltMax);
  });

  it('stays level when hovering still', () => {
    const tilt = thrusterTilt(vec3(), 1.2);
    expect(Math.abs(tilt.pitch)).toBe(0);
    expect(Math.abs(tilt.roll)).toBe(0);
  });
});

describe('eyeOffset (the drone looks where it is going)', () => {
  it('glances left (-X) when banking into a left turn', () => {
    const offset = eyeOffset(0, gameConfig.drone.leanRollMax, 0);
    expect(offset.x).toBeCloseTo(-look.glanceDistance, 9);
  });

  it('holds still on the visor while moving straight', () => {
    const offset = eyeOffset(12.3, 0, 0);
    expect(Math.abs(offset.x)).toBe(0);
    expect(Math.abs(offset.y)).toBe(0);
  });

  it('wanders only a little while idle, staying on the visor', () => {
    for (let t = 0; t < 60; t += 0.1) {
      const { x, y } = eyeOffset(t, 0, 1);
      expect(Math.hypot(x, y)).toBeLessThanOrEqual(look.idleGazeDistance * 1.2);
    }
  });
});
