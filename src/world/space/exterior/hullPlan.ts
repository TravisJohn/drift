/**
 * Hull plan - the shape of the ship's outside, worked out from the room
 * layout so the exterior always fits around the interior.
 *
 * Pure numbers, no Three.js (hullGeometry.ts turns the plan into meshes).
 *
 * - Rooms that straddle the centre line (bridge, corridor, engineering)
 *   form the **spine**: a lofted, chamfered hull running bow to stern,
 *   wide where its rooms are wide and sloping in at the waist. A tapered
 *   prow runs ahead of the first room; the engine face closes the stern.
 * - Every other room becomes a **module** bolted to the spine's side.
 * - On top go a raised bridge canopy, a dorsal ridge and a keel; engines
 *   sit on the stern face; windows glow where the real windows are; and
 *   running lights mark the bow, the beam ends and the stern.
 *
 * The ship's nose points -Z, as inside.
 */
import type { RoomSpec, ShipLayout, WallSide } from '../../../content/shipLayout';
import { type Vec3, vec3 } from '../../../physics/vec3';
import { mulberry32 } from '../../../core/random';

/** One cross-section of the spine: a rectangle with chamfered corners. */
export interface HullSection {
  readonly z: number;
  readonly halfWidth: number;
  readonly bottom: number;
  readonly top: number;
  /** How far each corner is cut back, metres. */
  readonly chamfer: number;
}

/** A box with its four edges along Z chamfered (modules, canopy, ridge). */
export interface HullBlock {
  readonly center: Vec3;
  readonly size: Vec3;
  readonly chamfer: number;
}

export interface EngineMount {
  /** Centre of the nozzle's mouth on the stern face. */
  readonly position: Vec3;
  readonly radius: number;
  readonly length: number;
}

/** A lit window panel on the outside of the hull. */
export interface WindowLight {
  readonly center: Vec3;
  readonly size: Vec3;
  readonly roomId: string;
}

export type RunningLightKind = 'port' | 'starboard' | 'strobe';

export interface RunningLight {
  readonly position: Vec3;
  readonly kind: RunningLightKind;
}

/** A flat area of hull top where surface detail can be scattered. */
export interface DetailArea {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
  readonly y: number;
}

export interface HullPlan {
  readonly spine: readonly HullSection[];
  readonly blocks: readonly HullBlock[];
  readonly engines: readonly EngineMount[];
  readonly windows: readonly WindowLight[];
  readonly lights: readonly RunningLight[];
  readonly detailAreas: readonly DetailArea[];
  /** Foot of the comms dish mast, on top of the starboard-most module. */
  readonly dishBase: Vec3;
  /** The spine's top and bottom heights, for placing extras. */
  readonly spineTop: number;
  readonly spineBottom: number;
}

/** Hull skin outside the room walls, metres. */
const PAD = 0.6;
/** Length of the slope where the spine narrows or widens. */
const TRANSITION = 1.6;
/** How far the prow runs ahead of the first room. */
const PROW_LENGTH = 7;
/** How far the engine face sits behind the last room. */
const STERN_LENGTH = 2.4;
/** Modules hang a little lower and stand a little taller than the rooms. */
const MODULE_BELOW = 0.8;
const MODULE_ABOVE = 0.7;
const MODULE_CHAMFER = 0.7;

const chamferFor = (halfWidth: number, height: number): number =>
  Math.min(1.3, 0.28 * Math.min(halfWidth, height / 2));

/** A room straddles the centre line: it belongs to the spine. */
export const isSpineRoom = (room: RoomSpec): boolean => room.minX < 0 && room.maxX > 0;

const halfWidthOf = (room: RoomSpec): number => Math.max(-room.minX, room.maxX) + PAD;

function section(z: number, halfWidth: number, bottom: number, top: number): HullSection {
  return { z, halfWidth, bottom, top, chamfer: chamferFor(halfWidth, top - bottom) };
}

/**
 * Spine sections, bow to stern. Between two spine rooms of different
 * width, the wider room keeps its width up to the shared edge and the
 * slope runs inside the narrower room, so both stay enclosed.
 */
function planSpine(rooms: readonly RoomSpec[], bottom: number, top: number): HullSection[] {
  const spine = [...rooms].sort((a, b) => a.minZ - b.minZ);
  const bow = spine[0]!;
  const stern = spine[spine.length - 1]!;
  const height = top - bottom;

  const sections: HullSection[] = [
    // Prow: a blunt tip, then a shoulder halfway back to the bow room.
    section(bow.minZ - PROW_LENGTH, 1.4, bottom + height * 0.35, top - height * 0.35),
    section(bow.minZ - PROW_LENGTH / 2, halfWidthOf(bow) * 0.68, bottom + 0.8, top - 0.5),
  ];

  spine.forEach((room, i) => {
    const hw = halfWidthOf(room);
    const prev = spine[i - 1];
    const next = spine[i + 1];
    const narrowerThanPrev = prev !== undefined && hw < halfWidthOf(prev);
    const narrowerThanNext = next !== undefined && hw < halfWidthOf(next);
    sections.push(section(room.minZ + (narrowerThanPrev ? TRANSITION : 0), hw, bottom, top));
    sections.push(section(room.maxZ - (narrowerThanNext ? TRANSITION : 0), hw, bottom, top));
  });

  // Engine face: a little narrower and shorter than the stern room.
  sections.push(
    section(stern.maxZ + STERN_LENGTH, halfWidthOf(stern) - 0.5, bottom + 0.4, top - 0.4),
  );
  return sections;
}

/** The hull block that wraps a side room. */
function moduleFor(room: RoomSpec, ceiling: number): HullBlock {
  const bottom = -MODULE_BELOW;
  const top = ceiling + MODULE_ABOVE;
  return {
    center: vec3((room.minX + room.maxX) / 2, (bottom + top) / 2, (room.minZ + room.maxZ) / 2),
    size: vec3(room.maxX - room.minX + 2 * 0.5, top - bottom, room.maxZ - room.minZ + 2 * 0.5),
    chamfer: MODULE_CHAMFER,
  };
}

/** Where a window shows on the outside, or null where none can be seen. */
function windowFor(
  room: RoomSpec,
  side: WallSide,
  center: number,
  width: number,
  layout: ShipLayout,
  spine: boolean,
): WindowLight | null {
  const y = (layout.windowBottom + layout.windowTop) / 2;
  const height = layout.windowTop - layout.windowBottom;
  // Modules are padded by 0.5, the spine by PAD; sit just proud of the skin.
  const skin = (spine ? PAD : 0.5) + 0.03;
  switch (side) {
    case 'west':
      return {
        center: vec3(room.minX - skin, y, center),
        size: vec3(0.06, height, width),
        roomId: room.id,
      };
    case 'east':
      return {
        center: vec3(room.maxX + skin, y, center),
        size: vec3(0.06, height, width),
        roomId: room.id,
      };
    // North and south walls face the prow and the engines, which cover
    // them; the canopy glazing stands in for the bridge viewport.
    default:
      return null;
  }
}

/** Height of the porthole row: above the real windows, under the ceiling. */
const PORTHOLE_Y = 2.78;
const PORTHOLE_SPACING = 1.25;
/** Share of portholes that are lit; the rest are dark glass. */
const PORTHOLE_LIT = 0.55;

/**
 * A row of small lit portholes along each outward-facing side: modules on
 * their outer side, the bow and stern rooms on both. Tiny lights in rows
 * are what make a hull look large. Seeded, so the same ones are lit each run.
 */
function portholes(
  layout: ShipLayout,
  spineRooms: readonly RoomSpec[],
  seed: number,
): WindowLight[] {
  const random = mulberry32(seed);
  const bow = spineRooms[0]!;
  const stern = spineRooms[spineRooms.length - 1]!;
  const out: WindowLight[] = [];
  for (const room of layout.rooms) {
    const spine = isSpineRoom(room);
    if (spine && room !== bow && room !== stern) continue;
    const skin = (spine ? PAD : 0.5) + 0.03;
    const sides: number[] = spine ? [-1, 1] : [Math.sign(room.minX + room.maxX)];
    for (const side of sides) {
      const x = side < 0 ? room.minX - skin : room.maxX + skin;
      for (let z = room.minZ + 0.7; z <= room.maxZ - 0.7; z += PORTHOLE_SPACING) {
        if (random() > PORTHOLE_LIT) continue;
        out.push({ center: vec3(x, PORTHOLE_Y, z), size: vec3(0.06, 0.22, 0.34), roomId: room.id });
      }
    }
  }
  return out;
}

export function planHull(layout: ShipLayout, seed = 4127): HullPlan {
  if (layout.rooms.length === 0) {
    throw new Error('planHull: layout has no rooms');
  }
  const spineRooms = layout.rooms.filter(isSpineRoom);
  if (spineRooms.length === 0) {
    throw new Error('planHull: no room crosses the centre line to form the spine');
  }
  const H = layout.ceilingHeight;
  const spineBottom = -1.3;
  const spineTop = H + 1.1;

  const spine = planSpine(spineRooms, spineBottom, spineTop);
  const modules = layout.rooms.filter((r) => !isSpineRoom(r)).map((r) => moduleFor(r, H));

  const sorted = [...spineRooms].sort((a, b) => a.minZ - b.minZ);
  const bow = sorted[0]!;
  const stern = sorted[sorted.length - 1]!;
  const bowHalf = halfWidthOf(bow);
  const sternHalf = halfWidthOf(stern);
  const sternZ = spine[spine.length - 1]!.z;

  // Raised canopy over the front of the bow room, and a ridge and keel
  // along the length - the shapes that make a silhouette read as a ship.
  const canopy: HullBlock = {
    center: vec3(0, spineTop + 0.45, bow.minZ + 2.4),
    size: vec3(bowHalf * 1.05, 0.9, 4.2),
    chamfer: 0.38,
  };
  const ridgeStart = bow.minZ + 5;
  const ridgeEnd = stern.minZ + 2;
  const ridge: HullBlock = {
    center: vec3(0, spineTop + 0.25, (ridgeStart + ridgeEnd) / 2),
    size: vec3(1.5, 0.5, ridgeEnd - ridgeStart),
    chamfer: 0.22,
  };
  const keel: HullBlock = {
    center: vec3(0, spineBottom - 0.3, (bow.minZ + stern.maxZ) / 2),
    size: vec3(2.6, 0.6, (stern.maxZ - bow.minZ) * 0.75),
    chamfer: 0.25,
  };
  // Radiator housings on the stern's flanks, below the beam line.
  const radiators: HullBlock[] = [-1, 1].map((sideSign) => ({
    center: vec3(sideSign * (sternHalf + 0.5), spineBottom + 1.4, (stern.minZ + stern.maxZ) / 2),
    size: vec3(1.2, 1.6, stern.maxZ - stern.minZ - 1),
    chamfer: 0.3,
  }));

  // Engines: three big nozzles across the stern face, two small low ones.
  const midY = (spineBottom + spineTop) / 2;
  const mainRadius = Math.min(1.35, (sternHalf - 0.5) * 0.24);
  const spacing = (sternHalf - 0.5) * 0.58;
  const engines: EngineMount[] = [
    ...[-1, 0, 1].map((i) => ({
      position: vec3(i * spacing, midY + 0.2, sternZ),
      radius: mainRadius,
      length: 2.2,
    })),
    ...[-1, 1].map((i) => ({
      position: vec3(i * (spacing * 1.55), spineBottom + 1.0, sternZ),
      radius: mainRadius * 0.45,
      length: 1.4,
    })),
  ];

  const windows: WindowLight[] = [];
  for (const w of layout.windows) {
    const room = layout.rooms.find((r) => r.id === w.roomId);
    if (!room) throw new Error(`planHull: window refers to unknown room '${w.roomId}'`);
    const lit = windowFor(room, w.side, w.center, w.width, layout, isSpineRoom(room));
    if (lit) windows.push(lit);
  }
  windows.push(...portholes(layout, sorted, seed));
  // Canopy glazing across the front of the canopy.
  windows.push({
    center: vec3(0, canopy.center.y + 0.05, canopy.center.z - canopy.size.z / 2 - 0.03),
    size: vec3(canopy.size.x * 0.7, 0.32, 0.06),
    roomId: bow.id,
  });

  // Running lights: red to port (-X), green to starboard, white strobes.
  const beam = Math.max(...layout.rooms.map((r) => Math.max(-r.minX, r.maxX))) + 0.55;
  const beamZ = modules.length > 0 ? Math.min(...modules.map((m) => m.center.z)) : bow.maxZ;
  const lights: RunningLight[] = [
    { position: vec3(-beam, H * 0.5, beamZ), kind: 'port' },
    { position: vec3(beam, H * 0.5, beamZ), kind: 'starboard' },
    { position: vec3(0, spine[0]!.top + 0.05, spine[0]!.z + 0.2), kind: 'strobe' },
    {
      position: vec3(0, canopy.center.y + canopy.size.y / 2 + 0.1, canopy.center.z + 1),
      kind: 'strobe',
    },
    { position: vec3(0, spineTop - 0.3, sternZ + 0.1), kind: 'strobe' },
  ];

  const detailAreas: DetailArea[] = [
    ...modules.map((m) => ({
      minX: m.center.x - m.size.x / 2 + 0.7,
      maxX: m.center.x + m.size.x / 2 - 0.7,
      minZ: m.center.z - m.size.z / 2 + 0.6,
      maxZ: m.center.z + m.size.z / 2 - 0.6,
      y: m.center.y + m.size.y / 2,
    })),
    {
      minX: -sternHalf + 1.2,
      maxX: sternHalf - 1.2,
      minZ: stern.minZ + 0.5,
      maxZ: stern.maxZ - 0.5,
      y: spineTop,
    },
    {
      minX: -bowHalf + 1.2,
      maxX: bowHalf - 1.2,
      minZ: bow.minZ + 4.8,
      maxZ: bow.maxZ,
      y: spineTop,
    },
  ];

  // Comms dish on the aft end of the starboard-most module (or the stern).
  const host =
    modules.length > 0 ? modules.reduce((a, b) => (b.center.x > a.center.x ? b : a)) : null;
  const dishBase = host
    ? vec3(
        host.center.x + host.size.x * 0.2,
        host.center.y + host.size.y / 2,
        host.center.z + host.size.z * 0.25,
      )
    : vec3(sternHalf * 0.5, spineTop, stern.minZ + 1);

  return {
    spine,
    dishBase,
    blocks: [...modules, canopy, ridge, keel, ...radiators],
    engines,
    windows,
    lights,
    detailAreas,
    spineTop,
    spineBottom,
  };
}

/** The spine's cross-section at `z`, interpolated, or null outside it. */
export function spineSectionAt(spine: readonly HullSection[], z: number): HullSection | null {
  for (let i = 0; i < spine.length - 1; i++) {
    const a = spine[i]!;
    const b = spine[i + 1]!;
    if (z < a.z || z > b.z) continue;
    // At a step (two sections at one z) the wider one counts.
    if (b.z === a.z) return b.halfWidth > a.halfWidth ? b : a;
    const t = (z - a.z) / (b.z - a.z);
    const mix = (p: number, q: number) => p + (q - p) * t;
    return {
      z,
      halfWidth: mix(a.halfWidth, b.halfWidth),
      bottom: mix(a.bottom, b.bottom),
      top: mix(a.top, b.top),
      chamfer: mix(a.chamfer, b.chamfer),
    };
  }
  return null;
}

/** True when `p` lies inside the spine or one of the blocks. */
export function hullContains(plan: HullPlan, p: Vec3): boolean {
  const s = spineSectionAt(plan.spine, p.z);
  if (
    s &&
    insideChamferedRect(
      p.x,
      p.y,
      0,
      (s.bottom + s.top) / 2,
      s.halfWidth,
      (s.top - s.bottom) / 2,
      s.chamfer,
    )
  ) {
    return true;
  }
  return plan.blocks.some(
    (b) =>
      Math.abs(p.z - b.center.z) <= b.size.z / 2 &&
      insideChamferedRect(p.x, p.y, b.center.x, b.center.y, b.size.x / 2, b.size.y / 2, b.chamfer),
  );
}

function insideChamferedRect(
  x: number,
  y: number,
  cx: number,
  cy: number,
  hw: number,
  hh: number,
  chamfer: number,
): boolean {
  const dx = Math.abs(x - cx);
  const dy = Math.abs(y - cy);
  if (dx > hw || dy > hh) return false;
  // The corner cut: the line from (hw - c, hh) to (hw, hh - c).
  return dx - (hw - chamfer) + (dy - (hh - chamfer)) <= chamfer;
}
