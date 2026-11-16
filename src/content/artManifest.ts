/**
 * Art manifest - which author-supplied art the game can use, as data (D4).
 *
 * The built-in look is generated in code. Any of it can be replaced by
 * dropping image files into public/art/<surface>/ - made by hand or by an
 * outside AI tool (see ART_PROMPTS.md). With a folder empty, the generated
 * look is used; nothing is ever required.
 */

/** URL prefix and folder name under public/. */
export const ART_ROOT = 'art';

/** Where the listing of supplied art is served, relative to the site root. */
export const ART_LIBRARY_URL = 'art/library.json';

/** Accepted image formats (matched case-insensitively). */
export const ART_EXTENSIONS: readonly string[] = ['png', 'jpg', 'jpeg', 'webp'];

/**
 * The surfaces that accept art. Each is a folder under public/art/, and
 * one texture covers every surface of that kind on the ship.
 */
export const ART_SURFACES = ['wall', 'floor', 'ceiling'] as const;
export type ArtSurface = (typeof ART_SURFACES)[number];

/** The maps one surface can have; only `color` is required. */
export interface SurfaceFiles {
  /** The picture itself. */
  readonly color: string | null;
  /** Optional relief map. Without one, relief is derived from the picture. */
  readonly normal: string | null;
  /** Optional glow map: black except where the surface should emit light. */
  readonly emissive: string | null;
}

const NORMAL_HINT = /(normal|nrm|bump)/i;
const EMISSIVE_HINT = /(emissive|emission|glow|light)/i;

/**
 * Sort a folder's files into maps by their names: "normal"/"nrm"/"bump"
 * marks the relief map, "emissive"/"glow"/"light" the glow map, and the
 * first remaining file is the picture. File names are otherwise free.
 */
export function classifySurfaceFiles(urls: readonly string[]): SurfaceFiles {
  let color: string | null = null;
  let normal: string | null = null;
  let emissive: string | null = null;
  for (const url of urls) {
    // Judge by the file name only, not the folder or the version query.
    const name = decodeURIComponent((url.split('?')[0] ?? url).split('/').pop() ?? url);
    if (NORMAL_HINT.test(name)) normal ??= url;
    else if (EMISSIVE_HINT.test(name)) emissive ??= url;
    else color ??= url;
  }
  return { color, normal, emissive };
}
