/**
 * surfaceArt - turn author-supplied images into the textures a ship
 * surface needs.
 *
 * Only a colour picture is required. A relief (normal) map is used when
 * supplied; otherwise one is derived from the picture's brightness, so
 * painted seams and panels still catch the light. A glow (emissive) map is
 * optional.
 */
import * as THREE from 'three';
import {
  ART_LIBRARY_URL,
  ART_SURFACES,
  type ArtSurface,
  classifySurfaceFiles,
} from '../content/artManifest';
import { parseAudioLibrary, trackLabel } from '../audio/audioLibrary';

/** The textures for one surface, ready to put on its material. */
export interface SurfaceArt {
  readonly map: THREE.Texture;
  readonly normalMap: THREE.Texture | null;
  readonly emissiveMap: THREE.Texture | null;
}

/** Textures larger than this cost frame rate on integrated graphics. */
const LARGE_TEXTURE = 2048;

/**
 * A normal map from a picture: brighter pixels are treated as higher, and
 * the slope between neighbours becomes the surface tilt. `pixels` is RGBA.
 * Wraps at the edges so a tiling picture gives a tiling normal map. Pure.
 */
export function normalFromColor(
  pixels: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  strength: number,
): Uint8Array {
  if (width <= 0 || height <= 0 || pixels.length !== width * height * 4) {
    throw new Error('normalFromColor: pixel data does not match width x height');
  }
  const heights = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const r = pixels[i * 4] ?? 0;
    const g = pixels[i * 4 + 1] ?? 0;
    const b = pixels[i * 4 + 2] ?? 0;
    heights[i] = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  }
  const at = (x: number, y: number): number =>
    heights[((y + height) % height) * width + ((x + width) % width)] ?? 0;
  const normal = new Uint8Array(width * height * 4);
  const byte = (v: number): number => Math.round(Math.min(1, Math.max(0, v)) * 255);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const length = Math.hypot(dx, dy, 1);
      const i = (y * width + x) * 4;
      normal[i] = byte(0.5 - (dx / length) * 0.5);
      normal[i + 1] = byte(0.5 - (dy / length) * 0.5);
      normal[i + 2] = byte(0.5 + (1 / length) * 0.5);
      normal[i + 3] = 255;
    }
  }
  return normal;
}

function prepare<T extends THREE.Texture>(texture: T, srgb: boolean): T {
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

/** Read an image's pixels. Null where the browser offers no 2D canvas. */
function readPixels(image: HTMLImageElement): ImageData | null {
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext('2d');
  if (!context) return null;
  // Flipped vertically so row 0 is the bottom, matching texture space.
  context.translate(0, canvas.height);
  context.scale(1, -1);
  context.drawImage(image, 0, 0);
  return context.getImageData(0, 0, canvas.width, canvas.height);
}

function derivedNormal(image: HTMLImageElement, strength: number): THREE.Texture | null {
  const data = readPixels(image);
  if (!data) return null;
  const texture = new THREE.DataTexture(
    normalFromColor(data.data, data.width, data.height, strength),
    data.width,
    data.height,
    THREE.RGBAFormat,
  );
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  return prepare(texture, false);
}

/** Load the textures for one surface from its folder's file URLs. */
export async function loadSurfaceArt(
  urls: readonly string[],
  derivedNormalStrength: number,
): Promise<SurfaceArt | null> {
  const files = classifySurfaceFiles(urls);
  if (files.color === null) return null;
  const loader = new THREE.TextureLoader();

  const map = prepare(await loader.loadAsync(files.color), true);
  const image = map.image;
  if (Math.max(image.naturalWidth, image.naturalHeight) > LARGE_TEXTURE) {
    console.warn(
      `Drift art: ${trackLabel(files.color)} is ${image.naturalWidth}x${image.naturalHeight}; ` +
        `over ${LARGE_TEXTURE} px can cost frame rate. 1024 is plenty.`,
    );
  }
  const normalMap =
    files.normal !== null
      ? prepare(await loader.loadAsync(files.normal), false)
      : derivedNormal(image, derivedNormalStrength);
  const emissiveMap =
    files.emissive !== null ? prepare(await loader.loadAsync(files.emissive), true) : null;
  return { map, normalMap, emissiveMap };
}

/** The slice of fetch() this module needs (test seam). */
export type ArtFetch = (url: string) => Promise<{
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
}>;

/**
 * Find and load whatever surface art the author has supplied, handing each
 * surface over as it is ready. Art is optional: a missing listing or a
 * broken image is logged and that surface keeps its generated look.
 */
export function connectArt(
  onSurface: (surface: ArtSurface, art: SurfaceArt) => void,
  derivedNormalStrength: number,
  fetchFn: ArtFetch = (url) => fetch(url, { cache: 'no-store' }),
  load: typeof loadSurfaceArt = loadSurfaceArt,
): Promise<void> {
  const run = async (): Promise<void> => {
    const response = await fetchFn(ART_LIBRARY_URL);
    if (!response.ok) throw new Error(`${ART_LIBRARY_URL} answered HTTP ${response.status}`);
    const library = parseAudioLibrary(await response.json());
    await Promise.all(
      ART_SURFACES.map(async (surface) => {
        const urls = library[surface] ?? [];
        if (urls.length === 0) return;
        try {
          const art = await load(urls, derivedNormalStrength);
          if (art) onSurface(surface, art);
        } catch (error) {
          console.warn(
            `Drift art: could not load "${surface}" art - keeping the built-in look`,
            error,
          );
        }
      }),
    );
  };
  return run().catch((error: unknown) => {
    console.warn('Drift art: could not read the art listing - keeping the built-in look', error);
  });
}
