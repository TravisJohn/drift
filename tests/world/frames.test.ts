import { describe, expect, it } from 'vitest';
import {
  type RoomSpec,
  type ShipLayout,
  type WallSide,
  shipLayout,
} from '../../src/content/shipLayout';
import { vec3 } from '../../src/physics/vec3';
import { buildFrames, frameStations, sideOpenings } from '../../src/world/ship/frames';
import { sideGeometry } from '../../src/world/ship/layoutGeometry';
import type { TrimBox } from '../../src/world/ship/trim';

const SPACING = 2;
const SIDES: readonly WallSide[] = ['north', 'south', 'east', 'west'];
const room = (id: string, layout: ShipLayout = shipLayout): RoomSpec => {
  const found = layout.rooms.find((r) => r.id === id);
  if (!found) throw new Error(`no room ${id}`);
  return found;
};

/** A beam lies flat under the ceiling; everything else stands on a wall. */
const isBeam = (box: TrimBox): boolean => box.size.y < 0.2;

describe('frameStations (an even rhythm along a wall)', () => {
  it('divides the span exactly, with half a gap at each end', () => {
    expect(frameStations({ start: -10, end: 6 }, 2)).toEqual([-9, -7, -5, -3, -1, 1, 3, 5]);
  });

  it('uses the nearest spacing that fits when the span is not a multiple', () => {
    const stations = frameStations({ start: 0, end: 3 }, 2);
    expect(stations).toEqual([0.75, 2.25]);
  });

  it('gives a short span one frame in the middle rather than none', () => {
    expect(frameStations({ start: 0, end: 0.6 }, 2)).toEqual([0.3]);
  });

  it('rejects a spacing that could never end (fail loud)', () => {
    expect(() => frameStations({ start: 0, end: 4 }, 0)).toThrow();
    expect(frameStations({ start: 2, end: 2 }, 2)).toEqual([]);
  });
});

describe('sideOpenings (where a wall is not wall)', () => {
  it('finds the two doors in the corridor wall that faces the lab and cryo bay', () => {
    const openings = sideOpenings(shipLayout, room('corridor'), 'west');
    expect(openings).toHaveLength(2);
    for (const o of openings) expect(o.end - o.start).toBeCloseTo(shipLayout.doorWidth, 6);
  });

  it('finds the bridge viewport, and sees a door from both rooms it joins', () => {
    expect(sideOpenings(shipLayout, room('bridge'), 'north')).toEqual([{ start: -3, end: 3 }]);
    expect(sideOpenings(shipLayout, room('bridge'), 'south')).toHaveLength(1);
    expect(sideOpenings(shipLayout, room('corridor'), 'north')).toHaveLength(1);
  });

  it('reports a blank wall as blank', () => {
    expect(sideOpenings(shipLayout, room('lab'), 'north')).toEqual([]);
  });
});

describe('buildFrames (ribs, beams and light strips for the whole ship)', () => {
  const frames = buildFrames(shipLayout, SPACING);
  const t = shipLayout.wallThickness;
  const H = shipLayout.ceilingHeight;

  it('never stands a rib in or against a door or window', () => {
    let checked = 0;
    for (const r of shipLayout.rooms) {
      for (const side of SIDES) {
        const { axis, at } = sideGeometry(r, side);
        const openings = sideOpenings(shipLayout, r, side);
        for (const box of frames.boxes) {
          if (box.roomId !== r.id || isBeam(box)) continue;
          const across = axis === 'x' ? box.center.z : box.center.x;
          if (Math.abs(across - at) > t) continue; // a piece of another wall
          const along = axis === 'x' ? box.center.x : box.center.z;
          const half = (axis === 'x' ? box.size.x : box.size.z) / 2;
          for (const o of openings) {
            expect(along + half <= o.start || along - half >= o.end).toBe(true);
            checked++;
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(50); // the check really ran
  });

  it('keeps every piece inside the room it belongs to', () => {
    for (const box of frames.boxes) {
      const r = room(box.roomId ?? '');
      expect(box.center.x).toBeGreaterThan(r.minX);
      expect(box.center.x).toBeLessThan(r.maxX);
      expect(box.center.z).toBeGreaterThan(r.minZ);
      expect(box.center.z).toBeLessThan(r.maxZ);
      expect(box.center.y + box.size.y / 2).toBeLessThanOrEqual(H + 0.05);
    }
  });

  it('stays within centimetres of a wall or ceiling (none of it is a collider)', () => {
    for (const box of frames.boxes) {
      if (isBeam(box)) {
        // Hangs no lower than a hand's width below the ceiling.
        expect(box.center.y - box.size.y / 2).toBeGreaterThan(H - 0.1);
      } else {
        expect(Math.min(box.size.x, box.size.z)).toBeLessThanOrEqual(0.13);
      }
    }
  });

  it('gives every rib one light strip, and every strip a glow in the room', () => {
    const strips = frames.boxes.filter((b) => b.role === 'accent');
    expect(strips.length).toBeGreaterThan(40);
    expect(frames.glows).toHaveLength(strips.length);
    for (const glow of frames.glows) {
      const r = room(glow.roomId);
      expect(glow.position.x).toBeGreaterThan(r.minX + t / 2);
      expect(glow.position.x).toBeLessThan(r.maxX - t / 2);
      expect(glow.position.z).toBeGreaterThan(r.minZ + t / 2);
      expect(glow.position.z).toBeLessThan(r.maxZ - t / 2);
      expect(glow.position.y).toBeGreaterThan(0.5);
      expect(glow.position.y).toBeLessThan(H - 0.5);
    }
  });

  it('light strips stand clear of the floor and ceiling trim', () => {
    for (const strip of frames.boxes.filter((b) => b.role === 'accent')) {
      expect(strip.center.y - strip.size.y / 2).toBeGreaterThan(0.3);
      expect(strip.center.y + strip.size.y / 2).toBeLessThan(H - 0.2);
    }
  });

  it('spans every room with beams across its short way', () => {
    for (const r of shipLayout.rooms) {
      const width = r.maxX - r.minX;
      const depth = r.maxZ - r.minZ;
      const beams = frames.boxes.filter((b) => b.roomId === r.id && isBeam(b));
      const long = Math.max(width, depth);
      expect(beams).toHaveLength(Math.round(long / SPACING));
      for (const beam of beams) {
        expect(Math.max(beam.size.x, beam.size.z)).toBeCloseTo(Math.min(width, depth) - t, 6);
      }
    }
  });

  it('turns the long corridor into a run of frames', () => {
    const corridor = frames.boxes.filter((b) => b.roomId === 'corridor');
    expect(corridor.filter(isBeam)).toHaveLength(8);
    // Both long walls carry ribs, even with three doors opening off them.
    const west = corridor.filter((b) => b.role === 'accent' && b.center.x < 0);
    const east = corridor.filter((b) => b.role === 'accent' && b.center.x > 0);
    expect(west.length).toBeGreaterThanOrEqual(5);
    expect(east.length).toBeGreaterThanOrEqual(6);
  });

  it('a closer spacing gives more ribs', () => {
    const dense = buildFrames(shipLayout, 1.5).glows.length;
    const sparse = buildFrames(shipLayout, 3).glows.length;
    expect(dense).toBeGreaterThan(frames.glows.length);
    expect(sparse).toBeLessThan(frames.glows.length);
  });

  it('is the same every time (pure)', () => {
    expect(buildFrames(shipLayout, SPACING)).toEqual(frames);
  });
});

describe('buildFrames on a two-room layout', () => {
  const twoRooms: ShipLayout = {
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
    windows: [],
    props: [],
    spawn: vec3(0, 1.1, -3),
  };
  const frames = buildFrames(twoRooms, 2);

  it('leaves the doorway between them clear, on both sides of the wall', () => {
    const inDoorway = frames.boxes.filter(
      (b) => !isBeam(b) && Math.abs(b.center.z) < 0.4 && Math.abs(b.center.x) < 0.8,
    );
    expect(inDoorway).toHaveLength(0);
  });

  it('puts ribs on both faces of the shared wall, each owned by its own room', () => {
    const onShared = frames.boxes.filter((b) => b.role === 'accent' && Math.abs(b.center.z) < 0.4);
    expect(onShared.some((b) => b.roomId === 'bridge' && b.center.z < 0)).toBe(true);
    expect(onShared.some((b) => b.roomId === 'cargo' && b.center.z > 0)).toBe(true);
  });
});
