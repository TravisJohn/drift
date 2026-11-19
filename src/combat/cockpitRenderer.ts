/**
 * CockpitRenderer - the fight seen from the pilot's seat.
 *
 * Ported from the STARFALL prototype's cockpit: a nebula and starfield, a
 * ringed planet and a far sun, raiders drawn as small 3D fighters from
 * projected vertices, laser bolts, a canopy frame and instrument console,
 * the aim ring and arrows to hostiles out of view.
 *
 * The ship never turns, so the view always looks forward, wide (about 120
 * degrees). The mouse moves the aim ring along the horizon (the guns
 * swivel); the sides and the tail are watched on the big holographic map
 * (holoMap.ts) projected over the centre console, where raider missiles
 * flash. The wide view makes everything small, so raiders are drawn larger
 * than life, and one making an attack run is bracketed in red, INCOMING.
 *
 * The rules stay flat (2D): everything that matters sits on one plane at
 * about eye level. Depth comes from things that don't (stars, the planet,
 * debris drifting above and below) and from the view banking with the
 * sideways drift. Raiders bob a little for life; never enough to look
 * like a miss.
 */
import { gameConfig } from '../config/gameConfig';
import { mulberry32 } from '../core/random';
import {
  type CameraPoint,
  type CockpitCamera,
  type ScreenFrame,
  bearing,
  bearingToScreenX,
  clipToNear,
  project,
  screenBearing,
  skyToCamera,
  toCamera,
} from './cockpitCamera';
import { paintCockpitInterior } from './cockpitInterior';
import { angleBetween, approach, clamp } from './combatMath';
import {
  type CombatEvent,
  type CombatSettings,
  type CombatSnapshot,
  FORWARD,
  type Raider,
  type Rock,
  type Shot,
} from './combatTypes';
import type { CombatView } from './combatView';
import { drawHoloMap } from './holoMap';
import { drawRaiderModel, RAIDER_HALF_SPAN } from './raiderModel';
import asteroidUrl from './scenery/asteroid-relief.webp';
import nebulaUrl from './scenery/dust-nebula.webp';
import planetUrl from './scenery/ringed-giant.webp';
import { type Vec2, add, fromAngle, length, normalize, scale, sub, vec2 } from './vec2';

/** Eye height above the plane the fight happens on. */
const EYE = 4;
/** How far a raider bobs above and below the plane (visual only). */
const RAIDER_BOB = 4;
/** Visual roll at the widest sideways drift, radians. */
const MAX_BANK = 0.1;
/** Half the view's width as an angle: a 120 degree view. */
export const VIEW_HALF_ANGLE = Math.PI / 3;
const STAR_COUNT = 900;
const DEBRIS_COUNT = 36;
/** Debris repeats in a square this wide around the ship, so it is always about. */
const DEBRIS_TILE = 2600;
const MAX_PARTICLES = 500;
const HIT_FLASH = 0.28;

/**
 * Raiders are drawn this much larger than their real size: at 120 degrees
 * a raider at fighting range is otherwise only a few pixels. (Hits use the
 * real size; the lock and the aim assist make up the difference.)
 */
const RAIDER_LOOK = 1.6;

/**
 * Where the holographic map sits: centred on the instrument console, its
 * diameter about a third of the screen's height (smaller on narrow screens).
 */
export function consoleMapFrame(
  width: number,
  height: number,
): { cx: number; cy: number; radius: number } {
  const radius = Math.max(50, Math.min(height * 0.155, width * 0.2, 180));
  // Lifted clear of the wingman's line along the bottom.
  return { cx: width / 2, cy: height - 36 - radius, radius };
}

/** The INCOMING call-out for a raider on an attack run, or null if it isn't on one. */
export function incomingLabel(raider: Readonly<Raider>, shipPos: Vec2): string | null {
  if (raider.dead || raider.attacking <= 0) return null;
  return `INCOMING · ${Math.round(length(sub(raider.pos, shipPos)))} M`;
}
// Atlas columns sweep the sun around each surface. Rows are distinct rock materials.
const ROCK_LIGHT_ANGLES = 8;
const ROCK_MATERIALS = 3;
// The tile covers all outline radii, including the larger corners on decorative debris.
const ROCK_TILE_RADIUS = 1.16;

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
  private interior: HTMLCanvasElement | null = null;
  private pixelRatio = 1;
  private readonly nebula = new Image();
  private readonly planet = new Image();
  private readonly asteroid = new Image();
  private readonly rockContours = new WeakMap<readonly number[], (readonly [number, number])[]>();

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
    this.nebula.src = nebulaUrl;
    this.planet.src = planetUrl;
    this.asteroid.src = asteroidUrl;
  }

  resize(width: number, height: number, pixelRatio: number): void {
    this.interior = null;
    this.pixelRatio = pixelRatio;
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.frame = {
      cx: this.width / 2,
      cy: this.height * 0.46,
      // Wide: the screen's half-width spans VIEW_HALF_ANGLE.
      focal: this.width / 2 / Math.tan(VIEW_HALF_ANGLE),
    };
    this.ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  }

  /** The gun angle for the pointer: its bearing from straight ahead. */
  aimAt(pointer: Vec2): number {
    return FORWARD + screenBearing(pointer.x, this.frame);
  }

  react(events: readonly CombatEvent[]): void {
    for (const e of events) {
      if (e.type === 'raiderDestroyed')
        this.burst(e.at, e.commander ? 60 : 35, e.commander ? 1.7 : 1);
      else if (e.type === 'hit' && e.on === 'raider') this.spark(e.at, '#d2f7ff');
      else if (e.type === 'hit') this.spark(e.at, '#8fa3ad');
      else if (e.type === 'playerDamaged') this.flash = HIT_FLASH;
      else if (e.type === 'enemyMissileDown') this.burst(e.at, 18, 0.7);
    }
  }

  draw(view: CombatSnapshot, dt: number): void {
    this.time += dt;
    this.flash = Math.max(0, this.flash - dt);
    const p = view.player;
    this.cam = { pos: p.pos, heading: FORWARD, eye: EYE };
    // Bank with the sideways drift: −1 hard left .. 1 hard right.
    const ship = this.s.ship;
    const drift = clamp(p.vel.x / (ship.strafeNotches * ship.strafeStep), -1, 1);
    this.bank += (drift * MAX_BANK - this.bank) * approach(4, dt);
    this.updateParticles(dt);

    const c = this.ctx;
    c.save();
    // Shake on a hit; bank the whole outside world with the drift.
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
    this.drawIncoming(view);
    c.restore();

    this.drawReticle(view);
    // Composite the detailed metalwork as one layer, including its projector lighting.
    this.interior ??= paintCockpitInterior(
      this.width,
      this.height,
      this.pixelRatio,
      consoleMapFrame(this.width, this.height),
    );
    // Allow the original five-pixel seat sway at full drift. Overscan the sides
    // so the moving foreground still covers the viewport edges.
    c.save();
    c.translate(drift * 5, 0);
    c.drawImage(this.interior, -5, 0, this.width + 10, this.height);
    this.drawMap(view);
    c.restore();
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

  private drawSky(boosting: boolean): void {
    const c = this.ctx;
    // Overscan the distant sky for banking and hit shake. Cover preserves cloud proportions.
    const pad = Math.max(this.width, this.height) * 0.12 + 6;
    const w = this.width + pad * 2;
    const h = this.height + pad * 2;
    if (this.nebula.complete && this.nebula.naturalWidth > 0) {
      const scale = Math.max(w / this.nebula.naturalWidth, h / this.nebula.naturalHeight);
      const skyWidth = this.nebula.naturalWidth * scale;
      const skyHeight = this.nebula.naturalHeight * scale;
      c.drawImage(
        this.nebula,
        (this.width - skyWidth) / 2,
        (this.height - skyHeight) / 2,
        skyWidth,
        skyHeight,
      );
    } else {
      c.fillStyle = '#050a16';
      c.fillRect(-pad, -pad, w, h);
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
      c.fillStyle = star.size > 1.3 ? '#d8e6ed' : star.alpha > 0.68 ? '#e5c29d' : '#94b2d1';
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

  /** Keep the planet round and above the combat horizon across different canopy sizes. */
  private drawPlanet(): void {
    if (!this.planet.complete || this.planet.naturalWidth === 0) return;
    const width = Math.min(this.width * 0.49, this.height * 0.82);
    const height = (width * this.planet.naturalHeight) / this.planet.naturalWidth;
    this.ctx.drawImage(
      this.planet,
      this.width * 0.77 - width / 2,
      this.height * 0.25 - height / 2,
      width,
      height,
    );
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

  /** Rotate the original outline and its surface together, with sunlight fixed to port. */
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
    if (size < 1 || !this.onScreen(at, size * ROCK_TILE_RADIUS)) return;
    const c = this.ctx;
    c.save();
    c.globalAlpha = alpha;
    c.translate(at.x, at.y);
    c.rotate(angle);
    c.scale(size, size);
    const pts = this.rockContour(outline);
    if (this.asteroid.complete && this.asteroid.naturalWidth > 0) {
      this.path(pts, null);
      c.clip();
      const material = Math.floor((outline[0] ?? 1) * 1000) % ROCK_MATERIALS;
      this.drawRockSurface(material, angle, alpha);
    } else {
      // The silhouette is visible immediately, including while the texture is loading.
      this.path(pts, '#3c4149');
    }
    c.restore();
  }

  /** Keep the sim's corners and cut small chips into the straight edges between them. */
  private rockContour(outline: readonly number[]): (readonly [number, number])[] {
    const cached = this.rockContours.get(outline);
    if (cached) return cached;
    const corners = outline.map((radius, i) => {
      const angle = (i * Math.PI * 2) / outline.length;
      return [Math.cos(angle) * radius, Math.sin(angle) * radius] as const;
    });
    const random = mulberry32(Math.floor((outline[0] ?? 1) * 1e8));
    const contour: (readonly [number, number])[] = [];
    corners.forEach(([x, y], i) => {
      const next = corners[(i + 1) % corners.length];
      if (!next) return;
      contour.push([x, y]);
      for (let j = 0; j < 4; j++) {
        const t = (j + 0.3 + random() * 0.4) / 4;
        const chip = 1 - random() * 0.037;
        contour.push([(x + (next[0] - x) * t) * chip, (y + (next[1] - y) * t) * chip]);
      }
    });
    this.rockContours.set(outline, contour);
    return contour;
  }

  private drawRockSurface(material: number, angle: number, opacity: number): void {
    const c = this.ctx;
    const turns = angle / (Math.PI * 2);
    const phase = (turns - Math.floor(turns)) * ROCK_LIGHT_ANGLES;
    const first = Math.floor(phase) % ROCK_LIGHT_ANGLES;
    const blend = phase - Math.floor(phase);
    const tile = this.asteroid.naturalWidth / ROCK_LIGHT_ANGLES;
    const radius = ROCK_TILE_RADIUS;
    const drawFrame = (column: number) =>
      c.drawImage(
        this.asteroid,
        column * tile,
        material * tile,
        tile,
        tile,
        -radius,
        -radius,
        radius * 2,
        radius * 2,
      );

    // Crossfade neighbouring sun angles. Compensate for source-over blending so
    // decorative debris stays at its requested opacity throughout the rotation.
    const topAlpha = opacity * blend;
    c.globalAlpha = (opacity - topAlpha) / (1 - topAlpha);
    drawFrame(first);
    if (topAlpha > 0) {
      c.globalAlpha = topAlpha;
      drawFrame((first + 1) % ROCK_LIGHT_ANGLES);
    }
  }

  /** A raider as a small 3D fighter, its faces sorted far to near. */
  private drawRaider(r: Readonly<Raider>, time: number): void {
    const lift = Math.sin(time * 0.7 + r.phase * 2.3) * RAIDER_BOB;
    const position = toCamera(this.cam, r.pos, lift);
    const centre = project(position, this.frame);
    if (!centre || !this.onScreen(centre, r.radius * RAIDER_LOOK * centre.scale * 2)) return;

    // The nose leads the velocity through a turn. Lower the inside wing as it breaks away.
    const slip = length(r.vel) > 1 ? angleBetween(Math.atan2(r.vel.y, r.vel.x), r.heading) : 0;
    const bank = Math.sin(time + r.phase) * 0.12 - Math.sin(slip) * 0.62;
    drawRaiderModel(
      this.ctx,
      position,
      this.frame,
      (r.radius * RAIDER_LOOK) / RAIDER_HALF_SPAN,
      r.heading - this.cam.heading,
      bank,
      r.commander,
    );

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

  // --- Targeting and the head-up display ---

  /** Brackets around the raider being locked, closing as the lock builds. */
  private drawLock(view: CombatSnapshot): void {
    const target = view.raiders.find((r) => r.id === view.lock.targetId && !r.dead);
    if (!target || view.lock.progress <= 0) return;
    const at = project(toCamera(this.cam, target.pos), this.frame);
    if (!at) return;
    const locked = view.lock.progress >= 1;
    const r = Math.max(14, target.radius * RAIDER_LOOK * at.scale * 1.6);
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

  /** Red brackets and a closing range on each raider making an attack run. */
  private drawIncoming(view: CombatSnapshot): void {
    const c = this.ctx;
    const pulse = 0.55 + 0.45 * Math.sin(this.time * 10);
    c.save();
    c.font = '600 10px ui-monospace, Consolas, monospace';
    c.textAlign = 'center';
    for (const r of view.raiders) {
      const label = incomingLabel(r, view.player.pos);
      if (!label) continue;
      const at = project(toCamera(this.cam, r.pos), this.frame);
      if (!at || !this.onScreen(at, 40)) continue;
      const g = Math.max(16, r.radius * RAIDER_LOOK * at.scale * 1.9);
      const k = g * 0.4;
      c.strokeStyle = `rgba(255, 80, 70, ${pulse.toFixed(3)})`;
      c.lineWidth = 1.5;
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
      c.fillStyle = `rgba(255, 120, 100, ${(0.5 + 0.5 * pulse).toFixed(3)})`;
      c.fillText(label, at.x, at.y - g - 6);
    }
    c.restore();
  }

  private drawReticle(view: CombatSnapshot): void {
    const c = this.ctx;
    const { cx: x, cy: y } = this.frame;
    const p = view.player;
    c.save();
    // Boresight: a small fixed cross where the nose points.
    this.line(x - 6, y, x - 2, y, '#c1efea88');
    this.line(x + 2, y, x + 6, y, '#c1efea88');
    this.line(x, y - 6, x, y - 2, '#c1efea88');
    this.line(x, y + 2, x, y + 6, '#c1efea88');
    this.drawAimRing(view);
    // Side ladder ticks.
    for (const side of [-1, 1]) {
      for (let i = -2; i <= 2; i++) {
        const lx = x + side * Math.min(this.width * 0.19, 230);
        const ly = y + i * 28;
        this.line(lx, ly, lx + side * 12, ly, '#7fa5ad40');
      }
    }

    // Arrows round the view toward raiders and missiles out of sight.
    const flash = 0.55 + 0.45 * Math.sin(this.time * 14);
    for (const e of view.raiders) {
      if (e.dead) continue;
      // One turning in on the ship flashes red, like a missile.
      const color =
        e.attacking > 0
          ? `rgba(255, 90, 70, ${flash.toFixed(3)})`
          : e.commander
            ? '#ffae7aee'
            : '#e38d6488';
      this.offViewArrow(e.pos, color);
    }
    for (const shot of view.shots) {
      if (shot.owner === 'enemy' && shot.missile) {
        this.offViewArrow(shot.pos, `rgba(255, 70, 70, ${flash.toFixed(3)})`);
      }
    }

    // Target readout under the centre.
    const locked = view.lock.progress >= 1;
    const target = view.raiders.find((e) => e.id === view.lock.targetId && !e.dead);
    c.font = '600 10px ui-monospace, Consolas, monospace';
    c.textAlign = 'center';
    c.fillStyle = locked ? '#ffc39a' : '#c6e9ef';
    if (target) {
      const kind = target.commander ? 'COMMANDER' : 'RAIDER';
      const range = Math.round(length(sub(target.pos, p.pos)));
      c.fillText(`${kind} ${String(target.id).padStart(2, '0')} · ${range} M`, x, y + 46);
      c.font = '9px ui-monospace, Consolas, monospace';
      c.fillStyle = '#7fa5adcc';
      c.fillText(
        locked ? 'MISSILE LOCK · FIRE' : `ACQUIRING ${Math.round(view.lock.progress * 100)}%`,
        x,
        y + 59,
      );
    } else {
      c.fillText('NO TARGET', x, y + 46);
      c.font = '9px ui-monospace, Consolas, monospace';
      c.fillStyle = '#7fa5adaa';
      c.fillText('AIM AT A RAIDER TO LOCK', x, y + 59);
    }
    c.fillStyle = '#ff9b76';
    // Above the aim ring: below the readout is the console map's room.
    if (p.overheated) c.fillText('CANNONS COOLING', x, y - 44);
    if (p.shield < 25)
      c.fillText(p.shield < 1 ? 'SHIELDS DOWN' : 'SHIELDS LOW', x, this.height * 0.25);
    c.restore();
  }

  /**
   * The aim ring: where the guns point, on the horizon. When the guns
   * point outside the view (aimed by the tactical view, say) it waits at
   * the view's edge, dimmed.
   */
  private drawAimRing(view: CombatSnapshot): void {
    const c = this.ctx;
    const p = view.player;
    const off = angleBetween(FORWARD, p.aim);
    const edge = VIEW_HALF_ANGLE * 0.97;
    const inView = Math.abs(off) <= edge;
    const x = bearingToScreenX(clamp(off, -edge, edge), this.frame);
    const y = this.frame.cy;
    const locked = view.lock.progress >= 1;
    const r = 27;
    c.globalAlpha = inView ? 1 : 0.4;
    c.strokeStyle = p.overheated ? '#ff7955aa' : locked ? '#ffae7a' : '#a6d2d0aa';
    c.lineWidth = 1;
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
    c.fillStyle = '#c1efea';
    c.fillRect(x - 1, y - 1, 2, 2);
    c.globalAlpha = 1;
  }

  /** An arrow round the view's edge toward something out of sight. */
  private offViewArrow(pos: Vec2, color: string): void {
    const at = project(toCamera(this.cam, pos), this.frame);
    if (
      at &&
      at.x > this.width * 0.12 &&
      at.x < this.width * 0.88 &&
      at.y > this.height * 0.22 &&
      at.y < this.height * 0.72
    )
      return;
    const c = this.ctx;
    const { cx: x, cy: y } = this.frame;
    const rx = Math.min(this.width * 0.36, 500);
    const ry = this.height * 0.26;
    const a = bearing(this.cam, pos) - Math.PI / 2;
    c.save();
    c.translate(x + Math.cos(a) * rx, y + Math.sin(a) * ry);
    c.rotate(a);
    this.path(
      [
        [7, 0],
        [-4, -5],
        [-4, 5],
      ],
      color,
    );
    c.restore();
  }

  /** The holographic map, projected large over the centre console. */
  private drawMap(view: CombatSnapshot): void {
    const at = consoleMapFrame(this.width, this.height);
    drawHoloMap(this.ctx, view, { ...at, range: this.s.fieldRadius }, this.time, {
      viewCone: VIEW_HALF_ANGLE,
      scale: Math.max(1, at.radius / 80),
      markAttacks: true,
    });
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
