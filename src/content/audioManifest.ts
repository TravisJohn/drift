/**
 * Audio manifest - every sound the game can play, as data (D4).
 *
 * The author supplies the actual files (PRD): drop them into public/audio/
 * named <key>.<ext>, where <ext> is any of AUDIO_EXTENSIONS. A missing file
 * is fine - the game runs silent for that key and logs one console warning.
 */

/**
 * Accepted file formats, in preference order: when several formats of the
 * same key exist, the earliest one here wins.
 */
export const AUDIO_EXTENSIONS: readonly string[] = ['ogg', 'mp3', 'wav'];

export type AudioCategory = 'music' | 'ambience' | 'sfx';

export interface AudioSpec {
  readonly key: string;
  /**
   * Candidate paths relative to the site root (Vite's public/), tried in
   * order until one loads.
   */
  readonly files: readonly string[];
  readonly loop: boolean;
  /** Baseline volume 0..1; fades and gains scale within it. */
  readonly volume: number;
  readonly category: AudioCategory;
}

const spec = (key: string, loop: boolean, volume: number, category: AudioCategory): AudioSpec => ({
  key,
  files: AUDIO_EXTENSIONS.map((ext) => `audio/${key}.${ext}`),
  loop,
  volume,
  category,
});

export const audioManifest: readonly AudioSpec[] = [
  // Music beds.
  spec('music_roaming', true, 0.5, 'music'),
  spec('music_cruise', true, 0.5, 'music'),
  // Ambience loops.
  spec('amb_ship_hum', true, 0.55, 'ambience'),
  spec('amb_engine_cruise', true, 0.5, 'ambience'),
  spec('amb_cryo_bay', true, 0.45, 'ambience'),
  spec('sfx_drone_hover', true, 0.3, 'sfx'),
  // One-shots.
  spec('sfx_ui_blip', false, 0.6, 'sfx'),
  spec('sfx_depart', false, 0.7, 'sfx'),
  spec('sfx_arrive', false, 0.7, 'sfx'),
  spec('sfx_terminal', false, 0.6, 'sfx'),
];

/** Content validation (fail loud at startup, like the other validators). */
export function validateAudioManifest(list: readonly AudioSpec[]): string[] {
  const problems: string[] = [];
  const keys = new Set<string>();
  for (const s of list) {
    if (keys.has(s.key)) problems.push(`duplicate audio key "${s.key}"`);
    keys.add(s.key);
    if (!s.key.trim()) problems.push('an audio spec has an empty key');
    if (s.files.length === 0) problems.push(`audio "${s.key}" has no file candidates`);
    if (s.files.some((f) => !f.trim())) problems.push(`audio "${s.key}" has an empty file path`);
    if (s.volume < 0 || s.volume > 1) problems.push(`audio "${s.key}" volume outside 0..1`);
  }
  return problems;
}
