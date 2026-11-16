// @vitest-environment node
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { scanAudioDirectory } from '../../tools/audioLibraryPlugin';
import { scanMediaDirectory } from '../../tools/mediaScan';

describe('scanAudioDirectory', () => {
  let dir: string;

  const put = async (relative: string, content = 'x'): Promise<void> => {
    const full = path.join(dir, relative);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, content);
  };

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'drift-audio-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('lists audio files per moment folder under any file name', async () => {
    await put('music/Deep Field.mp3');
    await put('music/Deep Field (1).mp3');
    await put('sfx_ui_blip/click.wav');
    const { library } = await scanAudioDirectory(dir);
    expect(library.music).toHaveLength(2);
    expect(library.music?.[0]).toMatch(/^audio\/music\/Deep%20Field%20\(1\)\.mp3\?v=\d+-1$/);
    expect(library.sfx_ui_blip).toHaveLength(1);
  });

  it('ignores non-audio files and empty folders', async () => {
    await put('music/.gitkeep', '');
    await put('music/notes.txt');
    await mkdir(path.join(dir, 'amb_ship_hum'));
    const { library } = await scanAudioDirectory(dir);
    expect(library).toEqual({});
  });

  it('reports audio files left outside any moment folder, without playing them', async () => {
    await put('Loose Track.mp3');
    await put('README.txt');
    const { library, unsorted } = await scanAudioDirectory(dir);
    expect(library).toEqual({});
    expect(unsorted).toEqual(['Loose Track.mp3']);
  });

  it('a replaced file gets a new URL', async () => {
    await put('music/a.mp3', 'one');
    const before = (await scanAudioDirectory(dir)).library.music?.[0];
    await put('music/a.mp3', 'longer content');
    const after = (await scanAudioDirectory(dir)).library.music?.[0];
    expect(after).not.toBe(before);
  });

  it('a missing audio folder means an empty library, not a crash', async () => {
    const scan = await scanAudioDirectory(path.join(dir, 'nope'));
    expect(scan).toEqual({ library: {}, unsorted: [] });
  });
});

describe('scanMediaDirectory (the same scan, for art)', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'drift-art-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('lists images under the art root and ignores other files', async () => {
    await mkdir(path.join(dir, 'wall'));
    await writeFile(path.join(dir, 'wall', 'My Wall.PNG'), 'x');
    await writeFile(path.join(dir, 'wall', 'wall_glow.webp'), 'x');
    await writeFile(path.join(dir, 'wall', 'notes.txt'), 'x');
    await writeFile(path.join(dir, 'wall', 'track.mp3'), 'x');
    const { library } = await scanMediaDirectory(dir, ['png', 'jpg', 'jpeg', 'webp'], 'art');
    expect(library.wall).toHaveLength(2);
    expect(library.wall?.[0]).toMatch(/^art\/wall\/My%20Wall\.PNG\?v=/);
  });
});
