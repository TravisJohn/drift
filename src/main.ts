/**
 * Entry point: bootstraps the Game into the #app container.
 */
import { Game } from './game';

function bootstrap(): void {
  const container = document.getElementById('app');
  if (!container) {
    // Explicit failure beats a silent black page.
    throw new Error('Drift: #app container not found in index.html');
  }
  const game = new Game(container);
  game.start();

  if (import.meta.env.DEV) {
    // Dev-only handle so tooling can inspect live state from the console.
    (window as unknown as Record<string, unknown>).__drift = game;
  }
}

bootstrap();
