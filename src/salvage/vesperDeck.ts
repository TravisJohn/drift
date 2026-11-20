/**
 * VesperDeck - the Vesper Station service deck's geometry, built once from
 * the deck plan (content/vesperDeckPlan.ts).
 *
 * One occupancy grid (1 = floor) drives everything that touches walls:
 * drone movement, guard sight, lamp and seed light, and the renderer's wall
 * outlines. Patrol routes are precomputed polylines so a guard's pose is a
 * pure function of the patrol clock. Pure TypeScript, no DOM.
 *
 * Building the grid stamps ~1M cells, so the deck is created lazily on
 * first use (getVesperDeck) rather than when the game loads.
 */
import { gameConfig } from '../config/gameConfig';
import {
  AIRLOCK_ID,
  DECK_HEIGHT,
  DECK_WIDTH,
  SOCKET_OFFSET,
  cellRoomIds,
  deckHalls,
  deckRooms,
  patrolSpecs,
  type DeckRoom,
} from '../content/vesperDeckPlan';

export type Point = readonly [number, number];

export interface DeckHall {
  readonly a: string;
  readonly b: string;
  /** Room centre a, the bends, room centre b. */
  readonly points: readonly Point[];
}

/** One straight piece of a corridor, with its unit direction. */
export interface Passage {
  readonly x: number;
  readonly y: number;
  readonly endX: number;
  readonly endY: number;
  readonly ux: number;
  readonly uy: number;
  readonly length: number;
}

export interface CellSocket {
  readonly id: string;
  readonly name: string;
  readonly x: number;
  readonly y: number;
}

interface PatrolSegment {
  readonly x: number;
  readonly y: number;
  readonly dx: number;
  readonly dy: number;
  readonly dist: number;
  /** Distance along the circuit where this segment begins. */
  readonly start: number;
  readonly angle: number;
}

export interface PatrolPath {
  readonly segments: readonly PatrolSegment[];
  readonly length: number;
  readonly speed: number;
  readonly offset: number;
}

/** A patroller at one instant: where it is, where it faces, what it sees. */
export interface GuardPose {
  readonly x: number;
  readonly y: number;
  readonly angle: number;
  /** The sight cone clipped by bulkheads: drawn and tested as one polygon. */
  readonly cone: readonly Point[];
}

/** Corridor half-width. */
const HALL_RADIUS = 12;
/** Room octagon chamfer. */
const ROOM_CHAMFER = 12;
/** Ray-march step for sight and light. */
const RAY_STEP = 1.4;
/** Rays across a guard's sight cone. */
const SIGHT_RAYS = 36;
/** Points around the drone hull tested against walls. */
const HULL_POINTS = 16;
/** Below this alignment with a passage, steering leaves the input alone. */
const STEER_ALIGNMENT = 0.4;
/** How strongly steering pulls back toward a slanted passage's centre line. */
const STEER_CENTRING = 32;

export class VesperDeck {
  readonly width = DECK_WIDTH;
  readonly height = DECK_HEIGHT;
  readonly rooms: Readonly<Record<string, DeckRoom>> = deckRooms;
  readonly airlockId = AIRLOCK_ID;
  readonly halls: readonly DeckHall[];
  readonly passages: readonly Passage[];
  readonly cells: readonly CellSocket[];
  readonly paths: readonly PatrolPath[];
  /** Occupancy grid, row-major: 1 = floor, 0 = bulkhead or space. */
  readonly map: Uint8Array;
  /** Farthest a sight ray can reach (the cone's corner). */
  readonly sightReach: number;

  private readonly hull: readonly Point[];
  private readonly cfg = gameConfig.salvage;

  constructor() {
    const centre = (id: string): Point => {
      const r = this.rooms[id];
      if (!r) throw new Error(`VesperDeck: unknown room "${id}"`);
      return [r.x, r.y];
    };
    this.halls = deckHalls.map(({ a, b, bends }) => ({
      a,
      b,
      points: [centre(a), ...bends, centre(b)],
    }));
    this.passages = this.halls.flatMap(({ points }) =>
      points.slice(1).map(([endX, endY], i) => {
        const [x, y] = points[i] as Point;
        const length = Math.hypot(endX - x, endY - y);
        return { x, y, endX, endY, ux: (endX - x) / length, uy: (endY - y) / length, length };
      }),
    );
    this.cells = cellRoomIds.map((id) => {
      const r = this.rooms[id];
      if (!r) throw new Error(`VesperDeck: cell room "${id}" is not on the deck`);
      return { id, name: r.name, x: r.x + SOCKET_OFFSET.x, y: r.y + SOCKET_OFFSET.y };
    });
    this.paths = patrolSpecs.map((spec) => this.buildPatrol(spec.rooms, spec.speed, spec.offset));

    const r = this.cfg.droneRadius;
    this.hull = Array.from({ length: HULL_POINTS }, (_, i) => {
      const a = (i * 2 * Math.PI) / HULL_POINTS;
      return [r * Math.cos(a), r * Math.sin(a)] as const;
    });
    this.sightReach = Math.ceil(this.cfg.sightDepth / Math.cos(this.cfg.sightHalfAngle));
    this.map = this.buildMap();
  }

  /** Is this point open floor? */
  floor(x: number, y: number): boolean {
    return (
      x >= 0 &&
      y >= 0 &&
      x < this.width &&
      y < this.height &&
      this.map[Math.floor(y) * this.width + Math.floor(x)] === 1
    );
  }

  /** Does the whole drone hull fit here? */
  fits(x: number, y: number): boolean {
    return this.floor(x, y) && this.hull.every(([dx, dy]) => this.floor(x + dx, y + dy));
  }

  /** The room whose bounding box holds this point (corridors return undefined). */
  roomAt(x: number, y: number): string | undefined {
    for (const [id, r] of Object.entries(this.rooms)) {
      if (Math.abs(x - r.x) < r.width / 2 && Math.abs(y - r.y) < r.height / 2) return id;
    }
    return undefined;
  }

  /**
   * In a slanted corridor, turn a roughly-aligned input into motion along
   * the corridor, so one key follows the passage. Rooms and straight
   * corridors leave the input alone. Input and result are unit vectors.
   */
  steer(x: number, y: number, dx: number, dy: number): Point {
    if (this.roomAt(x, y)) return [dx, dy];
    let best: { passage: Passage; cx: number; cy: number; sign: number } | null = null;
    let nearest = HALL_RADIUS ** 2;
    for (const passage of this.passages) {
      const [cx, cy] = projectOnPassage(x, y, passage);
      const distance = (cx - x) ** 2 + (cy - y) ** 2;
      const alignment = dx * passage.ux + dy * passage.uy;
      if (Math.abs(alignment) < STEER_ALIGNMENT || distance >= nearest) continue;
      nearest = distance;
      best = { passage, cx, cy, sign: Math.sign(alignment) };
    }
    if (!best || !best.passage.ux || !best.passage.uy) return [dx, dy];
    // Follow the slant while pulling gently away from the bulkheads.
    const vx = best.passage.ux * best.sign + (best.cx - x) / STEER_CENTRING;
    const vy = best.passage.uy * best.sign + (best.cy - y) / STEER_CENTRING;
    const speed = Math.hypot(vx, vy);
    return [vx / speed, vy / speed];
  }

  /** March from (x, y) along angle `a`; stop just short of the first wall. */
  ray(x: number, y: number, a: number, range: number): Point {
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    for (let d = 1; d < range; d += RAY_STEP) {
      if (!this.floor(x + dx * d, y + dy * d)) {
        const back = Math.max(0, d - 1);
        return [x + dx * back, y + dy * back];
      }
    }
    return [x + dx * range, y + dy * range];
  }

  /** A guard's sight cone from (x, y) facing `angle`, clipped by walls. */
  sight(x: number, y: number, angle: number): Point[] {
    const { sightHalfAngle: half, sightDepth: depth } = this.cfg;
    const points: Point[] = [[x, y]];
    for (let i = 0; i <= SIGHT_RAYS; i++) {
      const a = -half + (2 * half * i) / SIGHT_RAYS;
      // Divide by cos so the cone's far edge is a straight line.
      points.push(this.ray(x, y, angle + a, depth / Math.cos(a)));
    }
    return points;
  }

  /**
   * Does a circle of radius `r` at (x, y) touch the polygon? The drone's
   * hull is tested against the very polygon the camera draws.
   */
  touches(poly: readonly Point[], x: number, y: number, r = this.cfg.droneRadius): boolean {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [ax, ay] = poly[j] as Point;
      const [bx, by] = poly[i] as Point;
      const dx = bx - ax;
      const dy = by - ay;
      if (ay > y !== by > y && x < (dx * (y - ay)) / dy + ax) inside = !inside;
      const t = Math.max(
        0,
        Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)),
      );
      if ((x - ax - t * dx) ** 2 + (y - ay - t * dy) ** 2 <= r * r) return true;
    }
    return inside;
  }

  /** A patroller `distance` units along its circuit. */
  guardAt(path: PatrolPath, distance: number): GuardPose {
    const d = distance % path.length;
    const seg =
      path.segments.find((s) => d < s.start + s.dist) ?? path.segments[path.segments.length - 1];
    if (!seg) throw new Error('VesperDeck: patrol path has no segments');
    const t = (d - seg.start) / seg.dist;
    const x = seg.x + seg.dx * t;
    const y = seg.y + seg.dy * t;
    return { x, y, angle: seg.angle, cone: this.sight(x, y, seg.angle) };
  }

  /** Every patroller at patrol-clock time `clock` (seconds). */
  guardsAt(clock: number): GuardPose[] {
    return this.paths.map((p) => this.guardAt(p, p.offset * p.length + clock * p.speed));
  }

  /** A corridor's points from room a to room b, whichever way it was surveyed. */
  private route(a: string, b: string): readonly Point[] {
    const h = this.halls.find((h) => (h.a === a && h.b === b) || (h.a === b && h.b === a));
    if (!h) throw new Error(`VesperDeck: no corridor between "${a}" and "${b}"`);
    return h.a === a ? h.points : [...h.points].reverse();
  }

  private buildPatrol(rooms: readonly string[], speed: number, offset: number): PatrolPath {
    const first = this.rooms[rooms[0] as string] as DeckRoom;
    const points: Point[] = [[first.x, first.y]];
    rooms.forEach((id, i) => {
      const cell = this.cells.find((c) => c.id === id);
      const r = this.rooms[id] as DeckRoom;
      // Inspect the actual socket, then curl back onto the circuit.
      if (cell) {
        points.push([cell.x - 26, cell.y], [cell.x, cell.y], [cell.x + 14, cell.y + 9], [r.x, r.y]);
      }
      const next = rooms[(i + 1) % rooms.length] as string;
      points.push(...this.route(id, next).slice(1));
    });
    let length = 0;
    const segments = points.slice(1).map(([x, y], i) => {
      const [sx, sy] = points[i] as Point;
      const dx = x - sx;
      const dy = y - sy;
      const dist = Math.hypot(dx, dy);
      const start = length;
      length += dist;
      return { x: sx, y: sy, dx, dy, dist, start, angle: Math.atan2(dy, dx) };
    });
    return { segments, length, speed, offset };
  }

  private buildMap(): Uint8Array {
    const { width: W, height: H } = this;
    const map = new Uint8Array(W * H);
    const stamp = (
      x0: number,
      y0: number,
      x1: number,
      y1: number,
      test: (px: number, py: number) => boolean,
    ): void => {
      for (let y = Math.max(0, Math.floor(y0)); y <= Math.min(H - 1, Math.ceil(y1)); y++) {
        for (let x = Math.max(0, Math.floor(x0)); x <= Math.min(W - 1, Math.ceil(x1)); x++) {
          if (test(x + 0.5, y + 0.5)) map[y * W + x] = 1;
        }
      }
    };
    for (const r of Object.values(this.rooms)) {
      const hw = r.width / 2;
      const hh = r.height / 2;
      stamp(
        r.x - hw,
        r.y - hh,
        r.x + hw,
        r.y + hh,
        (px, py) =>
          Math.abs(px - r.x) + Math.abs(py - r.y) <= hw + hh - ROOM_CHAMFER &&
          Math.abs(px - r.x) <= hw &&
          Math.abs(py - r.y) <= hh,
      );
    }
    for (const passage of this.passages) {
      const { x, y, endX, endY } = passage;
      stamp(
        Math.min(x, endX) - HALL_RADIUS,
        Math.min(y, endY) - HALL_RADIUS,
        Math.max(x, endX) + HALL_RADIUS,
        Math.max(y, endY) + HALL_RADIUS,
        (px, py) => {
          const [cx, cy] = projectOnPassage(px, py, passage);
          return (px - cx) ** 2 + (py - cy) ** 2 <= HALL_RADIUS ** 2;
        },
      );
    }
    return map;
  }
}

/** The closest point on a passage to (x, y). */
function projectOnPassage(x: number, y: number, passage: Passage): Point {
  const { x: sx, y: sy, ux, uy, length } = passage;
  const along = Math.max(0, Math.min(length, (x - sx) * ux + (y - sy) * uy));
  return [sx + along * ux, sy + along * uy];
}

let shared: VesperDeck | null = null;

/** The deck, built on first use and shared after that (it never changes). */
export function getVesperDeck(): VesperDeck {
  shared ??= new VesperDeck();
  return shared;
}
