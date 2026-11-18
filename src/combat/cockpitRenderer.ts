/**
 * CockpitRenderer - the fight seen from the pilot's seat.
 *
 * Ported from the STARFALL prototype's cockpit: a nebula and starfield, a
 * ringed planet and a far sun, raiders drawn as small 3D fighters from
 * projected vertices, laser bolts converging ahead, a canopy frame and
 * instrument console, a heading-up radar, the targeting ring and arrows
 * to hostiles out of view.
 *
 * The rules stay flat (2D): everything that matters sits on one plane at
 * about eye level. Depth comes from things that don't (stars, the planet,
 * debris drifting above and below) and from the view banking into turns.
 * Raiders bob a little for life; never enough to look like a miss.
 */
import { gameConfig } from '../config/gameConfig';
import { mulberry32 } from '../core/random';
import {
  type CameraPoint,
  type CockpitCamera,
  type ScreenFrame,
  bearing,
  clipToNear,
  compassDegrees,
  project,
  skyToCamera,
  toCamera,
} from './cockpitCamera';
import { angleBetween, approach, clamp } from './combatMath';
import type {
  CombatEvent,
  CombatSettings,
  CombatSnapshot,
  PlayerShip,
  Raider,
  Rock,
  Shot,
} from './combatTypes';
import type { CombatView, PilotState } from './combatView';
import { type Vec2, add, angleOf, fromAngle, length, normalize, scale, sub, vec2 } from './vec2';

/** Eye height above the plane the fight happens on. */
const EYE = 4;
/** How far a raider bobs above and below the plane (visual only). */
const RAIDER_BOB = 4;
/** Visual roll into a full-rate turn, radians. */
const MAX_BANK = 0.14;
/** How far out along the drift the horizon markers are placed (any far point works). */
const DRIFT_MARKER_DISTANCE = 100_000;
const STAR_COUNT = 900;
const DEBRIS_COUNT = 36;
/** Debris repeats in a square this wide around the ship, so it is always about. */
const DEBRIS_TILE = 2600;
const MAX_PARTICLES = 500;
const HIT_FLASH = 0.28;
/** Radar range: raiders further than this sit on the radar's rim. */
const RADAR_RANGE = 1900;

/** The raider fighter from STARFALL: vertices (x right, y up, −z forward). */
const RAIDER_VERTS: readonly (readonly [number, number, number])[] = [
  [-24, -1, 7],
  [-8, 1, -4],
  [-4, 3, 5],
  [-3, 3, -14],
  [0, 1, -22],
  [3, 3, -14],
  [4, 3, 5],
  [8, 1, -4],
  [24, -1, 7],
  [12, -2, 12],
  [4, -2, 11],
  [0, -3, -13],
  [-4, -2, 11],
  [-12, -2, 12],
  [-6, 6, 10],
  [6, 6, 10],
  [0, 6, -7],
];
const RAIDER_FACES: readonly { ids: readonly number[]; fill: string; stroke?: string }[] = [
  { ids: [0, 1, 2, 12, 13], fill: '#44505b' },
  { ids: [7, 8, 9, 10, 6], fill: '#394754' },
  { ids: [0, 1, 12, 13], fill: '#1e2c3a' },
  { ids: [7, 8, 9, 10], fill: '#293642' },
  { ids: [2, 3, 4, 5, 6, 10, 11, 12], fill: '#66717a' },
  { ids: [3, 4, 5, 16], fill: '#506574' },
  { ids: [2, 14, 16, 3], fill: '#859099' },
  { ids: [6, 15, 16, 5], fill: '#3a4d5d' },
  { ids: [14, 15, 16], fill: '#a6afb1' },
  { ids: [3, 16, 5, 4], fill: '#142b3b', stroke: '#97ccdc77' },
];
const RAIDER_EDGES: readonly (readonly [number, number, string, number])[] = [
  [0, 1, '#c67f57', 1.7],
  [7, 8, '#dd8a5d', 1.7],
  [14, 16, '#c3d3d988', 1],
  [3, 5, '#8ad9e7', 1],
  [0, 13, '#b2bec555', 1],
  [8, 9, '#b2bec555', 1],
];
/** The model's half-span, to scale it to a raider's radius. */
const RAIDER_SPAN = 24;
const ROCK_SHADES = ['#30343d', '#1a222d', '#242c36', '#3a3b42', '#222a33'];

interface Star {
  readonly azimuth: number;
  readonly elevation: number;
  readonly size: number;
  readonly alpha: number;
}

interface Debris {
  readonly base: Vec2;
  readonly height: number;
  readonly radius: number;
  readonly outline: readonly number[];
  readonly spin: number;
}

interface Particle {
  pos: Vec2;
  height: number;
  vel: Vec2;
  rise: number;
  life: number;
  readonly max: number;
  readonly size: number;
  readonly color: string;
}

/** Something drawn in the world, kept so all of them can be drawn far to near. */
type Drawable =
  | { readonly kind: 'rock'; readonly z: number; readonly rock: Readonly<Rock> }
  | { readonly kind: 'debris'; readonly z: number; readonly debris: Debris; readonly at: Vec2 }
  | { readonly kind: 'raider'; readonly z: number; readonly raider: Readonly<Raider> };

export class CockpitRenderer implements CombatView {
  private width = 1;
  private height = 1;
  private frame: ScreenFrame = { cx: 0, cy: 0, focal: 1 };
  private cam: CockpitCamera = { pos: vec2(), heading: 0, eye: EYE };
  private bank = 0;
  private time = 0;
  private flash = 0;
  private particles: Particle[] = [];
  private readonly stars: Star[];
  private readonly debris: Debris[];
  private readonly nebula: HTMLCanvasElement;

  constructor(
    private readonly ctx: CanvasRenderingContext2D,
    private readonly s: CombatSettings = gameConfig.combat,
  ) {
    // Fixed seed: the same sky every fight.
    const random = mulberry32(2611);
    this.stars = Array.from({ length: STAR_COUNT }, () => ({
      azimuth: random() * Math.PI * 2,
      elevation: Math.asin(random() * 2 - 1) * 0.9,
      size: 0.35 + random() * 1.25,
      alpha: 0.15 + random() * 0.7,
    }));
    this.debris = Array.from({ length: DEBRIS_COUNT }, () => ({
      base: vec2((random() - 0.5) * DEBRIS_TILE, (random() - 0.5) * DEBRIS_TILE),
      height: (random() < 0.5 ? -1 : 1) * (60 + random() * 380),
      radius: 8 + random() * 30,
      outline: Array.from({ length: 9 }, () => 0.7 + random() * 0.45),
      spin: (random() * 2 - 1) * 0.3,
    }));
    this.nebula = this.paintNebula(random);
  }

  resize(width: number, height: number, pixelRatio: number): void {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.frame = {
      cx: this.width / 2,
      cy: this.height * 0.46,
      focal: Math.max(this.width * 0.62, this.height * 0.8),
    };
    this.ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  }

  react(events: readonly CombatEvent[]): void {
    for (const e of events) {
      if (e.type === 'raiderDestroyed')
        this.burst(e.at, e.commander ? 60 : 35, e.commander ? 1.7 : 1);
      else if (e.type === 'hit' && e.on === 'raider') this.spark(e.at, '#d2f7ff');
      else if (e.type === 'hit') this.spark(e.at, '#8fa3ad');
      else if (e.type === 'playerDamaged') this.flash = HIT_FLASH;
    }
  }

  draw(view: CombatSnapshot, dt: number, pilot: PilotState): void {
    this.time += dt;
    this.flash = Math.max(0, this.flash - dt);
    const p = view.player;
    this.cam = { pos: p.pos, heading: p.heading, eye: EYE };
    this.bank += (pilot.turn * MAX_BANK - this.bank) * approach(4, dt);
    this.updateParticles(dt);

    const c = this.ctx;
    c.save();
    // Shake on a hit; bank the whole outside world into the turn.
    if (this.flash > 0) {
      const k = (this.flash / HIT_FLASH) * 5;
      c.translate((Math.random() * 2 - 1) * k, (Math.random() * 2 - 1) * k);
    }
    c.translate(this.frame.cx, this.frame.cy);
    c.rotate(-this.bank);
    c.translate(-this.frame.cx, -this.frame.cy);
    this.drawSky(p.boosting);
    this.drawBodies(view);
    for (const shot of view.shots) this.drawShot(shot);
    this.drawParticles();
    this.drawLock(view);
    this.drawDrift(p);
    c.restore();

    this.drawReticle(view, pilot);
    this.drawCockpit(pilot.turn);
    this.drawRadar(view);
    if (this.flash > 0) {
      const a = this.flash / HIT_FLASH;
      c.fillStyle = `rgba(255, 90, 60, ${(a * 0.3).toFixed(3)})`;
      c.fillRect(0, 0, this.width, this.height);
      c.strokeStyle = `rgba(255, 97, 60, ${a.toFixed(3)})`;
      c.lineWidth = 20;
      c.strokeRect(0, 0, this.width, this.height);
    }
    const vignette = c.createRadialGradient(
      this.width * 0.5,
      this.height * 0.45,
      this.height * 0.22,
      this.width * 0.5,
      this.height * 0.45,
      Math.max(this.width, this.height) * 0.7,
    );
    vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
    vignette.addColorStop(1, 'rgba(0, 0, 0, 0.53)');
    c.fillStyle = vignette;
    c.fillRect(0, 0, this.width, this.height);
  }

  // --- The sky: nebula, stars, planet, sun ---

  /** A soft nebula, painted once; it scrolls sideways as the ship turns. */
  private paintNebula(random: () => number): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = 1400;
    canvas.height = 850;
    const n = canvas.getContext('2d');
    if (!n) return canvas; // nothing to paint on: the sky is just dark
    n.fillStyle = '#060b16';
    n.fillRect(0, 0, 1400, 850);
    for (let i = 0; i < 90; i++) {
      const x = random() * 1400;
      const y = random() * 850;
      const r = 90 + random() * 310;
      const g = n.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, i % 3 === 0 ? 'rgba(70,63,72,.065)' : 'rgba(23,66,90,.065)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      n.fillStyle = g;
      n.fillRect(x - r, y - r, r * 2, r * 2);
    }
    return canvas;
  }

  private drawSky(boosting: boolean): void {
    const c = this.ctx;
    // Overscan so the banked view never shows an edge.
    const pad = Math.max(this.width, this.height) * 0.2;
    const w = this.width + pad * 2;
    const h = this.height + pad * 2;
    // One full turn scrolls the nebula across two widths of the screen.
    const turnShare = (((this.cam.heading / (Math.PI * 2)) % 1) + 1) % 1;
    const offset = -turnShare * w * 2;
    for (let k = -1; k <= 3; k++) {
      const left = offset + k * w - pad;
      // Only the (at most two) copies that reach the screen.
      if (left < this.width + pad && left + w > -pad) c.drawImage(this.nebula, left, -pad, w, h);
    }

    const { cx, cy } = this.frame;
    for (const star of this.stars) {
      const q = skyToCamera(this.cam.heading, star.azimuth, star.elevation);
      const at = project({ x: q.x * 1e5, y: q.y * 1e5, z: q.z * 1e5 }, this.frame);
      if (
        !at ||
        at.x < -pad ||
        at.x > this.width + pad ||
        at.y < -pad ||
        at.y > this.height + pad
      ) {
        continue;
      }
      c.globalAlpha = star.alpha * (0.85 + Math.sin(this.time + star.size * 100) * 0.15);
      c.fillStyle = star.size > 1.3 ? '#c3d7de' : '#9bb6cb';
      c.fillRect(at.x, at.y, star.size, star.size);
      if (boosting) {
        // Streaks away from the centre while the afterburner runs.
        this.line(
          at.x,
          at.y,
          at.x + (at.x - cx) * 0.018,
          at.y + (at.y - cy) * 0.018,
          '#93d8ed55',
          star.size * 0.6,
        );
      }
    }
    c.globalAlpha = 1;
    this.drawPlanet();
    const sun = project(this.sky(-0.9, 0.42, 1e5), this.frame);
    if (sun) {
      this.glow(sun.x, sun.y, this.width * 0.25, 'rgba(191,140,100,.06)');
      this.glow(sun.x, sun.y, 40, 'rgba(255,229,193,.13)');
      this.glow(sun.x, sun.y, 5, 'rgba(255,241,214,.9)');
    }
  }

  /** A sky direction (relative to the map's "up") scaled out to `far`. */
  private sky(azimuthFromNorth: number, elevation: number, far: number): CameraPoint {
    const q = skyToCamera(this.cam.heading, azimuthFromNorth - Math.PI / 2, elevation);
    return { x: q.x * far, y: q.y * far, z: q.z * far };
  }

  /** STARFALL's ringed planet, hanging off to one side. */
  private drawPlanet(): void {
    const c = this.ctx;
    const dirQ = skyToCamera(this.cam.heading, 0.5 - Math.PI / 2, 0.2);
    if (dirQ.z < 0.1) return;
    const at = project({ x: dirQ.x * 2e4, y: dirQ.y * 2e4, z: dirQ.z * 2e4 }, this.frame);
    if (!at) return;
    // A distant planet keeps its size wherever it sits in the view.
    const r = Math.min(this.width, this.height) * 0.2;
    if (at.x + r * 2 < 0 || at.x - r * 2 > this.width) return;
    c.save();
    c.translate(at.x, at.y);
    c.rotate(-0.32);
    c.scale(1, 0.25);
    c.beginPath();
    c.ellipse(0, 0, r * 1.8, r * 1.8, 0, 0, Math.PI * 2);
    c.strokeStyle = '#77a0b725';
    c.lineWidth = r * 0.18;
    c.stroke();
    c.beginPath();
    c.ellipse(0, 0, r * 1.65, r * 1.65, 0, 0, Math.PI * 2);
    c.strokeStyle = '#a2b6bd27';
    c.lineWidth = r * 0.035;
    c.stroke();
    c.restore();
    this.glow(at.x, at.y, r * 1.15, 'rgba(72,142,181,.07)');
    c.save();
    c.beginPath();
    c.arc(at.x, at.y, r, 0, Math.PI * 2);
    c.clip();
    const g = c.createRadialGradient(
      at.x - r * 0.55,
      at.y - r * 0.5,
      0,
      at.x + r * 0.15,
      at.y + r * 0.1,
      r * 1.4,
    );
    g.addColorStop(0, '#6b8998');
    g.addColorStop(0.32, '#365366');
    g.addColorStop(0.66, '#172e3e');
    g.addColorStop(1, '#040b14');
    c.fillStyle = g;
    c.fillRect(at.x - r, at.y - r, r * 2, r * 2);
    for (let i = 0; i < 34; i++) {
      const y = at.y - r + (i * r * 2) / 34;
      c.beginPath();
      c.ellipse(at.x - r * 0.1, y, r * 1.1, r * 0.022, Math.sin(i) * 0.06, 0, Math.PI * 2);
      c.fillStyle = i % 3 === 0 ? 'rgba(167,191,197,.055)' : 'rgba(8,24,41,.09)';
      c.fill();
    }
    const shade = c.createLinearGradient(at.x - r, at.y, at.x + r * 0.5, at.y);
    shade.addColorStop(0, '#0a172000');
    shade.addColorStop(0.55, '#02081330');
    shade.addColorStop(1, '#020710d9');
    c.fillStyle = shade;
    c.fillRect(at.x - r, at.y - r, r * 2, r * 2);
    c.restore();
    c.beginPath();
    c.arc(at.x, at.y, r, Math.PI * 0.65, Math.PI * 1.65);
    c.strokeStyle = '#a1d9ef55';
    c.lineWidth = 1.3;
    c.stroke();
  }

  // --- Rocks, debris and raiders, far to near ---

  private drawBodies(view: CombatSnapshot): void {
    const list: Drawable[] = [];
    for (const rock of view.rocks) {
      const z = toCamera(this.cam, rock.pos).z;
      if (z > 0) list.push({ kind: 'rock', z, rock });
    }
    const half = DEBRIS_TILE / 2;
    const wrap = (v: number) => ((((v + half) % DEBRIS_TILE) + DEBRIS_TILE) % DEBRIS_TILE) - half;
    for (const d of this.debris) {
      const rel = sub(d.base, this.cam.pos);
      const at = add(this.cam.pos, vec2(wrap(rel.x), wrap(rel.y)));
      const z = toCamera(this.cam, at).z;
      if (z > 0) list.push({ kind: 'debris', z, debris: d, at });
    }
    for (const raider of view.raiders) {
      if (raider.dead) continue;
      const z = toCamera(this.cam, raider.pos).z;
      if (z > -raider.radius) list.push({ kind: 'raider', z, raider });
    }
    list.sort((a, b) => b.z - a.z);
    for (const item of list) {
      if (item.kind === 'rock')
        this.drawRock(
          item.rock.pos,
          rockHeight(item.rock),
          item.rock.radius,
          item.rock.outline,
          item.rock.angle,
          1,
        );
      else if (item.kind === 'debris') {
        this.drawRock(
          item.at,
          item.debris.height,
          item.debris.radius,
          item.debris.outline,
          this.time * item.debris.spin,
          0.55,
        );
      } else this.drawRaider(item.raider, view.time);
    }
  }

  /** A rock as STARFALL drew them: a faceted, shaded outline facing the pilot. */
  private drawRock(
    pos: Vec2,
    height: number,
    radius: number,
    outline: readonly number[],
    angle: number,
    alpha: number,
  ): void {
    const at = project(toCamera(this.cam, pos, height), this.frame);
    if (!at) return;
    const size = radius * at.scale;
    if (size < 1 || !this.onScreen(at, size)) return;
    const c = this.ctx;
    c.save();
    c.globalAlpha = alpha;
    c.translate(at.x, at.y);
    c.rotate(angle);
    const pts = outline.map((k, i) => {
      const a = (i / outline.length) * Math.PI * 2;
      return [Math.cos(a) * size * k, Math.sin(a) * size * k] as const;
    });
    this.path(pts, '#212832', '#77818a30');
    const centre = [-size * 0.15, -size * 0.05] as const;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      if (a && b)
        this.path(
          [centre, a, b],
          ROCK_SHADES[i % ROCK_SHADES.length] ?? '#222a33',
          '#555f6810',
          0.5,
        );
    }
    c.restore();
  }

  /** A raider as a small 3D fighter, its faces sorted far to near. */
  private drawRaider(r: Readonly<Raider>, time: number): void {
    const forward = fromAngle(r.heading);
    const right = vec2(-Math.sin(r.heading), Math.cos(r.heading));
    const size = r.radius / RAIDER_SPAN;
    const bank = Math.sin(time + r.phase) * 0.22;
    const lift = Math.sin(time * 0.7 + r.phase * 2.3) * RAIDER_BOB;
    const cs = Math.cos(bank);
    const sn = Math.sin(bank);
    const cam = RAIDER_VERTS.map(([x, y, z]) => {
      const bx = x * cs - y * sn;
      const by = x * sn + y * cs;
      const world = add(r.pos, add(scale(forward, -z * size), scale(right, bx * size)));
      return toCamera(this.cam, world, by * size + lift);
    });
    const points = cam.map((q) => project(q, this.frame));
    const centre = project(toCamera(this.cam, r.pos, lift), this.frame);
    if (!centre || !this.onScreen(centre, r.radius * centre.scale * 2)) return;

    const faces = RAIDER_FACES.map((face) => ({
      face,
      depth: face.ids.reduce((sum, i) => sum + (cam[i]?.z ?? 0), 0) / face.ids.length,
    })).sort((a, b) => b.depth - a.depth);
    for (const { face } of faces) {
      const pts = face.ids.map((i) => points[i]);
      if (pts.some((pt) => !pt)) continue;
      this.path(
        pts.map((pt) => [pt?.x ?? 0, pt?.y ?? 0] as const),
        face.fill,
        face.stroke ?? '#a8b7bb25',
        0.8,
      );
    }
    for (const [a, b, color, width] of RAIDER_EDGES) {
      const pa = points[a];
      const pb = points[b];
      if (pa && pb) this.line(pa.x, pa.y, pb.x, pb.y, color, width);
    }
    // Engine glow at the tail.
    const tail = project(
      toCamera(this.cam, sub(r.pos, scale(forward, 12 * size)), lift),
      this.frame,
    );
    if (tail) this.glow(tail.x, tail.y, Math.max(3, 9 * tail.scale * size), 'rgba(255,150,90,.55)');

    const span = r.radius * centre.scale;
    if (r.commander) {
      this.ctx.strokeStyle = 'rgba(255,150,90,.45)';
      this.ctx.lineWidth = 1;
      this.ctx.beginPath();
      this.ctx.arc(centre.x, centre.y, span * 1.7, 0, Math.PI * 2);
      this.ctx.stroke();
    }
    if (r.hp < r.maxHp && span > 6) {
      const w = span * 2;
      this.ctx.fillStyle = 'rgba(255,150,90,.25)';
      this.ctx.fillRect(centre.x - w / 2, centre.y - span * 1.3, w, 3);
      this.ctx.fillStyle = 'rgba(255,150,90,.9)';
      this.ctx.fillRect(
        centre.x - w / 2,
        centre.y - span * 1.3,
        (w * Math.max(0, r.hp)) / r.maxHp,
        3,
      );
    }
  }

  // --- Shots and sparks ---

  private drawShot(shot: Readonly<Shot>): void {
    const enemy = shot.owner === 'enemy';
    const len = shot.missile ? 35 : enemy ? 38 : 75;
    const tail = sub(shot.pos, scale(normalize(shot.vel), len));
    const clipped = clipToNear(toCamera(this.cam, tail), toCamera(this.cam, shot.pos));
    if (!clipped) return;
    const a = project(clipped[0], this.frame);
    const b = project(clipped[1], this.frame);
    if (!a || !b) return;
    const c = this.ctx;
    c.save();
    c.globalAlpha = clamp(shot.life * 3, 0, 1);
    c.lineCap = 'round';
    const color = enemy ? '#ff705c' : shot.missile ? '#ffd2a0' : '#a9f4ed';
    this.line(
      a.x,
      a.y,
      b.x,
      b.y,
      enemy ? '#ff413e44' : shot.missile ? '#ff995a55' : '#77eff044',
      enemy ? 5 : 7,
    );
    this.line(a.x, a.y, b.x, b.y, color, enemy ? 1.5 : 2);
    this.glow(
      b.x,
      b.y,
      shot.missile ? 12 : 5,
      enemy ? 'rgba(255,85,65,.7)' : 'rgba(168,255,244,.6)',
    );
    c.restore();
    if (shot.missile && Math.random() < 0.65) {
      this.spawn(shot.pos, 0, scale(shot.vel, -0.03), 0, 0.3, 2, '#ffc180');
    }
  }

  private burst(at: Vec2, count: number, power: number): void {
    for (let i = 0; i < count; i++) {
      const dir = fromAngle(Math.random() * Math.PI * 2);
      const speed = (20 + Math.random() * 130) * power;
      const color = i % 4 === 0 ? '#d3f7ff' : i % 3 === 0 ? '#fff1bd' : '#ff8850';
      this.spawn(
        at,
        0,
        scale(dir, speed),
        (Math.random() * 2 - 1) * speed * 0.7,
        0.35 + Math.random() * 1.05,
        (1 + Math.random() * 2) * power,
        color,
      );
    }
  }

  private spark(at: Vec2, color: string): void {
    this.spawn(at, 0, vec2(), 0, 0.15, 7, color);
  }

  private spawn(
    pos: Vec2,
    height: number,
    vel: Vec2,
    rise: number,
    life: number,
    size: number,
    color: string,
  ): void {
    if (this.particles.length >= MAX_PARTICLES) this.particles.shift();
    this.particles.push({ pos, height, vel, rise, life, max: life, size, color });
  }

  private updateParticles(dt: number): void {
    for (const p of this.particles) {
      p.pos = add(p.pos, scale(p.vel, dt));
      p.height += p.rise * dt;
      p.life -= dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
  }

  private drawParticles(): void {
    const c = this.ctx;
    for (const p of this.particles) {
      const at = project(toCamera(this.cam, p.pos, p.height), this.frame);
      if (!at || !this.onScreen(at, 10)) continue;
      const r = clamp(p.size * at.scale, 1, 35);
      c.globalAlpha = clamp(p.life / p.max, 0, 1);
      c.fillStyle = p.color;
      c.beginPath();
      c.arc(at.x, at.y, r, 0, Math.PI * 2);
      c.fill();
      if (r > 3) this.glow(at.x, at.y, r * 3, 'rgba(255,154,70,.13)');
    }
    c.globalAlpha = 1;
  }

  // --- Flight ---

  /**
   * Where the ship is actually going. With no drag the nose and the motion
   * part ways, so two markers sit on the horizon: a ring with wings for the
   * drift ahead (prograde), a crossed ring for the way back (retrograde,
   * where S swings the nose; burn there to slow down).
   */
  private drawDrift(p: Readonly<PlayerShip>): void {
    const speed = length(p.vel);
    if (speed < this.s.ship.flipMinSpeed) return;
    const dir = scale(p.vel, 1 / speed);
    for (const way of [1, -1] as const) {
      // A far point along the drift, at eye height: it lands on the horizon.
      const far = add(p.pos, scale(dir, way * DRIFT_MARKER_DISTANCE));
      const at = project(toCamera(this.cam, far, EYE), this.frame);
      if (!at || !this.onScreen(at, 20)) continue;
      const color = way > 0 ? '#9fe3d6dd' : '#ffc39add';
      const c = this.ctx;
      c.save();
      c.strokeStyle = color;
      c.lineWidth = 1.3;
      c.beginPath();
      c.arc(at.x, at.y, 7, 0, Math.PI * 2);
      c.stroke();
      if (way > 0) {
        this.line(at.x - 17, at.y, at.x - 7, at.y, color, 1.3);
        this.line(at.x + 7, at.y, at.x + 17, at.y, color, 1.3);
        this.line(at.x, at.y - 7, at.x, at.y - 13, color, 1.3);
      } else {
        const k = 7 * Math.SQRT1_2;
        this.line(at.x - k, at.y - k, at.x + k, at.y + k, color, 1.3);
        this.line(at.x - k, at.y + k, at.x + k, at.y - k, color, 1.3);
      }
      c.restore();
    }
  }

  // --- Targeting and the head-up display ---

  /** Brackets around the raider being locked, closing as the lock builds. */
  private drawLock(view: CombatSnapshot): void {
    const target = view.raiders.find((r) => r.id === view.lock.targetId && !r.dead);
    if (!target || view.lock.progress <= 0) return;
    const at = project(toCamera(this.cam, target.pos), this.frame);
    if (!at) return;
    const locked = view.lock.progress >= 1;
    const r = Math.max(14, target.radius * at.scale * 1.6);
    const g = r * (1.5 - 0.5 * view.lock.progress);
    const k = r * 0.45;
    const c = this.ctx;
    c.lineWidth = locked ? 2 : 1.2;
    c.strokeStyle = locked ? '#ffae7a' : '#a6d2d0aa';
    c.beginPath();
    for (const [sx, sy] of [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ] as const) {
      c.moveTo(at.x + sx * g, at.y + sy * (g - k));
      c.lineTo(at.x + sx * g, at.y + sy * g);
      c.lineTo(at.x + sx * (g - k), at.y + sy * g);
    }
    c.stroke();
  }

  private drawReticle(view: CombatSnapshot, pilot: PilotState): void {
    const c = this.ctx;
    const { cx: x, cy: y } = this.frame;
    const p = view.player;
    const locked = view.lock.progress >= 1;
    const r = 27;
    c.save();
    c.strokeStyle = p.overheated ? '#ff7955aa' : locked ? '#ffae7a' : '#a6d2d080';
    c.lineWidth = 0.8;
    for (const a of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
      c.beginPath();
      c.arc(x, y, r, a + 0.22, a + 1.1);
      c.stroke();
    }
    // Lock progress fills the ring.
    if (view.lock.progress > 0) {
      c.lineWidth = 2;
      c.strokeStyle = locked ? '#ffae7a' : '#a6d2d0cc';
      c.beginPath();
      c.arc(x, y, r + 5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * view.lock.progress);
      c.stroke();
    }
    this.line(x - 6, y, x - 2, y, '#c1efea');
    this.line(x + 2, y, x + 6, y, '#c1efea');
    this.line(x, y - 6, x, y - 2, '#c1efea');
    this.line(x, y + 2, x, y + 6, '#c1efea');
    this.line(x - 48, y, x - 36, y, '#a6d2d055');
    this.line(x + 36, y, x + 48, y, '#a6d2d055');

    if (pilot.stick) {
      const sx = x + pilot.stick.x * 65;
      const sy = y + pilot.stick.y * 65;
      this.line(x, y, sx, sy, '#83d7db23');
      c.beginPath();
      c.arc(sx, sy, 3, 0, Math.PI * 2);
      c.strokeStyle = '#8dc8ce66';
      c.stroke();
    }

    // Heading tape across the top.
    c.font = '9px ui-monospace, Consolas, monospace';
    c.textAlign = 'center';
    const compass = compassDegrees(p.heading);
    const base = Math.round(compass / 10) * 10;
    const tapeY = this.height * 0.16;
    for (let i = -2; i <= 2; i++) {
      const tx = x + (i * 10 - (compass - base)) * 3.8;
      this.line(tx, tapeY, tx, tapeY + 4, '#7fa5ad50');
      c.fillStyle = '#7fa5ad80';
      c.fillText(String((base + i * 10 + 360) % 360).padStart(3, '0'), tx, tapeY - 6);
    }
    // Drift: speed, and how far the motion is off the nose.
    const speed = length(p.vel);
    c.fillStyle = '#9fe3d6bb';
    c.fillText(`DRIFT ${Math.round(speed)} M/S`, x, tapeY + 18);
    if (speed >= this.s.ship.flipMinSpeed) {
      const off = Math.round((angleBetween(p.heading, angleOf(p.vel)) * 180) / Math.PI);
      const side = off === 0 ? 'ON NOSE' : `${Math.abs(off)}° ${off > 0 ? 'RIGHT' : 'LEFT'}`;
      c.fillStyle = '#7fa5ad99';
      c.fillText(side, x, tapeY + 30);
    }
    // Side ladder ticks.
    for (const side of [-1, 1]) {
      for (let i = -2; i <= 2; i++) {
        const lx = x + side * Math.min(this.width * 0.19, 230);
        const ly = y + i * 28;
        this.line(lx, ly, lx + side * 12, ly, '#7fa5ad40');
      }
    }

    // Arrows round the reticle toward hostiles out of view.
    const rx = Math.min(this.width * 0.36, 500);
    const ry = this.height * 0.26;
    for (const e of view.raiders) {
      if (e.dead) continue;
      const at = project(toCamera(this.cam, e.pos), this.frame);
      if (
        at &&
        at.x > this.width * 0.12 &&
        at.x < this.width * 0.88 &&
        at.y > this.height * 0.22 &&
        at.y < this.height * 0.72
      )
        continue;
      const a = bearing(this.cam, e.pos) - Math.PI / 2;
      c.save();
      c.translate(x + Math.cos(a) * rx, y + Math.sin(a) * ry);
      c.rotate(a);
      this.path(
        [
          [7, 0],
          [-4, -5],
          [-4, 5],
        ],
        e.commander ? '#ffae7aee' : '#e38d6488',
      );
      c.restore();
    }

    // Target readout under the reticle.
    const target = view.raiders.find((e) => e.id === view.lock.targetId && !e.dead);
    c.font = '600 10px ui-monospace, Consolas, monospace';
    c.fillStyle = locked ? '#ffc39a' : '#c6e9ef';
    if (target) {
      const kind = target.commander ? 'COMMANDER' : 'RAIDER';
      const range = Math.round(length(sub(target.pos, p.pos)));
      c.fillText(`${kind} ${String(target.id).padStart(2, '0')} · ${range} M`, x, y + 72);
      c.font = '9px ui-monospace, Consolas, monospace';
      c.fillStyle = '#7fa5adcc';
      c.fillText(
        locked ? 'MISSILE LOCK · FIRE' : `ACQUIRING ${Math.round(view.lock.progress * 100)}%`,
        x,
        y + 86,
      );
    } else {
      c.fillText('NO TARGET', x, y + 72);
      c.font = '9px ui-monospace, Consolas, monospace';
      c.fillStyle = '#7fa5adaa';
      c.fillText('SEARCHING FOR HOSTILES', x, y + 86);
    }
    c.fillStyle = '#ff9b76';
    if (p.overheated) c.fillText('CANNONS COOLING', x, y + 102);
    if (p.shield < 25)
      c.fillText(p.shield < 1 ? 'SHIELDS DOWN' : 'SHIELDS LOW', x, this.height * 0.25);
    c.restore();
  }

  /** The canopy frame and instrument console (STARFALL's cockpit). */
  private drawCockpit(turn: number): void {
    const c = this.ctx;
    const w = this.width;
    const h = this.height;
    c.save();
    c.translate(turn * 5, 0);
    const metal = c.createLinearGradient(0, h * 0.7, 0, h);
    metal.addColorStop(0, '#182430');
    metal.addColorStop(0.2, '#111e2a');
    metal.addColorStop(1, '#070d15');
    // Side canopy spars, tapering toward the instrument deck.
    this.path(
      [
        [0, h * 0.18],
        [w * 0.026, h * 0.23],
        [w * 0.16, h * 0.77],
        [w * 0.12, h],
        [0, h],
      ],
      '#090f18',
      '#6e859339',
      1.2,
    );
    this.path(
      [
        [w, h * 0.18],
        [w * 0.974, h * 0.23],
        [w * 0.84, h * 0.77],
        [w * 0.88, h],
        [w, h],
      ],
      '#090f18',
      '#6e859339',
      1.2,
    );
    this.path(
      [
        [0, h * 0.39],
        [w * 0.011, h * 0.4],
        [w * 0.124, h * 0.79],
        [w * 0.15, h * 0.79],
      ],
      '#283745',
      '#778c9b30',
    );
    this.path(
      [
        [w, h * 0.39],
        [w * 0.989, h * 0.4],
        [w * 0.876, h * 0.79],
        [w * 0.85, h * 0.79],
      ],
      '#263340',
      '#778c9b30',
    );
    this.line(w * 0.023, h * 0.285, w * 0.148, h * 0.776, '#b4c3c438', 1.4);
    this.line(w * 0.977, h * 0.285, w * 0.852, h * 0.776, '#b4c3c438', 1.4);
    // Narrow upper canopy rim.
    this.path(
      [
        [0, 0],
        [w, 0],
        [w, h * 0.036],
        [w * 0.71, h * 0.027],
        [w * 0.29, h * 0.027],
        [0, h * 0.036],
      ],
      '#090e16',
      '#46596933',
    );
    // Console, its bevelled lip, and three recessed instrument bays.
    this.path(
      [
        [0, h * 0.88],
        [w * 0.12, h * 0.765],
        [w * 0.32, h * 0.815],
        [w * 0.41, h * 0.795],
        [w * 0.59, h * 0.795],
        [w * 0.68, h * 0.815],
        [w * 0.88, h * 0.765],
        [w, h * 0.88],
        [w, h],
        [0, h],
      ],
      metal,
      '#9ab6c250',
      1.2,
    );
    this.path(
      [
        [w * 0.12, h * 0.8],
        [w * 0.33, h * 0.852],
        [w * 0.34, h * 0.99],
        [w * 0.12, h * 0.97],
      ],
      '#08131c',
      '#44627635',
    );
    this.path(
      [
        [w * 0.88, h * 0.8],
        [w * 0.67, h * 0.852],
        [w * 0.66, h * 0.99],
        [w * 0.88, h * 0.97],
      ],
      '#08131c',
      '#44627635',
    );
    this.path(
      [
        [w * 0.36, h * 0.857],
        [w * 0.42, h * 0.838],
        [w * 0.58, h * 0.838],
        [w * 0.64, h * 0.857],
        [w * 0.62, h],
        [w * 0.38, h],
      ],
      '#09151f',
      '#66879825',
    );
    // Structural ribs and small amber indicator lights.
    for (const side of [0, 1]) {
      const xx = (x: number) => (side ? w - x : x);
      this.line(xx(w * 0.085), h * 0.87, xx(w * 0.108), h * 0.965, '#46556266', 2);
      for (let i = 0; i < 5; i++) {
        const y = h * (0.884 + i * 0.016);
        this.line(xx(w * 0.052), y, xx(w * 0.074), y - 3, '#294352', 2);
      }
      for (let i = 0; i < 3; i++) {
        c.fillStyle = i === 0 ? '#ef9e64' : '#68858d';
        c.fillRect(xx(w * 0.099 + i * 5), h * 0.844, 2, 2);
      }
    }
    // Faint canopy reflections; the centre of the view stays clear.
    this.line(w * 0.11, h * 0.66, w * 0.2, h * 0.73, '#94cee20b', 20);
    this.line(w * 0.83, h * 0.65, w * 0.9, h * 0.61, '#94cee208', 25);
    c.restore();
  }

  /** Heading-up radar in the console: the ship at the centre, ahead is up. */
  private drawRadar(view: CombatSnapshot): void {
    const c = this.ctx;
    const x = this.width * 0.5;
    const y = this.height * 0.92;
    const r = Math.max(46, Math.min(this.width * 0.06, this.height * 0.09));
    const squash = 0.43;
    c.save();
    c.strokeStyle = '#6c9baa45';
    c.lineWidth = 0.7;
    for (const k of [0.5, 1]) {
      c.beginPath();
      c.ellipse(x, y, r * k, r * k * squash, 0, 0, Math.PI * 2);
      c.stroke();
    }
    this.line(x - r, y, x + r, y, '#6c9baa25');
    this.line(x, y - r * squash, x, y + r * squash, '#6c9baa25');
    c.beginPath();
    c.ellipse(x, y, r, r * squash, 0, this.time * 0.4, this.time * 0.4 + 0.6);
    c.strokeStyle = '#8acbd577';
    c.lineWidth = 2;
    c.stroke();
    const blip = (pos: Vec2, color: string, size: number) => {
      const q = toCamera(this.cam, pos);
      const k = Math.min(1, Math.hypot(q.x, q.z) / RADAR_RANGE);
      const a = Math.atan2(q.x, q.z);
      c.fillStyle = color;
      c.fillRect(x + Math.sin(a) * r * k - size / 2, y - Math.cos(a) * r * k * squash - 1, size, 2);
    };
    for (const rock of view.rocks) blip(rock.pos, '#6c9baa66', 2);
    for (const e of view.raiders) {
      if (!e.dead)
        blip(e.pos, e.id === view.lock.targetId ? '#ffc499' : '#ff815d', e.commander ? 5 : 3);
    }
    this.path(
      [
        [x, y - 3],
        [x - 2, y + 2],
        [x + 2, y + 2],
      ],
      '#9bd7dc',
    );
    c.restore();
  }

  // --- Drawing helpers ---

  private path(
    points: readonly (readonly [number, number])[],
    fill: string | CanvasGradient | null,
    stroke?: string,
    width = 1,
  ): void {
    const c = this.ctx;
    c.beginPath();
    points.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
    c.closePath();
    if (fill) {
      c.fillStyle = fill;
      c.fill();
    }
    if (stroke) {
      c.strokeStyle = stroke;
      c.lineWidth = width;
      c.stroke();
    }
  }

  private line(x1: number, y1: number, x2: number, y2: number, color: string, width = 1): void {
    const c = this.ctx;
    c.beginPath();
    c.moveTo(x1, y1);
    c.lineTo(x2, y2);
    c.strokeStyle = color;
    c.lineWidth = width;
    c.stroke();
  }

  private glow(x: number, y: number, r: number, color: string): void {
    if (!Number.isFinite(r) || r <= 0) return;
    const c = this.ctx;
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g;
    c.fillRect(x - r, y - r, r * 2, r * 2);
  }

  private onScreen(at: { x: number; y: number }, pad: number): boolean {
    return at.x > -pad && at.x < this.width + pad && at.y > -pad && at.y < this.height + pad;
  }
}

/**
 * A rock's visual height: big rocks sit a little off the plane so the
 * field doesn't look laid out on a table. Never more than a third of its
 * radius, so it still visibly blocks shots on the plane.
 */
function rockHeight(rock: Readonly<Rock>): number {
  return ((rock.outline[0] ?? 0.9) - 0.9) * rock.radius * 1.5;
}
