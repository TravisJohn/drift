import { describe, expect, it } from 'vitest';
import { shipLayout, type ShipLayout } from '../../src/content/shipLayout';
import { buildShipBoxes } from '../../src/world/ship/shipBuilder';
import { vec3 } from '../../src/physics/vec3';

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

describe('buildShipBoxes on a two-room layout', () => {
  const boxes = buildShipBoxes(twoRooms);

  it('creates one floor and one ceiling per room', () => {
    expect(boxes.filter((b) => b.role === 'floor')).toHaveLength(2);
    expect(boxes.filter((b) => b.role === 'ceiling')).toHaveLength(2);
  });

  it('builds the shared wall exactly once, split by the door', () => {
    // Shared edge at z=0: door -> left solid, right solid, lintel.
    const sharedWallPieces = boxes.filter((b) => b.role === 'wall' && Math.abs(b.center.z) < 0.01);
    expect(sharedWallPieces).toHaveLength(3);
    const lintel = sharedWallPieces.find((b) => b.center.y > twoRooms.doorHeight / 2 + 0.5);
    expect(lintel).toBeDefined();
    expect(lintel?.size.x).toBeCloseTo(twoRooms.doorWidth, 5);
  });

  it('leaves a walkable gap at the door (no full-height wall in the doorway)', () => {
    const blocking = boxes.filter(
      (b) =>
        b.role === 'wall' &&
        Math.abs(b.center.z) < 0.01 &&
        Math.abs(b.center.x) < twoRooms.doorWidth / 2 - 0.01 &&
        b.center.y - b.size.y / 2 < 1, // occupies drone height
    );
    expect(blocking).toHaveLength(0);
  });

  it('builds solid hull walls on all exterior sides', () => {
    // North hull of A at z=-6 and south hull of B at z=6, plus east/west of both.
    const north = boxes.filter((b) => b.role === 'wall' && Math.abs(b.center.z + 6) < 0.01);
    const south = boxes.filter((b) => b.role === 'wall' && Math.abs(b.center.z - 6) < 0.01);
    expect(north).toHaveLength(1);
    expect(south).toHaveLength(1);
    const west = boxes.filter((b) => b.role === 'wall' && Math.abs(b.center.x + 3) < 0.01);
    expect(west).toHaveLength(2); // one per room along the west side
  });
});

describe('buildShipBoxes with a window', () => {
  const withWindow: ShipLayout = {
    ...twoRooms,
    windows: [{ roomId: 'bridge', side: 'north', center: 0, width: 2 }],
  };
  const boxes = buildShipBoxes(withWindow);

  it('splits the hull wall into left/right/sill/lintel around the window', () => {
    const northPieces = boxes.filter((b) => b.role === 'wall' && Math.abs(b.center.z + 6) < 0.01);
    expect(northPieces).toHaveLength(4);
    // The opening itself is empty between windowBottom and windowTop.
    const inOpening = northPieces.filter(
      (b) =>
        Math.abs(b.center.x) < 0.99 &&
        b.center.y - b.size.y / 2 > withWindow.windowBottom - 0.01 &&
        b.center.y + b.size.y / 2 < withWindow.windowTop + 0.01,
    );
    expect(inOpening).toHaveLength(0);
  });
});

describe('buildShipBoxes on the real ship', () => {
  const boxes = buildShipBoxes(shipLayout);

  it('produces floors and ceilings for all six rooms', () => {
    expect(boxes.filter((b) => b.role === 'floor')).toHaveLength(6);
    expect(boxes.filter((b) => b.role === 'ceiling')).toHaveLength(6);
  });

  it('includes every prop as a box', () => {
    const propRoles = boxes.filter((b) => !['floor', 'ceiling', 'wall'].includes(b.role));
    expect(propRoles).toHaveLength(shipLayout.props.length);
  });

  it('every box has positive size', () => {
    for (const b of boxes) {
      expect(b.size.x).toBeGreaterThan(0);
      expect(b.size.y).toBeGreaterThan(0);
      expect(b.size.z).toBeGreaterThan(0);
    }
  });

  it('no wall piece blocks a doorway (drone height, door center of each shared edge)', () => {
    // For each door, the opening center must be free of wall boxes at y=1.
    for (const door of shipLayout.doors) {
      const [aId, bId] = door.rooms;
      const a = shipLayout.rooms.find((r) => r.id === aId);
      const b = shipLayout.rooms.find((r) => r.id === bId);
      if (!a || !b) throw new Error('door rooms missing');
      // shared edge midpoint
      const sx = Math.max(a.minX, b.minX);
      const ex = Math.min(a.maxX, b.maxX);
      const sz = Math.max(a.minZ, b.minZ);
      const ez = Math.min(a.maxZ, b.maxZ);
      const mid = { x: (sx + ex) / 2, y: 1, z: (sz + ez) / 2 };
      const blockers = boxes.filter(
        (box) =>
          box.role === 'wall' &&
          mid.x > box.center.x - box.size.x / 2 &&
          mid.x < box.center.x + box.size.x / 2 &&
          mid.y > box.center.y - box.size.y / 2 &&
          mid.y < box.center.y + box.size.y / 2 &&
          mid.z > box.center.z - box.size.z / 2 &&
          mid.z < box.center.z + box.size.z / 2,
      );
      expect(blockers, `door ${aId}->${bId} blocked`).toHaveLength(0);
    }
  });
});
