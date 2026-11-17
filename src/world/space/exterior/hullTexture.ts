/**
 * Hull texture - the ship's outer plating, generated (no image files).
 *
 * The look is a well-used working ship: light grey plates of many sizes,
 * each a slightly different shade, a few darker service panels and the odd
 * faded rust-red replacement plate, dark seams with a lit edge, broad
 * grime and fine streaking. Plates come from cutting the tile in two again
 * and again at random, which gives the mix of big and small panels that
 * studio models of spaceships are known for.
 *
 * Pure pixel generation (seeded, testable), then one DataTexture. The
 * tile wraps seamlessly: seams are drawn on the near edges of each plate
 * only, and the noise repeats with the tile.
 */
import * as THREE from 'three';
import { mulberry32 } from '../../../core/random';

interface Plate {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
  readonly tint: readonly [number, number, number];
}

/** Base paint: a warm light grey. */
const BASE: readonly [number, number, number] = [0.6, 0.59, 0.565];
const SERVICE: readonly [number, number, number] = [0.42, 0.43, 0.44];
/** Faded, not fresh: a replacement plate that has been out here a while. */
const RUST: readonly [number, number, number] = [0.56, 0.44, 0.39];

/** Cut a rectangle into plates: long sides are cut first, at 30-70 %. */
function cutPlates(size: number, random: () => number): Plate[] {
  const plates: Plate[] = [];
  const cut = (x0: number, y0: number, x1: number, y1: number, depth: number) => {
    const w = x1 - x0;
    const h = y1 - y0;
    const stop = depth >= 7 || Math.min(w, h) < size / 32 || (depth > 3 && random() < 0.25);
    if (stop) {
      const roll = random();
      const shade = 1 + (random() - 0.5) * 0.1;
      const tint = roll < 0.05 ? SERVICE : roll < 0.065 ? RUST : BASE;
      plates.push({ x0, y0, x1, y1, tint: [tint[0] * shade, tint[1] * shade, tint[2] * shade] });
      return;
    }
    const at = 0.3 + random() * 0.4;
    if (w >= h) {
      const xm = Math.round(x0 + w * at);
      cut(x0, y0, xm, y1, depth + 1);
      cut(xm, y0, x1, y1, depth + 1);
    } else {
      const ym = Math.round(y0 + h * at);
      cut(x0, y0, x1, ym, depth + 1);
      cut(x0, ym, x1, y1, depth + 1);
    }
  };
  cut(0, 0, size, size, 0);
  return plates;
}

/** Value noise that repeats every `period` cells: tiles with the texture. */
function tiledNoise(period: number, random: () => number): (u: number, v: number) => number {
  const grid = Array.from({ length: period * period }, () => random());
  const at = (i: number, j: number) =>
    grid[(((j % period) + period) % period) * period + (((i % period) + period) % period)]!;
  const smooth = (t: number) => t * t * (3 - 2 * t);
  return (u, v) => {
    const x = u * period;
    const y = v * period;
    const i = Math.floor(x);
    const j = Math.floor(y);
    const fx = smooth(x - i);
    const fy = smooth(y - j);
    const top = at(i, j) + (at(i + 1, j) - at(i, j)) * fx;
    const bottom = at(i, j + 1) + (at(i + 1, j + 1) - at(i, j + 1)) * fx;
    return top + (bottom - top) * fy;
  };
}

/** RGBA bytes for a `size` x `size` tile of hull plating. */
export function generateHullTextureData(size: number, seed: number): Uint8Array {
  if (!Number.isInteger(size) || size < 16) {
    throw new Error('generateHullTextureData: size must be an integer of at least 16');
  }
  const random = mulberry32(seed);
  const plates = cutPlates(size, random);
  const grime = tiledNoise(5, random);
  const streak = tiledNoise(23, random);
  const data = new Uint8Array(size * size * 4);

  for (const plate of plates) {
    for (let y = plate.y0; y < plate.y1; y++) {
      for (let x = plate.x0; x < plate.x1; x++) {
        const u = x / size;
        const v = y / size;
        // Seam on the plate's near edges; a lit bevel just inside it.
        let relief = 1;
        if (x === plate.x0 || y === plate.y0) relief = 0.42;
        else if (x === plate.x0 + 1 || y === plate.y0 + 1) relief = 1.1;
        // Broad grime, and fine streaks stretched along one axis.
        const dirt = 0.74 + 0.26 * grime(u, v);
        const streaks = 0.9 + 0.1 * streak(u, v * 0.15);
        const speckle = 0.97 + 0.06 * random();
        const k = relief * dirt * streaks * speckle;
        const i = (y * size + x) * 4;
        data[i] = Math.min(255, Math.round(plate.tint[0] * k * 255));
        data[i + 1] = Math.min(255, Math.round(plate.tint[1] * k * 255));
        data[i + 2] = Math.min(255, Math.round(plate.tint[2] * k * 255));
        data[i + 3] = 255;
      }
    }
  }
  return data;
}

export function createHullTexture(size: number, seed: number): THREE.DataTexture {
  const texture = new THREE.DataTexture(generateHullTextureData(size, seed), size, size);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}
