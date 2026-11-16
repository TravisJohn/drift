/**
 * audioLibraryPlugin - tells the game which audio files exist.
 *
 * The author drops files into public/audio/<moment>/ under any name. A
 * browser cannot list a directory, so this Vite plugin does it:
 * - dev: serves the listing at /audio/library.json, creates the moment
 *   folders if they are missing, and pushes a fresh listing to the running
 *   game whenever a file is added, replaced or deleted - no reload needed;
 * - build: writes the listing into the bundle next to the copied files.
 */
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { Plugin } from 'vite';
// Explicit .ts extensions: Vite's native config loader requires them for
// everything vite.config.ts pulls in.
import {
  AUDIO_LIBRARY_EVENT,
  AUDIO_LIBRARY_URL,
  type AudioLibrary,
} from '../src/audio/audioLibrary.ts';
import { AUDIO_EXTENSIONS, audioFolders, audioManifest } from '../src/content/audioManifest.ts';
import { type MediaScan, isInside, scanMediaDirectory } from './mediaScan.ts';

/**
 * Copying several files fires a burst of watcher events, and a large file
 * is seen before it is fully written; wait for the burst to settle.
 */
const SETTLE_MS = 300;

export type AudioScan = MediaScan;

/** List every audio file one level down: audioDir/<folder>/<file>. */
export function scanAudioDirectory(audioDir: string): Promise<AudioScan> {
  return scanMediaDirectory(audioDir, AUDIO_EXTENSIONS, 'audio');
}

export function audioLibraryPlugin(): Plugin {
  let audioDir = '';

  return {
    name: 'drift-audio-library',

    configResolved(config) {
      audioDir = path.join(config.publicDir, 'audio');
    },

    async configureServer(server) {
      const log = server.config.logger;
      // Make sure every moment has a folder to drop files into.
      for (const folder of audioFolders(audioManifest)) {
        await mkdir(path.join(audioDir, folder), { recursive: true });
      }

      let lastUnsorted = '';
      const scan = async (): Promise<AudioLibrary> => {
        const { library, unsorted } = await scanAudioDirectory(audioDir);
        const listed = unsorted.join(', ');
        if (listed !== '' && listed !== lastUnsorted) {
          log.warn(
            `[drift audio] not in a moment folder, so not played: ${listed}. ` +
              'Move them into one of the folders in public/audio/.',
          );
        }
        lastUnsorted = listed;
        return library;
      };

      // Runs before Vite's own static serving, so the listing is always live.
      server.middlewares.use((req, res, next) => {
        if (req.url?.split('?')[0] !== `/${AUDIO_LIBRARY_URL}`) {
          next();
          return;
        }
        scan().then((library) => {
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Cache-Control', 'no-store');
          res.end(JSON.stringify(library));
        }, next);
      });

      let timer: NodeJS.Timeout | undefined;
      const pushLibrary = (): void => {
        scan().then(
          (library) =>
            server.ws.send({ type: 'custom', event: AUDIO_LIBRARY_EVENT, data: library }),
          (error: unknown) =>
            log.error(`[drift audio] could not list audio files: ${String(error)}`),
        );
      };
      server.watcher.add(audioDir);
      server.watcher.on('all', (_event, file) => {
        if (!isInside(audioDir, file)) return;
        clearTimeout(timer);
        timer = setTimeout(pushLibrary, SETTLE_MS);
      });
    },

    async generateBundle() {
      const { library } = await scanAudioDirectory(audioDir);
      this.emitFile({
        type: 'asset',
        fileName: AUDIO_LIBRARY_URL,
        source: JSON.stringify(library),
      });
    },
  };
}
