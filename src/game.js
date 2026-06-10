// =====================================================
// CHROMA — Game Logic + Discord Activity Integration
// =====================================================
// The Discord Embedded App SDK normalises the iframe
// environment and gives us the OAuth2 code we need to
// authenticate the player server-side.
//
// Flow:
//   1. SDK ready → exchange code for access_token via /api/token
//   2. GET /api/daily → fetch today's colors + user info
//   3. If already played → jump straight to final screen
//   4. Play the game locally (same as before)
//   5. POST /api/score → persist result, get leaderboard rank
//   6. GET /api/leaderboard → show today's full board
// =====================================================
let cachedToken = null;
window.addEventListener('error', (e) => {
    debug('WINDOW ERROR:', e.message);
});

window.addEventListener('unhandledrejection', (e) => {
    debug('PROMISE REJECTION:',
        e.reason?.message || String(e.reason));
});

function debug(...args) {
    console.log('[CHROMA]', ...args);

    const el = document.getElementById('debug-log');
    if (!el) return;

    const line = document.createElement('div');
    line.textContent = args.map(a =>
        typeof a === 'object' ? JSON.stringify(a) : String(a)
    ).join(' ');

    el.appendChild(line);
}

import { DiscordSDK } from "@discord/embedded-app-sdk";

// ─── CONFIG ───────────────────────────────────────────────────────────────────

// Set this to your deployed backend URL.
// During development with a tunnel (e.g. ngrok) you can override via:
//   sessionStorage.setItem('CHROMA_API', 'https://your-tunnel.ngrok.io')
const API_BASE = sessionStorage.getItem('CHROMA_API') || '/api';

const DISCORD_CLIENT_ID = '1513482392503980063';

// ─── COLOR MATH ───────────────────────────────────────────────────────────────

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

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const ROUNDS       = 5;
const MEMORIZE_SEC = 5;
const CIRC         = 2 * Math.PI * 42;

// ─── GAME STATE ───────────────────────────────────────────────────────────────

let game = {
    round:       0,
    targets:     [],   // fetched from server
    guesses:     [],
    scores:      [],
};

let accessToken = null;  // Discord OAuth2 access token
let discordUser = null;  // { id, username, avatar }
let todayDate   = null;  // 'YYYY-MM-DD' string from server

let pickerH = 180, pickerS = 0.6, pickerB = 0.75;
let rafId   = null;

// ─── DOM REFS ─────────────────────────────────────────────────────────────────

const $ = (id) => document.getElementById(id);

const screens = {
    loading:  $('loading-screen'),
    start:    $('start-screen'),
    memorize: $('memorize-screen'),
    guess:    $('guess-screen'),
    result:   $('result-screen'),
    final:    $('final-screen'),
};

const trackHue  = $('track-hue'),  handleHue = $('handle-hue');
const trackSat  = $('track-sat'),  handleSat = $('handle-sat');
const trackBri  = $('track-bri'),  handleBri = $('handle-bri');
const colorPreview = $('color-preview');
const ring         = $('c-ring');
const countdownNum = $('countdown-num');
const activeLabel  = $('active-slider-label');
const previewRound = $('preview-round');

// ─── SCREEN SWITCHING ─────────────────────────────────────────────────────────

function show(name) {
    for (const [key, el] of Object.entries(screens)) {
        el.classList.toggle('active', key === name);
    }
}

// ─── COLOR PICKER ─────────────────────────────────────────────────────────────

function updatePicker() {
    handleHue.style.top = `${(1 - pickerH / 360) * 100}%`;
    handleSat.style.top = `${(1 - pickerS) * 100}%`;
    handleBri.style.top = `${(1 - pickerB) * 100}%`;

    trackSat.style.background = `linear-gradient(to bottom,
        ${hsbToHsl(pickerH, 1, pickerB)},
        ${hsbToHsl(pickerH, 0, pickerB)})`;

    trackBri.style.background = `linear-gradient(to bottom,
        ${hsbToHsl(pickerH, pickerS, 1)},
        #000)`;

    colorPreview.style.backgroundColor = hsbToHsl(pickerH, pickerS, pickerB);

    const rgb       = hsbToRgb(pickerH, pickerS, pickerB);
    const luminance = (rgb.r * 0.299 + rgb.g * 0.587 + rgb.b * 0.114);
    const textColor = luminance > 130 ? '#242424' : '#b5b5b5';

    activeLabel.style.color  = textColor;
    previewRound.style.color = textColor;
}

function makeDraggable(track, labelName, onValue) {
    function drag(e) {
        const rect = track.getBoundingClientRect();
        const y    = Math.max(0, Math.min(e.clientY - rect.top, rect.height));
        onValue(1 - y / rect.height);
        updatePicker();
    }
    track.addEventListener('pointerdown', (e) => {
        track.setPointerCapture(e.pointerId);
        activeLabel.textContent = labelName;
        activeLabel.style.opacity = '1';
        drag(e);
    });
    track.addEventListener('pointermove', (e) => {
        if (track.hasPointerCapture(e.pointerId)) drag(e);
    });
    track.addEventListener('pointerup', () => {
        activeLabel.style.opacity = '0';
    });
}

makeDraggable(trackHue, 'HUE',        (v) => { pickerH = v * 360; });
makeDraggable(trackSat, 'SATURATION', (v) => { pickerS = v; });
makeDraggable(trackBri, 'BRIGHTNESS', (v) => { pickerB = v; });

// ─── COUNTDOWN ────────────────────────────────────────────────────────────────

function startCountdown(onEnd) {
    if (rafId) cancelAnimationFrame(rafId);

    ring.style.transition    = 'none';
    ring.style.strokeDashoffset = '0';
    ring.offsetHeight;

    const t0  = performance.now();
    const dur = MEMORIZE_SEC * 1000;

    function frame(now) {
        const pct = Math.min((now - t0) / dur, 1);
        ring.style.strokeDashoffset = String(CIRC * pct);
        countdownNum.textContent = Math.ceil(MEMORIZE_SEC * (1 - pct)) || '0';
        if (pct < 1) {
            rafId = requestAnimationFrame(frame);
        } else {
            rafId = null;
            onEnd();
        }
    }

    rafId = requestAnimationFrame(frame);
}

// ─── GAME FLOW ────────────────────────────────────────────────────────────────

function startGame() {
    game = { round: 0, targets: [...dailyTargets], guesses: [], scores: [] };
    doRound();
}

function doRound() {
    const t = game.targets[game.round];
    $('mem-swatch').style.backgroundColor = hsbToHsl(t.h, t.s, t.b);
    $('mem-round-num').textContent         = game.round + 1;
    show('memorize');

    setTimeout(() => {
        startCountdown(() => {
            pickerH = 180; pickerS = 0.5; pickerB = 0.7;
            updatePicker();
            $('guess-round-num').textContent = game.round + 1;
            show('guess');
        });
    }, 460);
}

function submitGuess() {
    const guess  = { h: pickerH, s: pickerS, b: pickerB };
    const target = game.targets[game.round];
    const dist   = rgbDistance(target.h, target.s, target.b, guess.h, guess.s, guess.b);
    const score  = calcScore(dist);

    game.guesses.push(guess);
    game.scores.push(score);

    $('res-round-num').textContent              = game.round + 1;
    $('orig-swatch').style.backgroundColor      = hsbToHsl(target.h, target.s, target.b);
    $('guess-swatch').style.backgroundColor     = hsbToHsl(guess.h,  guess.s,  guess.b);
    $('orig-hsb').textContent                   = `H${Math.round(target.h)} S${Math.round(target.s * 100)} B${Math.round(target.b * 100)}`;
    $('guess-hsb').textContent                  = `H${Math.round(guess.h)} S${Math.round(guess.s * 100)} B${Math.round(guess.b * 100)}`;
    $('btn-continue-text').textContent          = (game.round === ROUNDS - 1) ? 'See Results' : 'Next Round';

    show('result');
    animateCount($('round-pts'), 0, score, 700);
}

async function showFinal() {
    const total = game.scores.reduce((a, b) => a + b, 0);

    // ── Persist to server ──────────────────────────────
    try {
        // We now include game.guesses in the payload!
        await apiPost('/score', { scores: game.scores, guesses: game.guesses, total });
    } catch (err) {
        console.warn('[chroma] Score submit failed:', err.message);
    }

    renderFinal({ total, scores: game.scores, guesses: game.guesses });
}

function renderFinal({ total, scores, guesses }) {
    show('final');
    loadLeaderboard(total, scores, guesses);
}

function renderAlreadyPlayed({ total, scores, guesses }) {
    game.targets = [...dailyTargets];
    game.scores  = scores;
    // Use server guesses if available, otherwise use placeholders
    game.guesses = guesses || dailyTargets.map(() => ({ h: 0, s: 0, b: 0 }));
    show('final');
    loadLeaderboard(total, scores, game.guesses);
}

// ─── LEADERBOARD ──────────────────────────────────────────────────────────────

async function loadLeaderboard(myTotal, myScores, myGuesses) {
    const boardContainer = $('results-board');

    let boardData = [];
    try {
        const data = await apiGet('/leaderboard');
        boardData = data.board;
    } catch (err) {
        console.warn('[chroma] Leaderboard load failed:', err.message);
        boardData = [{
            rank: 1,
            userId: discordUser?.id || 'me',
            username: discordUser?.username || 'YOU',
            avatar: discordUser?.avatar || null,
            total: myTotal,
            isMe: true,
            scores: myScores,
            targets: game.targets,
            guesses: myGuesses
        }];
    }

    boardData = boardData.map(r => {
        if (r.isMe) {
            r.scores = myScores || r.scores;
            r.targets = game.targets || r.targets;

            // Only apply local guesses if they aren't the black placeholders
            const isPlaceholder = myGuesses && myGuesses.every(g => g.h === 0 && g.s === 0 && g.b === 0);
            if (myGuesses && !isPlaceholder) {
                r.guesses = myGuesses;
            }
        }
        return r;
    });

    const subTitleEl = $('results-sub');
    if (boardData.length > 1) {
        const diff = boardData[0].total - boardData[1].total;
        if (diff < 200) {
            subTitleEl.textContent = `This one came down to the wire. ${boardData[0].username} barely pulled it off.`;
        } else if (diff < 600) {
            subTitleEl.textContent = `A solid win for ${boardData[0].username}. Well played!`;
        } else {
            subTitleEl.textContent = `${boardData[0].username} completely dominated today's palette.`;
        }
    } else {
        subTitleEl.textContent = "You're the first to play today. Check back later to see how you rank!";
    }

    boardContainer.innerHTML = boardData.map((r) => {
        const totalFormatted = (r.total / 100).toFixed(2);
        const isWinner = r.rank === 1;

        const pScores = r.scores || Array(5).fill(0);
        const pTargets = r.targets || game.targets || Array(5).fill({h:0, s:0, b:0});
        const pGuesses = r.guesses || Array(5).fill({h:0, s:0, b:0});

        const swatchesHtml = pScores.map((score, idx) => {
            const roundScore = (score / 100).toFixed(2);
            const t = pTargets[idx];
            let g = pGuesses[idx];

            // FIX: If the guess is missing or is the pure black placeholder, approximate it from the score
            if (!g || (g.h === 0 && g.s === 0 && g.b === 0)) {
                if (t) {
                    const error = 1 - (score / 1000); // 0 (perfect) to 1 (terrible)
                    g = {
                        h: (t.h + (error * 45)) % 360, // Shift hue slightly based on error
                        s: Math.max(0, Math.min(1, t.s - (error * 0.5))), // Desaturate
                        b: Math.max(0, Math.min(1, t.b - (error * 0.3)))  // Darken
                    };
                } else {
                    g = { h: 0, s: 0, b: 0.2 }; // Dark grey fallback if target is missing
                }
            }

            const tColor = t ? hsbToHsl(t.h, t.s, t.b) : '#333';
            const gColor = g ? hsbToHsl(g.h, g.s, g.b) : '#333';

            return `
                <div class="rc-swatch" style="background: linear-gradient(to top left, ${gColor} 0%, ${gColor} 50%, ${tColor} 50%, ${tColor} 100%);">
                    <span class="rc-swatch-score">${roundScore}</span>
                </div>
            `;
        }).join('');

        const avatarHtml = r.avatar
            ? `<img class="rc-avatar" src="https://cdn.discordapp.com/avatars/${r.userId}/${r.avatar}.png?size=32" alt="" />`
            : `<div class="rc-avatar"></div>`;

        const winnerBadge = isWinner ? `<span class="rc-winner-badge">winner</span>` : '';

        return `
            <div class="result-card ${r.isMe ? 'is-me' : ''}">
                <div class="rc-header">
                    <div class="rc-user-info">
                        <span class="rc-rank">${r.rank}.</span>
                        ${avatarHtml}
                        <span class="rc-name">${escHtml(r.username)}</span>
                        ${winnerBadge}
                    </div>
                    <div class="rc-score-wrap">
                        <span class="rc-score">${totalFormatted}</span><span class="rc-score-max">/50</span>
                    </div>
                </div>
                <div class="rc-swatches">
                    ${swatchesHtml}
                </div>
            </div>
        `;
    }).join('');
}

// ─── API HELPERS ──────────────────────────────────────────────────────────────

async function apiGet(path) {
    const res = await fetch(`${API_BASE}${path}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) throw new Error(`GET ${path} → ${res.status}`);
    return res.json();
}

async function apiPost(path, body) {
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

// ─── DISCORD SDK BOOTSTRAP ────────────────────────────────────────────────────

let dailyTargets = []; // filled by /api/daily

async function bootstrap() {
    show('loading');

    try {
        debug('Starting bootstrap');
        debug('Client ID:', DISCORD_CLIENT_ID);

        const sdk = new DiscordSDK(DISCORD_CLIENT_ID);

        debug('SDK created');
        await sdk.ready();
        debug('SDK ready');

        // ─── 1. CHECK FOR CACHED TOKEN ──────────────────────────────
        const storedToken = cachedToken
        let isAuthenticated = false;

        if (storedToken) {
            try {
                debug('Found stored token, attempting fast auth...');
                await sdk.commands.authenticate({ access_token: storedToken });
                accessToken = storedToken;
                isAuthenticated = true;
                debug('SDK authenticated via cached token!');
            } catch (err) {
                cachedToken = null;
                debug('Stored token expired or invalid. Clearing cache.');
            }
        }

        // ─── 2. FULL AUTH FLOW (IF NO VALID CACHE) ──────────────────
        if (!isAuthenticated) {
            debug('Calling authorize');

            const auth = await sdk.commands.authorize({
                client_id: DISCORD_CLIENT_ID,
                response_type: 'code',
                state: '',
                prompt: 'none', // Changed back to 'none' for smooth silent auth
                scope: [
                    'identify',
                    'guilds.members.read'
                ]
            });

            debug('Authorize success');
            const code = auth.code;

            debug('Requesting token');
            const tokenResponse = await fetch(`${API_BASE}/token`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ code })
            });

            debug('Token status:', tokenResponse.status);
            const tokenData = await tokenResponse.json();

            accessToken = tokenData.access_token;

            cachedToken = accessToken;
            debug('Token received and cached');

            debug('Authenticating SDK');
            await sdk.commands.authenticate({
                access_token: accessToken
            });
            debug('SDK authenticated via new token');
        }

        // ─── 3. RESUME NORMAL BOOTSTRAP ─────────────────────────────
        debug('Loading daily');
        const daily = await apiGet('/daily');
        debug('Daily loaded');

        dailyTargets = daily.colors;
        todayDate = daily.date;
        discordUser = daily.user;

        debug('Finished bootstrap');

        // ─── 4. ROUTE PLAYER BASED ON PLAY STATUS ───────────────────
        if (daily.alreadyPlayed && daily.previousResult) {
            debug('User already played today. Jumping to results.');
            // This calls the helper function you already wrote!
            renderAlreadyPlayed(daily.previousResult);
        } else {
            debug('New game. Showing start screen.');
            show('start');
        }

    } catch (err) {
        debug('BOOTSTRAP FAILED');
        debug(err.message);

        if (err.stack) {
            debug(err.stack);
        }

        console.error(err);
    }
}

function randomTarget() {
    return {
        h: Math.random() * 360,
        s: 0.45 + Math.random() * 0.55,
        b: 0.40 + Math.random() * 0.60,
    };
}

// ─── UTILITY ──────────────────────────────────────────────────────────────────

function animateCount(el, from, to, ms) {
    const t0 = performance.now();
    (function tick(now) {
        const t    = Math.min((now - t0) / ms, 1);
        const ease = 1 - Math.pow(1 - t, 3);
        el.textContent = Math.round(from + (to - from) * ease);
        if (t < 1) requestAnimationFrame(tick);
    })(t0);
}

function escHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// ─── EVENTS ───────────────────────────────────────────────────────────────────

$('btn-play').addEventListener('click', startGame);
$('btn-submit-guess').addEventListener('click', submitGuess);

$('btn-continue').addEventListener('click', () => {
    game.round++;
    if (game.round < ROUNDS) doRound();
    else showFinal();
});

// ─── BOOT ─────────────────────────────────────────────────────────────────────

updatePicker();
bootstrap();