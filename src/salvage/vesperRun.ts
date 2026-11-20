/**
 * VesperRun - the rules of one Vesper Station blackout run.
 *
 * Fly the drone from the western airlock, pull any two of the three energy
 * cells (each needs uninterrupted seconds beside its socket), and unload
 * them back at the airlock. If a guard's sight cone touches the drone, RED
 * ALERT plays out and the run resets to the airlock. Light seeds light the
 * deck for a while; a patroller that touches one puts it out.
 *
 * Pure TypeScript: `step(dt, input)` advances one fixed step and returns
 * what happened, so the overlay, sounds and AI can react without the rules
 * knowing about them.
 */
import { gameConfig } from '../config/gameConfig';
import { type CellSocket, type GuardPose, type VesperDeck, getVesperDeck } from './vesperDeck';

export type RunMode = 'ready' | 'play' | 'alarm' | 'won';

export interface RunInput {
  /** Movement direction (screen axes, any length; 0,0 = hold still). */
  readonly dx: number;
  readonly dy: number;
}

export interface LightSeed {
  readonly x: number;
  readonly y: number;
  /** Run time (seconds) when it burns out. */
  readonly expires: number;
}

export type RunEvent =
  | { readonly type: 'deployed'; readonly attempt: number }
  | { readonly type: 'extractionStarted'; readonly cellId: string }
  | { readonly type: 'extractionCancelled'; readonly cellId: string }
  | { readonly type: 'cellSecured'; readonly cellId: string; readonly name: string }
  | { readonly type: 'seedPlanted' }
  | { readonly type: 'spotted'; readonly guard: number }
  | { readonly type: 'reset'; readonly attempt: number }
  | { readonly type: 'won' };

export interface Drone {
  x: number;
  y: number;
  /** Lamp heading, radians (0 = east, screen y down). */
  angle: number;
}

/** Floating-point slack when comparing accumulated step times. */
const EPSILON = 1e-8;

export class VesperRun {
  mode: RunMode = 'ready';
  /** Runs deployed so far (1 for the first). */
  attempt = 0;
  readonly player: Drone = { x: 0, y: 0, angle: 0 };
  readonly taken = new Set<string>();
  /** The socket being tapped, if any. */
  tap: CellSocket | null = null;
  /** Seconds of the current tap. */
  progress = 0;
  /** Patrol clock (runs faster during RED ALERT). */
  clock = 0;
  /** Seconds of play this run (seeds expire against it). */
  time = 0;
  guards: GuardPose[] = [];
  seeds: LightSeed[] = [];
  /** 1-based guard that raised the alarm. */
  spottedBy = 0;
  /** Name of the last cell secured ('' before any). */
  lastCell = '';
  private alertLeft = 0;
  private readonly cfg = gameConfig.salvage;

  constructor(readonly deck: VesperDeck = getVesperDeck()) {
    this.resetState();
  }

  /** Is the run live (the clock moving)? */
  get active(): boolean {
    return this.mode === 'play' || this.mode === 'alarm';
  }

  /** An untaken socket within reach, if any. */
  get nearby(): CellSocket | undefined {
    const { x, y } = this.player;
    return this.deck.cells.find(
      (c) => Math.hypot(x - c.x, y - c.y) <= this.cfg.socketReach && !this.taken.has(c.id),
    );
  }

  get atDock(): boolean {
    return this.deck.roomAt(this.player.x, this.player.y) === this.deck.airlockId;
  }

  get cargoFull(): boolean {
    return this.taken.size >= this.cfg.cellsNeeded;
  }

  /** Can E unload right now? */
  get canUnload(): boolean {
    return this.mode === 'play' && this.cargoFull && this.atDock;
  }

  /** Start (or restart) a run from the airlock. */
  deploy(): RunEvent[] {
    this.resetState();
    this.mode = 'play';
    this.attempt++;
    return [{ type: 'deployed', attempt: this.attempt }];
  }

  /** E: unload at the airlock, or start tapping a socket in reach. */
  interact(): RunEvent[] {
    if (this.mode !== 'play') return [];
    if (this.canUnload) {
      this.mode = 'won';
      this.seeds = [];
      return [{ type: 'won' }];
    }
    if (this.cargoFull || this.tap) return [];
    const socket = this.nearby;
    if (!socket) return [];
    this.tap = socket;
    this.progress = 0;
    return [{ type: 'extractionStarted', cellId: socket.id }];
  }

  /** Q: drop a light seed where the drone is (false at the limit). */
  plantSeed(): RunEvent[] {
    if (this.mode !== 'play' || this.seeds.length >= this.cfg.seedLimit) return [];
    const { x, y } = this.player;
    this.seeds.push({ x, y, expires: this.time + this.cfg.seedSeconds });
    return [{ type: 'seedPlanted' }];
  }

  /** One fixed step. */
  step(dt: number, input: RunInput): RunEvent[] {
    if (!this.active) return [];
    const events: RunEvent[] = [];
    this.time += dt;
    this.clock += dt * (this.mode === 'alarm' ? this.cfg.alarmSpeed : 1);
    this.guards = this.deck.guardsAt(this.clock);
    this.burnSeeds();

    if (this.mode === 'alarm') {
      this.alertLeft -= dt;
      if (this.alertLeft <= 0) {
        this.resetState();
        this.mode = 'play';
        this.attempt++;
        events.push({ type: 'reset', attempt: this.attempt });
      }
      return events;
    }

    this.move(dt, input);

    // Capture outranks everything, even the last tick of an extraction.
    const guard = this.detect();
    if (guard >= 0) {
      this.mode = 'alarm';
      this.spottedBy = guard + 1;
      this.alertLeft = this.cfg.alarmSeconds;
      this.tap = null;
      this.progress = 0;
      events.push({ type: 'spotted', guard: guard + 1 });
      return events;
    }

    if (this.tap) {
      if (this.nearby !== this.tap) {
        events.push({ type: 'extractionCancelled', cellId: this.tap.id });
        this.tap = null;
        this.progress = 0;
        return events;
      }
      this.progress += dt;
      if (this.progress + EPSILON >= this.cfg.extractionSeconds) {
        this.taken.add(this.tap.id);
        this.lastCell = this.tap.name;
        events.push({ type: 'cellSecured', cellId: this.tap.id, name: this.tap.name });
        this.tap = null;
        this.progress = 0;
      }
    }
    return events;
  }

  /** Index of the guard whose sight touches the drone, or -1. */
  detect(): number {
    const { x, y } = this.player;
    return this.guards.findIndex(
      (g) =>
        Math.hypot(x - g.x, y - g.y) < this.cfg.sightCheckRange && this.deck.touches(g.cone, x, y),
    );
  }

  /** Distance to the nearest patroller (for the warning pulse). */
  nearestGuard(): number {
    const { x, y } = this.player;
    return Math.min(Infinity, ...this.guards.map((g) => Math.hypot(x - g.x, y - g.y)));
  }

  private move(dt: number, { dx, dy }: RunInput): void {
    const mag = Math.hypot(dx, dy);
    if (!mag) return;
    const p = this.player;
    const [ux, uy] = this.deck.steer(p.x, p.y, dx / mag, dy / mag);
    const sx = this.cfg.flightSpeed * dt * ux;
    const sy = this.cfg.flightSpeed * dt * uy;
    if (this.deck.fits(p.x + sx, p.y + sy)) {
      p.x += sx;
      p.y += sy;
    } else {
      // Slide along whichever wall allows it.
      if (this.deck.fits(p.x + sx, p.y)) p.x += sx;
      if (this.deck.fits(p.x, p.y + sy)) p.y += sy;
    }
  }

  /** Seeds burn out with time, and a patroller passing over one snuffs it. */
  private burnSeeds(): void {
    if (this.seeds.length === 0) return;
    const reach = this.cfg.droneRadius + this.cfg.seedRadius;
    this.seeds = this.seeds.filter(
      (seed) =>
        this.time + EPSILON < seed.expires &&
        !this.guards.some((g) => Math.hypot(g.x - seed.x, g.y - seed.y) <= reach),
    );
  }

  private resetState(): void {
    const { x, y } = this.cfg.start;
    this.player.x = x;
    this.player.y = y;
    this.player.angle = 0;
    this.taken.clear();
    this.tap = null;
    this.progress = 0;
    this.clock = 0;
    this.time = 0;
    this.guards = this.deck.guardsAt(0);
    this.seeds = [];
    this.alertLeft = 0;
    this.lastCell = '';
    this.spottedBy = 0;
  }
}
