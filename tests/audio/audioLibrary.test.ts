import { describe, expect, it } from 'vitest';
import {
  buildAudioLibrary,
  parseAudioLibrary,
  resolveFolder,
  trackLabel,
} from '../../src/audio/audioLibrary';
import type { AudioSpec } from '../../src/content/audioManifest';

const EXT = ['ogg', 'mp3', 'wav'];
const file = (
  folder: string,
  name: string,
  version = '1',
): { folder: string; name: string; version: string } => ({
  folder,
  name,
  version,
});

describe('buildAudioLibrary', () => {
  it('groups files by folder, sorted by name', () => {
    const library = buildAudioLibrary(
      [file('music', 'b.mp3'), file('hum', 'x.ogg'), file('music', 'a.mp3')],
      EXT,
    );
    expect(Object.keys(library).sort()).toEqual(['hum', 'music']);
    expect(library.music).toEqual(['audio/music/a.mp3?v=1', 'audio/music/b.mp3?v=1']);
  });

  it('keeps only accepted audio formats, whatever the letter case', () => {
    const library = buildAudioLibrary(
      [file('m', 'a.MP3'), file('m', 'notes.txt'), file('m', '.gitkeep'), file('m', 'noext')],
      EXT,
    );
    expect(library.m).toEqual(['audio/m/a.MP3?v=1']);
  });

  it('encodes author file names with spaces and brackets into safe URLs', () => {
    const library = buildAudioLibrary([file('music', 'Deep Field (1).mp3', '99-5')], EXT);
    expect(library.music).toEqual(['audio/music/Deep%20Field%20(1).mp3?v=99-5']);
  });

  it('a new version yields a new URL so a replaced file is not served stale', () => {
    const before = buildAudioLibrary([file('m', 'a.mp3', '1')], EXT);
    const after = buildAudioLibrary([file('m', 'a.mp3', '2')], EXT);
    expect(before.m?.[0]).not.toBe(after.m?.[0]);
  });
});

describe('parseAudioLibrary', () => {
  it('accepts a folder -> track list object', () => {
    expect(parseAudioLibrary({ music: ['a', 'b'], hum: [] })).toEqual({
      music: ['a', 'b'],
      hum: [],
    });
  });

  it.each([null, 'text', 42, ['a'], { music: 'a.mp3' }, { music: [1, 2] }])(
    'rejects a malformed listing (%j) instead of guessing',
    (bad) => {
      expect(() => parseAudioLibrary(bad)).toThrow(/Audio library/);
    },
  );
});

describe('resolveFolder', () => {
  const spec: AudioSpec = {
    key: 'cruise',
    folder: 'cruise',
    fallbackFolder: 'music',
    loop: true,
    volume: 0.5,
    category: 'music',
  };

  it('prefers the own folder when it has tracks', () => {
    expect(resolveFolder(spec, { cruise: ['x'], music: ['y'] })).toBe('cruise');
  });

  it('uses the fallback while the own folder is empty', () => {
    expect(resolveFolder(spec, { cruise: [], music: ['y'] })).toBe('music');
  });

  it('is null when neither has tracks, or there is no fallback', () => {
    expect(resolveFolder(spec, {})).toBeNull();
    expect(resolveFolder({ ...spec, fallbackFolder: null }, { music: ['y'] })).toBeNull();
  });
});

describe('trackLabel', () => {
  it('shows the file as the author named it', () => {
    expect(trackLabel('audio/music/Deep%20Field%20(1).mp3?v=99-5')).toBe(
      'audio/music/Deep Field (1).mp3',
    );
  });

  it('falls back to the raw path when it is not valid encoding', () => {
    expect(trackLabel('audio/m/100%.mp3?v=1')).toBe('audio/m/100%.mp3');
  });
});
