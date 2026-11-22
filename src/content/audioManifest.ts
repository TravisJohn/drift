/**
 * Audio manifest - every moment in the game that can make a sound, as data
 * (D4).
 *
 * The author supplies the actual files (PRD). Each moment has a folder under
 * public/audio/; any file dropped in that folder, under any name, plays for
 * that moment. Several files in one folder rotate. An empty folder is fine -
 * the game runs silent for that moment and logs one console warning.
 */

/** Accepted file formats (matched case-insensitively). */
export const AUDIO_EXTENSIONS: readonly string[] = ['ogg', 'mp3', 'wav'];

/**
 * Tracks here play for every music moment that has no tracks of its own, so
 * one playlist can cover the whole journey.
 */
export const SHARED_MUSIC_FOLDER = 'music';

export type AudioCategory = 'music' | 'score' | 'ambience' | 'sfx';

export interface AudioSpec {
  readonly key: string;
  /** Folder under public/audio/ holding this moment's files. */
  readonly folder: string;
  /** Folder used instead while `folder` is empty; null for none. */
  readonly fallbackFolder: string | null;
  readonly loop: boolean;
  /** Baseline volume 0..1; fades and gains scale within it. */
  readonly volume: number;
  readonly category: AudioCategory;
}

const spec = (key: string, loop: boolean, volume: number, category: AudioCategory): AudioSpec => ({
  key,
  folder: key,
  fallbackFolder: category === 'music' ? SHARED_MUSIC_FOLDER : null,
  loop,
  volume,
  category,
});

export const audioManifest: readonly AudioSpec[] = [
  // Music beds.
  spec('music_roaming', true, 0.5, 'music'),
  spec('music_cruise', true, 0.5, 'music'),
  spec('music_vesper', true, 0.5, 'score'),
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

/** Every folder the manifest reads from, own and fallback, without repeats. */
export function audioFolders(list: readonly AudioSpec[]): string[] {
  const folders = new Set<string>();
  for (const s of list) {
    folders.add(s.folder);
    if (s.fallbackFolder !== null) folders.add(s.fallbackFolder);
  }
  return [...folders];
}

/** Content validation (fail loud at startup, like the other validators). */
export function validateAudioManifest(list: readonly AudioSpec[]): string[] {
  const problems: string[] = [];
  const keys = new Set<string>();
  const ownFolders = new Set<string>();
  /** Whether each folder feeds loops or one-shots; it cannot do both. */
  const folderLoops = new Map<string, boolean>();

  for (const s of list) {
    if (!s.key.trim()) problems.push('an audio spec has an empty key');
    if (keys.has(s.key)) problems.push(`duplicate audio key "${s.key}"`);
    keys.add(s.key);

    if (!s.folder.trim()) problems.push(`audio "${s.key}" has an empty folder`);
    if (ownFolders.has(s.folder)) problems.push(`audio folder "${s.folder}" is used twice`);
    ownFolders.add(s.folder);
    if (s.fallbackFolder !== null && !s.fallbackFolder.trim()) {
      problems.push(`audio "${s.key}" has an empty fallback folder`);
    }
    if (s.volume < 0 || s.volume > 1) problems.push(`audio "${s.key}" volume outside 0..1`);

    for (const folder of [s.folder, s.fallbackFolder]) {
      if (folder === null) continue;
      const known = folderLoops.get(folder);
      if (known !== undefined && known !== s.loop) {
        problems.push(`audio folder "${folder}" feeds both loops and one-shots`);
      }
      folderLoops.set(folder, s.loop);
    }
  }
  return problems;
}
