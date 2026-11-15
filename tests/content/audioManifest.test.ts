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

  it('validation catches duplicates, bad volume and empty paths', () => {
    const bad: AudioSpec[] = [
      { key: 'a', file: 'audio/a.ogg', loop: true, volume: 0.5, category: 'music' },
      { key: 'a', file: 'audio/a.ogg', loop: true, volume: 0.5, category: 'music' },
      { key: 'b', file: '', loop: false, volume: 1.5, category: 'sfx' },
    ];
    const problems = validateAudioManifest(bad);
    expect(problems.some((p) => p.includes('duplicate audio key'))).toBe(true);
    expect(problems.some((p) => p.includes('empty file path'))).toBe(true);
    expect(problems.some((p) => p.includes('volume outside'))).toBe(true);
  });
});
