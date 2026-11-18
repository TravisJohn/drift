/**
 * CombatRenderer - draws the fight as a top-down tactical hologram (the
 * other view is the cockpit, cockpitRenderer.ts).
 *
 * Canvas 2D, in the command deck's projector colours: the ship and its
 * fire in cyan, raiders and their fire in warm orange so friend and foe
 * read at a glance. The view follows the ship. Off-screen raiders get an
 * arrow at the edge, and a small radar shows the whole arena.
 *
 * Explosions and sparks are visual only: they are spawned from the
 * simulation's events (`react`) and live here, not in the rules.
 */
import { gameConfig } from '../config/gameConfig';
import type {
  CombatEvent,
  CombatSettings,
  CombatSnapshot,
  PlayerShip,
  Raider,
  Rock,
  Shot,
} from './combatTypes';
import type { CombatView } from './combatView';
import { type Vec2, add, fromAngle, length, scale, sub, vec2 } from './vec2';

const CYAN = '127, 220, 255';
const WARM = '255, 150, 90';
const WHITE = '235, 250, 255';
const GRID_STEP = 150;
/** Most particles alive at once (old ones give way): keeps big fights cheap. */
const MAX_PARTICLES = 500;
/** Seconds the red edge glow lasts after a hit. */
const HIT_FLASH = 0.3;

interface Particle {
  pos: Vec2;
  vel: Vec2;
  life: number;
  readonly max: number;
  readonly size: number;
  readonly rgb: string;
}

const rgba = (rgb: string, a: number): string => `rgba(${rgb}, ${a.toFixed(3)})`;

export class CombatRenderer implements CombatView {
  private width = 1;
  private height = 1;
  private zoom = 1;
  private camera: Vec2 = vec2();
  private particles: Particle[] = [];
  private hitFlash = 0;

  constructor(
    private readonly ctx: CanvasRenderingContext2D,
    private readonly s: CombatSettings = gameConfig.combat,
  ) {}

  /** The canvas's size in CSS pixels and the device pixel ratio. */
  resize(width: number, height: number, pixelRatio: number): void {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.zoom = Math.min(this.width, this.height) / this.s.viewSpan;
    this.ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  }

  /** Screen position (CSS pixels) of a world point, for the overlay's aim. */
  toScreen(p: Vec2): Vec2 {
    return vec2(
      (p.x - this.camera.x) * this.zoom + this.width / 2,
      (p.y - this.camera.y) * this.zoom + this.height / 2,
    );
  }

  /** World position of a screen point (CSS pixels). */
  toWorld(screen: Vec2): Vec2 {
    return vec2(
      (screen.x - this.width / 2) / this.zoom + this.camera.x,
      (screen.y - this.height / 2) / this.zoom + this.camera.y,
    );
  }

  /** Turn this step's events into sparks, explosions and flashes. */
  react(events: readonly CombatEvent[]): void {
    for (const e of events) {
      if (e.type === 'raiderDestroyed') this.burst(e.at, e.commander ? 70 : 40, WARM, 1.6);
      else if (e.type === 'hit') this.burst(e.at, 6, e.on === 'raider' ? WHITE : CYAN, 0.5);
      else if (e.type === 'playerDamaged') {
        this.hitFlash = HIT_FLASH;
        this.burst(e.at, 10, CYAN, 0.7);
      } else if (e.type === 'lost') this.burst(this.camera, 90, CYAN, 2.2); // the ship breaks up
    }
  }

  /** Draw one frame. `dt` moves the visual-only effects. */
  draw(view: CombatSnapshot, dt: number): void {
    this.camera = view.player.pos;
    this.updateParticles(dt);
    this.hitFlash = Math.max(0, this.hitFlash - dt);

    const c = this.ctx;
    c.clearRect(0, 0, this.width, this.height);
    c.fillStyle = 'rgba(2, 12, 22, 0.9)';
    c.fillRect(0, 0, this.width, this.height);

    this.drawGrid();
    this.drawArenaEdge();
    for (const rock of view.rocks) this.drawRock(rock);
    for (const shot of view.shots) this.drawShot(shot);
    for (const r of view.raiders) if (!r.dead) this.drawRaider(r, view);
    if (view.phase !== 'lost') this.drawShip(view.player);
    this.drawParticles();
    this.drawLock(view);
    this.drawEdgeArrows(view.raiders);
    this.drawRadar(view);
    if (this.hitFlash > 0) this.drawHitFlash();
  }

  // --- Background ---

  private drawGrid(): void {
    const c = this.ctx;
    const step = GRID_STEP * this.zoom;
    const origin = this.toScreen(vec2(0, 0));
    const offX = ((origin.x % step) + step) % step;
    const offY = ((origin.y % step) + step) % step;
    c.lineWidth = 1;
    c.strokeStyle = rgba(CYAN, 0.07);
    c.beginPath();
    for (let x = offX; x < this.width; x += step) {
      c.moveTo(x, 0);
      c.lineTo(x, this.height);
    }
    for (let y = offY; y < this.height; y += step) {
      c.moveTo(0, y);
      c.lineTo(this.width, y);
    }
    c.stroke();
  }

  private drawArenaEdge(): void {
    const c = this.ctx;
    const centre = this.toScreen(vec2(0, 0));
    c.save();
    c.setLineDash([10, 8]);
    c.lineWidth = 2;
    c.strokeStyle = rgba(CYAN, 0.35);
    c.beginPath();
    c.arc(centre.x, centre.y, this.s.arenaRadius * this.zoom, 0, Math.PI * 2);
    c.stroke();
    c.restore();
  }

  // --- Bodies ---

  private drawRock(rock: Readonly<Rock>): void {
    const c = this.ctx;
    const at = this.toScreen(rock.pos);
    const r = rock.radius * this.zoom;
    if (!this.onScreen(at, r)) return;
    c.beginPath();
    rock.outline.forEach((k, i) => {
      const a = rock.angle + (i / rock.outline.length) * Math.PI * 2;
      const x = at.x + Math.cos(a) * r * k;
      const y = at.y + Math.sin(a) * r * k;
      if (i === 0) c.moveTo(x, y);
      else c.lineTo(x, y);
    });
    c.closePath();
    c.fillStyle = rgba(CYAN, 0.07);
    c.fill();
    c.lineWidth = 1.2;
    c.strokeStyle = rgba(CYAN, 0.45);
    c.stroke();
  }

  private drawShot(shot: Readonly<Shot>): void {
    const c = this.ctx;
    const head = this.toScreen(shot.pos);
    if (!this.onScreen(head, 40)) return;
    const mine = shot.owner === 'player';
    if (shot.missile) {
      this.glow(head, 9, WHITE, 0.9);
      // Exhaust trail along where it came from.
      if (Math.random() < 0.7)
        this.spawn(shot.pos, scale(shot.vel, -0.05), 0.35, 2, '255, 200, 130');
      return;
    }
    const tail = this.toScreen(sub(shot.pos, scale(shot.vel, mine ? 0.03 : 0.04)));
    c.lineCap = 'round';
    c.lineWidth = mine ? 2.4 : 3;
    c.strokeStyle = rgba(mine ? CYAN : WARM, 0.95);
    c.beginPath();
    c.moveTo(tail.x, tail.y);
    c.lineTo(head.x, head.y);
    c.stroke();
  }

  private drawRaider(r: Readonly<Raider>, view: CombatSnapshot): void {
    const c = this.ctx;
    const at = this.toScreen(r.pos);
    const size = r.radius * this.zoom;
    if (!this.onScreen(at, size * 2)) return;
    c.save();
    c.translate(at.x, at.y);
    c.rotate(r.heading);
    // A swept arrowhead with a notch at the back: reads as "fighter" from above.
    c.beginPath();
    c.moveTo(size * 1.25, 0);
    c.lineTo(-size * 0.9, -size * 0.85);
    c.lineTo(-size * 0.45, 0);
    c.lineTo(-size * 0.9, size * 0.85);
    c.closePath();
    c.fillStyle = rgba(WARM, 0.22);
    c.fill();
    c.lineWidth = 1.6;
    c.strokeStyle = rgba(WARM, 0.95);
    c.stroke();
    // Engine glow.
    c.fillStyle = rgba(WARM, 0.7 + 0.3 * Math.sin(view.time * 20 + r.phase));
    c.fillRect(-size * 0.75, -size * 0.12, size * 0.3, size * 0.24);
    c.restore();

    if (r.commander) {
      c.lineWidth = 1;
      c.strokeStyle = rgba(WARM, 0.55);
      c.beginPath();
      c.arc(at.x, at.y, size * 1.7, 0, Math.PI * 2);
      c.stroke();
    }
    if (r.hp < r.maxHp) {
      const w = size * 2;
      c.fillStyle = rgba(WARM, 0.25);
      c.fillRect(at.x - w / 2, at.y - size * 1.6, w, 3);
      c.fillStyle = rgba(WARM, 0.9);
      c.fillRect(at.x - w / 2, at.y - size * 1.6, (w * Math.max(0, r.hp)) / r.maxHp, 3);
    }
  }

  /** The ship from above: a plated freighter with side modules and an engine. */
  private drawShip(p: Readonly<PlayerShip>): void {
    const c = this.ctx;
    const at = this.toScreen(p.pos);
    const u = this.s.ship.radius * this.zoom;
    c.save();
    c.translate(at.x, at.y);
    c.rotate(p.heading);

    const speed = length(p.vel) / this.s.ship.maxSpeed;
    const plume = (p.boosting ? 1.6 : 0.5 + speed * 0.6) * u;
    const gradient = c.createLinearGradient(-u * 0.9, 0, -u * 0.9 - plume, 0);
    gradient.addColorStop(0, rgba(p.boosting ? WHITE : CYAN, 0.85));
    gradient.addColorStop(1, rgba(CYAN, 0));
    c.fillStyle = gradient;
    c.fillRect(-u * 0.9 - plume, -u * 0.22, plume, u * 0.44);

    c.lineWidth = 1.6;
    c.strokeStyle = rgba(CYAN, 1);
    c.fillStyle = rgba(CYAN, 0.18);
    // Hull: long body with a tapered nose.
    c.beginPath();
    c.moveTo(u * 1.25, 0);
    c.lineTo(u * 0.7, -u * 0.38);
    c.lineTo(-u * 0.9, -u * 0.38);
    c.lineTo(-u * 0.9, u * 0.38);
    c.lineTo(u * 0.7, u * 0.38);
    c.closePath();
    c.fill();
    c.stroke();
    // Side modules.
    for (const side of [-1, 1]) {
      c.beginPath();
      c.rect(-u * 0.6, side > 0 ? u * 0.38 : -u * 0.68, u * 0.9, u * 0.3);
      c.fill();
      c.stroke();
    }
    // Cockpit.
    c.fillStyle = rgba(WHITE, 0.85);
    c.fillRect(u * 0.55, -u * 0.12, u * 0.3, u * 0.24);
    c.restore();

    // Shield bubble: as strong as the shields are.
    if (p.shield > 0) {
      c.lineWidth = 1.5;
      c.strokeStyle = rgba(CYAN, 0.12 + (0.35 * p.shield) / this.s.defence.shieldMax);
      c.beginPath();
      c.arc(at.x, at.y, u * 1.65, 0, Math.PI * 2);
      c.stroke();
    }
  }

  // --- Targeting ---

  private drawLock(view: CombatSnapshot): void {
    const target = view.raiders.find((r) => r.id === view.lock.targetId && !r.dead);
    if (!target || view.lock.progress <= 0) return;
    const c = this.ctx;
    const at = this.toScreen(target.pos);
    const r = target.radius * this.zoom * 2.1;
    const locked = view.lock.progress >= 1;
    c.lineWidth = locked ? 2.2 : 1.4;
    c.strokeStyle = rgba(locked ? WHITE : CYAN, 0.95);
    // Corner brackets that close in as the lock builds.
    const g = r * (1.5 - 0.5 * view.lock.progress);
    const k = r * 0.45;
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
    c.beginPath();
    c.arc(at.x, at.y, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * view.lock.progress);
    c.stroke();
    if (locked) {
      c.fillStyle = rgba(WHITE, 0.95);
      c.font = '600 11px ui-monospace, Consolas, monospace';
      c.textAlign = 'center';
      c.fillText('LOCK', at.x, at.y - g - 6);
    }
  }

  /** Arrows on the screen edge pointing at raiders out of view. */
  private drawEdgeArrows(raiders: readonly Readonly<Raider>[]): void {
    const c = this.ctx;
    const cx = this.width / 2;
    const cy = this.height / 2;
    const margin = 26;
    for (const r of raiders) {
      if (r.dead) continue;
      const at = this.toScreen(r.pos);
      if (at.x > 0 && at.x < this.width && at.y > 0 && at.y < this.height) continue;
      const a = Math.atan2(at.y - cy, at.x - cx);
      // Where the ray from the centre leaves the screen (inset by the margin).
      const sx = (cx - margin) / Math.abs(Math.cos(a) || 1e-6);
      const sy = (cy - margin) / Math.abs(Math.sin(a) || 1e-6);
      const reach = Math.min(sx, sy);
      c.save();
      c.translate(cx + Math.cos(a) * reach, cy + Math.sin(a) * reach);
      c.rotate(a);
      c.fillStyle = rgba(WARM, r.commander ? 0.95 : 0.7);
      c.beginPath();
      c.moveTo(9, 0);
      c.lineTo(-5, -6);
      c.lineTo(-5, 6);
      c.closePath();
      c.fill();
      c.restore();
    }
  }

  private drawRadar(view: CombatSnapshot): void {
    const c = this.ctx;
    const size = Math.min(150, Math.min(this.width, this.height) * 0.2);
    const cx = 24 + size / 2;
    const cy = this.height - 24 - size / 2;
    const k = size / 2 / (this.s.arenaRadius + 120);
    c.fillStyle = rgba(CYAN, 0.06);
    c.strokeStyle = rgba(CYAN, 0.45);
    c.lineWidth = 1;
    c.beginPath();
    c.arc(cx, cy, size / 2, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    const dot = (p: Vec2, rgb: string, r: number) => {
      c.fillStyle = rgba(rgb, 0.95);
      c.beginPath();
      c.arc(cx + p.x * k, cy + p.y * k, r, 0, Math.PI * 2);
      c.fill();
    };
    for (const rock of view.rocks) dot(rock.pos, CYAN, 1.5);
    for (const r of view.raiders) if (!r.dead) dot(r.pos, WARM, r.commander ? 3.5 : 2.2);
    dot(view.player.pos, WHITE, 3);
  }

  private drawHitFlash(): void {
    const c = this.ctx;
    const a = (this.hitFlash / HIT_FLASH) * 0.35;
    const g = c.createRadialGradient(
      this.width / 2,
      this.height / 2,
      Math.min(this.width, this.height) * 0.35,
      this.width / 2,
      this.height / 2,
      Math.max(this.width, this.height) * 0.75,
    );
    g.addColorStop(0, 'rgba(255, 60, 60, 0)');
    g.addColorStop(1, `rgba(255, 60, 60, ${a.toFixed(3)})`);
    c.fillStyle = g;
    c.fillRect(0, 0, this.width, this.height);
  }

  // --- Particles ---

  private burst(at: Vec2, count: number, rgb: string, power: number): void {
    for (let i = 0; i < count; i++) {
      const dir = fromAngle(Math.random() * Math.PI * 2);
      const speed = (20 + Math.random() * 140) * power;
      this.spawn(
        at,
        scale(dir, speed),
        0.3 + Math.random() * 0.9,
        1 + Math.random() * 2 * power,
        rgb,
      );
    }
  }

  private spawn(pos: Vec2, vel: Vec2, life: number, size: number, rgb: string): void {
    if (this.particles.length >= MAX_PARTICLES) this.particles.shift();
    this.particles.push({ pos, vel, life, max: life, size, rgb });
  }

  private updateParticles(dt: number): void {
    for (const p of this.particles) {
      p.pos = add(p.pos, scale(p.vel, dt));
      p.life -= dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
  }

  private drawParticles(): void {
    const c = this.ctx;
    for (const p of this.particles) {
      const at = this.toScreen(p.pos);
      if (!this.onScreen(at, 10)) continue;
      c.fillStyle = rgba(p.rgb, Math.max(0, p.life / p.max));
      const s = p.size * Math.max(0.6, this.zoom);
      c.fillRect(at.x - s / 2, at.y - s / 2, s, s);
    }
  }

  private glow(at: Vec2, radius: number, rgb: string, alpha: number): void {
    const c = this.ctx;
    const g = c.createRadialGradient(at.x, at.y, 0, at.x, at.y, radius);
    g.addColorStop(0, rgba(rgb, alpha));
    g.addColorStop(1, rgba(rgb, 0));
    c.fillStyle = g;
    c.fillRect(at.x - radius, at.y - radius, radius * 2, radius * 2);
  }

  private onScreen(at: Vec2, pad: number): boolean {
    return at.x > -pad && at.x < this.width + pad && at.y > -pad && at.y < this.height + pad;
  }
}
