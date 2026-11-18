import { describe, expect, it } from 'vitest';
import { shipLayout, type ShipLayout } from '../../src/content/shipLayout';
import { vec3 } from '../../src/physics/vec3';
import {
  hullBounds,
  hullContains,
  isSpineRoom,
  planHull,
  spineSectionAt,
} from '../../src/world/space/exterior/hullPlan';

const plan = planHull(shipLayout);

describe('planHull (the outside fits around the inside)', () => {
  it('encloses every corner of every room, floor to ceiling', () => {
    const inset = 0.01;
    for (const room of shipLayout.rooms) {
      for (const x of [room.minX + inset, room.maxX - inset]) {
        for (const z of [room.minZ + inset, room.maxZ - inset]) {
          for (const y of [inset, shipLayout.ceilingHeight - inset]) {
            expect(hullContains(plan, vec3(x, y, z)), `${room.id} ${x},${y},${z}`).toBe(true);
          }
        }
      }
    }
  });

  it('runs the spine bow to stern, never doubling back', () => {
    for (let i = 1; i < plan.spine.length; i++) {
      expect(plan.spine[i]!.z).toBeGreaterThanOrEqual(plan.spine[i - 1]!.z);
    }
  });

  it('puts the prow ahead of every room and the engine face behind them all', () => {
    const bow = Math.min(...shipLayout.rooms.map((r) => r.minZ));
    const stern = Math.max(...shipLayout.rooms.map((r) => r.maxZ));
    expect(plan.spine[0]!.z).toBeLessThan(bow - 3);
    for (const engine of plan.engines) expect(engine.position.z).toBeGreaterThan(stern);
  });

  it('makes a module for each room that does not cross the centre line', () => {
    const sideRooms = shipLayout.rooms.filter((r) => !isSpineRoom(r));
    expect(sideRooms.length).toBeGreaterThan(0);
    for (const room of sideRooms) {
      const centre = vec3((room.minX + room.maxX) / 2, 1, (room.minZ + room.maxZ) / 2);
      expect(
        plan.blocks.some(
          (b) => Math.abs(b.center.x - centre.x) < 0.01 && Math.abs(b.center.z - centre.z) < 0.01,
        ),
        room.id,
      ).toBe(true);
    }
  });

  it('lights windows outside the hull skin, not inside a room', () => {
    for (const w of plan.windows) {
      // Inside a room means within its walls AND below its ceiling: the
      // canopy glazing sits on the roof, above the bridge.
      const insideARoom = shipLayout.rooms.some(
        (r) =>
          w.center.x > r.minX &&
          w.center.x < r.maxX &&
          w.center.z > r.minZ &&
          w.center.z < r.maxZ &&
          w.center.y < shipLayout.ceilingHeight,
      );
      expect(insideARoom, `${w.roomId} window at ${w.center.x},${w.center.z}`).toBe(false);
    }
  });

  it('shows every side window of the layout on the outside', () => {
    const sideWindows = shipLayout.windows.filter((w) => w.side === 'east' || w.side === 'west');
    for (const w of sideWindows) {
      expect(
        plan.windows.some(
          (lit) => lit.roomId === w.roomId && Math.abs(lit.center.z - w.center) < 0.01,
        ),
        `${w.roomId} ${w.side}`,
      ).toBe(true);
    }
  });

  it('has red to port (-X) and green to starboard (+X), as ships do', () => {
    const port = plan.lights.find((l) => l.kind === 'port');
    const starboard = plan.lights.find((l) => l.kind === 'starboard');
    expect(port?.position.x).toBeLessThan(0);
    expect(starboard?.position.x).toBeGreaterThan(0);
  });

  it('builds the same ship every run for the same seed', () => {
    expect(planHull(shipLayout, 9)).toEqual(planHull(shipLayout, 9));
    // A different seed lights different portholes, same hull.
    const other = planHull(shipLayout, 10);
    expect(other.spine).toEqual(planHull(shipLayout, 9).spine);
  });

  it('refuses a layout with no rooms, or none on the centre line', () => {
    expect(() => planHull({ ...shipLayout, rooms: [] })).toThrow(/no rooms/);
    const offCentre: ShipLayout = {
      ...shipLayout,
      rooms: [{ id: 'lab', name: 'Lab', minX: 1, maxX: 4, minZ: 0, maxZ: 4 }],
      windows: [],
    };
    expect(() => planHull(offCentre)).toThrow(/centre line/);
  });
});

describe('spineSectionAt', () => {
  it('is null ahead of the prow and behind the engine face', () => {
    expect(spineSectionAt(plan.spine, plan.spine[0]!.z - 1)).toBeNull();
    expect(spineSectionAt(plan.spine, plan.spine[plan.spine.length - 1]!.z + 1)).toBeNull();
  });

  it('interpolates between neighbouring sections', () => {
    const [a, b] = [plan.spine[0]!, plan.spine[1]!];
    const mid = spineSectionAt(plan.spine, (a.z + b.z) / 2)!;
    expect(mid.halfWidth).toBeCloseTo((a.halfWidth + b.halfWidth) / 2, 6);
  });
});

describe('hullBounds (the box the drone tether is measured from)', () => {
  it('contains every room of the ship', () => {
    const b = hullBounds(plan);
    for (const room of shipLayout.rooms) {
      expect(room.minX).toBeGreaterThanOrEqual(b.min.x);
      expect(room.maxX).toBeLessThanOrEqual(b.max.x);
      expect(room.minZ).toBeGreaterThanOrEqual(b.min.z);
      expect(room.maxZ).toBeLessThanOrEqual(b.max.z);
    }
    expect(b.min.y).toBeLessThanOrEqual(0);
    expect(b.max.y).toBeGreaterThanOrEqual(shipLayout.ceilingHeight);
  });
});
