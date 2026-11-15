import { describe, expect, it } from 'vitest';
import { buildPropVisual } from '../../src/world/ship/propVisuals';
import type { PropKind } from '../../src/content/shipLayout';
import { vec3 } from '../../src/physics/vec3';

const SIZE = vec3(1.2, 1.4, 2.0);
const KINDS: PropKind[] = ['pod', 'console', 'machine', 'crate', 'seat'];

describe('buildPropVisual', () => {
  it('every prop kind builds a non-empty assembly', () => {
    for (const kind of KINDS) {
      const visual = buildPropVisual(kind, SIZE, 0);
      expect(visual.group.children.length, kind).toBeGreaterThan(1);
    }
  });

  it('pods, consoles and machines glow; crates and seats do not', () => {
    expect(buildPropVisual('pod', SIZE, 0).pulses).toHaveLength(1);
    expect(buildPropVisual('console', SIZE, 0).pulses).toHaveLength(1);
    expect(buildPropVisual('machine', SIZE, 0).pulses).toHaveLength(1);
    expect(buildPropVisual('crate', SIZE, 0).pulses).toHaveLength(0);
    expect(buildPropVisual('seat', SIZE, 0).pulses).toHaveLength(0);
  });

  it('pulses never dip to negative emissive intensity', () => {
    for (const kind of KINDS) {
      for (const pulse of buildPropVisual(kind, SIZE, 0).pulses) {
        expect(pulse.base - pulse.amplitude, kind).toBeGreaterThanOrEqual(0);
        expect(pulse.frequency, kind).toBeGreaterThan(0);
      }
    }
  });

  it('the pod breathes at cryo pace (slower than one cycle per second)', () => {
    const [pulse] = buildPropVisual('pod', SIZE, 0).pulses;
    expect(pulse?.frequency).toBeLessThan(0.5);
  });

  it('the given phase is carried into the pulse (pods stay out of sync)', () => {
    const a = buildPropVisual('pod', SIZE, 0).pulses[0];
    const b = buildPropVisual('pod', SIZE, 2.4).pulses[0];
    expect(a?.phase).not.toBe(b?.phase);
  });
});
