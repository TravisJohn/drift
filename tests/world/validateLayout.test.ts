import { describe, expect, it } from 'vitest';
import { shipLayout, type ShipLayout } from '../../src/content/shipLayout';
import { validateLayout } from '../../src/world/ship/validateLayout';
import { vec3 } from '../../src/physics/vec3';

/** A minimal valid two-room layout to mutate in failure tests. */
const base: ShipLayout = {
  ceilingHeight: 3.2,
  wallThickness: 0.3,
  doorWidth: 1.6,
  doorHeight: 2.3,
  windowBottom: 0.9,
  windowTop: 2.4,
  rooms: [
    { id: 'bridge', name: 'A', minX: -3, maxX: 3, minZ: -6, maxZ: 0 },
    { id: 'cargo', name: 'B', minX: -3, maxX: 3, minZ: 0, maxZ: 6 },
  ],
  doors: [{ rooms: ['bridge', 'cargo'] }],
  windows: [{ roomId: 'bridge', side: 'north', center: 0, width: 2 }],
  props: [{ roomId: 'cargo', kind: 'crate', center: vec3(0, 0.5, 3), size: vec3(1, 1, 1) }],
  spawn: vec3(0, 1.1, -3),
};

describe('validateLayout on the real ship content', () => {
  it('the shipped layout has no problems', () => {
    expect(validateLayout(shipLayout)).toEqual([]);
  });

  it('the shipped layout has the five PRD rooms plus the corridor', () => {
    const ids = shipLayout.rooms.map((r) => r.id);
    for (const id of ['bridge', 'cargo', 'lab', 'engineering', 'cryo', 'corridor']) {
      expect(ids).toContain(id);
    }
  });

  it('the shipped layout has a helm prop on the bridge and at least one window per PRD room', () => {
    const helm = shipLayout.props.find((p) => p.id === 'helm');
    expect(helm?.roomId).toBe('bridge');
    for (const roomId of ['bridge', 'lab', 'cargo', 'cryo', 'engineering']) {
      expect(shipLayout.windows.some((w) => w.roomId === roomId)).toBe(true);
    }
  });
});

describe('validateLayout failure detection', () => {
  it('detects overlapping rooms', () => {
    const layout: ShipLayout = {
      ...base,
      rooms: [
        base.rooms[0] as ShipLayout['rooms'][number],
        { id: 'cargo', name: 'B', minX: -3, maxX: 3, minZ: -2, maxZ: 6 },
      ],
    };
    expect(validateLayout(layout).join()).toMatch(/overlap/);
  });

  it('detects a door between rooms that share no edge', () => {
    const layout: ShipLayout = {
      ...base,
      rooms: [
        base.rooms[0] as ShipLayout['rooms'][number],
        { id: 'cargo', name: 'B', minX: -3, maxX: 3, minZ: 2, maxZ: 8 },
      ],
    };
    const problems = validateLayout(layout).join();
    expect(problems).toMatch(/share no edge/);
  });

  it('detects an unreachable room (missing door)', () => {
    const layout: ShipLayout = { ...base, doors: [] };
    expect(validateLayout(layout).join()).toMatch(/unreachable/);
  });

  it('detects a window on a shared (non-exterior) wall', () => {
    const layout: ShipLayout = {
      ...base,
      windows: [{ roomId: 'bridge', side: 'south', center: 0, width: 2 }],
    };
    expect(validateLayout(layout).join()).toMatch(/does not fit in an exterior wall span/);
  });

  it('detects a prop sticking out of its room', () => {
    const layout: ShipLayout = {
      ...base,
      props: [{ roomId: 'cargo', kind: 'crate', center: vec3(2.9, 0.5, 3), size: vec3(1, 1, 1) }],
    };
    expect(validateLayout(layout).join()).toMatch(/sticks out/);
  });

  it('detects a spawn outside every room', () => {
    const layout: ShipLayout = { ...base, spawn: vec3(50, 1.1, 0) };
    expect(validateLayout(layout).join()).toMatch(/spawn point/);
  });

  it('detects duplicate prop ids', () => {
    const layout: ShipLayout = {
      ...base,
      props: [
        {
          id: 'helm',
          roomId: 'cargo',
          kind: 'crate',
          center: vec3(0, 0.5, 3),
          size: vec3(1, 1, 1),
        },
        {
          id: 'helm',
          roomId: 'cargo',
          kind: 'crate',
          center: vec3(1.5, 0.5, 3),
          size: vec3(1, 1, 1),
        },
      ],
    };
    expect(validateLayout(layout).join()).toMatch(/duplicate prop id/);
  });

  it('accepts the unmutated base layout', () => {
    expect(validateLayout(base)).toEqual([]);
  });
});
