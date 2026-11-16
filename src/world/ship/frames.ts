/**
 * frames - the ship's structural frames: a rib up the wall, a beam across
 * the ceiling joining it to the rib opposite, and a strip of coloured light
 * set into each rib.
 *
 * This is what makes a room read as part of a vessel instead of a box:
 * the walls get a rhythm, the ceiling gets depth, and every room carries
 * its own colour of light.
 *
 * Pure: derived from the layout, like the walls themselves, so frames
 * always fit the rooms. A rib is left out wherever it would stand in or
 * crowd a door or window; the beam above still runs. Visual only - no
 * piece becomes a collider, and each stays within centimetres of a wall
 * or ceiling that already is one.
 */
import type { RoomId, RoomSpec, ShipLayout, WallSide } from '../../content/shipLayout';
import { type Vec3, vec3 } from '../../physics/vec3';
import { type Interval, sharedEdge, sideGeometry } from './layoutGeometry';
import type { TrimBox, TrimRole } from './trim';

const EPS = 1e-6;
/** The rib's shaft: width along the wall, and how far it stands out. */
const RIB_WIDTH = 0.18;
const RIB_DEPTH = 0.06;
/** Wider blocks at the rib's foot and head. */
const BLOCK_WIDTH = 0.3;
const BLOCK_DEPTH = 0.1;
const FOOT_HEIGHT = 0.34;
const HEAD_HEIGHT = 0.26;
/** The light strip in the rib's face. */
const SLIT_WIDTH = 0.036;
const SLIT_PROUD = 0.008;
const SLIT_GAP = 0.09;
/** How far the ceiling beam hangs below the ceiling. */
const BEAM_DEPTH = 0.08;
/** Pieces start this far inside the surface they sit on: no visible gap. */
const SUNK = 0.02;
/** A rib keeps at least this far from the edge of a door or window. */
const OPENING_CLEARANCE = 0.1;
/** Where a rib's glow is placed: out from the wall, at chest height. */
const GLOW_REACH = 0.45;
const GLOW_HEIGHT = 1.5;

/** Where a rib's light strip shines from, for the baked glow around it. */
export interface FrameGlow {
  readonly position: Vec3;
  readonly roomId: RoomId;
}

export interface Frames {
  readonly boxes: readonly TrimBox[];
  readonly glows: readonly FrameGlow[];
}

const SIDES: readonly WallSide[] = ['north', 'south', 'east', 'west'];

/**
 * Evenly spaced positions along a span, as close to `spacing` apart as
 * divides it exactly, with half a gap left at each end.
 */
export function frameStations(span: Interval, spacing: number): number[] {
  if (spacing <= 0) throw new Error('frameStations: spacing must be positive');
  const length = span.end - span.start;
  if (length <= EPS) return [];
  const count = Math.max(1, Math.round(length / spacing));
  const pitch = length / count;
  return Array.from({ length: count }, (_, i) => span.start + pitch * (i + 0.5));
}

/** The doors and windows in one side of a room, as intervals along it. */
export function sideOpenings(layout: ShipLayout, room: RoomSpec, side: WallSide): Interval[] {
  const geom = sideGeometry(room, side);
  const openings: Interval[] = layout.windows
    .filter((w) => w.roomId === room.id && w.side === side)
    .map((w) => ({ start: w.center - w.width / 2, end: w.center + w.width / 2 }));
  for (const door of layout.doors) {
    if (!door.rooms.includes(room.id)) continue;
    const otherId = door.rooms[0] === room.id ? door.rooms[1] : door.rooms[0];
    const other = layout.rooms.find((r) => r.id === otherId);
    const edge = other ? sharedEdge(room, other) : null;
    if (!edge || edge.axis !== geom.axis || Math.abs(edge.at - geom.at) > EPS) continue;
    const center = (edge.span.start + edge.span.end) / 2;
    openings.push({ start: center - layout.doorWidth / 2, end: center + layout.doorWidth / 2 });
  }
  return openings;
}

/** Is there room for a rib at `station`, clear of every opening? */
function isClear(station: number, openings: readonly Interval[]): boolean {
  const reach = BLOCK_WIDTH / 2 + OPENING_CLEARANCE;
  return openings.every((o) => station + reach <= o.start || station - reach >= o.end);
}

/**
 * A box on the room side of a wall. `near` and `far` are distances from
 * the wall face into the room (negative = sunk into the wall).
 */
function onFace(
  axis: 'x' | 'z',
  face: number,
  inward: 1 | -1,
  along: number,
  bottom: number,
  top: number,
  width: number,
  near: number,
  far: number,
  role: TrimRole,
  roomId: RoomId,
): TrimBox {
  const across = face + (inward * (near + far)) / 2;
  const y = (bottom + top) / 2;
  const depth = far - near;
  return axis === 'x'
    ? { center: vec3(along, y, across), size: vec3(width, top - bottom, depth), role, roomId }
    : { center: vec3(across, y, along), size: vec3(depth, top - bottom, width), role, roomId };
}

/** One rib: shaft, foot, head and the light strip in its face. */
function rib(
  axis: 'x' | 'z',
  face: number,
  inward: 1 | -1,
  station: number,
  height: number,
  roomId: RoomId,
): TrimBox[] {
  const place = (
    bottom: number,
    top: number,
    width: number,
    near: number,
    far: number,
    role: TrimRole,
  ): TrimBox => onFace(axis, face, inward, station, bottom, top, width, near, far, role, roomId);
  return [
    place(0, height, RIB_WIDTH, -SUNK, RIB_DEPTH, 'rib'),
    place(0, FOOT_HEIGHT, BLOCK_WIDTH, -SUNK, BLOCK_DEPTH, 'rib'),
    place(height - HEAD_HEIGHT, height, BLOCK_WIDTH, -SUNK, BLOCK_DEPTH, 'rib'),
    place(
      FOOT_HEIGHT + SLIT_GAP,
      height - HEAD_HEIGHT - SLIT_GAP,
      SLIT_WIDTH,
      RIB_DEPTH - SUNK,
      RIB_DEPTH + SLIT_PROUD,
      'accent',
    ),
  ];
}

/** Every frame piece for the ship, and where each rib's light shines from. */
export function buildFrames(layout: ShipLayout, spacing: number): Frames {
  const t = layout.wallThickness;
  const H = layout.ceilingHeight;
  const boxes: TrimBox[] = [];
  const glows: FrameGlow[] = [];

  for (const room of layout.rooms) {
    // --- Ribs: along every side, wherever the wall is clear ---
    for (const side of SIDES) {
      const { axis, at, span } = sideGeometry(room, side);
      const inward: 1 | -1 = side === 'north' || side === 'west' ? 1 : -1;
      const face = at + (inward * t) / 2;
      const openings = sideOpenings(layout, room, side);
      for (const station of frameStations(span, spacing)) {
        if (!isClear(station, openings)) continue;
        boxes.push(...rib(axis, face, inward, station, H, room.id));
        const out = face + inward * GLOW_REACH;
        glows.push({
          position:
            axis === 'x' ? vec3(station, GLOW_HEIGHT, out) : vec3(out, GLOW_HEIGHT, station),
          roomId: room.id,
        });
      }
    }

    // --- Beams: across the short way, joining the ribs of the long sides ---
    const width = room.maxX - room.minX;
    const depth = room.maxZ - room.minZ;
    const y = H - BEAM_DEPTH / 2 + SUNK / 2;
    const thick = BEAM_DEPTH + SUNK;
    if (width >= depth) {
      const z = (room.minZ + room.maxZ) / 2;
      for (const x of frameStations({ start: room.minX, end: room.maxX }, spacing)) {
        boxes.push({
          center: vec3(x, y, z),
          size: vec3(RIB_WIDTH, thick, depth - t),
          role: 'rib',
          roomId: room.id,
        });
      }
    } else {
      const x = (room.minX + room.maxX) / 2;
      for (const z of frameStations({ start: room.minZ, end: room.maxZ }, spacing)) {
        boxes.push({
          center: vec3(x, y, z),
          size: vec3(width - t, thick, RIB_WIDTH),
          role: 'rib',
          roomId: room.id,
        });
      }
    }
  }
  return { boxes, glows };
}
