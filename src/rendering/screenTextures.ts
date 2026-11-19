/**
 * screenTextures - what is on the ship's displays, so a console reads as a
 * working screen instead of a glowing slab.
 *
 * The bridge uses wide instrument artwork. Other consoles and the holo-table
 * use seeded pixel readouts and a projector grid. All are emissive maps.
 */
import * as THREE from 'three';
import type { BridgeInstrument } from '../content/shipLayout';
import helm from './instruments/helm.png';
import power from './instruments/power.png';
import comms from './instruments/comms.png';

const instrumentArt = { helm, power, comms };
const instrumentTextures = new Map<BridgeInstrument, THREE.Texture>();

export function bridgeScreenTexture(instrument: BridgeInstrument): THREE.Texture {
  let texture = instrumentTextures.get(instrument);
  if (!texture) {
    texture = new THREE.TextureLoader().load(instrumentArt[instrument]);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    instrumentTextures.set(instrument, texture);
  }
  return texture;
}

export type ScreenKind = 'readout' | 'grid';

type Rgb = readonly [number, number, number];

const BACKGROUND: Rgb = [5, 13, 19];
const CYAN: Rgb = [96, 216, 255];
const AMBER: Rgb = [255, 188, 92];

/** Small deterministic PRNG so each screen is the same every run. */
function prng(seed: number): () => number {
  let state = (seed * 2654435761) >>> 0 || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 4294967296;
  };
}

/** A tiny software canvas: rectangles in 0..1 coordinates, y up. */
class Raster {
  readonly bytes: Uint8Array;

  constructor(readonly size: number) {
    this.bytes = new Uint8Array(size * size * 4);
    this.fill(0, 0, 1, 1, BACKGROUND, 1);
  }

  /** Blend a rectangle in. `strength` 0..1 scales the colour's brightness. */
  fill(x0: number, y0: number, x1: number, y1: number, color: Rgb, strength: number): void {
    const s = this.size;
    const left = Math.max(0, Math.round(x0 * s));
    const right = Math.min(s, Math.round(x1 * s));
    const bottom = Math.max(0, Math.round(y0 * s));
    const top = Math.min(s, Math.round(y1 * s));
    for (let y = bottom; y < top; y++) {
      for (let x = left; x < right; x++) {
        const i = (y * s + x) * 4;
        this.bytes[i] = Math.round(color[0] * strength);
        this.bytes[i + 1] = Math.round(color[1] * strength);
        this.bytes[i + 2] = Math.round(color[2] * strength);
        this.bytes[i + 3] = 255;
      }
    }
  }

  /** Darken alternate rows: the look of a scanned display. */
  scanlines(amount: number): void {
    for (let y = 0; y < this.size; y += 2) {
      for (let x = 0; x < this.size; x++) {
        const i = (y * this.size + x) * 4;
        for (let c = 0; c < 3; c++) {
          this.bytes[i + c] = Math.round((this.bytes[i + c] ?? 0) * (1 - amount));
        }
      }
    }
  }
}

function drawReadout(raster: Raster, random: () => number): void {
  // Header bar with a title block and a status pip.
  raster.fill(0.05, 0.88, 0.95, 0.94, CYAN, 0.35);
  raster.fill(0.07, 0.895, 0.07 + 0.18 + random() * 0.2, 0.925, CYAN, 1);
  raster.fill(0.88, 0.895, 0.93, 0.925, AMBER, 1);

  // Left column: rows of text-like blocks, the odd one highlighted.
  const ROWS = 9;
  for (let row = 0; row < ROWS; row++) {
    const y = 0.8 - row * 0.075;
    let x = 0.07;
    const words = 1 + Math.floor(random() * 3);
    const highlighted = random() < 0.14;
    for (let w = 0; w < words && x < 0.52; w++) {
      const width = 0.05 + random() * 0.13;
      raster.fill(
        x,
        y,
        Math.min(0.55, x + width),
        y + 0.028,
        highlighted ? AMBER : CYAN,
        0.45 + random() * 0.5,
      );
      x += width + 0.025;
    }
  }

  // Right column: a bar chart over a trace.
  const BARS = 7;
  for (let bar = 0; bar < BARS; bar++) {
    const x = 0.62 + bar * 0.045;
    raster.fill(x, 0.5, x + 0.028, 0.5 + 0.06 + random() * 0.28, CYAN, 0.55 + random() * 0.4);
  }
  raster.fill(0.61, 0.485, 0.94, 0.492, CYAN, 0.5);
  let level = 0.25 + random() * 0.1;
  const STEPS = 30;
  for (let step = 0; step < STEPS; step++) {
    level = Math.min(0.42, Math.max(0.14, level + (random() - 0.5) * 0.07));
    const x = 0.61 + (step / STEPS) * 0.33;
    raster.fill(x, level, x + 0.33 / STEPS, level + 0.012, AMBER, 0.9);
  }
  raster.fill(0.61, 0.11, 0.94, 0.117, CYAN, 0.35);
  raster.scanlines(0.28);
}

function drawGrid(raster: Raster): void {
  const LINES = 12;
  const thin = 0.5 / raster.size + 0.002;
  for (let i = 0; i <= LINES; i++) {
    const t = 0.04 + (i / LINES) * 0.92;
    // Lines brighten toward the middle, where the hologram stands.
    const strength = 0.25 + 0.5 * (1 - Math.abs(i / LINES - 0.5) * 2);
    raster.fill(t - thin, 0.04, t + thin, 0.96, CYAN, strength);
    raster.fill(0.04, t - thin, 0.96, t + thin, CYAN, strength);
  }
  // Emitter frame and a bright core.
  for (const inset of [0.04, 0.3]) {
    const w = 0.008;
    raster.fill(inset, inset, 1 - inset, inset + w, CYAN, 1);
    raster.fill(inset, 1 - inset - w, 1 - inset, 1 - inset, CYAN, 1);
    raster.fill(inset, inset, inset + w, 1 - inset, CYAN, 1);
    raster.fill(1 - inset - w, inset, 1 - inset, 1 - inset, CYAN, 1);
  }
  raster.fill(0.47, 0.47, 0.53, 0.53, CYAN, 1);
}

/** Generate one display's pixels (RGBA, sRGB). Pure and deterministic. */
export function generateScreenPixels(kind: ScreenKind, size: number, seed: number): Uint8Array {
  if (!Number.isInteger(size) || size < 16) {
    throw new Error('generateScreenPixels: size must be an integer of at least 16');
  }
  const raster = new Raster(size);
  if (kind === 'readout') drawReadout(raster, prng(seed + 1));
  else drawGrid(raster);
  return raster.bytes;
}

const SCREEN_SIZE = 128;
/** How many different readouts exist; consoles cycle through them. */
export const READOUT_VARIANTS = 4;

const cache = new Map<string, THREE.DataTexture>();

/**
 * The texture for a display. Shared: every console with the same variant
 * uses one texture, so ten consoles cost four small uploads.
 */
export function screenTexture(kind: ScreenKind, variant = 0): THREE.DataTexture {
  const index =
    kind === 'readout' ? ((variant % READOUT_VARIANTS) + READOUT_VARIANTS) % READOUT_VARIANTS : 0;
  const key = `${kind}:${index}`;
  let texture = cache.get(key);
  if (!texture) {
    texture = new THREE.DataTexture(
      generateScreenPixels(kind, SCREEN_SIZE, index),
      SCREEN_SIZE,
      SCREEN_SIZE,
      THREE.RGBAFormat,
    );
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.generateMipmaps = true;
    texture.needsUpdate = true;
    cache.set(key, texture);
  }
  return texture;
}
