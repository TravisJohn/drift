/**
 * Ship layout - the research vessel's floor plan as data (D4).
 *
 * Everything here is content, not code: rooms are axis-aligned rectangles on
 * a shared deck (floor y=0), doors connect rooms that share an edge, windows
 * sit on exterior walls, props are grey boxes placed in world coordinates.
 * `world/ship/shipBuilder.ts` turns this into meshes + colliders, and
 * `world/ship/validateLayout.ts` rejects broken layouts before they ship.
 *
 * Plan (top view; north = -Z, the direction of travel):
 *
 *                 [ Bridge ]
 *                 [corridor]
 *          [ Lab ][corridor][ Cargo ]
 *                 [corridor]
 *          [ Cryo ][corridor]
 *                 [corridor]
 *               [ Engineering ]
 */
import { type Vec3, vec3 } from '../physics/vec3';

export type RoomId = 'bridge' | 'corridor' | 'lab' | 'cargo' | 'cryo' | 'engineering';

export type WallSide = 'north' | 'south' | 'east' | 'west';

export interface RoomSpec {
  readonly id: RoomId;
  readonly name: string;
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

/** A doorway centered on the shared edge between two rooms. */
export interface DoorSpec {
  readonly rooms: readonly [RoomId, RoomId];
}

/** A window opening in an exterior wall of a room. */
export interface WindowSpec {
  readonly roomId: RoomId;
  readonly side: WallSide;
  /** Center along the wall's axis (world X for north/south, world Z for east/west). */
  readonly center: number;
  readonly width: number;
}

export type PropKind = 'crate' | 'console' | 'pod' | 'machine' | 'seat' | 'holotable';
export type BridgeInstrument = 'power' | 'helm' | 'comms';

export interface PropSpec {
  /** Optional stable id for props that become interactable later (M3+). */
  readonly id?: string;
  readonly roomId: RoomId;
  readonly kind: PropKind;
  readonly instrument?: BridgeInstrument;
  /** World-space center of the box. */
  readonly center: Vec3;
  readonly size: Vec3;
}

export interface ShipLayout {
  readonly ceilingHeight: number;
  readonly wallThickness: number;
  readonly doorWidth: number;
  readonly doorHeight: number;
  readonly windowBottom: number;
  readonly windowTop: number;
  readonly rooms: readonly RoomSpec[];
  readonly doors: readonly DoorSpec[];
  readonly windows: readonly WindowSpec[];
  readonly props: readonly PropSpec[];
  /** Player spawn point (world). */
  readonly spawn: Vec3;
}

export const shipLayout: ShipLayout = {
  ceilingHeight: 3.2,
  wallThickness: 0.3,
  doorWidth: 1.6,
  doorHeight: 2.3,
  windowBottom: 0.9,
  windowTop: 2.4,

  rooms: [
    { id: 'bridge', name: 'Bridge', minX: -5, maxX: 5, minZ: -16, maxZ: -10 },
    { id: 'corridor', name: 'Main Corridor', minX: -1.5, maxX: 1.5, minZ: -10, maxZ: 6 },
    { id: 'lab', name: 'Science Lab', minX: -9.5, maxX: -1.5, minZ: -8, maxZ: -2 },
    { id: 'cargo', name: 'Cargo Bay', minX: 1.5, maxX: 9.5, minZ: -8, maxZ: -2 },
    { id: 'cryo', name: 'Cryo Bay', minX: -9.5, maxX: -1.5, minZ: 0, maxZ: 6 },
    { id: 'engineering', name: 'Engineering', minX: -5, maxX: 5, minZ: 6, maxZ: 14 },
  ],

  doors: [
    { rooms: ['bridge', 'corridor'] },
    { rooms: ['corridor', 'lab'] },
    { rooms: ['corridor', 'cargo'] },
    { rooms: ['corridor', 'cryo'] },
    { rooms: ['corridor', 'engineering'] },
  ],

  windows: [
    // The bridge viewport - the widest window on the ship.
    { roomId: 'bridge', side: 'north', center: 0, width: 6 },
    { roomId: 'lab', side: 'west', center: -5, width: 3 },
    { roomId: 'cargo', side: 'east', center: -5, width: 3 },
    { roomId: 'cryo', side: 'west', center: 3, width: 3 },
    { roomId: 'engineering', side: 'east', center: 10, width: 3 },
    { roomId: 'engineering', side: 'south', center: 0, width: 4 },
  ],

  props: [
    // Bridge: helm console + seat facing the viewport.
    {
      id: 'helm',
      instrument: 'helm',
      roomId: 'bridge',
      kind: 'console',
      center: vec3(0, 0.55, -14.6),
      size: vec3(2.2, 1.1, 0.7),
    },
    { roomId: 'bridge', kind: 'seat', center: vec3(0, 0.35, -13.4), size: vec3(0.7, 0.7, 0.7) },
    {
      roomId: 'bridge',
      kind: 'console',
      instrument: 'power',
      center: vec3(-3.4, 0.5, -14.8),
      size: vec3(1.6, 1, 0.6),
    },
    {
      roomId: 'bridge',
      kind: 'console',
      instrument: 'comms',
      center: vec3(3.4, 0.5, -14.8),
      size: vec3(1.6, 1, 0.6),
    },
    // The ship dashboard: a holo-table behind the helm seat.
    {
      id: 'dashboard',
      roomId: 'bridge',
      kind: 'holotable',
      center: vec3(0, 0.45, -11.8),
      size: vec3(1.8, 0.9, 1.0),
    },

    // Science lab: work tables and a crate.
    { roomId: 'lab', kind: 'console', center: vec3(-6.5, 0.5, -5), size: vec3(1.8, 1, 0.9) },
    { roomId: 'lab', kind: 'console', center: vec3(-4, 0.5, -3.2), size: vec3(1.8, 1, 0.9) },
    {
      id: 'terminal-lab',
      roomId: 'lab',
      kind: 'console',
      center: vec3(-8.9, 0.6, -5),
      size: vec3(0.5, 1.2, 0.9),
    },
    { roomId: 'lab', kind: 'crate', center: vec3(-2.6, 0.4, -7.2), size: vec3(0.8, 0.8, 0.8) },

    // Cargo bay: crate stacks of varying sizes.
    { roomId: 'cargo', kind: 'crate', center: vec3(4, 0.6, -6.5), size: vec3(1.2, 1.2, 1.2) },
    { roomId: 'cargo', kind: 'crate', center: vec3(5.6, 0.4, -6.7), size: vec3(0.8, 0.8, 0.8) },
    { roomId: 'cargo', kind: 'crate', center: vec3(4.1, 1.6, -6.6), size: vec3(0.8, 0.8, 0.8) },
    { roomId: 'cargo', kind: 'crate', center: vec3(7.8, 0.75, -3.6), size: vec3(1.5, 1.5, 1.5) },
    { roomId: 'cargo', kind: 'crate', center: vec3(6.9, 0.5, -6.9), size: vec3(1, 1, 1) },
    { roomId: 'cargo', kind: 'crate', center: vec3(8.4, 0.5, -5.8), size: vec3(1, 1, 1) },

    // Cryo bay: four pods along the west wall, plus a monitor console.
    { roomId: 'cryo', kind: 'pod', center: vec3(-8.7, 1.1, 1), size: vec3(1, 2.2, 1.1) },
    { roomId: 'cryo', kind: 'pod', center: vec3(-8.7, 1.1, 2.4), size: vec3(1, 2.2, 1.1) },
    { roomId: 'cryo', kind: 'pod', center: vec3(-8.7, 1.1, 3.8), size: vec3(1, 2.2, 1.1) },
    { roomId: 'cryo', kind: 'pod', center: vec3(-8.7, 1.1, 5.2), size: vec3(1, 2.2, 1.1) },
    { roomId: 'cryo', kind: 'console', center: vec3(-5, 0.5, 0.6), size: vec3(1.4, 1, 0.6) },

    // Engineering: the reactor block and machinery.
    { roomId: 'engineering', kind: 'machine', center: vec3(0, 1.3, 10), size: vec3(2.4, 2.6, 2.4) },
    {
      roomId: 'engineering',
      kind: 'machine',
      center: vec3(-4.2, 0.9, 12.8),
      size: vec3(1.2, 1.8, 1.6),
    },
    {
      roomId: 'engineering',
      kind: 'machine',
      center: vec3(4.2, 0.9, 7.6),
      size: vec3(1.2, 1.8, 1.4),
    },
    { roomId: 'engineering', kind: 'crate', center: vec3(-4.3, 0.5, 7.4), size: vec3(1, 1, 1) },
  ],

  // Wake up beside the cryo pods you are tending.
  spawn: vec3(-5, 1.1, 3),
};
