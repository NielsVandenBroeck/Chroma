// =====================================================
// flagle-game.js — Flagle Game Logic
// =====================================================
// Flagle is a daily flag color-guessing game.
// Each day a country flag is shown with its guessable
// color regions blanked out (grey). The player must
// pick the correct color for each region using the
// same HSB slider picker as Chroma.
//
// Flow:
//   1. SDK ready → auth (same as Chroma, reuses token)
//   2. GET /api/flagle/daily → today's flag + played status
//   3. If already played → jump to results
//   4. Show flag with guessable regions as grey
//   5. Player picks colors one at a time (largest region first)
//   6. POST /api/flagle/score → persist, get rank
//   7. GET /api/flagle/leaderboard → show board with flag
// =====================================================

import { DiscordSDK } from "@discord/embedded-app-sdk";

// ─── CONFIG ───────────────────────────────────────

const API_BASE = sessionStorage.getItem('CHROMA_API') || '/api';
const DISCORD_CLIENT_ID = '1513482392503980063'; // Same app as Chroma

// ─── COLOR MATH ───────────────────────────────────

function hsbToHsl(h, s, b) {
    const l    = b * (1 - s / 2);
    const sHsl = (l === 0 || l === 1) ? 0 : (b - l) / Math.min(l, 1 - l);
    return `hsl(${h},${(sHsl * 100).toFixed(1)}%,${(l * 100).toFixed(1)}%)`;
}

function hsbToRgb(h, s, b) {
    const c = b * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = b - c;
    let r = 0, g = 0, bl = 0;
    if      (h < 60)  { r = c; g = x;  bl = 0;  }
    else if (h < 120) { r = x; g = c;  bl = 0;  }
    else if (h < 180) { r = 0; g = c;  bl = x;  }
    else if (h < 240) { r = 0; g = x;  bl = c;  }
    else if (h < 300) { r = x; g = 0;  bl = c;  }
    else              { r = c; g = 0;  bl = x;  }
    return { r: (r + m) * 255, g: (g + m) * 255, b: (bl + m) * 255 };
}

function rgbDistance(h1, s1, b1, h2, s2, b2) {
    const a = hsbToRgb(h1, s1, b1);
    const z = hsbToRgb(h2, s2, b2);
    return Math.sqrt((a.r - z.r) ** 2 + (a.g - z.g) ** 2 + (a.b - z.b) ** 2);
}

const MAX_DIST = Math.sqrt(3 * 255 * 255);

function calcScore(dist) {
    return Math.max(0, Math.round((1 - dist / MAX_DIST) * 1000));
}

function escHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// ─── STATE ────────────────────────────────────────

let accessToken  = null;
let discordUser  = null;
let sdk          = null;
let todayDate    = null;

// Flag data from server
let flagData     = null;  // full response from /api/flagle/daily
let guessableGroups = []; // groups the player must guess
let prefilledGroups = []; // groups shown automatically

// Game progress
let currentGroupIndex = 0; // which guessable group we're on
let guesses    = [];        // { h, s, b } per guessable group
let scores     = [];        // score per guessable group

// Picker state
let pickerH = 180, pickerS = 0.6, pickerB = 0.75;

// ─── DOM REFS ─────────────────────────────────────

const $ = (id) => document.getElementById(id);

function flagleDebug(...args) {
    console.log('[FLAGLE]', ...args);
    const el = $('flagle-debug-log');
    if (!el) return;
    const line = document.createElement('div');
    line.textContent = args.map(a =>
        typeof a === 'object' ? JSON.stringify(a) : String(a)
    ).join(' ');
    el.appendChild(line);
}

// ─── SCREEN MANAGEMENT ────────────────────────────

const flagleScreens = {
    loading:  $('flagle-loading-screen'),
    game:     $('flagle-game-screen'),
    result:   $('flagle-result-screen'),
    final:    $('flagle-final-screen'),
};

function flagleShow(name) {
    for (const [key, el] of Object.entries(flagleScreens)) {
        if (el) el.classList.toggle('active', key === name);
    }
}

// ─── FLAG SVG RENDERER ────────────────────────────

/**
 * Renders the flag SVG into the given container element.
 * Guessable groups are shown as grey (#555) with a dashed outline.
 * Pre-filled groups show their real color.
 * guessOverrides: { groupId: {h,s,b} } — real-time preview colors
 */
function renderFlag(container, flag, guessOverrides = {}) {
    if (!container || !flag) return;

    const groups = flag.colorGroups;
    const pathsHtml = groups.map(group => {
        let fillColor;
        if (!group.isGuessable) {
            // Pre-filled: show real color
            fillColor = group.color
                ? hsbToHsl(group.color.h, group.color.s, group.color.b)
                : '#888';
        } else if (guessOverrides[group.id]) {
            // Player's live guess color
            const g = guessOverrides[group.id];
            fillColor = hsbToHsl(g.h, g.s, g.b);
        } else {
            // Not yet guessed: show as grey placeholder
            fillColor = '#3a3a3a';
        }

        return group.paths.map(pathData => {
            // Detect if this is a circle (uses 'm' arc notation) vs a polygon
            const isCircle = pathData.includes(' a') || pathData.includes(' A');
            const strokeColor = (!group.isGuessable || guessOverrides[group.id])
                ? 'none'
                : 'rgba(255,255,255,0.15)';

            return `<path d="${pathData}" fill="${fillColor}" stroke="${strokeColor}" stroke-width="1"/>`;
        }).join('');
    }).join('');

    container.innerHTML = `
        <svg viewBox="${flag.viewBox}" xmlns="http://www.w3.org/2000/svg"
             style="width:100%;height:100%;display:block;border-radius:8px;">
            ${pathsHtml}
        </svg>
    `;
}

// ─── COLOR PICKER ─────────────────────────────────

function hsbToHslStr(h, s, b) {
    return hsbToHsl(h, s, b);
}

function updateFlaglePicker() {
    const flagleHandleHue = $('flagle-handle-hue');
    const flagleHandleSat = $('flagle-handle-sat');
    const flagleHandleBri = $('flagle-handle-bri');
    const flagleTrackSat  = $('flagle-track-sat');
    const flagleTrackBri  = $('flagle-track-bri');
    const flaglePreview   = $('flagle-color-preview');

    if (!flagleHandleHue) return;

    flagleHandleHue.style.top = `${(1 - pickerH / 360) * 100}%`;
    flagleHandleSat.style.top = `${(1 - pickerS) * 100}%`;
    flagleHandleBri.style.top = `${(1 - pickerB) * 100}%`;

    flagleTrackSat.style.background = `linear-gradient(to bottom,
        ${hsbToHslStr(pickerH, 1, pickerB)},
        ${hsbToHslStr(pickerH, 0, pickerB)})`;

    flagleTrackBri.style.background = `linear-gradient(to bottom,
        ${hsbToHslStr(pickerH, pickerS, 1)},
        #000)`;

    // Update the flag preview with the current picker color for the active group
    if (flagData && guessableGroups[currentGroupIndex]) {
        const activeGroup = guessableGroups[currentGroupIndex];
        const overrides = buildCurrentOverrides();
        overrides[activeGroup.id] = { h: pickerH, s: pickerS, b: pickerB };
        const flagContainer = $('flagle-flag-display');
        if (flagContainer) renderFlag(flagContainer, flagData, overrides);
    }

    // Update the picker preview swatch
    if (flaglePreview) {
        flaglePreview.style.backgroundColor = hsbToHslStr(pickerH, pickerS, pickerB);
        const rgb = hsbToRgb(pickerH, pickerS, pickerB);
        const lum = rgb.r * 0.299 + rgb.g * 0.587 + rgb.b * 0.114;
        const textColor = lum > 130 ? '#242424' : '#b5b5b5';
        const roundLabel = $('flagle-round-label');
        if (roundLabel) roundLabel.style.color = textColor;
    }
}

function buildCurrentOverrides() {
    const overrides = {};
    guesses.forEach((g, i) => {
        if (guessableGroups[i]) {
            overrides[guessableGroups[i].id] = g;
        }
    });
    return overrides;
}

function makeFlagleDraggable(trackId, onValue) {
    const track = $(trackId);
    if (!track) return;
    function drag(e) {
        const rect = track.getBoundingClientRect();
        const y    = Math.max(0, Math.min(e.clientY - rect.top, rect.height));
        onValue(1 - y / rect.height);
        updateFlaglePicker();
    }
    track.addEventListener('pointerdown', (e) => {
        track.setPointerCapture(e.pointerId);
        drag(e);
    });
    track.addEventListener('pointermove', (e) => {
        if (track.hasPointerCapture(e.pointerId)) drag(e);
    });
}

// ─── GAME FLOW ────────────────────────────────────

function startFlagleRound() {
    const group = guessableGroups[currentGroupIndex];
    if (!group) return;

    // Reset picker to neutral position
    pickerH = 180; pickerS = 0.5; pickerB = 0.7;
    updateFlaglePicker();

    // Update round label
    const roundLabel = $('flagle-round-label');
    if (roundLabel) {
        roundLabel.textContent = `${currentGroupIndex + 1} / ${guessableGroups.length}`;
    }

    // Update color group label
    const groupLabel = $('flagle-group-label');
    if (groupLabel) {
        groupLabel.textContent = group.label;
    }

    flagleShow('game');
}

function submitFlagleGuess() {
    const group  = guessableGroups[currentGroupIndex];
    const target = group.color; // revealed only after play (server sends it when alreadyPlayed)
    const guess  = { h: pickerH, s: pickerS, b: pickerB };

    // We can't score client-side (target color is hidden) — just record guess
    guesses.push(guess);

    if (currentGroupIndex < guessableGroups.length - 1) {
        currentGroupIndex++;
        startFlagleRound();
    } else {
        // All groups guessed — submit to server
        submitAllGuesses();
    }
}

async function submitAllGuesses() {
    flagleShow('loading');
    $('flagle-loading-label').textContent = 'Scoring your guesses...';

    try {
        // POST to server — server validates against real colors we never sent client-side
        const result = await apiFlaglePost('/flagle/score', {
            guesses,
            channelId: sdk?.channelId ?? null,
        });

        // Server returns { ok, scores, total, rank, totalPlayers, flagName, colorGroups }
        scores = result.scores;
        const total = result.total;

        // Server also returns the actual color groups with target colors now revealed
        if (result.colorGroups) {
            flagData.colorGroups = result.colorGroups;
            // Rebuild guessable groups with revealed colors
            guessableGroups = flagData.colorGroups.filter(g => g.isGuessable);
        }

        showFlagleResults(result);
    } catch (err) {
        flagleDebug('Score submit error:', err.message);
        // Fall back to showing results without server scores
        showFlagleResults({ scores: [], total: 0, rank: null });
    }
}

function showFlagleResults(result) {
    const resultsContainer = $('flagle-results-container');
    if (!resultsContainer) return;

    const total    = result.total ?? 0;
    const maxScore = guessableGroups.length * 1000;
    const pct      = maxScore > 0 ? (total / maxScore * 100).toFixed(1) : '0.0';

    // Render the completed flag
    const completedFlag = $('flagle-completed-flag');
    if (completedFlag && flagData) {
        const allOverrides = {};
        guessableGroups.forEach((group, i) => {
            allOverrides[group.id] = guesses[i];
        });
        renderFlag(completedFlag, flagData, allOverrides);
    }

    // Render the perfect flag for comparison
    const perfectFlag = $('flagle-perfect-flag');
    if (perfectFlag && flagData) {
        const perfectOverrides = {};
        guessableGroups.forEach(group => {
            if (group.color) perfectOverrides[group.id] = group.color;
        });
        renderFlag(perfectFlag, flagData, perfectOverrides);
    }

    // Score breakdown
    const breakdown = $('flagle-score-breakdown');
    if (breakdown) {
        breakdown.innerHTML = guessableGroups.map((group, i) => {
            const score    = result.scores?.[i] ?? 0;
            const pctBar   = (score / 1000 * 100).toFixed(0);
            const target   = group.color;
            const guess    = guesses[i];
            const tColor   = target ? hsbToHslStr(target.h, target.s, target.b) : '#555';
            const gColor   = guess  ? hsbToHslStr(guess.h, guess.s, guess.b)   : '#555';
            return `
                <div class="flagle-brow">
                    <div class="flagle-color-pair">
                        <div class="flagle-swatch-pair">
                            <div class="flagle-swatch" style="background:${gColor}" title="Your guess"></div>
                            <div class="flagle-swatch" style="background:${tColor}" title="Target"></div>
                        </div>
                        <span class="flagle-group-name">${escHtml(group.label)}</span>
                    </div>
                    <div class="flagle-bbar">
                        <div class="flagle-bfill" style="width:${pctBar}%"></div>
                    </div>
                    <span class="flagle-bscore">${(score/100).toFixed(1)}</span>
                </div>
            `;
        }).join('');
        // Trigger animation after a frame
        requestAnimationFrame(() => {
            document.querySelectorAll('.flagle-bfill').forEach(el => {
                el.style.transition = 'width 0.9s cubic-bezier(0.4,0,0.2,1)';
            });
        });
    }

    // Show rank
    const rankEl = $('flagle-rank-display');
    if (rankEl && result.rank) {
        rankEl.textContent = `You ranked #${result.rank} of ${result.totalPlayers} players`;
    }

    $('flagle-total-score').textContent = `${(total/100).toFixed(1)} / ${(maxScore/100).toFixed(1)}`;
    $('flagle-flag-name-reveal').textContent = `Today's flag: ${flagData?.flagName ?? ''}`;

    flagleShow('result');
    loadFlagleLeaderboard(total, result.scores ?? []);
}

// ─── LEADERBOARD ──────────────────────────────────

async function loadFlagleLeaderboard(myTotal, myScores) {
    const boardContainer = $('flagle-final-board');
    if (!boardContainer) return;

    let boardData = [];
    let flagName  = flagData?.flagName ?? '';

    try {
        const data = await apiFlagleGet('/flagle/leaderboard');
        boardData  = data.board;
        flagName   = data.flagName ?? flagName;
    } catch (err) {
        flagleDebug('Leaderboard load failed:', err.message);
        boardData = [{
            rank: 1,
            userId: discordUser?.id || 'me',
            username: discordUser?.username || 'YOU',
            avatar: discordUser?.avatar || null,
            total: myTotal,
            scores: myScores,
            isMe: true,
        }];
    }

    const sub = $('flagle-results-sub');
    if (sub) {
        if (boardData.length > 1) {
            const diff = boardData[0].total - (boardData[1]?.total ?? 0);
            if (diff < 200) {
                sub.textContent = `${boardData[0].username} barely edged it out on ${flagName}.`;
            } else {
                sub.textContent = `${boardData[0].username} dominated the ${flagName} palette today.`;
            }
        } else {
            sub.textContent = "You're the first to play Flagle today!";
        }
    }

    boardContainer.innerHTML = boardData.map(r => {
        const maxScore = (r.scores?.length ?? guessableGroups.length) * 1000;
        const formatted = maxScore > 0 ? (r.total / (maxScore / 10)).toFixed(1) : '0.0';
        const isWinner  = r.rank === 1;
        const avatarHtml = r.avatar
            ? `<img class="rc-avatar" src="https://cdn.discordapp.com/avatars/${r.userId}/${r.avatar}.png?size=32" alt="" />`
            : `<div class="rc-avatar"></div>`;
        const winnerBadge = isWinner ? `<span class="rc-winner-badge">winner</span>` : '';

        let rankIcon = `${r.rank}.`;
        if (r.rank === 1) rankIcon = '🥇';
        if (r.rank === 2) rankIcon = '🥈';
        if (r.rank === 3) rankIcon = '🥉';

        return `
            <div class="result-card ${r.isMe ? 'is-me' : ''}">
                <div class="rc-header">
                    <div class="rc-user-info">
                        <span class="rc-rank">${rankIcon}</span>
                        ${avatarHtml}
                        <span class="rc-name">${escHtml(r.username)}</span>
                        ${winnerBadge}
                    </div>
                    <div class="rc-score-wrap">
                        <span class="rc-score">${formatted}</span>
                        <span class="rc-score-max"> / 10</span>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// ─── API HELPERS ──────────────────────────────────

async function apiFlagleGet(path) {
    const res = await fetch(`${API_BASE}${path}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) throw new Error(`GET ${path} → ${res.status}`);
    return res.json();
}

async function apiFlaglePost(path, body) {
    const res = await fetch(`${API_BASE}${path}`, {
        method:  'POST',
        headers: {
            'Content-Type':  'application/json',
            Authorization:   `Bearer ${accessToken}`,
        },
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`POST ${path} → ${res.status}: ${text}`);
    }
    return res.json();
}

// ─── ALREADY PLAYED ───────────────────────────────

async function renderFlagleAlreadyPlayed(previousResult) {
    // Load leaderboard to show results
    await loadFlagleLeaderboard(previousResult.total, previousResult.scores ?? []);
    // Show the result screen with previous data
    showFlagleResults({
        scores: previousResult.scores ?? [],
        total:  previousResult.total,
        rank:   null, // will be filled by leaderboard
    });
}

// ─── BOOTSTRAP ────────────────────────────────────

async function flagleBootstrap() {
    flagleShow('loading');

    try {
        flagleDebug('Starting Flagle bootstrap');

        // Reuse same Discord SDK & token as Chroma if available (same page)
        // Otherwise, init fresh
        if (!window.__chromaAccessToken) {
            sdk = new DiscordSDK(DISCORD_CLIENT_ID);
            await sdk.ready();

            const auth = await sdk.commands.authorize({
                client_id: DISCORD_CLIENT_ID,
                response_type: 'code',
                state: '',
                prompt: 'none',
                scope: ['identify', 'guilds.members.read'],
            });

            const tokenResponse = await fetch(`${API_BASE}/token`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code: auth.code }),
            });
            const tokenData = await tokenResponse.json();
            accessToken = tokenData.access_token;

            await sdk.commands.authenticate({ access_token: accessToken });
        } else {
            // Piggyback on Chroma's already-authenticated session
            accessToken = window.__chromaAccessToken;
            sdk         = window.__chromaSdk;
        }

        flagleDebug('Auth complete. Loading daily flag...');

        const daily = await apiFlagleGet('/flagle/daily');
        flagData    = daily;
        discordUser = daily.user;
        todayDate   = daily.date;

        guessableGroups = daily.colorGroups.filter(g => g.isGuessable);
        prefilledGroups = daily.colorGroups.filter(g => !g.isGuessable);

        flagleDebug(`Flag: ${daily.flagName}, guessable groups: ${guessableGroups.length}`);

        // Update the flag name display
        const nameEl = $('flagle-country-name');
        if (nameEl) nameEl.textContent = '???'; // hidden until reveal

        // Initial render with blanked regions
        const flagContainer = $('flagle-flag-display');
        if (flagContainer) renderFlag(flagContainer, daily, {});

        if (daily.alreadyPlayed && daily.previousResult) {
            flagleDebug('Already played today. Showing results.');
            await renderFlagleAlreadyPlayed(daily.previousResult);
        } else {
            currentGroupIndex = 0;
            guesses = [];
            scores  = [];
            startFlagleRound();
        }

    } catch (err) {
        flagleDebug('BOOTSTRAP FAILED:', err.message);
        const label = $('flagle-loading-label');
        if (label) label.textContent = 'Failed to connect. Please refresh.';
    }
}

// ─── WIRE UP EVENTS ───────────────────────────────

function initFlagleEvents() {
    // Submit guess button
    const submitBtn = $('flagle-submit-btn');
    if (submitBtn) submitBtn.addEventListener('click', submitFlagleGuess);

    // Sliders
    makeFlagleDraggable('flagle-track-hue', (v) => { pickerH = v * 360; });
    makeFlagleDraggable('flagle-track-sat', (v) => { pickerS = v; });
    makeFlagleDraggable('flagle-track-bri', (v) => { pickerB = v; });

    // Init picker display
    updateFlaglePicker();
}

// ─── INIT ─────────────────────────────────────────

// Run when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        initFlagleEvents();
        flagleBootstrap();
    });
} else {
    initFlagleEvents();
    flagleBootstrap();
}
