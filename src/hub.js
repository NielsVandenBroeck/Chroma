import { startChroma } from './game.js';

// Game registry: Add new games here
const GAMES = {
    chroma: { name: 'Chroma', start: startChroma }
};

// Initialize game launcher
function initGameHub() {
    const menuScreen = document.getElementById('menu-screen');
    const hubButtons = document.querySelector('.hub-buttons');

    if (!menuScreen || !hubButtons) return;

    // Clear existing buttons and recreate from registry
    hubButtons.innerHTML = '';

    for (const [gameId, game] of Object.entries(GAMES)) {
        const btn = document.createElement('button');
        btn.id = `btn-${gameId}`;
        btn.className = 'cta-btn';
        btn.textContent = `Play ${game.name}`;
        btn.addEventListener('click', game.start);
        hubButtons.appendChild(btn);
    }
}

// Auto-init when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initGameHub);
} else {
    initGameHub();
}