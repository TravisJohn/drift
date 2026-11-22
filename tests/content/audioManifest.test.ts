import { describe, expect, it } from 'vitest';
import {
  SHARED_MUSIC_FOLDER,
  audioFolders,
  audioManifest,
  validateAudioManifest,
  type AudioSpec,
} from '../../src/content/audioManifest';

const base: AudioSpec = {
  key: 'a',
  folder: 'a',
  fallbackFolder: null,
  loop: true,
  volume: 0.5,
  category: 'music',
};

describe('audio manifest content', () => {
  it('the shipped manifest is valid', () => {
    expect(validateAudioManifest(audioManifest)).toEqual([]);
  });

  it('covers the architecture audio key list', () => {
    const keys = audioManifest.map((s) => s.key);
    for (const expected of [
      'music_roaming',
      'music_cruise',
      'music_vesper',
      'amb_ship_hum',
      'amb_engine_cruise',
      'amb_cryo_bay',
      'sfx_drone_hover',
      'sfx_ui_blip',
      'sfx_depart',
      'sfx_arrive',
      'sfx_terminal',
    ]) {
      expect(keys).toContain(expected);
    }
  });

  it('every sound has its own folder named after its key', () => {
    for (const s of audioManifest) expect(s.folder).toBe(s.key);
  });

  it('only ship music falls back to the shared playlist folder', () => {
    for (const s of audioManifest) {
      expect(s.fallbackFolder).toBe(s.category === 'music' ? SHARED_MUSIC_FOLDER : null);
    }
  });

  it('audioFolders lists own and shared folders once each', () => {
    const folders = audioFolders(audioManifest);
    expect(folders).toContain(SHARED_MUSIC_FOLDER);
    expect(folders).toHaveLength(audioManifest.length + 1);
  });

  it('validation catches duplicates, bad volume and empty folders', () => {
    const problems = validateAudioManifest([
      base,
      base,
      { ...base, key: 'b', folder: '', volume: 1.5 },
      { ...base, key: 'c', folder: 'c', fallbackFolder: ' ' },
    ]);
    expect(problems.some((p) => p.includes('duplicate audio key'))).toBe(true);
    expect(problems.some((p) => p.includes('is used twice'))).toBe(true);
    expect(problems.some((p) => p.includes('empty folder'))).toBe(true);
    expect(problems.some((p) => p.includes('empty fallback folder'))).toBe(true);
    expect(problems.some((p) => p.includes('volume outside'))).toBe(true);
  });

  it('a folder cannot feed both loops and one-shots', () => {
    const problems = validateAudioManifest([
      { ...base, fallbackFolder: 'shared' },
      { ...base, key: 'b', folder: 'b', fallbackFolder: 'shared', loop: false },
    ]);
    expect(problems.some((p) => p.includes('both loops and one-shots'))).toBe(true);
  });
});
