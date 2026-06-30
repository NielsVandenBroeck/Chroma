import { startChroma } from './game.js';
import { startFlagle } from './flagle-game.js';

document.getElementById('btn-chroma').addEventListener('click', () => {
    startChroma();
});

document.getElementById('btn-flagle').addEventListener('click', () => {
    startFlagle();
});