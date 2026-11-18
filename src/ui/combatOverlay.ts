/**
 * CombatOverlay - the tactical fight's screen: the hologram canvas, the
 * ship's readouts, the AI's lines, pause and results.
 *
 * Like the other overlays it owns its keys and mouse while open, so
 * nothing leaks into the drone. The game drives it: `update(dt)` once per
 * fixed step (the rules) and `render(now)` once per frame (the drawing).
 *
 * Controls: the mouse aims (the ship turns toward the pointer); W / ↑
 * thrust, S / ↓ brake, A D / ← → turn; left click or Space fires; right
 * click or R launches a missile once locked; Shift boosts; Esc or P
 * pauses (Q there retreats). Leaving the window pauses too.
 */
import { gameConfig } from '../config/gameConfig';
import { CombatRenderer } from '../combat/combatRenderer';
import { CombatSim } from '../combat/combatSim';
import {
  type CombatEvent,
  type CombatInput,
  type CombatSnapshot,
  type DifficultyId,
} from '../combat/combatTypes';
import { type Vec2, angleOf, sub, vec2 } from '../combat/vec2';
import { CombatVoice, momentFor } from '../content/combatLines';
import { el } from './dashboard/panel';

export type CombatOutcome = 'won' | 'lost' | 'retreated';

export interface CombatCallbacks {
  /** The fight is over and the player chose to leave. The overlay has closed. */
  onEnd(outcome: CombatOutcome, score: number): void;
}

/** Whatever plays the fight's sounds (combat/combatSounds.ts in the game). */
export interface CombatAudio {
  play(events: readonly CombatEvent[]): void;
}

export interface CombatOverlayOptions {
  readonly audio: CombatAudio;
  /** Random source for each new fight (seeded in tests). */
  readonly random?: () => number;
  /** Seconds the last moment of a fight stays on screen before the results. */
  readonly resultsDelay?: number;
}

/** Seconds an AI line stays up. */
const LINE_SECONDS = 4;
/** Seconds between readout refreshes (the DOM need not change every step). */
const READOUT_SECONDS = 0.1;
/** Highest canvas pixel ratio: integrated graphics is the target. */
const MAX_PIXEL_RATIO = 1.5;

const TURN_LEFT = ['KeyA', 'ArrowLeft'];
const TURN_RIGHT = ['KeyD', 'ArrowRight'];
const THRUST = ['KeyW', 'ArrowUp'];
const BRAKE = ['KeyS', 'ArrowDown'];
const BOOST = ['ShiftLeft', 'ShiftRight'];
/** Keys the browser would otherwise act on (scrolling, page down). */
const SWALLOW = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

interface Readouts {
  status: HTMLDivElement;
  shield: HTMLDivElement;
  hull: HTMLDivElement;
  heat: HTMLDivElement;
  heatLabel: HTMLSpanElement;
  boost: HTMLDivElement;
  missiles: HTMLDivElement;
  line: HTMLDivElement;
}

export class CombatOverlay {
  private root: HTMLDivElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private renderer: CombatRenderer | null = null;
  private sim: CombatSim | null = null;
  private callbacks: CombatCallbacks | null = null;
  private readouts: Readouts | null = null;
  private dialog: HTMLDivElement | null = null;
  private voice = new CombatVoice();
  private difficulty: DifficultyId = 'rookie';

  private readonly keys = new Set<string>();
  private mouseFire = false;
  private missileQueued = false;
  /** Mouse position (CSS px); null until it moves, or after keyboard turning. */
  private pointer: Vec2 | null = null;
  private paused = false;
  private overFor = 0;
  private resultsShown = false;
  private lineLeft = 0;
  private readoutTimer = 0;
  private pendingEvents: CombatEvent[] = [];
  private lastFrameAt: number | null = null;

  constructor(private readonly options: CombatOverlayOptions) {}

  get isOpen(): boolean {
    return this.root !== null;
  }

  get isPaused(): boolean {
    return this.paused;
  }

  /** The fight in progress, for the game's debug snapshot and tests. */
  get snapshot(): CombatSnapshot | null {
    return this.sim?.snapshot ?? null;
  }

  open(
    difficulty: DifficultyId,
    callbacks: CombatCallbacks,
    parent: HTMLElement = document.body,
  ): void {
    if (this.root) this.close();
    this.callbacks = callbacks;
    this.difficulty = difficulty;

    this.root = el('div');
    this.root.id = 'combat';
    this.canvas = el('canvas', 'scope');
    const context = this.canvas.getContext('2d');
    if (!context) {
      this.root = null;
      throw new Error('CombatOverlay: this browser cannot draw a 2D canvas');
    }
    this.renderer = new CombatRenderer(context);
    this.readouts = this.buildReadouts();
    this.root.append(this.canvas, this.readouts.status, this.buildMeters(), this.readouts.line);
    this.root.appendChild(
      el(
        'div',
        'hint',
        'Mouse aim · W thrust · S brake · A/D turn · Click/Space fire · R/right-click missile · Shift boost · Esc pause',
      ),
    );
    parent.appendChild(this.root);

    document.addEventListener('keydown', this.onKeyDown);
    document.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    window.addEventListener('resize', this.onResize);
    this.canvas.addEventListener('mousemove', this.onMouseMove);
    this.canvas.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    this.canvas.addEventListener('contextmenu', this.onContextMenu);
    this.onResize();
    this.startFight();
  }

  /** Tear everything down without telling anyone (the caller knows). */
  close(): void {
    document.removeEventListener('keydown', this.onKeyDown);
    document.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('mouseup', this.onMouseUp);
    this.canvas?.removeEventListener('mousemove', this.onMouseMove);
    this.canvas?.removeEventListener('mousedown', this.onMouseDown);
    this.canvas?.removeEventListener('contextmenu', this.onContextMenu);
    this.root?.remove();
    this.root = null;
    this.canvas = null;
    this.renderer = null;
    this.sim = null;
    this.callbacks = null;
    this.readouts = null;
    this.dialog = null;
    this.clearInput();
  }

  /** One fixed step of the fight. */
  update(dt: number): void {
    if (!this.sim || this.paused) return;
    const events = this.sim.step(dt, this.sampleInput());
    this.missileQueued = false;
    this.handle(events);

    if (this.sim.isOver && !this.resultsShown) {
      this.overFor += dt;
      if (this.overFor >= (this.options.resultsDelay ?? 1.6)) this.showResults();
    }
    this.lineLeft = Math.max(0, this.lineLeft - dt);
    if (this.lineLeft === 0 && this.readouts) this.readouts.line.classList.remove('show');
    this.readoutTimer -= dt;
    if (this.readoutTimer <= 0) {
      this.readoutTimer = READOUT_SECONDS;
      this.refreshReadouts();
    }
  }

  /** Draw a frame. `now` is a performance.now() timestamp. */
  render(now: number): void {
    if (!this.sim || !this.renderer) return;
    const dt = this.lastFrameAt === null ? 0 : Math.min(0.1, (now - this.lastFrameAt) / 1000);
    this.lastFrameAt = now;
    this.renderer.react(this.pendingEvents);
    this.pendingEvents = [];
    this.renderer.draw(this.sim.snapshot, this.paused ? 0 : dt);
  }

  // --- The fight ---

  private startFight(): void {
    this.sim = new CombatSim(this.difficulty, this.options.random ?? Math.random);
    this.voice = new CombatVoice();
    this.paused = false;
    this.overFor = 0;
    this.resultsShown = false;
    this.lastFrameAt = null;
    this.pendingEvents = [];
    this.hideDialog();
    this.clearInput();
    this.handle(this.sim.begin());
    this.refreshReadouts();
  }

  private handle(events: readonly CombatEvent[]): void {
    if (events.length === 0 || !this.sim) return;
    this.options.audio.play(events);
    this.pendingEvents.push(...events);
    const { kills, wave, score } = this.sim.snapshot;
    for (const event of events) {
      const moment = momentFor(event, kills);
      if (moment) this.say(this.voice.say(moment, { wave, score }));
    }
  }

  private say(text: string): void {
    if (!this.readouts) return;
    this.readouts.line.textContent = text;
    this.readouts.line.classList.add('show');
    this.lineLeft = LINE_SECONDS;
  }

  private sampleInput(): CombatInput {
    const held = (codes: readonly string[]) => codes.some((c) => this.keys.has(c));
    const turn = (held(TURN_RIGHT) ? 1 : 0) - (held(TURN_LEFT) ? 1 : 0);
    const thrust = (held(THRUST) ? 1 : 0) - (held(BRAKE) ? 1 : 0);
    return {
      thrust,
      turn,
      aimAngle: turn === 0 ? this.aimAngle() : null,
      fire: this.mouseFire || this.keys.has('Space'),
      boost: held(BOOST),
      missile: this.missileQueued,
    };
  }

  /** Heading from the ship (centre of the view) toward the pointer. */
  private aimAngle(): number | null {
    if (!this.pointer || !this.sim || !this.renderer) return null;
    const ship = this.renderer.toScreen(this.sim.snapshot.player.pos);
    const toward = sub(this.pointer, ship);
    if (Math.hypot(toward.x, toward.y) < 6) return null; // pointer on the ship itself
    return angleOf(toward);
  }

  // --- Pause and results ---

  private togglePause(): void {
    if (!this.sim || this.sim.isOver) return;
    this.paused = !this.paused;
    this.clearInput();
    if (this.paused) {
      this.showDialog('Paused', 'The raiders hold position while you think.', [
        ['Resume', 'Esc', () => this.togglePause()],
        ['Retreat to the deck', 'Q', () => this.leave('retreated')],
      ]);
    } else {
      this.hideDialog();
    }
  }

  private showResults(): void {
    if (!this.sim) return;
    this.resultsShown = true;
    const { phase, score, kills } = this.sim.snapshot;
    const won = phase === 'won';
    this.showDialog(
      won ? 'Sector clear' : 'Ship lost',
      `${kills} raiders destroyed · score ${score}`,
      [
        ['Fight again', 'Enter', () => this.startFight()],
        ['Back to the deck', 'Esc', () => this.leave(won ? 'won' : 'lost')],
      ],
    );
  }

  private showDialog(
    title: string,
    detail: string,
    actions: readonly (readonly [string, string, () => void])[],
  ): void {
    this.hideDialog();
    if (!this.root) return;
    this.dialog = el('div', 'dialog');
    this.dialog.append(el('h2', '', title), el('p', '', detail));
    const row = el('div', 'actions');
    for (const [label, key, action] of actions) {
      const button = el('button', '', label);
      button.type = 'button';
      button.prepend(el('span', 'key', key));
      button.addEventListener('click', action);
      row.appendChild(button);
    }
    this.dialog.appendChild(row);
    this.root.appendChild(this.dialog);
  }

  private hideDialog(): void {
    this.dialog?.remove();
    this.dialog = null;
  }

  private leave(outcome: CombatOutcome): void {
    const callbacks = this.callbacks;
    const score = this.sim?.snapshot.score ?? 0;
    this.close();
    callbacks?.onEnd(outcome, score);
  }

  // --- Readouts ---

  private buildReadouts(): Readouts {
    const bar = (cls: string) => el('div', `fill ${cls}`);
    return {
      status: el('div', 'status'),
      shield: bar('shield'),
      hull: bar('hull'),
      heat: bar('heat'),
      heatLabel: el('span', 'label', 'Heat'),
      boost: bar('boost'),
      missiles: el('div', 'missiles'),
      line: el('div', 'line'),
    };
  }

  private buildMeters(): HTMLDivElement {
    const r = this.readouts;
    if (!r) throw new Error('CombatOverlay: readouts must exist before meters');
    const meters = el('div', 'meters');
    const meter = (label: HTMLElement | string, fill: HTMLDivElement) => {
      const row = el('div', 'meter');
      const track = el('div', 'track');
      track.appendChild(fill);
      row.append(typeof label === 'string' ? el('span', 'label', label) : label, track);
      return row;
    };
    const missiles = el('div', 'meter');
    missiles.append(el('span', 'label', 'Missiles'), r.missiles);
    meters.append(
      meter('Shield', r.shield),
      meter('Hull', r.hull),
      meter(r.heatLabel, r.heat),
      meter('Boost', r.boost),
      missiles,
    );
    return meters;
  }

  private refreshReadouts(): void {
    if (!this.sim || !this.readouts) return;
    const view = this.sim.snapshot;
    const p = view.player;
    const r = this.readouts;
    const left = view.raiders.filter((x) => !x.dead).length;
    const level = this.difficulty === 'ace' ? 'Ace' : 'Rookie';
    r.status.textContent = `Tactical · ${level} · Wave ${view.wave}/${view.waveCount} · Raiders ${left} · Score ${view.score}`;
    r.shield.style.width = `${p.shield}%`;
    r.hull.style.width = `${p.hull}%`;
    r.hull.classList.toggle('low', p.hull < 30);
    r.heat.style.width = `${p.heat}%`;
    r.heat.classList.toggle('over', p.overheated);
    r.heatLabel.textContent = p.overheated ? 'Overheat' : 'Heat';
    r.boost.style.width = `${p.energy}%`;
    r.missiles.textContent =
      '▮'.repeat(p.missiles) +
      '▯'.repeat(Math.max(0, gameConfig.combat.missiles.count - p.missiles));
  }

  // --- Input ---

  private clearInput(): void {
    this.keys.clear();
    this.mouseFire = false;
    this.missileQueued = false;
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (SWALLOW.has(event.code)) event.preventDefault();
    if (event.repeat) return;
    if (this.resultsShown) {
      if (event.code === 'Enter') this.startFight();
      else if (event.code === 'Escape')
        this.leave(this.sim?.snapshot.phase === 'won' ? 'won' : 'lost');
      return;
    }
    if (event.code === 'Escape' || event.code === 'KeyP') {
      event.preventDefault();
      this.togglePause();
      return;
    }
    if (this.paused) {
      if (event.code === 'KeyQ') this.leave('retreated');
      else if (event.code === 'Enter') this.togglePause();
      return;
    }
    if (event.code === 'KeyR') this.missileQueued = true;
    if (TURN_LEFT.includes(event.code) || TURN_RIGHT.includes(event.code)) {
      // Keyboard steering takes over until the mouse moves again.
      this.pointer = null;
    }
    this.keys.add(event.code);
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    this.keys.delete(event.code);
  };

  private readonly onMouseMove = (event: MouseEvent): void => {
    const rect = this.canvas?.getBoundingClientRect();
    this.pointer = vec2(event.clientX - (rect?.left ?? 0), event.clientY - (rect?.top ?? 0));
  };

  private readonly onMouseDown = (event: MouseEvent): void => {
    if (this.paused || this.resultsShown) return;
    if (event.button === 0) this.mouseFire = true;
    else if (event.button === 2) this.missileQueued = true;
  };

  private readonly onMouseUp = (event: MouseEvent): void => {
    if (event.button === 0) this.mouseFire = false;
  };

  /** Right click launches missiles; it must not open the browser's menu. */
  private readonly onContextMenu = (event: MouseEvent): void => {
    event.preventDefault();
  };

  /** Leaving the window pauses: keys released elsewhere never reach us. */
  private readonly onBlur = (): void => {
    if (!this.paused && this.sim && !this.sim.isOver) this.togglePause();
    this.clearInput();
  };

  private readonly onResize = (): void => {
    if (!this.canvas || !this.renderer) return;
    const ratio = Math.min(MAX_PIXEL_RATIO, window.devicePixelRatio || 1);
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.canvas.width = Math.round(width * ratio);
    this.canvas.height = Math.round(height * ratio);
    this.renderer.resize(width, height, ratio);
  };
}
