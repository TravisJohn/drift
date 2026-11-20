/**
 * VesperRenderer - the drone camera feed and the seed map, drawn on 2D
 * canvases from a VesperRun.
 *
 * The deck art (floor plates, fittings, stencils, wall outlines) is baked
 * once into an atlas at 2x. Each frame draws the atlas around the drone,
 * then masks it with light: the drone's lamp (a forward spot plus close
 * spill, stopped by walls) and any light seeds. Guard sight cones are the
 * same polygons the rules test against. The seed map shows only what
 * active seeds light.
 *
 * Only draws; never changes the run. The canvases' DOM sizing belongs to
 * the overlay, which calls `resize`.
 */
import { gameConfig } from '../config/gameConfig';
import type { DeckRoom } from '../content/vesperDeckPlan';
import { type GuardPose, type Point, type VesperDeck } from './vesperDeck';
import type { LightSeed, VesperRun } from './vesperRun';

type Ctx = CanvasRenderingContext2D;

/** Atlas pixels per deck unit. */
const TILE = 2;
/** Lamp beam texture size in pixels. */
const BEAM_SIZE = 448;
/** Rays around a light's wall-clipped boundary. */
const LAMP_RAYS = 256;
const SEED_RAYS = 192;
/** The seed map crops the empty space above the deck. */
const MAP_TOP = 152;
const MAP_WIDTH = 440;
/** Fixed seed so the baked floor wear is the same every visit. */
const ART_SEED = 2231;
/** Camera zoom limits (screen pixels per deck unit). */
const MIN_ZOOM = 2.2;
const MAX_ZOOM = 5;

/** Makes an offscreen canvas; injectable for tests. */
export type CanvasFactory = (width: number, height: number) => HTMLCanvasElement;

const defaultCanvas: CanvasFactory = (width, height) => {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  return c;
};

function context(canvas: HTMLCanvasElement): Ctx {
  const c = canvas.getContext('2d');
  if (!c) throw new Error('VesperRenderer: this browser cannot draw a 2D canvas');
  return c;
}

function polygon(c: Ctx, points: readonly Point[]): void {
  const [first, ...rest] = points;
  if (!first) return;
  c.beginPath();
  c.moveTo(first[0], first[1]);
  for (const [x, y] of rest) c.lineTo(x, y);
  c.closePath();
}

function circle(c: Ctx, x: number, y: number, r: number, fill: string): void {
  c.beginPath();
  c.arc(x, y, r, 0, 2 * Math.PI);
  c.fillStyle = fill;
  c.fill();
}

function line(c: Ctx, pts: readonly Point[], colour: string, width = 1): void {
  const [first, ...rest] = pts;
  if (!first) return;
  c.beginPath();
  c.moveTo(first[0], first[1]);
  for (const [x, y] of rest) c.lineTo(x, y);
  c.strokeStyle = colour;
  c.lineWidth = width;
  c.stroke();
}

/** Fill, then soften the inside edge without adding light outside the polygon. */
export function fillWithSoftEdge(
  c: Ctx,
  points: readonly Point[],
  fill: string | CanvasGradient,
  width: number,
): void {
  c.save();
  polygon(c, points);
  c.fillStyle = fill;
  c.fill();
  c.globalCompositeOperation = 'destination-out';
  c.globalAlpha = 0.78;
  c.strokeStyle = '#000';
  c.lineWidth = width;
  c.lineJoin = 'round';
  c.filter = 'blur(2px)';
  c.stroke();
  c.restore();
}

function smoothstep(low: number, high: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - low) / (high - low)));
  return t * t * (3 - 2 * t);
}

function roomShape(r: DeckRoom): Point[] {
  const l = r.x - r.width / 2;
  const t = r.y - r.height / 2;
  const right = r.x + r.width / 2;
  const b = r.y + r.height / 2;
  const k = 12;
  return [
    [l + k, t],
    [right - k, t],
    [right, t + k],
    [right, b - k],
    [right - k, b],
    [l + k, b],
    [l, b - k],
    [l, t + k],
  ];
}

export class VesperRenderer {
  private readonly ctx: Ctx;
  private readonly mapCtx: Ctx;
  private readonly atlas: HTMLCanvasElement;
  private readonly lightMask: HTMLCanvasElement;
  private readonly mask: Ctx;
  private readonly beam: HTMLCanvasElement;
  private readonly lampOcclusion: HTMLCanvasElement;
  private readonly occlusion: Ctx;
  private readonly guardLight: HTMLCanvasElement;
  private readonly guardCtx: Ctx;
  private readonly guardRadius: number;
  private readonly lampRange = gameConfig.salvage.lampRange;
  private readonly mapScale: number;
  private readonly seedBoundaries = new WeakMap<LightSeed, Point[]>();
  private lampAt: { x: number; y: number } | null = null;
  private mapLit = false;
  private width = 1;
  private height = 1;
  private ratio = 1;
  private zoom = MIN_ZOOM;

  constructor(
    private readonly deck: VesperDeck,
    private readonly view: HTMLCanvasElement,
    private readonly mapView: HTMLCanvasElement,
    makeCanvas: CanvasFactory = defaultCanvas,
  ) {
    this.ctx = context(view);
    this.mapCtx = context(mapView);
    this.atlas = makeCanvas(deck.width * TILE, deck.height * TILE);
    this.bakeAtlas(context(this.atlas));
    this.lightMask = makeCanvas(1, 1);
    this.mask = context(this.lightMask);
    this.beam = makeCanvas(BEAM_SIZE, BEAM_SIZE);
    this.bakeBeam(context(this.beam));
    const lampDiameter = 2 * this.lampRange;
    this.lampOcclusion = makeCanvas(lampDiameter, lampDiameter);
    this.occlusion = context(this.lampOcclusion);
    this.guardRadius = deck.sightReach + 1;
    this.guardLight = makeCanvas(2 * this.guardRadius, 2 * this.guardRadius);
    this.guardCtx = context(this.guardLight);

    mapView.width = MAP_WIDTH;
    this.mapScale = MAP_WIDTH / deck.width;
    mapView.height = Math.ceil((deck.height - MAP_TOP) * this.mapScale);
  }

  /** Match the feed canvas to its CSS size (pixels) and device ratio. */
  resize(width: number, height: number, ratio: number): void {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.ratio = ratio;
    this.view.width = this.lightMask.width = Math.round(this.width * ratio);
    this.view.height = this.lightMask.height = Math.round(this.height * ratio);
    this.zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, this.width / 234, this.height / 140));
  }

  /** Feed-canvas pixels to the drone, as an angle (for mouse aiming). */
  aimFrom(px: number, py: number): number | null {
    const dx = px - this.width / 2;
    const dy = py - this.height / 2;
    return Math.hypot(dx, dy) > 5 ? Math.atan2(dy, dx) : null;
  }

  draw(run: VesperRun): void {
    const { ctx, deck } = this;
    const p = run.player;
    const halfW = this.width / (2 * this.zoom);
    const halfH = this.height / (2 * this.zoom);
    const left = Math.max(0, p.x - halfW);
    const top = Math.max(0, p.y - halfH);
    const width = Math.min(deck.width, p.x + halfW) - left;
    const height = Math.min(deck.height, p.y + halfH) - top;

    ctx.setTransform(this.ratio, 0, 0, this.ratio, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.save();
    this.setCamera(ctx, p);
    if (width > 0 && height > 0) {
      ctx.drawImage(
        this.atlas,
        left * TILE,
        top * TILE,
        width * TILE,
        height * TILE,
        left,
        top,
        width,
        height,
      );
    }
    this.drawSockets(run);
    const alarm = run.mode === 'alarm';
    const r = this.guardRadius;
    for (const g of run.guards) {
      if (g.x + r < left || g.x - r > left + width || g.y + r < top || g.y - r > top + height) {
        continue;
      }
      this.drawGuardSight(g, alarm);
      this.drone(ctx, g.x, g.y, g.angle, true, alarm);
    }
    ctx.restore();

    // Combine lamp and seeds into one mask; each light stops at walls.
    this.updateLampOcclusion(p.x, p.y);
    const m = this.mask;
    const range = this.lampRange;
    m.setTransform(this.ratio, 0, 0, this.ratio, 0, 0);
    m.clearRect(0, 0, this.width, this.height);
    m.save();
    this.setCamera(m, p);
    m.save();
    m.translate(p.x, p.y);
    m.rotate(p.angle);
    m.drawImage(this.beam, -range, -range, 2 * range, 2 * range);
    m.restore();
    m.globalCompositeOperation = 'destination-in';
    m.drawImage(this.lampOcclusion, p.x - range, p.y - range);
    m.globalCompositeOperation = 'source-over';
    for (const seed of run.seeds) this.seedLight(m, seed, run.time);
    m.restore();

    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(this.lightMask, 0, 0, this.width, this.height);
    ctx.globalCompositeOperation = 'source-over';
    ctx.save();
    this.setCamera(ctx, p);
    for (const seed of run.seeds)
      this.seedMarker(ctx, seed, run.time, gameConfig.salvage.seedRadius);
    // The camera always sees its own drone, even against a wall.
    this.drone(ctx, p.x, p.y, p.angle);
    ctx.restore();
    ctx.globalCompositeOperation = 'destination-over';
    ctx.fillStyle = '#030708';
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.globalCompositeOperation = 'source-over';
  }

  /** The seed map: only floor that active seeds light. Cheap when nothing changed. */
  drawMap(run: VesperRun): void {
    const c = this.mapCtx;
    const seeds = run.seeds;
    if (seeds.length === 0 && !this.mapLit) return;
    c.clearRect(0, 0, this.mapView.width, this.mapView.height);
    this.mapLit = seeds.length > 0;
    if (!this.mapLit) return;
    const mapHeight = this.deck.height - MAP_TOP;
    c.save();
    c.scale(this.mapScale, this.mapScale);
    c.translate(0, -MAP_TOP);
    for (const seed of seeds) this.seedLight(c, seed, run.time);
    c.globalCompositeOperation = 'source-in';
    c.drawImage(
      this.atlas,
      0,
      MAP_TOP * TILE,
      this.deck.width * TILE,
      mapHeight * TILE,
      0,
      MAP_TOP,
      this.deck.width,
      mapHeight,
    );
    c.globalCompositeOperation = 'source-over';
    for (const seed of seeds) this.seedMarker(c, seed, run.time, 6);
    c.restore();
  }

  private setCamera(c: Ctx, p: { x: number; y: number }): void {
    c.translate(this.width / 2, this.height / 2);
    c.scale(this.zoom, this.zoom);
    c.translate(-p.x, -p.y);
  }

  private drawSockets(run: VesperRun): void {
    const c = this.ctx;
    const full = gameConfig.salvage.extractionSeconds;
    for (const cell of this.deck.cells) {
      const taken = run.taken.has(cell.id);
      c.save();
      c.translate(cell.x, cell.y);
      c.fillStyle = '#161e20';
      c.strokeStyle = taken ? '#526258' : '#c0a675';
      c.lineWidth = 0.8;
      c.fillRect(-4, -5, 8, 10);
      c.strokeRect(-4, -5, 8, 10);
      if (!taken) {
        // A lightning glyph: this socket still holds a cell.
        polygon(c, [
          [1, -3.8],
          [-2.2, 0.6],
          [-0.5, 0.6],
          [-1.2, 3.8],
          [2.4, -0.6],
          [0.7, -0.6],
        ]);
        c.fillStyle = '#f2d58a';
        c.fill();
      }
      if (run.tap?.id === cell.id) {
        c.beginPath();
        c.arc(0, 0, 7.8, -Math.PI / 2, -Math.PI / 2 + (2 * Math.PI * run.progress) / full);
        c.strokeStyle = '#ffe39d';
        c.lineWidth = 1.1;
        c.stroke();
      }
      c.restore();
    }
  }

  private drawGuardSight({ x, y, angle, cone }: GuardPose, alarm: boolean): void {
    const g = this.guardCtx;
    const r = this.guardRadius;
    const depth = gameConfig.salvage.sightDepth;
    g.clearRect(0, 0, this.guardLight.width, this.guardLight.height);
    g.save();
    g.translate(r - x, r - y);
    const glow = g.createLinearGradient(
      x,
      y,
      x + depth * Math.cos(angle),
      y + depth * Math.sin(angle),
    );
    glow.addColorStop(0, alarm ? 'rgba(255,85,63,.72)' : 'rgba(250,158,111,.52)');
    glow.addColorStop(1, alarm ? 'rgba(255,73,49,.38)' : 'rgba(245,143,99,.28)');
    fillWithSoftEdge(g, cone, glow, 6);
    g.restore();
    this.ctx.drawImage(this.guardLight, x - r, y - r);
  }

  private drone(c: Ctx, x: number, y: number, a: number, guard = false, alarm = false): void {
    c.save();
    c.translate(x, y);
    c.rotate(a);
    const accent = guard ? (alarm ? '#ff553d' : '#ffc19c') : '#a7ffe0';
    circle(c, 0, 1.2, 4.8, '#071113');
    for (const side of [-1, 1]) {
      c.fillStyle = '#17282b';
      c.fillRect(-2.7, side * 2.55 - 1, 4.8, 1.9);
      c.fillStyle = guard ? '#ad8b74' : '#697e77';
      c.fillRect(-2.2, side * 2.55 - 0.55, 3.8, 0.9);
      c.fillStyle = accent;
      c.fillRect(-3.4, side * 2.5 - 0.45, 1.1, 1);
    }
    polygon(c, [
      [4.4, 0],
      [1, -2.4],
      [-2.8, -1.9],
      [-3.4, 0],
      [-2.8, 1.9],
      [1, 2.4],
    ]);
    c.fillStyle = guard ? '#bd9d88' : '#c4d4c5';
    c.fill();
    c.strokeStyle = '#283935';
    c.lineWidth = 0.45;
    c.stroke();
    circle(c, 0.5, 0, 1.65, '#24302f');
    circle(c, 1.1, 0, 0.75, accent);
    c.fillStyle = accent;
    c.fillRect(3.2, -0.8, 0.9, 1.6);
    c.restore();
  }

  private lightBoundary(x: number, y: number, range: number, samples: number): Point[] {
    return Array.from({ length: samples }, (_, i) =>
      this.deck.ray(x, y, (2 * Math.PI * i) / samples, range),
    );
  }

  /** Recompute the lamp's wall shadow only when the drone has moved. */
  private updateLampOcclusion(x: number, y: number): void {
    if (this.lampAt?.x === x && this.lampAt.y === y) return;
    this.lampAt = { x, y };
    const range = this.lampRange;
    const o = this.occlusion;
    o.clearRect(0, 0, 2 * range, 2 * range);
    o.save();
    o.translate(range - x, range - y);
    fillWithSoftEdge(o, this.lightBoundary(x, y, range, LAMP_RAYS), '#fff', 7);
    o.restore();
  }

  /** Seeds fade over their last three seconds. */
  private seedBrightness(seed: LightSeed, time: number): number {
    return Math.max(0, Math.min(1, (seed.expires - time) / 3));
  }

  private seedLight(c: Ctx, seed: LightSeed, time: number): void {
    const { x, y } = seed;
    const range = gameConfig.salvage.seedRange;
    let boundary = this.seedBoundaries.get(seed);
    if (!boundary) {
      boundary = this.lightBoundary(x, y, range, SEED_RAYS);
      this.seedBoundaries.set(seed, boundary);
    }
    c.save();
    polygon(c, boundary);
    c.clip();
    const glow = c.createRadialGradient(x, y, 0, x, y, range);
    glow.addColorStop(0, '#fff');
    glow.addColorStop(0.6, '#ffffffe0');
    glow.addColorStop(1, '#fff0');
    c.globalAlpha = this.seedBrightness(seed, time);
    c.fillStyle = glow;
    c.fillRect(x - range, y - range, range * 2, range * 2);
    c.restore();
  }

  private seedMarker(c: Ctx, seed: LightSeed, time: number, r: number): void {
    c.save();
    c.globalAlpha = this.seedBrightness(seed, time);
    circle(c, seed.x, seed.y, r * 1.8, '#70f5ba40');
    circle(c, seed.x, seed.y, r, '#a7ffe0');
    c.restore();
  }

  private bakeBeam(c: Ctx): void {
    const lamp = c.createImageData(BEAM_SIZE, BEAM_SIZE);
    const half = BEAM_SIZE / 2;
    for (let y = 0; y < BEAM_SIZE; y++) {
      for (let x = 0; x < BEAM_SIZE; x++) {
        const dx = (x + 0.5 - half) / half;
        const dy = (y + 0.5 - half) / half;
        const distance = Math.hypot(dx, dy);
        const forward = smoothstep(0.28, 0.98, dx / distance);
        const spot = forward * (1 - smoothstep(0.22, 1, distance));
        const spill = 0.56 * (1 - smoothstep(0.13, 0.78, distance));
        const closeGlow = 0.58 * (1 - smoothstep(0.04, 0.29, distance));
        const opacity = 1 - (1 - spot) * (1 - spill) * (1 - closeGlow);
        lamp.data[(y * BEAM_SIZE + x) * 4 + 3] = Math.round(255 * opacity);
      }
    }
    c.putImageData(lamp, 0, 0);
  }

  /** Deck machining, conduits, room fittings and local wayfinding, baked once. */
  private bakeAtlas(art: Ctx): void {
    const deck = this.deck;
    let seed = ART_SEED;
    const rand = (): number => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    art.scale(TILE, TILE);
    art.lineJoin = 'round';
    art.lineCap = 'round';
    for (const h of deck.halls) {
      line(art, h.points, '#677e7d', 25);
      line(art, h.points, '#243336', 22);
      line(art, h.points, '#41524e', 0.7);
    }
    for (const [id, r] of Object.entries(deck.rooms)) {
      const l = r.x - r.width / 2;
      const t = r.y - r.height / 2;
      const w = r.width;
      const h = r.height;
      art.save();
      polygon(art, roomShape(r));
      art.clip();
      const g = art.createLinearGradient(l, t, l + w, t + h);
      g.addColorStop(0, '#334649');
      g.addColorStop(0.6, '#26383a');
      g.addColorStop(1, '#354342');
      art.fillStyle = g;
      art.fillRect(l, t, w, h);
      // Staggered floor plates with a rivet each.
      for (let yy = t + 3; yy < t + h; yy += 14) {
        for (let xx = l - 11; xx < l + w; xx += 23) {
          const off = (Math.round((yy - t - 3) / 14) % 2) * 11;
          art.fillStyle = rand() > 0.47 ? 'rgba(130,156,149,.055)' : 'rgba(0,0,0,.08)';
          art.fillRect(xx + off, yy, 22, 13);
          art.strokeStyle = '#152829';
          art.lineWidth = 0.5;
          art.strokeRect(xx + off, yy, 22, 13);
          art.fillStyle = '#667570';
          art.fillRect(xx + off + 1.4, yy + 1.3, 0.55, 0.55);
        }
      }
      // Scuffs.
      for (let j = 0; j < 95; j++) {
        const xx = l + rand() * w;
        const yy = t + rand() * h;
        line(
          art,
          [
            [xx, yy],
            [xx + rand() * 4, yy - rand() * 1.8],
          ],
          '#536361',
          0.24,
        );
      }
      // Flush equipment plates keep the traversable silhouette legible.
      for (let j = 0; j < 3; j++) {
        const xx = l + 17 + 9 * j;
        const yy = t + 8;
        art.fillStyle = '#192b2d';
        art.fillRect(xx, yy, 8, 11);
        art.strokeStyle = '#74857f';
        art.lineWidth = 0.5;
        art.strokeRect(xx, yy, 8, 11);
        if (id === 'hydro') {
          for (let k = 0; k < 3; k++) circle(art, xx + 3 + k, yy + 4 + k, 1.6, '#618c63');
        } else if (id === 'converter' || id === 'pump' || id === 'coolant') {
          circle(art, xx + 4, yy + 5, 3.2, '#74817c');
          circle(art, xx + 4, yy + 5, 2.3, '#263a38');
        } else {
          for (let k = 0; k < 4; k++) {
            line(
              art,
              [
                [xx + 2, yy + 2 + k * 2],
                [xx + 6, yy + 2 + k * 2],
              ],
              '#5c726f',
              0.5,
            );
          }
        }
      }
      art.font = 'bold 5px Consolas,monospace';
      art.fillStyle = '#82938a';
      art.fillText(r.name.toUpperCase(), l + 15, t + h - 12);
      for (let k = 0; k < 5; k++) {
        line(
          art,
          [
            [l + 14 + k * 2, t + h - 9],
            [l + 15 + k * 2, t + h - 11],
          ],
          '#ab9e70',
          0.8,
        );
      }
      art.restore();
    }
    // Wall outlines come from the same occupancy grid as movement and sight.
    const W = deck.width;
    const wall = (x: number, y: number): boolean => deck.map[y * W + x] === 1;
    art.fillStyle = '#9cae9d';
    for (let y = 1; y < deck.height - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        if (
          wall(x, y) &&
          (!wall(x - 1, y) || !wall(x + 1, y) || !wall(x, y - 1) || !wall(x, y + 1))
        ) {
          art.fillRect(x, y, 1, 1);
        }
      }
    }
    // Exit chevrons point down each corridor; visible only when lit.
    for (const h of deck.halls) {
      for (const reverse of [false, true]) {
        const id = reverse ? h.b : h.a;
        const p = reverse ? [...h.points].reverse() : h.points;
        const r = deck.rooms[id] as DeckRoom;
        const [nx, ny] = p[1] as Point;
        const a = Math.atan2(ny - r.y, nx - r.x);
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        const dist = Math.min(
          (r.width / 2 - 8) / Math.max(0.001, Math.abs(ca)),
          (r.height / 2 - 8) / Math.max(0.001, Math.abs(sa)),
        );
        art.save();
        art.translate(r.x + ca * dist, r.y + sa * dist);
        art.rotate(a);
        line(
          art,
          [
            [-2, -2],
            [1, 0],
            [-2, 2],
          ],
          '#b5c0aa',
          0.7,
        );
        art.restore();
      }
    }
  }
}
