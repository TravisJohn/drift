import { describe, expect, it } from 'vitest';
import {
  audioManifest,
  validateAudioManifest,
  type AudioSpec,
} from '../../src/content/audioManifest';

describe('audio manifest content', () => {
  it('the shipped manifest is valid', () => {
    expect(validateAudioManifest(audioManifest)).toEqual([]);
  });

  it('covers the architecture audio key list', () => {
    const keys = audioManifest.map((s) => s.key);
    for (const expected of [
      'music_roaming',
      'music_cruise',
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

  it('every sound accepts ogg, mp3 and wav, preferring ogg (author may supply any)', () => {
    for (const s of audioManifest) {
      expect(s.files).toEqual([`audio/${s.key}.ogg`, `audio/${s.key}.mp3`, `audio/${s.key}.wav`]);
    }
  });

  it('validation catches duplicates, bad volume, empty paths and no candidates', () => {
    const bad: AudioSpec[] = [
      { key: 'a', files: ['audio/a.ogg'], loop: true, volume: 0.5, category: 'music' },
      { key: 'a', files: ['audio/a.ogg'], loop: true, volume: 0.5, category: 'music' },
      { key: 'b', files: [''], loop: false, volume: 1.5, category: 'sfx' },
      { key: 'c', files: [], loop: false, volume: 0.5, category: 'sfx' },
    ];
    const problems = validateAudioManifest(bad);
    expect(problems.some((p) => p.includes('duplicate audio key'))).toBe(true);
    expect(problems.some((p) => p.includes('no file candidates'))).toBe(true);
    expect(problems.some((p) => p.includes('empty file path'))).toBe(true);
    expect(problems.some((p) => p.includes('volume outside'))).toBe(true);
  });
});
