/**
 * Pure geometry helpers for turning the ship layout into walls.
 *
 * All functions are 1D/2D math with no Three.js so the wall construction
 * rules - where walls go, how door and window openings split them - are
 * fully unit-testable.
 */
import type { RoomSpec, WallSide } from '../../content/shipLayout';

const EPS = 1e-6;

export interface Interval {
  readonly start: number;
  readonly end: number;
}

/**
 * The edge two rooms share, if any.
 *
 * `axis` is the axis the edge runs along ('x' for a north/south edge,
 * 'z' for an east/west edge); `at` is the fixed coordinate on the other
 * axis; `span` is the overlapping interval along `axis`.
 */
export interface SharedEdge {
  readonly axis: 'x' | 'z';
  readonly at: number;
  readonly span: Interval;
}

export function sharedEdge(a: RoomSpec, b: RoomSpec): SharedEdge | null {
  // b east of a / a east of b -> edge runs along z.
  if (Math.abs(a.maxX - b.minX) < EPS || Math.abs(b.maxX - a.minX) < EPS) {
    const at = Math.abs(a.maxX - b.minX) < EPS ? a.maxX : b.maxX;
    const start = Math.max(a.minZ, b.minZ);
    const end = Math.min(a.maxZ, b.maxZ);
    if (end - start > EPS) return { axis: 'z', at, span: { start, end } };
  }
  // b south of a / a south of b -> edge runs along x.
  if (Math.abs(a.maxZ - b.minZ) < EPS || Math.abs(b.maxZ - a.minZ) < EPS) {
    const at = Math.abs(a.maxZ - b.minZ) < EPS ? a.maxZ : b.maxZ;
    const start = Math.max(a.minX, b.minX);
    const end = Math.min(a.maxX, b.maxX);
    if (end - start > EPS) return { axis: 'x', at, span: { start, end } };
  }
  return null;
}

/** Subtract `holes` from `span`, returning the remaining sub-intervals. */
export function subtractIntervals(span: Interval, holes: readonly Interval[]): Interval[] {
  const sorted = [...holes]
    .map((h) => ({ start: Math.max(h.start, span.start), end: Math.min(h.end, span.end) }))
    .filter((h) => h.end - h.start > EPS)
    .sort((a, b) => a.start - b.start);

  const result: Interval[] = [];
  let cursor = span.start;
  for (const hole of sorted) {
    if (hole.start - cursor > EPS) result.push({ start: cursor, end: hole.start });
    cursor = Math.max(cursor, hole.end);
  }
  if (span.end - cursor > EPS) result.push({ start: cursor, end: span.end });
  return result;
}

/** A rectangular wall piece in wall-plane coordinates (along-axis x height). */
export interface WallPiece {
  readonly start: number;
  readonly end: number;
  readonly bottom: number;
  readonly top: number;
}

export interface WallOpening {
  readonly center: number;
  readonly width: number;
  readonly bottom: number;
  readonly top: number;
}

/**
 * Split a wall span into solid pieces around openings.
 *
 * Between/beside openings: full-height pieces. At each opening: a sill
 * below (if bottom > 0) and a lintel above (if top < height). Openings must
 * be disjoint (validated upstream).
 */
export function segmentWall(
  span: Interval,
  height: number,
  openings: readonly WallOpening[],
): WallPiece[] {
  const holes = openings.map((o) => ({
    start: o.center - o.width / 2,
    end: o.center + o.width / 2,
  }));
  const pieces: WallPiece[] = [];

  for (const solid of subtractIntervals(span, holes)) {
    pieces.push({ ...solid, bottom: 0, top: height });
  }
  for (const o of openings) {
    const start = Math.max(span.start, o.center - o.width / 2);
    const end = Math.min(span.end, o.center + o.width / 2);
    if (end - start <= EPS) continue;
    if (o.bottom > EPS) pieces.push({ start, end, bottom: 0, top: o.bottom });
    if (height - o.top > EPS) pieces.push({ start, end, bottom: o.top, top: height });
  }
  return pieces;
}

/** The wall-plane geometry of one side of a room. */
export function sideGeometry(
  room: RoomSpec,
  side: WallSide,
): { axis: 'x' | 'z'; at: number; span: Interval } {
  switch (side) {
    case 'north':
      return { axis: 'x', at: room.minZ, span: { start: room.minX, end: room.maxX } };
    case 'south':
      return { axis: 'x', at: room.maxZ, span: { start: room.minX, end: room.maxX } };
    case 'west':
      return { axis: 'z', at: room.minX, span: { start: room.minZ, end: room.maxZ } };
    case 'east':
      return { axis: 'z', at: room.maxX, span: { start: room.minZ, end: room.maxZ } };
  }
}

/**
 * The exterior sub-spans of one side of a room: the parts of that side not
 * shared with any other room (these get solid hull walls and windows).
 */
export function exteriorSpans(
  room: RoomSpec,
  side: WallSide,
  allRooms: readonly RoomSpec[],
): Interval[] {
  const geom = sideGeometry(room, side);
  const holes: Interval[] = [];
  for (const other of allRooms) {
    if (other.id === room.id) continue;
    const edge = sharedEdge(room, other);
    if (edge && edge.axis === geom.axis && Math.abs(edge.at - geom.at) < EPS) {
      holes.push(edge.span);
    }
  }
  return subtractIntervals(geom.span, holes);
}
