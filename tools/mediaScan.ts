/**
 * mediaScan - list author-supplied files one level down in a public
 * folder: <dir>/<folder>/<file>. Shared by the audio and art plugins, since
 * both work the same way: a folder per slot, any file name inside it.
 */
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
// Explicit .ts extension: Vite's native config loader requires it for
// everything vite.config.ts pulls in.
import {
  type AudioFileInfo,
  type AudioLibrary,
  buildAudioLibrary,
} from '../src/audio/audioLibrary.ts';

export interface MediaScan {
  /** Folder name -> URLs of the accepted files inside it. */
  readonly library: AudioLibrary;
  /** Accepted files sitting directly in `dir`, in no folder (not used). */
  readonly unsorted: readonly string[];
}

function hasExtension(name: string, extensions: readonly string[]): boolean {
  return extensions.includes(path.extname(name).slice(1).toLowerCase());
}

/**
 * Scan `dir`. `root` is the URL prefix the files are served under
 * ("audio", "art"). A missing directory is a valid, empty result.
 */
export async function scanMediaDirectory(
  dir: string,
  extensions: readonly string[],
  root: string,
): Promise<MediaScan> {
  const files: AudioFileInfo[] = [];
  const unsorted: string[] = [];

  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { library: {}, unsorted };
    throw error;
  }

  for (const entry of entries) {
    if (entry.isFile()) {
      if (hasExtension(entry.name, extensions)) unsorted.push(entry.name);
      continue;
    }
    if (!entry.isDirectory()) continue;
    const folderPath = path.join(dir, entry.name);
    for (const file of await readdir(folderPath, { withFileTypes: true })) {
      if (!file.isFile()) continue;
      try {
        const info = await stat(path.join(folderPath, file.name));
        files.push({
          folder: entry.name,
          name: file.name,
          version: `${Math.round(info.mtimeMs)}-${info.size}`,
        });
      } catch (error) {
        // Deleted between listing and stat: it simply is not there any more.
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    }
  }
  return { library: buildAudioLibrary(files, extensions, root), unsorted };
}

/** True when `file` lies somewhere under `parent`. */
export function isInside(parent: string, file: string): boolean {
  const relative = path.relative(parent, file);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}
