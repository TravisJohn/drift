import recording from './power-countdown.mp3';

/** The spoken beats are recorded on one timeline, aligned to the cabin clock. */
export class PowerCountdown {
  private readonly clip = new Audio(recording);
  private active = false;

  constructor() {
    this.clip.preload = 'auto';
    this.clip.volume = 0.75;
  }

  update(offset: number | null): void {
    if (offset === null) {
      if (this.active) this.clip.pause();
      this.active = false;
      return;
    }
    if (!this.active) {
      this.active = true;
      this.clip.currentTime = offset;
      void this.clip.play().catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        console.warn('Drift audio: could not play the cooldown announcement', error);
      });
    } else if (this.clip.readyState >= 2 && Math.abs(this.clip.currentTime - offset) > 0.25) {
      this.clip.currentTime = offset;
    }
  }
}
