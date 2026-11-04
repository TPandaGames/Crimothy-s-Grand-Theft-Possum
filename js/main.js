import { Game } from './game.js';

window.addEventListener('DOMContentLoaded', () => {
  window.game = new Game();

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
});
