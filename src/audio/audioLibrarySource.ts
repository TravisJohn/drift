/**
 * AudioLibrarySource - gets the current audio file listing to the game.
 *
 * Two paths, both served by tools/audioLibraryPlugin.ts:
 * - a JSON file fetched once at startup (dev server and production build);
 * - in development, a pushed update every time a file in public/audio is
 *   added, replaced or deleted, so the soundscape changes without a reload.
 */
import {
  AUDIO_LIBRARY_EVENT,
  AUDIO_LIBRARY_URL,
  type AudioLibrary,
  EMPTY_LIBRARY,
  parseAudioLibrary,
} from './audioLibrary';

/** The slice of fetch() this module needs (test seam). */
export type LibraryFetch = (url: string) => Promise<{
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
}>;

/** The slice of Vite's import.meta.hot this module needs (test seam). */
export interface LibraryPushChannel {
  on(event: string, listener: (data: unknown) => void): void;
}

export async function fetchAudioLibrary(fetchFn: LibraryFetch): Promise<AudioLibrary> {
  const response = await fetchFn(AUDIO_LIBRARY_URL);
  if (!response.ok) {
    throw new Error(`Audio library: ${AUDIO_LIBRARY_URL} answered HTTP ${response.status}`);
  }
  return parseAudioLibrary(await response.json());
}

/**
 * Deliver the library now and on every later change. When the listing
 * cannot be read the game still runs: an empty library is delivered and the
 * reason is logged.
 */
export function connectAudioLibrary(
  onLibrary: (library: AudioLibrary) => void,
  fetchFn: LibraryFetch = (url) => fetch(url, { cache: 'no-store' }),
  push: LibraryPushChannel | undefined = import.meta.hot,
): void {
  // A pushed listing is always newer than the startup fetch; if one lands
  // first, the slower fetch must not overwrite it.
  let pushed = false;

  push?.on(AUDIO_LIBRARY_EVENT, (data) => {
    try {
      const library = parseAudioLibrary(data);
      pushed = true;
      onLibrary(library);
    } catch (error) {
      console.error('Drift audio: ignored a malformed library update', error);
    }
  });

  fetchAudioLibrary(fetchFn).then(
    (library) => {
      if (!pushed) onLibrary(library);
    },
    (error: unknown) => {
      console.warn('Drift audio: could not read the audio file listing - running silent', error);
      if (!pushed) onLibrary(EMPTY_LIBRARY);
    },
  );
}
