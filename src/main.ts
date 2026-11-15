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
}

bootstrap();
