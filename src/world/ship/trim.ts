/**
 * trim - the small built details that stop a room reading as a bare box:
 * baseboards with a floor-level guide light, ceiling coves, frames around
 * every window and door, a light bar over each doorway, window glass.
 *
 * Pure: derived from the same layout data and wall boxes as the ship
 * itself, so the details always fit the walls. Trim is visual only - none
 * of it becomes a collider, and all of it stays within a few centimetres
 * of surfaces that already are.
 */
import type { ShipLayout } from '../../content/shipLayout';
import { type Vec3, vec3 } from '../../physics/vec3';
import { sharedEdge, sideGeometry } from './layoutGeometry';

export type TrimRole = 'baseboard' | 'cove' | 'frame' | 'guideLight' | 'doorLight' | 'glass';

export interface TrimBox {
  readonly center: Vec3;
  readonly size: Vec3;
  readonly role: TrimRole;
}

/** A wall piece as the ship builder emits it. */
export interface WallBox {
  readonly center: Vec3;
  readonly size: Vec3;
}

const EPS = 1e-6;
/** How far trim stands out from the wall face. */
const PROUD = 0.03;
const BASEBOARD_HEIGHT = 0.14;
const GUIDE_HEIGHT = 0.022;
const COVE_HEIGHT = 0.12;
const WINDOW_FRAME = 0.07;
const DOOR_FRAME = 0.1;
const DOOR_LIGHT_HEIGHT = 0.03;
const GLASS_THICKNESS = 0.02;
/** Wall pieces shorter than this get no baseboard (door-side slivers). */
const MIN_RUN = 0.2;

/**
 * A box in a wall's own terms - `along` the wall, `up`, and `depth`
 * through it - placed on a wall running along the x or z axis.
 */
function onWall(
  axis: 'x' | 'z',
  at: number,
  along: number,
  y: number,
  length: number,
  height: number,
  depth: number,
  role: TrimRole,
): TrimBox {
  return axis === 'x'
    ? { center: vec3(along, y, at), size: vec3(length, height, depth), role }
    : { center: vec3(at, y, along), size: vec3(depth, height, length), role };
}

/** Baseboard + guide light at the foot of a wall piece, cove at its top. */
function wallRunTrim(wall: WallBox, layout: ShipLayout): TrimBox[] {
  const t = layout.wallThickness;
  // A wall piece is `t` thick across; the other horizontal size is its run.
  const axis: 'x' | 'z' = Math.abs(wall.size.z - t) < EPS ? 'x' : 'z';
  const length = axis === 'x' ? wall.size.x : wall.size.z;
  if (length < MIN_RUN) return [];
  const at = axis === 'x' ? wall.center.z : wall.center.x;
  const along = axis === 'x' ? wall.center.x : wall.center.z;
  const bottom = wall.center.y - wall.size.y / 2;
  const top = wall.center.y + wall.size.y / 2;
  const trim: TrimBox[] = [];

  if (bottom < EPS) {
    trim.push(
      onWall(
        axis,
        at,
        along,
        BASEBOARD_HEIGHT / 2,
        length,
        BASEBOARD_HEIGHT,
        t + 2 * PROUD,
        'baseboard',
      ),
      onWall(
        axis,
        at,
        along,
        BASEBOARD_HEIGHT + GUIDE_HEIGHT / 2,
        length,
        GUIDE_HEIGHT,
        t + PROUD,
        'guideLight',
      ),
    );
  }
  if (Math.abs(top - layout.ceilingHeight) < EPS) {
    trim.push(
      onWall(
        axis,
        at,
        along,
        layout.ceilingHeight - COVE_HEIGHT / 2,
        length,
        COVE_HEIGHT,
        t + 2 * PROUD,
        'cove',
      ),
    );
  }
  return trim;
}

/** Four bars lining an opening (jambs, head, sill when it has one). */
function openingFrame(
  axis: 'x' | 'z',
  at: number,
  center: number,
  width: number,
  bottom: number,
  top: number,
  bar: number,
  depth: number,
): TrimBox[] {
  const height = top - bottom;
  const mid = bottom + height / 2;
  const frame: TrimBox[] = [
    onWall(axis, at, center - width / 2 + bar / 2, mid, bar, height, depth, 'frame'),
    onWall(axis, at, center + width / 2 - bar / 2, mid, bar, height, depth, 'frame'),
    onWall(axis, at, center, top - bar / 2, width, bar, depth, 'frame'),
  ];
  // A doorway runs to the floor: no sill to trip over.
  if (bottom > EPS) {
    frame.push(onWall(axis, at, center, bottom + bar / 2, width, bar, depth, 'frame'));
  }
  return frame;
}

/** Every trim piece for the ship, from its layout and its wall boxes. */
export function buildTrimBoxes(layout: ShipLayout, walls: readonly WallBox[]): TrimBox[] {
  const t = layout.wallThickness;
  const trim: TrimBox[] = [];

  for (const wall of walls) trim.push(...wallRunTrim(wall, layout));

  for (const window of layout.windows) {
    const room = layout.rooms.find((r) => r.id === window.roomId);
    if (!room) continue; // validateLayout rejects this before we get here
    const { axis, at } = sideGeometry(room, window.side);
    trim.push(
      ...openingFrame(
        axis,
        at,
        window.center,
        window.width,
        layout.windowBottom,
        layout.windowTop,
        WINDOW_FRAME,
        t + 2 * PROUD,
      ),
      onWall(
        axis,
        at,
        window.center,
        (layout.windowBottom + layout.windowTop) / 2,
        window.width,
        layout.windowTop - layout.windowBottom,
        GLASS_THICKNESS,
        'glass',
      ),
    );
  }

  for (const door of layout.doors) {
    const a = layout.rooms.find((r) => r.id === door.rooms[0]);
    const b = layout.rooms.find((r) => r.id === door.rooms[1]);
    const edge = a && b ? sharedEdge(a, b) : null;
    if (!edge) continue; // validateLayout rejects this before we get here
    const center = (edge.span.start + edge.span.end) / 2;
    trim.push(
      ...openingFrame(
        edge.axis,
        edge.at,
        center,
        layout.doorWidth,
        0,
        layout.doorHeight,
        DOOR_FRAME,
        t + 2 * PROUD,
      ),
      // A light bar under the door head, seen from both rooms.
      onWall(
        edge.axis,
        edge.at,
        center,
        layout.doorHeight - DOOR_FRAME - DOOR_LIGHT_HEIGHT / 2,
        layout.doorWidth - 2 * DOOR_FRAME,
        DOOR_LIGHT_HEIGHT,
        t + 3 * PROUD,
        'doorLight',
      ),
    );
  }
  return trim;
}
