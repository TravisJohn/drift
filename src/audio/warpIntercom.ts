import departure from './warp-depart.mp3';
import arrival from './warp-arrive.mp3';

/** Bundled cabin-speaker recordings use the same voice as the power countdown. */
export class WarpIntercom {
  private readonly clips = { departed: new Audio(departure), arrived: new Audio(arrival) };
  private active: HTMLAudioElement | null = null;

  constructor() {
    for (const clip of Object.values(this.clips)) {
      clip.preload = 'auto';
      clip.volume = 0.85;
    }
  }

  play(cue: keyof WarpIntercom['clips']): void {
    this.active?.pause();
    this.active = this.clips[cue];
    this.active.currentTime = 0;
    this.resume();
  }

  resume(): void {
    if (this.active && !this.active.ended) {
      void this.active.play().catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        console.warn('Drift audio: could not play the warp announcement', error);
      });
    }
  }

  pause(): void {
    this.active?.pause();
  }

  stop(): void {
    this.pause();
    this.active = null;
  }
}
