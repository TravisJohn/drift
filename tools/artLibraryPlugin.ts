/**
 * artLibraryPlugin - tells the game which author-supplied art exists.
 *
 * The author drops image files into public/art/<surface>/ (see
 * src/content/artManifest.ts). Like the audio plugin, this lists them for
 * the browser:
 * - dev: serves /art/library.json, creates the folders if missing, and
 *   reloads the page when art changes (textures are applied at startup);
 * - build: writes the listing into the bundle next to the copied files.
 */
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { Plugin } from 'vite';
import {
  ART_EXTENSIONS,
  ART_LIBRARY_URL,
  ART_ROOT,
  ART_SURFACES,
} from '../src/content/artManifest.ts';
import { isInside, scanMediaDirectory } from './mediaScan.ts';

/** Wait for a burst of file events (a multi-file copy) to settle. */
const SETTLE_MS = 400;

export function artLibraryPlugin(): Plugin {
  let artDir = '';
  const scan = async (): Promise<unknown> =>
    (await scanMediaDirectory(artDir, ART_EXTENSIONS, ART_ROOT)).library;

  return {
    name: 'drift-art-library',

    configResolved(config) {
      artDir = path.join(config.publicDir, ART_ROOT);
    },

    async configureServer(server) {
      for (const surface of ART_SURFACES) {
        await mkdir(path.join(artDir, surface), { recursive: true });
      }

      server.middlewares.use((req, res, next) => {
        if (req.url?.split('?')[0] !== `/${ART_LIBRARY_URL}`) {
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
      server.watcher.add(artDir);
      server.watcher.on('all', (_event, file) => {
        if (!isInside(artDir, file)) return;
        clearTimeout(timer);
        timer = setTimeout(() => server.ws.send({ type: 'full-reload' }), SETTLE_MS);
      });
    },

    async generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: ART_LIBRARY_URL,
        source: JSON.stringify(await scan()),
      });
    },
  };
}
