/**
 * panelTextures - procedural hull-panel surfaces, so walls, floors and
 * ceilings read as built from plates instead of flat colour.
 *
 * The pixels come from a pure generator (seeded, no canvas, testable):
 * a height field of plates separated by seams, with rivets and brushed
 * noise, turned into two maps - colour, and normal (the seams catch
 * light). Every map tiles seamlessly.
 *
 * There is deliberately no roughness/metalness map: on integrated
 * graphics each extra texture read per pixel is measurable (about 1 ms a
 * frame each), and varying roughness along the seams was barely visible.
 * PANEL_FINISH gives each surface one roughness and metalness instead.
 */
import * as THREE from 'three';

export type PanelKind = 'wall' | 'floor' | 'ceiling';

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
    columns: 3,
    rows: 3,
    seam: 0.007,
    inset: 0,
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
  /** sRGB albedo multiplier (grey; the material's colour tints it). */
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

/** Value noise that repeats every `period` cells, so the texture tiles. */
function tileNoise(x: number, y: number, period: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const wrap = (n: number): number => ((n % period) + period) % period;
  const a = hash2(wrap(x0), wrap(y0), seed);
  const b = hash2(wrap(x0 + 1), wrap(y0), seed);
  const c = hash2(wrap(x0), wrap(y0 + 1), seed);
  const d = hash2(wrap(x0 + 1), wrap(y0 + 1), seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

const smooth = (edge0: number, edge1: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

/** One sample of the surface at tile coordinates u, v in 0..1. */
interface Sample {
  /** 0 = bottom of a seam, 1 = plate surface (rivets rise above 1). */
  readonly height: number;
  readonly brightness: number;
}

function sample(u: number, v: number, style: PanelStyle, seed: number): Sample {
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
    const corner = Math.hypot(edgeU - offset, edgeV - offset);
    // Only near a corner, never along the whole edge.
    if (du < style.seam * 2 && dv < style.seam * 2) {
      height += (1 - smooth(0, style.seam * 1.4, corner)) * 0.6;
    }
  }

  const plate = hash2(cellU, cellV, seed + 17);
  const grainValue = tileNoise(u * style.grain[0], v * style.grain[1], style.grain[0], seed + 3);
  // Slow, large blotches: wear that is not the same on every plate.
  const wear = tileNoise(u * 4, v * 4, 4, seed + 9);
  const brightness =
    (1 - style.plateVariation + style.plateVariation * 2 * plate) *
    (0.9 + 0.12 * grainValue) *
    (0.9 + 0.14 * wear) *
    (0.62 + 0.38 * Math.max(0, surface));
  return { height, brightness };
}

/** Generate the three maps for one surface kind. Pure and deterministic. */
export function generatePanelTextureData(
  kind: PanelKind,
  size: number,
  seed: number,
): PanelTextureData {
  if (!Number.isInteger(size) || size < 8) {
    throw new Error('generatePanelTextureData: size must be an integer of at least 8');
  }
  const style = STYLES[kind];
  const heights = new Float32Array(size * size);
  const color = new Uint8Array(size * size * 4);
  const normal = new Uint8Array(size * size * 4);
  const byte = (value: number): number => Math.round(Math.min(1, Math.max(0, value)) * 255);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const s = sample((x + 0.5) / size, (y + 0.5) / size, style, seed);
      const i = y * size + x;
      heights[i] = s.height;
      const c = byte(s.brightness);
      color[i * 4] = c;
      color[i * 4 + 1] = c;
      color[i * 4 + 2] = c;
      color[i * 4 + 3] = 255;
    }
  }

  // Normals from the height field's slope, wrapping at the edges.
  const STRENGTH = size / 90;
  const at = (x: number, y: number): number =>
    heights[((y + size) % size) * size + ((x + size) % size)] ?? 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * STRENGTH;
      const dy = (at(x, y + 1) - at(x, y - 1)) * STRENGTH;
      const length = Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      normal[i] = byte(0.5 - (dx / length) * 0.5);
      normal[i + 1] = byte(0.5 - (dy / length) * 0.5);
      normal[i + 2] = byte(0.5 + (1 / length) * 0.5);
      normal[i + 3] = 255;
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

export function createPanelTextures(kind: PanelKind, size: number, seed: number): PanelTextures {
  const data = generatePanelTextureData(kind, size, seed);
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
