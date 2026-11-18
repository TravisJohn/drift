/**
 * The holographic tactical map: a small top-down disc of everything around
 * the ship, behind included. The tactical view shows it as its corner
 * radar; the cockpit projects it above the console, where it is the
 * pilot's only view of the sides and the tail.
 *
 * The ship never turns (it always faces up the map), so the disc needs no
 * rotation: up on the disc is ahead. Anything beyond the disc's range is
 * pinned to its rim, dimmed, so a raider closing from far behind still
 * shows. Raider missiles flash, and the side the nearest one is coming
 * from is called out above the disc.
 */
import { sideOf } from './flight';
import type { CombatSnapshot, Side } from './combatTypes';
import { type Vec2, distance, length, scale, sub, vec2 } from './vec2';

/** Where the disc sits on screen (CSS px) and how far it sees (arena units). */
export interface HoloMapFrame {
  readonly cx: number;
  readonly cy: number;
  readonly radius: number;
  readonly range: number;
}

export interface HoloMapOptions {
  /** Half-angle of the cockpit's view (radians), drawn as a wedge; omit for none. */
  readonly viewCone?: number;
}

/** A world point placed on the disc, and whether it was pinned to the rim. */
export interface MapPoint {
  readonly x: number;
  readonly y: number;
  readonly pinned: boolean;
}

const CYAN = '127, 220, 255';
const WARM = '255, 150, 90';
const RED = '255, 70, 70';
const WHITE = '235, 250, 255';
const rgba = (rgb: string, a: number): string => `rgba(${rgb}, ${a.toFixed(3)})`;

/** The pilot's words for each side, as called out over the disc. */
const SIDE_NAMES: Record<Side, string> = {
  ahead: 'AHEAD',
  left: 'PORT',
  right: 'STARBOARD',
  behind: 'AFT',
};

/** Place `at` on the disc around `ship`; beyond range it is pinned to the rim. */
export function mapPoint(at: Vec2, ship: Vec2, frame: HoloMapFrame): MapPoint {
  const offset = sub(at, ship);
  const far = length(offset);
  const pinned = far > frame.range;
  const reach = pinned ? scale(offset, frame.range / far) : offset;
  const k = frame.radius / frame.range;
  return { x: frame.cx + reach.x * k, y: frame.cy + reach.y * k, pinned };
}

/** The side the nearest raider missile is coming from, or null if none. */
export function missileWarning(view: CombatSnapshot): Side | null {
  let nearest: Vec2 | null = null;
  let best = Infinity;
  for (const shot of view.shots) {
    if (shot.owner !== 'enemy' || !shot.missile) continue;
    const d = distance(shot.pos, view.player.pos);
    if (d < best) {
      best = d;
      nearest = shot.pos;
    }
  }
  return nearest ? sideOf(nearest, view.player.pos) : null;
}

/** Draw the disc. `time` drives the flashing and the sweep. */
export function drawHoloMap(
  c: CanvasRenderingContext2D,
  view: CombatSnapshot,
  frame: HoloMapFrame,
  time: number,
  options: HoloMapOptions = {},
): void {
  const { cx, cy, radius } = frame;
  const ship = view.player.pos;
  const place = (at: Vec2) => mapPoint(at, ship, frame);
  const flash = 0.5 + 0.5 * Math.sin(time * 14);
  c.save();

  // The disc, its range rings and the sweep.
  c.fillStyle = rgba(CYAN, 0.07);
  c.strokeStyle = rgba(CYAN, 0.45);
  c.lineWidth = 1;
  c.beginPath();
  c.arc(cx, cy, radius, 0, Math.PI * 2);
  c.fill();
  c.stroke();
  c.strokeStyle = rgba(CYAN, 0.16);
  c.beginPath();
  c.arc(cx, cy, radius * 0.5, 0, Math.PI * 2);
  c.moveTo(cx - radius, cy);
  c.lineTo(cx + radius, cy);
  c.moveTo(cx, cy - radius);
  c.lineTo(cx, cy + radius);
  c.stroke();
  c.strokeStyle = rgba(CYAN, 0.3);
  c.lineWidth = 2;
  c.beginPath();
  c.arc(cx, cy, radius - 1, time * 1.4, time * 1.4 + 0.5);
  c.stroke();

  // What the cockpit can see: a faint wedge ahead.
  if (options.viewCone !== undefined) {
    const up = -Math.PI / 2;
    c.fillStyle = rgba(CYAN, 0.06);
    c.beginPath();
    c.moveTo(cx, cy);
    c.arc(cx, cy, radius, up - options.viewCone, up + options.viewCone);
    c.closePath();
    c.fill();
  }

  for (const rock of view.rocks) {
    const p = place(rock.pos);
    if (p.pinned) continue;
    c.fillStyle = rgba(CYAN, 0.45);
    c.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
  }

  for (const shot of view.shots) {
    const p = place(shot.pos);
    if (p.pinned) continue;
    if (shot.owner === 'enemy' && shot.missile) {
      // A raider missile: flashing red, with a tail showing where it heads.
      const tail = place(sub(shot.pos, scale(shot.vel, 0.6)));
      c.strokeStyle = rgba(RED, 0.5);
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(tail.x, tail.y);
      c.lineTo(p.x, p.y);
      c.stroke();
      c.fillStyle = rgba(RED, 0.45 + 0.55 * flash);
      c.beginPath();
      c.arc(p.x, p.y, 3.2, 0, Math.PI * 2);
      c.fill();
    } else if (shot.missile) {
      c.fillStyle = rgba(WHITE, 0.9);
      c.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
    } else if (shot.owner === 'enemy') {
      c.fillStyle = rgba(WARM, 0.7);
      c.fillRect(p.x - 1, p.y - 1, 2, 2);
    }
  }

  for (const r of view.raiders) {
    if (r.dead) continue;
    const p = place(r.pos);
    const size = r.commander ? 5 : 3.5;
    const locked = r.id === view.lock.targetId && view.lock.progress > 0;
    c.save();
    c.translate(p.x, p.y);
    c.rotate(r.heading);
    c.fillStyle = rgba(locked ? WHITE : WARM, p.pinned ? 0.45 : 0.95);
    c.beginPath();
    c.moveTo(size * 1.3, 0);
    c.lineTo(-size, -size * 0.8);
    c.lineTo(-size, size * 0.8);
    c.closePath();
    c.fill();
    c.restore();
  }

  // The ship at the centre, nose up, and a line where the guns point.
  const aim = vec2(Math.cos(view.player.aim), Math.sin(view.player.aim));
  c.strokeStyle = rgba(CYAN, 0.55);
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(cx, cy);
  c.lineTo(cx + aim.x * radius * 0.4, cy + aim.y * radius * 0.4);
  c.stroke();
  c.fillStyle = rgba(WHITE, 0.95);
  c.beginPath();
  c.moveTo(cx, cy - 6);
  c.lineTo(cx - 4, cy + 4);
  c.lineTo(cx + 4, cy + 4);
  c.closePath();
  c.fill();

  const warning = missileWarning(view);
  if (warning) {
    c.font = '600 11px ui-monospace, Consolas, monospace';
    c.textAlign = 'center';
    c.fillStyle = rgba(RED, 0.55 + 0.45 * flash);
    c.fillText(`MISSILE · ${SIDE_NAMES[warning]}`, cx, cy - radius - 8);
  }
  c.restore();
}
