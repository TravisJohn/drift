/**
 * panelTextures - procedural hull-panel surfaces, so walls, floors and
 * ceilings read as built instead of as flat colour.
 *
 * The pixels come from a pure generator (seeded, no canvas, testable):
 * a height field turned into two maps - colour, and normal (edges catch
 * light). Every map tiles seamlessly.
 *
 * Floors and ceilings are a grid of plates with seams and rivets. Walls
 * are a designed bulkhead (see sampleWall): a dark kick band with vents,
 * tall main panels with a service strip between them, and a header band,
 * split at the heights of the window sill and head so the panelling and
 * the windows agree.
 *
 * The room light is baked per vertex and does not react to the normal
 * map, so the wall's colour map also carries its own shading: edges that
 * face up are lightened and edges that face down darkened, as the ceiling
 * lights would do.
 *
 * There is deliberately no roughness/metalness map: on integrated
 * graphics each extra texture read per pixel is measurable (about 1 ms a
 * frame each), and varying roughness along the seams was barely visible.
 * PANEL_FINISH gives each surface one roughness and metalness instead.
 */
import * as THREE from 'three';

export type PanelKind = 'wall' | 'floor' | 'ceiling';

/**
 * Where the wall's three bands meet, as fractions of the tile's height
 * (the tile runs floor to ceiling once).
 */
export interface WallBands {
  /** Top of the kick band: the window sill. */
  readonly sill: number;
  /** Bottom of the header band: the window head. */
  readonly head: number;
}

export const DEFAULT_WALL_BANDS: WallBands = { sill: 0.28, head: 0.75 };

interface PanelStyle {
  /** Plates across and up one tile. */
  readonly columns: number;
  readonly rows: number;
  /** Seam half-width, as a fraction of the tile. */
  readonly seam: number;
  /** A second, inner groove inset from each plate edge (0 = none). */
  readonly inset: number;
  /** Brightness difference between neighbouring plates. */
  readonly plateVariation: number;
  /** Noise stretch along u and v: unequal values read as brushed metal. */
  readonly grain: readonly [number, number];
  readonly rivets: boolean;
  readonly roughness: number;
  readonly metalness: number;
}

const STYLES: Record<PanelKind, PanelStyle> = {
  wall: {
    columns: 2,
    rows: 2,
    seam: 0.008,
    inset: 0,
    plateVariation: 0.1,
    grain: [3, 40],
    rivets: true,
    roughness: 0.58,
    metalness: 0.3,
  },
  floor: {
    columns: 2,
    rows: 2,
    seam: 0.01,
    inset: 0.07,
    plateVariation: 0.1,
    grain: [22, 22],
    rivets: true,
    roughness: 0.66,
    metalness: 0.25,
  },
  ceiling: {
    columns: 2,
    rows: 2,
    seam: 0.009,
    inset: 0.05,
    plateVariation: 0.07,
    grain: [14, 14],
    rivets: false,
    roughness: 0.8,
    metalness: 0.15,
  },
};

/** Raw RGBA bytes for the two maps of one panel surface. */
export interface PanelTextureData {
  readonly size: number;
  /**
   * sRGB surface colour. Floors and ceilings are grey and take their hue
   * from the material's colour; the wall is already painted.
   */
  readonly color: Uint8Array;
  /** Tangent-space normal map. */
  readonly normal: Uint8Array;
}

/** Integer hash -> 0..1. */
function hash2(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 362437) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * Value noise that repeats every `periodX` by `periodY` cells, so the
 * texture tiles.
 */
function tileNoise(x: number, y: number, periodX: number, seed: number, periodY = periodX): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  // The four surrounding cells, wrapped into the period.
  const xa = ((x0 % periodX) + periodX) % periodX;
  const xb = (xa + 1) % periodX;
  const ya = ((y0 % periodY) + periodY) % periodY;
  const yb = (ya + 1) % periodY;
  const a = hash2(xa, ya, seed);
  const b = hash2(xb, ya, seed);
  const c = hash2(xa, yb, seed);
  const d = hash2(xb, yb, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

const smooth = (edge0: number, edge1: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

type Rgb = readonly [number, number, number];

/**
 * One sample of the surface at tile coordinates u, v in 0..1. The
 * samplers fill in a Sample they are handed instead of returning a new
 * one: a wall texture is a million samples, and a million short-lived
 * objects made startup measurably slower.
 */
interface Sample {
  /** 0 = bottom of a seam, 1 = plate surface (rivets rise above 1). */
  height: number;
  /** Surface colour before lighting, each channel 0..1. */
  r: number;
  g: number;
  b: number;
}

function samplePlates(u: number, v: number, style: PanelStyle, seed: number, out: Sample): void {
  const pu = u * style.columns;
  const pv = v * style.rows;
  const cellU = Math.floor(pu) % style.columns;
  const cellV = Math.floor(pv) % style.rows;
  const fu = pu - Math.floor(pu);
  const fv = pv - Math.floor(pv);
  // Distance to the nearest plate edge, back in tile units.
  const edgeU = Math.min(fu, 1 - fu) / style.columns;
  const edgeV = Math.min(fv, 1 - fv) / style.rows;
  const edge = Math.min(edgeU, edgeV);

  let surface = smooth(style.seam * 0.4, style.seam * 1.6, edge);
  if (style.inset > 0) {
    // A shallow second groove framing each plate.
    const groove = 1 - smooth(0, style.seam, Math.abs(edge - style.inset));
    surface -= groove * 0.22;
  }
  let height = surface;
  if (style.rivets) {
    const offset = style.seam * 5;
    const du = Math.min(edgeU, Math.abs(edgeU - offset));
    const dv = Math.min(edgeV, Math.abs(edgeV - offset));
    const corner = Math.sqrt((edgeU - offset) ** 2 + (edgeV - offset) ** 2);
    // Only near a corner, never along the whole edge.
    if (du < style.seam * 2 && dv < style.seam * 2) {
      height += (1 - smooth(0, style.seam * 1.4, corner)) * 0.6;
    }
  }

  const plate = hash2(cellU, cellV, seed + 17);
  const grainValue = tileNoise(
    u * style.grain[0],
    v * style.grain[1],
    style.grain[0],
    seed + 3,
    style.grain[1],
  );
  // Slow, large blotches: wear that is not the same on every plate.
  const wear = tileNoise(u * 4, v * 4, 4, seed + 9);
  const brightness =
    (1 - style.plateVariation + style.plateVariation * 2 * plate) *
    (0.9 + 0.12 * grainValue) *
    (0.9 + 0.14 * wear) *
    (0.62 + 0.38 * Math.max(0, surface));
  out.height = height;
  out.r = brightness;
  out.g = brightness;
  out.b = brightness;
}

// --- The wall: a designed bulkhead ----------------------------------------

/** One centimetre, as a fraction of the wall tile (drawn for 3.2 m a side). */
const CM = 1 / 320;
/** Half the gap between neighbouring panels, and between bands. */
const SEAM = 0.5 * CM;
const BELT = 1.3 * CM;
/** Width of the slope from a seam up to a panel's face. */
const BEVEL = 2 * CM;

/** Paint colours of the wall's parts. */
const WALL_PAINT = {
  panel: [0.41, 0.448, 0.505],
  service: [0.29, 0.32, 0.37],
  kick: [0.21, 0.235, 0.275],
  header: [0.33, 0.365, 0.415],
  mark: [0.86, 0.47, 0.15],
} as const satisfies Record<string, Rgb>;

type WallPart = 'panel' | 'service' | 'vent' | 'plate' | 'header';

/** Column edges across the tile, and what each column is, per band. */
const WALL_COLUMNS = {
  kick: { edges: [0, 0.25, 0.5, 0.75, 1], parts: ['vent', 'plate', 'vent', 'plate'] },
  main: { edges: [0, 0.375, 0.5, 0.875, 1], parts: ['panel', 'service', 'panel', 'service'] },
  header: { edges: [0, 0.5, 1], parts: ['header', 'header'] },
} as const satisfies Record<string, { edges: readonly number[]; parts: readonly WallPart[] }>;

/** Cut-corner size of each part. */
const CHAMFER: Record<WallPart, number> = {
  panel: 5 * CM,
  service: 2 * CM,
  vent: 2.5 * CM,
  plate: 2.5 * CM,
  header: 3 * CM,
};

/**
 * Signed distance to a box with cut corners, centred on the origin:
 * negative inside, zero on the edge.
 */
function boxDistance(x: number, y: number, halfX: number, halfY: number, chamfer: number): number {
  const dx = Math.abs(x) - halfX;
  const dy = Math.abs(y) - halfY;
  return Math.max(dx, dy, (dx + dy + chamfer) * Math.SQRT1_2);
}

/** 1 inside a cut-corner box, falling to 0 across `edge` at its border. */
function inBox(
  x: number,
  y: number,
  halfX: number,
  halfY: number,
  chamfer: number,
  edge = 0.6 * CM,
): number {
  return smooth(0, edge, -boxDistance(x, y, halfX, halfY, chamfer));
}

/** 1 on a round dot of `radius`, 0 outside it. */
function dot(x: number, y: number, radius: number): number {
  const squared = x * x + y * y;
  if (squared >= radius * radius) return 0;
  return 1 - smooth(radius * 0.6, radius, Math.sqrt(squared));
}

/** Where the service strip's two hatches sit, as fractions of its half-height. */
const HATCH_CENTRES = [0.5, -0.5] as const;
/** Bolt positions in a hatch, from its centre. */
const HATCH_BOLTS_X = [-9.5 * CM, 9.5 * CM] as const;
const HATCH_BOLTS_Y = [-13.5 * CM, 13.5 * CM] as const;

function sampleWall(u: number, v: number, bands: WallBands, seed: number, out: Sample): void {
  // --- Which band, and which panel of it ---
  const bandName = v < bands.sill ? 'kick' : v < bands.head ? 'main' : 'header';
  const v0 = bandName === 'kick' ? 0 : bandName === 'main' ? bands.sill : bands.head;
  const v1 = bandName === 'kick' ? bands.sill : bandName === 'main' ? bands.head : 1;
  const band = WALL_COLUMNS[bandName];
  // The header's joints sit a quarter-tile off the panels below it.
  const across = bandName === 'header' ? (u + 0.25) % 1 : u;
  let column = 0;
  while (column < band.parts.length - 1 && across >= (band.edges[column + 1] ?? 1)) column++;
  const u0 = band.edges[column] ?? 0;
  const u1 = band.edges[column + 1] ?? 1;
  const part: WallPart = band.parts[column] ?? 'panel';

  // Position inside the panel, from its centre.
  const x = across - (u0 + u1) / 2;
  const y = v - (v0 + v1) / 2;
  const halfX = (u1 - u0) / 2 - SEAM;
  const halfY = (v1 - v0) / 2 - BELT;
  const inside = -boxDistance(x, y, halfX, halfY, CHAMFER[part]);

  let height = smooth(0, BEVEL, inside);
  let tone = 1;
  let paint: Rgb = WALL_PAINT.panel;

  switch (part) {
    case 'panel': {
      // A fine groove framing the panel, and a recessed grip near its foot.
      const groove = 1 - smooth(0.2 * CM, 0.7 * CM, Math.abs(inside - 7 * CM));
      height -= groove * 0.3;
      const grip = inBox(x, y + halfY - 16 * CM, 8 * CM, 1.4 * CM, 1 * CM);
      height -= grip * 0.5;
      tone *= 1 - grip * 0.45;
      break;
    }
    case 'service': {
      paint = WALL_PAINT.service;
      // Two access hatches with a bolt in each corner, a slotted vent
      // between them, and a painted tag above the upper hatch.
      for (const centre of HATCH_CENTRES) {
        const hy = y - centre * halfY;
        const hatch = inBox(x, hy, 12 * CM, 16 * CM, 2 * CM);
        height -= hatch * 0.35;
        tone *= 1 - hatch * 0.14;
        for (const bx of HATCH_BOLTS_X) {
          for (const by of HATCH_BOLTS_Y) {
            height += dot(x - bx, hy - by, 0.9 * CM) * 0.5;
          }
        }
      }
      for (let slot = -2; slot <= 2; slot++) {
        const cut = inBox(x, y - slot * 3.6 * CM, 9 * CM, 0.9 * CM, 0.6 * CM, 0.4 * CM);
        height -= cut * 0.6;
        tone *= 1 - cut * 0.6;
      }
      if (inBox(x + 6 * CM, y - halfY + 9 * CM, 4.5 * CM, 1.1 * CM, 0, 0.2 * CM) > 0.5) {
        paint = WALL_PAINT.mark;
      }
      break;
    }
    case 'vent': {
      paint = WALL_PAINT.kick;
      // Louvres: slats that each rise from shadow to a lit top edge. Set
      // high in the panel, clear of the baseboard that covers its foot.
      const louvre = inBox(x, y - 6 * CM, halfX - 9 * CM, halfY - 15 * CM, 2 * CM);
      const slat = (((v / (4 * CM)) % 1) + 1) % 1;
      height -= louvre * (0.75 - 0.5 * slat);
      tone *= 1 - louvre * (0.6 - 0.75 * slat * slat);
      break;
    }
    case 'plate': {
      paint = WALL_PAINT.kick;
      // A bolt near each corner; the lower pair sits above the baseboard.
      const boltX = Math.abs(x) - (halfX - 6 * CM);
      height += dot(boltX, y - (halfY - 6 * CM), 1.1 * CM) * 0.5;
      height += dot(boltX, y + (halfY - 24 * CM), 1.1 * CM) * 0.5;
      break;
    }
    case 'header': {
      paint = WALL_PAINT.header;
      // An air grille: a long recess crossed by upright fins, set below
      // the cove that covers the top of the band.
      const grille = inBox(x, y + 9 * CM, 36 * CM, 3.4 * CM, 1.2 * CM);
      const fin = Math.abs(((((x / (2.4 * CM)) % 1) + 1) % 1) - 0.5) * 2;
      height -= grille * (0.3 + 0.45 * fin);
      tone *= 1 - grille * (0.25 + 0.5 * fin);
      break;
    }
  }

  // Worn metal showing at the panel's edge.
  tone += (1 - smooth(0.2 * CM, 0.8 * CM, Math.abs(inside - BEVEL))) * 0.07;
  // A slightly different shade per panel, brushed grain, slow blotches.
  tone *= 0.96 + 0.08 * hash2(column, bandName.length, seed + 17);
  tone *= 0.98 + 0.035 * tileNoise(u * 6, v * 96, 6, seed + 3, 96);
  tone *= 0.93 + 0.1 * tileNoise(u * 5, v * 5, 5, seed + 9);
  // Seams and recesses sit in their own shadow.
  tone *= 0.38 + 0.62 * Math.min(1, Math.max(0, height));

  out.height = height;
  out.r = paint[0] * tone;
  out.g = paint[1] * tone;
  out.b = paint[2] * tone;
}

/**
 * How strongly the wall's colour map is shaded by its own relief, per unit
 * of slope, and the most any one pixel is changed.
 */
const TOP_LIGHT = 0.0022;
const TOP_LIGHT_LIMIT = 0.32;

/**
 * Generate the two maps for one surface kind. Pure and deterministic.
 * `bands` places the wall's belt lines; other surfaces ignore it.
 */
export function generatePanelTextureData(
  kind: PanelKind,
  size: number,
  seed: number,
  bands: WallBands = DEFAULT_WALL_BANDS,
): PanelTextureData {
  if (!Number.isInteger(size) || size < 8) {
    throw new Error('generatePanelTextureData: size must be an integer of at least 8');
  }
  if (!(bands.sill > 0.05 && bands.head > bands.sill + 0.1 && bands.head < 0.95)) {
    throw new Error('generatePanelTextureData: wall bands need 0 < sill < head < 1, well apart');
  }
  const style = STYLES[kind];
  const heights = new Float32Array(size * size);
  const tones = new Float32Array(size * size * 3);
  const color = new Uint8Array(size * size * 4);
  const normal = new Uint8Array(size * size * 4);
  const byte = (value: number): number => Math.round(Math.min(1, Math.max(0, value)) * 255);

  const s: Sample = { height: 0, r: 0, g: 0, b: 0 };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size;
      const v = (y + 0.5) / size;
      if (kind === 'wall') sampleWall(u, v, bands, seed, s);
      else samplePlates(u, v, style, seed, s);
      const i = y * size + x;
      heights[i] = s.height;
      tones[i * 3] = s.r;
      tones[i * 3 + 1] = s.g;
      tones[i * 3 + 2] = s.b;
    }
  }

  // Normals from the height field's slope, wrapping at the edges.
  const STRENGTH = size / 90;
  const at = (x: number, y: number): number =>
    heights[((y + size) % size) * size + ((x + size) % size)] ?? 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const rise = at(x, y + 1) - at(x, y - 1);
      const dx = (at(x + 1, y) - at(x - 1, y)) * STRENGTH;
      const dy = rise * STRENGTH;
      const length = Math.sqrt(dx * dx + dy * dy + 1);
      const i = y * size + x;
      normal[i * 4] = byte(0.5 - (dx / length) * 0.5);
      normal[i * 4 + 1] = byte(0.5 - (dy / length) * 0.5);
      normal[i * 4 + 2] = byte(0.5 + (1 / length) * 0.5);
      normal[i * 4 + 3] = 255;

      // Walls only: light from above. Relief that climbs as you go up the
      // wall faces the floor and is darkened; relief that falls faces the
      // ceiling lights and is lightened.
      const slope = (rise * size) / 2;
      const lit =
        kind === 'wall'
          ? 1 - Math.min(TOP_LIGHT_LIMIT, Math.max(-TOP_LIGHT_LIMIT, slope * TOP_LIGHT))
          : 1;
      color[i * 4] = byte((tones[i * 3] ?? 0) * lit);
      color[i * 4 + 1] = byte((tones[i * 3 + 1] ?? 0) * lit);
      color[i * 4 + 2] = byte((tones[i * 3 + 2] ?? 0) * lit);
      color[i * 4 + 3] = 255;
    }
  }
  return { size, color, normal };
}

/** How shiny each surface is (constant across it; see the header note). */
export const PANEL_FINISH: Record<
  PanelKind,
  { readonly roughness: number; readonly metalness: number }
> = {
  wall: { roughness: STYLES.wall.roughness, metalness: STYLES.wall.metalness },
  floor: { roughness: STYLES.floor.roughness, metalness: STYLES.floor.metalness },
  ceiling: { roughness: STYLES.ceiling.roughness, metalness: STYLES.ceiling.metalness },
};

/** The GPU textures for one surface kind. */
export interface PanelTextures {
  readonly map: THREE.DataTexture;
  readonly normalMap: THREE.DataTexture;
  dispose(): void;
}

function toTexture(bytes: Uint8Array, size: number, srgb: boolean): THREE.DataTexture {
  const texture = new THREE.DataTexture(bytes, size, size, THREE.RGBAFormat);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  // Keeps the seams crisp where floors and walls run away at a low angle.
  texture.anisotropy = 8;
  if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

export function createPanelTextures(
  kind: PanelKind,
  size: number,
  seed: number,
  bands: WallBands = DEFAULT_WALL_BANDS,
): PanelTextures {
  const data = generatePanelTextureData(kind, size, seed, bands);
  const map = toTexture(data.color, size, true);
  const normalMap = toTexture(data.normal, size, false);
  return {
    map,
    normalMap,
    dispose() {
      map.dispose();
      normalMap.dispose();
    },
  };
}
