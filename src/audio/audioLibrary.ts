/**
 * AudioLibrary - which audio files exist right now, grouped by folder.
 *
 * A browser cannot list a directory, so the dev server (and the build)
 * publish this listing as JSON (tools/audioLibraryPlugin.ts) and the game
 * reads it. Everything here is pure so both sides share one definition.
 */
import type { AudioSpec } from '../content/audioManifest';

/** Folder name -> playable track URLs, sorted by file name. */
export type AudioLibrary = Readonly<Record<string, readonly string[]>>;

export const EMPTY_LIBRARY: AudioLibrary = {};

/** Where the listing is served, relative to the site root. */
export const AUDIO_LIBRARY_URL = 'audio/library.json';
/** Dev-server push event carrying a fresh listing. */
export const AUDIO_LIBRARY_EVENT = 'drift:audio-library';

/** One file found on disk, as the scanner reports it. */
export interface AudioFileInfo {
  readonly folder: string;
  readonly name: string;
  /**
   * Changes whenever the file's content changes (e.g. mtime + size). It
   * becomes part of the URL, so replacing a file in place reads as a new
   * track and the old cached audio is never reused.
   */
  readonly version: string;
}

function hasAcceptedExtension(name: string, extensions: readonly string[]): boolean {
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return false;
  return extensions.includes(name.slice(dot + 1).toLowerCase());
}

/** Group scanned files into a library, dropping non-audio files. */
export function buildAudioLibrary(
  files: readonly AudioFileInfo[],
  extensions: readonly string[],
): AudioLibrary {
  const folders: Record<string, string[]> = {};
  const sorted = [...files]
    .filter((f) => hasAcceptedExtension(f.name, extensions))
    .sort((a, b) => a.name.localeCompare(b.name));
  for (const file of sorted) {
    // Author file names contain spaces and brackets; encode each segment.
    const url = `audio/${encodeURIComponent(file.folder)}/${encodeURIComponent(file.name)}?v=${encodeURIComponent(file.version)}`;
    (folders[file.folder] ??= []).push(url);
  }
  return folders;
}

/** Validate untrusted JSON into a library. Throws on a malformed shape. */
export function parseAudioLibrary(value: unknown): AudioLibrary {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Audio library: expected an object of folder -> track list');
  }
  const library: Record<string, readonly string[]> = {};
  for (const [folder, tracks] of Object.entries(value)) {
    if (!Array.isArray(tracks) || !tracks.every((t) => typeof t === 'string')) {
      throw new Error(`Audio library: folder "${folder}" is not a list of track URLs`);
    }
    library[folder] = tracks;
  }
  return library;
}

/**
 * The folder a sound plays from right now: its own when that has tracks,
 * else its fallback when that has tracks, else none.
 */
export function resolveFolder(spec: AudioSpec, library: AudioLibrary): string | null {
  if ((library[spec.folder]?.length ?? 0) > 0) return spec.folder;
  if (spec.fallbackFolder !== null && (library[spec.fallbackFolder]?.length ?? 0) > 0) {
    return spec.fallbackFolder;
  }
  return null;
}

/** A track URL as the author knows the file: decoded, without the version. */
export function trackLabel(url: string): string {
  const path = url.split('?')[0] ?? url;
  try {
    return decodeURIComponent(path);
  } catch {
    // Not valid percent-encoding: the raw path is still the best label.
    return path;
  }
}
