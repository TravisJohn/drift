/**
 * VesperOverlay - the Vesper Station blackout's screen: the drone camera
 * feed, the seed map, the salvage rail (order, cells, status), pause and
 * results.
 *
 * Like the combat overlay it owns its keys and mouse while open, so
 * nothing leaks into the 3D drone. The game drives it: `update(dt)` once
 * per fixed step (the rules) and `render()` once per frame (the drawing).
 *
 * Controls: W A S D / arrows move; the mouse aims the lamp (keys aim it
 * when the mouse is off the feed); E extracts or unloads; Q plants a light
 * seed; M mutes; Esc pauses (and from the pause, Q returns to the ship).
 * Before deploying and after the cells are aboard, Enter deploys and Esc
 * returns to the ship. Hiding the page pauses; losing focus only lets go
 * of held keys.
 */
import { gameConfig } from '../config/gameConfig';
import { getVesperDeck } from '../salvage/vesperDeck';
import { type CanvasFactory, VesperRenderer, fillWithSoftEdge } from '../salvage/vesperRenderer';
import { type RunEvent, VesperRun } from '../salvage/vesperRun';
import type { VesperSoundState } from '../salvage/vesperSounds';
import { el } from './dashboard/panel';

/** recovered: enough cells unloaded. abandoned: the player went back early. */
export type SalvageOutcome = 'recovered' | 'abandoned';

export interface SalvageCallbacks {
  /** The player left the deck. The overlay has closed. */
  onEnd(outcome: SalvageOutcome, runs: number, cells: number): void;
}

/** Whatever plays the blackout's score and effects (salvage/vesperSounds.ts). */
export interface SalvageAudio {
  muted: boolean;
  resume(): void;
  update(state: VesperSoundState): void;
  cellSecured(): void;
  breach(): void;
  freezeShot(): void;
}

export interface VesperOverlayOptions {
  readonly audio: SalvageAudio;
  /** Offscreen canvases for the renderer (stubbed in tests). */
  readonly makeCanvas?: CanvasFactory;
}

/** Seconds between HUD, seed map and sound refreshes. */
const REFRESH_SECONDS = 0.05;
/** Highest canvas pixel ratio: integrated graphics is the target. */
const MAX_PIXEL_RATIO = 1.5;
const MOVE_KEYS = new Set([
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
]);
/** Keys the browser would otherwise act on (scrolling). */
const SWALLOW = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
const FEED_STATE = {
  ready: 'Standby',
  play: 'Live',
  escape: 'Containment breach',
  alarm: 'Intrusion detected',
  won: 'Docked',
};
const BEARINGS = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'];

interface Hud {
  feedState: HTMLSpanElement;
  seedCount: HTMLSpanElement;
  minimap: HTMLElement;
  mapTitle: HTMLSpanElement;
  room: HTMLElement;
  order: HTMLElement;
  orderDetail: HTMLElement;
  notice: HTMLDivElement;
  noticeTitle: HTMLElement;
  noticeDetail: HTMLSpanElement;
  noticeActions: HTMLDivElement;
  count: HTMLSpanElement;
  rows: HTMLLIElement[];
  message: HTMLDivElement;
  track: HTMLDivElement;
  trackFill: HTMLElement;
  deploy: HTMLButtonElement;
  action: HTMLButtonElement;
  attempt: HTMLSpanElement;
  pause: HTMLButtonElement;
  sound: HTMLButtonElement;
}

export class VesperOverlay {
  private root: HTMLDivElement | null = null;
  private feed: HTMLElement | null = null;
  private view: HTMLCanvasElement | null = null;
  private renderer: VesperRenderer | null = null;
  private run: VesperRun | null = null;
  private hud: Hud | null = null;
  private callbacks: SalvageCallbacks | null = null;
  private readonly keys = new Set<string>();
  private paused = false;
  private mouseAiming = false;
  /** How hard the drone flew last step, 0..1 (drives the thruster hum). */
  private throttle = 0;
  private refresh = 0;
  /** The notice now showing, so buttons are rebuilt only when it changes. */
  private noticeKey = '';
  private returnIn: number | null = null;

  constructor(private readonly options: VesperOverlayOptions) {}

  get isOpen(): boolean {
    return this.root !== null;
  }

  get isPaused(): boolean {
    return this.paused;
  }

  /** The run in progress, for the game's debug snapshot and tests. */
  get state(): VesperRun | null {
    return this.run;
  }

  open(callbacks: SalvageCallbacks, parent: HTMLElement = document.body): void {
    if (this.root) this.close();
    this.callbacks = callbacks;
    this.run = new VesperRun(getVesperDeck());
    this.paused = false;
    this.throttle = 0;
    this.noticeKey = '';

    this.root = el('div');
    this.root.id = 'vesper';
    this.view = el('canvas', 'view');
    this.view.setAttribute('aria-label', 'Dark service deck seen by drone light');
    const mapCanvas = el('canvas', 'deckmap');
    mapCanvas.setAttribute('aria-label', 'Station minimap');
    this.hud = this.buildHud();
    this.feed = this.buildFeed(this.view, mapCanvas, this.hud);
    this.root.append(this.buildHeader(), this.feed, this.buildRail(this.hud), this.buildControls());
    parent.appendChild(this.root);

    this.renderer = new VesperRenderer(
      this.run.deck,
      this.view,
      mapCanvas,
      this.options.makeCanvas,
    );

    document.addEventListener('keydown', this.onKeyDown);
    document.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    window.addEventListener('resize', this.onResize);
    this.view.addEventListener('pointermove', this.onPointerMove);
    this.view.addEventListener('pointerdown', this.onPointerDown);
    this.view.addEventListener('pointerleave', this.onPointerLeave);
    this.onResize();
    this.refreshHud();
    this.refreshMap();
  }

  /** Tear everything down without telling anyone (the caller knows). */
  close(): void {
    this.returnIn = null;
    document.removeEventListener('keydown', this.onKeyDown);
    document.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    window.removeEventListener('resize', this.onResize);
    this.view?.removeEventListener('pointermove', this.onPointerMove);
    this.view?.removeEventListener('pointerdown', this.onPointerDown);
    this.view?.removeEventListener('pointerleave', this.onPointerLeave);
    this.options.audio.update(silence());
    this.root?.remove();
    this.root = null;
    this.feed = null;
    this.view = null;
    this.renderer = null;
    this.run = null;
    this.hud = null;
    this.callbacks = null;
    this.keys.clear();
  }

  /** One fixed step of the run. */
  update(dt: number): void {
    const run = this.run;
    if (!run) return;
    const wasScanning = run.mapScanSeconds > 0;
    if (this.returnIn !== null) {
      this.returnIn -= dt;
      if (this.returnIn <= 0) {
        this.leave();
        return;
      }
    }
    if (!this.paused && run.active) {
      const held = (a: string, b: string): number => Number(this.keys.has(a) || this.keys.has(b));
      const dx = held('KeyD', 'ArrowRight') - held('KeyA', 'ArrowLeft');
      const dy = held('KeyS', 'ArrowDown') - held('KeyW', 'ArrowUp');
      if (!this.mouseAiming && (dx || dy) && run.canFly) {
        run.player.angle = Math.atan2(dy, dx);
      }
      const { x, y } = run.player;
      const events = run.step(dt, { dx, dy });
      const moved = Math.hypot(run.player.x - x, run.player.y - y);
      this.throttle = Math.min(1, moved / (gameConfig.salvage.flightSpeed * dt));
      this.handle(events);
    }
    this.refresh += dt;
    if (this.refresh >= REFRESH_SECONDS) {
      this.refresh = 0;
      this.refreshHud();
      this.refreshMap();
      this.options.audio.update(this.soundState());
    } else if (wasScanning !== run.mapScanSeconds > 0) {
      this.refreshMap();
    }
  }

  /** Draw a frame. */
  render(): void {
    if (this.run && this.renderer) this.renderer.draw(this.run);
  }

  // --- The run ---

  private deploy(): void {
    if (!this.run) return;
    this.returnIn = null;
    this.paused = false;
    this.keys.clear();
    this.mouseAiming = false;
    this.throttle = 0;
    this.options.audio.resume();
    this.handle(this.run.deploy());
    this.feed?.focus();
  }

  private interact(): void {
    if (!this.run || this.paused) return;
    this.handle(this.run.interact());
  }

  private plantSeed(): void {
    if (!this.run || this.paused) return;
    this.handle(this.run.plantSeed());
  }

  private handle(events: readonly RunEvent[]): void {
    for (const event of events) {
      if (event.type === 'cellSecured') this.options.audio.cellSecured();
      if (event.type === 'breach') this.options.audio.breach();
      if (event.type === 'laserFired') this.options.audio.freezeShot();
      if (event.type === 'won' && this.run && this.run.taken.size === this.run.deck.cells.length) {
        this.returnIn = gameConfig.salvage.resultsDelay;
      }
      if (event.type === 'reset') {
        // A fresh run: nothing held over from the capture.
        this.keys.clear();
        this.mouseAiming = false;
        this.throttle = 0;
      }
      if (event.type === 'seedPlanted') this.refreshMap();
    }
    if (events.length > 0) {
      this.refreshHud();
      this.options.audio.update(this.soundState());
    }
  }

  private togglePause(): void {
    if (!this.run?.active) return;
    this.paused = !this.paused;
    this.keys.clear();
    this.throttle = 0;
    if (!this.paused) {
      this.options.audio.resume();
      this.feed?.focus();
    }
    this.options.audio.update(this.soundState());
    this.refreshHud();
    this.refreshMap();
  }

  private toggleSound(): void {
    const audio = this.options.audio;
    audio.muted = !audio.muted;
    if (!audio.muted && this.run?.active) audio.resume();
    audio.update(this.soundState());
    this.refreshHud();
  }

  private leave(): void {
    const callbacks = this.callbacks;
    const outcome: SalvageOutcome = this.run?.mode === 'won' ? 'recovered' : 'abandoned';
    const runs = this.run?.attempt ?? 0;
    const cells = outcome === 'recovered' ? (this.run?.taken.size ?? 0) : 0;
    this.close();
    callbacks?.onEnd(outcome, runs, cells);
  }

  private soundState(): VesperSoundState {
    const run = this.run;
    if (!run || this.paused || !run.active) return silence();
    if (run.mode === 'alarm') return { active: true, speed: 0, charge: null, proximity: 0 };
    const range = gameConfig.salvage.warningRange;
    const distance = Math.min(range, run.nearestGuard());
    return {
      active: true,
      speed: this.throttle,
      charge: run.tap ? run.progress / gameConfig.salvage.extractionSeconds : null,
      proximity: 1 - distance / range,
    };
  }

  // --- HUD ---

  private refreshMap(): void {
    const run = this.run;
    const h = this.hud;
    if (!run || !h) return;
    const seconds = this.paused ? 0 : Math.ceil(run.mapScanSeconds);
    h.minimap.classList.toggle('scan', seconds > 0);
    setText(h.mapTitle, seconds ? `Deck scan · ${seconds}s` : 'Seed map');
    this.renderer?.drawMap(run, seconds > 0);
  }

  private refreshHud(): void {
    const run = this.run;
    const h = this.hud;
    if (!run || !h) return;
    const cfg = gameConfig.salvage;
    const { mode } = run;
    const playing = mode === 'play';
    const roomId = run.deck.roomAt(run.player.x, run.player.y);
    setText(h.room, (roomId && run.deck.rooms[roomId]?.name) || 'Service passage');
    setText(h.feedState, this.paused ? 'Paused' : FEED_STATE[mode]);
    setText(h.order, mode === 'escape' ? 'Reach the portal.' : 'Bring at least two cells home.');
    setText(
      h.orderDetail,
      mode === 'escape'
        ? 'Freeze pursuers for five seconds. Fly into the portal to return to DRIFT.'
        : 'Return two cells to the western airlock or collect all three to open a portal.',
    );
    setText(h.count, `${run.taken.size} / ${run.deck.cells.length}`);
    setText(h.seedCount, `${run.seeds.length} / ${cfg.seedLimit}`);
    setText(h.attempt, `Run ${String(Math.max(1, run.attempt)).padStart(2, '0')}`);
    run.deck.cells.forEach((c, i) => h.rows[i]?.classList.toggle('taken', run.taken.has(c.id)));

    h.deploy.hidden = mode !== 'ready';
    h.pause.hidden = !run.active;
    setText(h.pause, this.paused ? 'Resume [Esc]' : 'Pause [Esc]');
    const unload = run.canUnload;
    const nearby = run.nearby;
    h.action.hidden = !(playing && !this.paused && !run.tap && (unload || nearby));
    setText(h.action, unload ? 'Unload cells [E]' : 'Extract cell [E]');
    h.track.hidden = !run.tap;
    if (run.tap) h.trackFill.style.width = `${(run.progress / cfg.extractionSeconds) * 100}%`;
    setText(h.message, this.statusMessage());
    h.sound.setAttribute('aria-pressed', String(!this.options.audio.muted));
    this.refreshNotice();
  }

  private statusMessage(): string {
    const run = this.run;
    if (!run) return '';
    const full = gameConfig.salvage.extractionSeconds;
    switch (run.mode) {
      case 'ready':
        return 'Docked at the western airlock. Deploy when ready.';
      case 'alarm':
        return 'Security active. Returning to the airlock.';
      case 'won':
        return 'Cargo transferred to DRIFT.';
      case 'escape': {
        const escape = run.escape!;
        const { portal } = escape;
        const angle = Math.atan2(portal.y - run.player.y, portal.x - run.player.x);
        const bearing = BEARINGS[(Math.round(angle / (Math.PI / 4)) + 8) % 8];
        const room = run.deck.rooms[portal.room]?.name;
        const seconds = Math.max(0, Math.ceil(escape.shiftAt - run.time));
        const timing = seconds ? `shifts in ${seconds}s` : 'holding nearby';
        return `Portal · ${room} · ${bearing} · ${timing}`;
      }
      case 'play':
        if (run.tap) {
          return `Extracting · ${Math.min(full, run.progress).toFixed(1)} / ${full.toFixed(1)} s`;
        }
        if (run.canUnload) return 'Airlock secured. Unload the recovered cells.';
        if (run.nearby) return 'Socket in range. Stay beside it during extraction.';
        if (run.hasRequiredCells) return 'Return to the airlock or recover the last cell.';
        if (run.lastCell) return `${run.lastCell} cell secured. Find one more.`;
        return run.atDock
          ? 'Move east into Receiving.'
          : 'Look for a gold socket. Keep clear of guard sight.';
    }
  }

  /** The centred notice: pause, RED ALERT, or the win. */
  private refreshNotice(): void {
    const run = this.run;
    const h = this.hud;
    if (!run || !h) return;
    const breach =
      run.mode === 'escape' &&
      run.time - run.escape!.startedAt < gameConfig.salvage.escape.alarmBannerSeconds;
    const key = this.paused
      ? 'paused'
      : run.mode === 'alarm' || run.mode === 'won'
        ? run.mode
        : breach
          ? 'breach'
          : '';
    h.notice.hidden = key === '';
    h.notice.classList.toggle('alarm', key === 'alarm' || key === 'breach');
    h.notice.classList.toggle('breach', key === 'breach');
    if (key === 'alarm' && !run.spottedBy) {
      setText(h.noticeDetail, 'A pursuer caught you. Resetting to the airlock.');
    } else if (key === 'alarm') {
      setText(
        h.noticeDetail,
        `Guard ${String(run.spottedBy).padStart(2, '0')} spotted you. Resetting to the airlock…`,
      );
    }
    if (key === this.noticeKey) return;
    this.noticeKey = key;
    h.noticeActions.replaceChildren();
    const button = (label: string, keyName: string, action: () => void): HTMLButtonElement => {
      const b = el('button', '', label);
      b.type = 'button';
      b.prepend(el('span', 'key', keyName));
      b.addEventListener('click', action);
      h.noticeActions.appendChild(b);
      return b;
    };
    if (key === 'paused') {
      setText(h.noticeTitle, 'Feed paused');
      setText(h.noticeDetail, 'Resume to continue your run.');
      button('Resume', 'Esc', () => this.togglePause());
      button('Return to DRIFT', 'Q', () => this.leave());
    } else if (key === 'alarm') {
      setText(h.noticeTitle, 'RED ALERT');
    } else if (key === 'breach') {
      setText(h.noticeTitle, 'CONTAINMENT BREACH');
      setText(h.noticeDetail, 'Aliens loose. Freeze them and find the portal.');
    } else if (key === 'won') {
      setText(h.noticeTitle, 'Cells recovered');
      setText(h.noticeDetail, `${run.taken.size} energy cells are aboard DRIFT.`);
      button('Return to DRIFT', 'Enter', () => this.leave());
      if (this.returnIn === null) button('Deploy again', 'R', () => this.deploy());
    }
  }

  // --- Building the screen ---

  private buildHud(): Hud {
    const notice = el('div', 'notice');
    notice.hidden = true;
    const noticeTitle = el('strong');
    const noticeDetail = el('span');
    const noticeActions = el('div', 'actions');
    notice.append(noticeTitle, noticeDetail, noticeActions);
    const track = el('div', 'track');
    const trackFill = el('i');
    track.appendChild(trackFill);
    track.hidden = true;
    const deploy = el('button', 'primary', 'Deploy drone →');
    deploy.type = 'button';
    deploy.addEventListener('click', () => this.deploy());
    const action = el('button', 'action', 'Extract cell [E]');
    action.type = 'button';
    action.hidden = true;
    action.addEventListener('click', () => {
      this.interact();
      this.feed?.focus();
    });
    const pause = el('button', '', 'Pause [Esc]');
    pause.type = 'button';
    pause.hidden = true;
    pause.addEventListener('click', () => this.togglePause());
    const sound = el('button', 'sound', 'Sound [M]');
    sound.type = 'button';
    sound.title = 'Mute or unmute the score and effects';
    sound.addEventListener('click', () => this.toggleSound());
    const message = el('div', 'status');
    message.setAttribute('role', 'status');
    return {
      feedState: el('span', '', 'Standby'),
      seedCount: el('span', 'seeds', '0 / 0'),
      minimap: el('figure', 'minimap'),
      mapTitle: el('span', '', 'Seed map'),
      room: el('strong', '', 'Docking airlock'),
      order: el('h2'),
      orderDetail: el('p'),
      notice,
      noticeTitle,
      noticeDetail,
      noticeActions,
      count: el('span', 'counter', '0 / 2'),
      rows: getVesperDeck().cells.map((c) => el('li', '', c.name)),
      message,
      track,
      trackFill,
      deploy,
      action,
      attempt: el('span', '', 'Run 01'),
      pause,
      sound,
    };
  }

  private buildHeader(): HTMLElement {
    const header = el('div', 'header');
    const brand = el('div', 'brand', 'DRIFT');
    const mark = el('span', 'mark');
    mark.append(el('i'), el('i'), el('i'));
    brand.prepend(mark);
    const title = el('div', 'title');
    title.append(el('h1', '', 'Vesper Station'), el('span', '', 'Energy recovery'));
    header.append(brand, title, el('div', 'tag', 'Drone operations / Service deck'));
    return header;
  }

  private buildFeed(view: HTMLCanvasElement, map: HTMLCanvasElement, h: Hud): HTMLElement {
    const feed = el('section', 'feed');
    feed.tabIndex = 0;
    feed.setAttribute('aria-label', 'Drone camera');
    const top = el('div', 'hud');
    const live = el('span', 'live', 'Drone camera');
    live.prepend(el('i', 'lampdot'));
    top.append(live, h.feedState);
    const minimap = h.minimap;
    const caption = el('figcaption');
    caption.append(h.mapTitle, h.seedCount);
    minimap.append(caption, map);
    const location = el('div', 'location');
    location.append(el('div', 'label', 'Local signal'), h.room);
    feed.append(view, el('div', 'sight'), top, minimap, location, h.notice);
    return feed;
  }

  private buildRail(h: Hud): HTMLElement {
    const rail = el('aside', 'rail');
    const order = el('section');
    order.append(el('div', 'label mission', 'Salvage order'), h.order, h.orderDetail);
    const cells = el('section');
    const line = el('div', 'line');
    line.append(el('span', 'label', 'Energy cells'), h.count);
    const items = el('ul', 'items');
    items.append(...h.rows);
    cells.append(line, items);

    const key = el('section', 'guardkey');
    const icon = el('canvas');
    icon.width = 88;
    icon.height = 40;
    this.drawGuardIcon(icon);
    const keyLabel = el('div', 'label', 'Guard sight');
    keyLabel.prepend(icon);
    key.append(
      keyLabel,
      el(
        'p',
        '',
        "Touch a guard's sight cone and your run resets. Guards put out seeds they touch.",
      ),
    );

    const status = el('section');
    status.append(h.message, h.track, h.deploy, h.action);
    const foot = el('div', 'railfoot');
    foot.append(h.attempt, h.pause);
    rail.append(order, cells, key, status, foot);
    return rail;
  }

  private buildControls(): HTMLElement {
    const controls = el('div', 'controls');
    const hint = (k: string, what: string): HTMLSpanElement => {
      const span = el('span', '', what);
      span.prepend(el('b', '', k));
      return span;
    };
    controls.append(
      hint('W A S D / ↑ ↓ ← →', 'Move'),
      hint('Mouse', 'Aim lamp'),
      hint('E', 'Extract / unload'),
      hint('Space / click', 'Freeze laser during escape'),
      hint('Q', 'Plant light seed · 15 s'),
      hint('Esc', 'Pause'),
      this.hud?.sound ?? el('span'),
    );
    return controls;
  }

  private drawGuardIcon(icon: HTMLCanvasElement): void {
    const c = icon.getContext('2d');
    if (!c) return;
    const glow = c.createLinearGradient(28, 20, 74, 20);
    glow.addColorStop(0, '#c79171');
    glow.addColorStop(1, '#875144');
    fillWithSoftEdge(
      c,
      [
        [28, 20],
        [74, 6],
        [74, 34],
      ],
      glow,
      5,
    );
    c.fillStyle = '#ffd1ad';
    c.beginPath();
    c.moveTo(31, 20);
    c.lineTo(12, 12);
    c.lineTo(16, 20);
    c.lineTo(12, 28);
    c.fill();
  }

  // --- Input ---

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (SWALLOW.has(event.code)) event.preventDefault();
    const run = this.run;
    if (!run) return;
    if (MOVE_KEYS.has(event.code) && run.canFly && !this.paused) {
      this.keys.add(event.code);
    }
    if (event.repeat) return;
    const code = event.code;
    if (code === 'KeyM') {
      this.toggleSound();
      return;
    }
    if (run.mode === 'ready' || run.mode === 'won') {
      if (code === 'Enter' && run.mode === 'ready') this.deploy();
      else if (code === 'Enter' || code === 'Escape') this.leave();
      else if (code === 'KeyR' && run.mode === 'won' && this.returnIn === null) this.deploy();
      event.preventDefault();
      return;
    }
    if (code === 'Escape' || code === 'KeyP') {
      event.preventDefault();
      this.togglePause();
      return;
    }
    if (this.paused) {
      if (code === 'KeyQ') this.leave();
      else if (code === 'Enter') this.togglePause();
      return;
    }
    if (code === 'KeyE') this.interact();
    else if (code === 'KeyQ') this.plantSeed();
    else if (code === 'Space') this.handle(run.fireLaser());
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    this.keys.delete(event.code);
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (event.pointerType === 'touch' || !this.run?.canFly || this.paused) return;
    const rect = this.view?.getBoundingClientRect();
    const angle = this.renderer?.aimFrom(
      event.clientX - (rect?.left ?? 0),
      event.clientY - (rect?.top ?? 0),
    );
    if (angle !== null && angle !== undefined && this.run) {
      this.run.player.angle = angle;
      this.mouseAiming = true;
    }
  };

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0 || this.paused || this.run?.mode !== 'escape') return;
    this.onPointerMove(event);
    this.handle(this.run.fireLaser());
  };

  private readonly onPointerLeave = (): void => {
    this.mouseAiming = false;
  };

  /**
   * Losing focus only lets go of the keys (a key released elsewhere never
   * reaches us). It does not pause: focus can flicker away in an embedded
   * browser without the player doing anything (seen in combat playtests).
   */
  private readonly onBlur = (): void => {
    this.keys.clear();
  };

  /** The page actually going out of sight (minimised, another tab) pauses. */
  private readonly onVisibilityChange = (): void => {
    if (document.visibilityState !== 'hidden') return;
    if (!this.paused && this.run?.active) this.togglePause();
    this.keys.clear();
  };

  private readonly onResize = (): void => {
    if (!this.view || !this.renderer) return;
    const rect = this.view.getBoundingClientRect();
    const ratio = Math.min(MAX_PIXEL_RATIO, window.devicePixelRatio || 1);
    this.renderer.resize(rect.width, rect.height, ratio);
  };
}

function silence(): VesperSoundState {
  return { active: false, speed: 0, charge: null, proximity: 0 };
}

function setText(node: HTMLElement, text: string): void {
  if (node.textContent !== text) node.textContent = text;
}
