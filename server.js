// =====================================================
// server.js — Chroma + Flagle Discord Activity Backend
// =====================================================
// Discord Activities run inside an iframe on discord.com.
// The client SDK gives us a short-lived `code` which we
// exchange for an access_token here (server-side, so our
// client_secret never leaves this process).
//
// Chroma Endpoints:
//   POST /api/token           — Discord OAuth2 token exchange
//   GET  /api/daily           — Today's colors + played status
//   POST /api/score           — Submit completed Chroma game score
//   GET  /api/leaderboard     — Today's Chroma leaderboard (top 50)
//
// Flagle Endpoints:
//   GET  /api/flagle/daily    — Today's flag + played status
//   POST /api/flagle/score    — Submit completed Flagle score
//   GET  /api/flagle/leaderboard — Today's Flagle leaderboard (top 50)
//
//   GET  /api/ping            — Health check
// =====================================================

require('dotenv').config();
const moment = require('moment-timezone');
const path = require('path');
const express = require('express');
const cors    = require('cors');
const db      = require('./db');
const { FLAGS } = require('./flag-data');

const bot = require('./bot.js');

const app = express();

app.use((req, res, next) => {
    res.setHeader(
        "Content-Security-Policy",
        [
            "frame-ancestors https://discord.com https://*.discord.com https://*.discordsays.com",
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
            "font-src 'self' https://fonts.gstatic.com data:",
            "img-src 'self' data: https:",
            "connect-src 'self' https: wss:",
        ].join("; ")
    );
    next();
});

const PORT = process.env.PORT || 3000;

// ─── MIDDLEWARE ───────────────────────────────────

app.use(cors({
    origin: true,
    credentials: true,
}));
app.use(express.json());

app.use(express.static(path.join(__dirname, 'dist')));
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

db.init().then(() => {
    app.listen(PORT, () => {
        console.log(`[server] Chroma + Flagle backend listening on :${PORT}`);
        scheduleMidnightSeed();
        bot.startBot(); // Boot up the chat bot alongside the API
    });
}).catch((err) => {
    console.error('[server] Failed to init DB:', err);
    process.exit(1);
});

// ─── HELPERS ──────────────────────────────────────

/** Today's date string in Belgium timezone */
function todayUTC() {
    return moment.tz('Europe/Brussels').format('YYYY-MM-DD');
}

/**
 * Fetch the Discord user associated with an access_token.
 */
async function fetchDiscordUser(accessToken) {
    const res = await fetch('https://discord.com/api/v10/users/@me', {
        headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Discord /users/@me error ${res.status}: ${text}`);
    }
    return res.json();
}

/**
 * Validate Chroma scores array.
 */
function validateScores(scores) {
    if (!Array.isArray(scores) || scores.length !== 5) return false;
    return scores.every(
        (s) => typeof s === 'number' && Number.isFinite(s) && s >= 0 && s <= 1000
    );
}

/**
 * Validate Flagle scores array (1 score per guessable color group, up to 3).
 */
function validateFlagleScores(scores) {
    if (!Array.isArray(scores) || scores.length < 1 || scores.length > 3) return false;
    return scores.every(
        (s) => typeof s === 'number' && Number.isFinite(s) && s >= 0 && s <= 1000
    );
}

function extractBearer(req) {
    const h = req.headers.authorization;
    if (!h || !h.startsWith('Bearer ')) return null;
    return h.slice(7);
}


// ─── COLOR MATH (server-side, mirrors client) ─────

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

function rgbDistanceHsb(h1, s1, b1, h2, s2, b2) {
    const a = hsbToRgb(h1, s1, b1);
    const z = hsbToRgb(h2, s2, b2);
    return Math.sqrt((a.r - z.r) ** 2 + (a.g - z.g) ** 2 + (a.b - z.b) ** 2);
}

const MAX_RGB_DIST = Math.sqrt(3 * 255 * 255);

function calcFlagleScore(dist) {
    return Math.max(0, Math.round((1 - dist / MAX_RGB_DIST) * 1000));
}

// ─── SHARED ROUTES ────────────────────────────────

/**
 * GET /api/ping
 */
app.get('/api/ping', (_req, res) => {
    res.json({ ok: true, ts: new Date().toISOString() });
});

/**
 * POST /api/token
 */
app.post('/api/token', async (req, res) => {
    const { code } = req.body;
    if (!code || typeof code !== 'string') {
        return res.status(400).json({ error: 'Missing code' });
    }

    try {
        const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id:     process.env.DISCORD_CLIENT_ID,
                client_secret: process.env.DISCORD_CLIENT_SECRET,
                grant_type:    'authorization_code',
                code,
            }),
        });

        if (!tokenRes.ok) {
            const text = await tokenRes.text();
            console.error('[token] Discord exchange failed:', text);
            return res.status(502).json({ error: 'Token exchange failed' });
        }

        const tokenData = await tokenRes.json();
        res.json({ access_token: tokenData.access_token });
    } catch (err) {
        console.error('[token] Unexpected error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ─── CHROMA ROUTES ────────────────────────────────

/**
 * GET /api/daily
 */
app.get('/api/daily', async (req, res) => {
    const token = extractBearer(req);
    if (!token) return res.status(401).json({ error: 'Unauthorised' });

    try {
        const user    = await fetchDiscordUser(token);
        const dateStr = todayUTC();
        const colors  = db.getTodayColors(dateStr);
        const played  = db.hasPlayed(dateStr, user.id);

        res.json({
            date:       dateStr,
            colors,
            alreadyPlayed:   !!played,
            previousResult:  played ?? null,
            user: {
                id:       user.id,
                username: user.global_name ?? user.username,
                avatar:   user.avatar,
            },
        });
    } catch (err) {
        console.error('[daily] Error:', err.message);
        res.status(502).json({ error: 'Failed to fetch user from Discord' });
    }
});

/**
 * POST /api/score
 */
app.post('/api/score', async (req, res) => {
    const token = extractBearer(req);
    if (!token) return res.status(401).json({ error: 'Unauthorised' });

    const { scores, total, channelId } = req.body;

    console.log(`[score] Score submitted. channelId received from frontend:`, channelId);
    if (!validateScores(scores)) {
        return res.status(400).json({ error: 'Invalid scores array' });
    }

    const expectedTotal = scores.reduce((a, b) => a + b, 0);
    if (Math.round(total) !== Math.round(expectedTotal)) {
        return res.status(400).json({ error: 'Total does not match scores' });
    }

    try {
        const user    = await fetchDiscordUser(token);
        const dateStr = todayUTC();

        const result = db.saveScore({
            dateStr,
            userId:   user.id,
            username: user.global_name ?? user.username,
            avatar:   user.avatar ?? null,
            scores,
            total:    Math.round(total),
        });

        if (!result.inserted) {
            return res.status(409).json({
                error:    'Already submitted today',
                existing: result.existing,
            });
        }

        if (channelId) {
            bot.sendLeaderboardToChannel(
                channelId,
                `@${user.global_name ?? user.username} was playing Chroma!`
            );
        }

        const board = db.getLeaderboard(dateStr);
        const rank  = board.findIndex((r) => r.userId === user.id) + 1;

        res.json({ ok: true, rank, totalPlayers: board.length });
    } catch (err) {
        console.error('[score] Error:', err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * GET /api/leaderboard
 */
app.get('/api/leaderboard', async (req, res) => {
    const token = extractBearer(req);
    if (!token) return res.status(401).json({ error: 'Unauthorised' });

    const dateStr = typeof req.query.date === 'string'
        ? req.query.date
        : todayUTC();

    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        return res.status(400).json({ error: 'Invalid date format' });
    }

    try {
        const user  = await fetchDiscordUser(token);
        const board = db.getLeaderboard(dateStr);

        res.json({
            date:  dateStr,
            board: board.map((r, i) => ({
                rank:     i + 1,
                userId:   r.userId,
                username: r.username,
                avatar:   r.avatar,
                total:    r.total,
                scores:   r.scores,
                isMe:     r.userId === user.id,
            })),
        });
    } catch (err) {
        console.error('[leaderboard] Error:', err.message);
        res.status(502).json({ error: 'Failed to fetch user from Discord' });
    }
});

// ─── FLAGLE ROUTES ────────────────────────────────

/**
 * GET /api/flagle/daily
 * Returns today's flag definition + whether this user has already played.
 * The flag's guessable colors are returned without their target values
 * until the user has submitted, to prevent cheating.
 */
app.get('/api/flagle/daily', async (req, res) => {
    const token = extractBearer(req);
    if (!token) return res.status(401).json({ error: 'Unauthorised' });

    try {
        const user    = await fetchDiscordUser(token);
        const dateStr = todayUTC();
        const flagIndex = db.getTodayFlagIndex(dateStr, FLAGS.length);
        const flag    = FLAGS[flagIndex];
        const played  = db.hasFlaglePlayed(dateStr, user.id);

        // Separate guessable and pre-filled groups
        const guessableGroups = flag.colorGroups.filter(g => g.isGuessable);
        const prefilledGroups = flag.colorGroups.filter(g => !g.isGuessable);

        // Build the response — strip target colors from guessable groups unless already played
        const responseGroups = flag.colorGroups.map(group => ({
            id:          group.id,
            label:       group.label,
            isGuessable: group.isGuessable,
            paths:       group.paths,
            // Only reveal the target color if pre-filled (already visible) or already played
            color:       (!group.isGuessable || !!played) ? group.color : null,
        }));

        res.json({
            date:          dateStr,
            flagIndex,
            flagName:      flag.name,
            viewBox:       flag.viewBox,
            colorGroups:   responseGroups,
            guessableCount: guessableGroups.length,
            alreadyPlayed:  !!played,
            previousResult: played ?? null,
            user: {
                id:       user.id,
                username: user.global_name ?? user.username,
                avatar:   user.avatar,
            },
        });
    } catch (err) {
        console.error('[flagle/daily] Error:', err.message);
        res.status(502).json({ error: 'Failed to fetch user from Discord' });
    }
});

/**
 * POST /api/flagle/score
 * Header: Authorization: Bearer <discord_access_token>
 * Body: { guesses: [{h,s,b}], channelId?: string }
 *
 * The client sends its raw HSB guesses (NOT scores).
 * We score them here server-side against the real target colors,
 * so clients can never fake a perfect score.
 */
app.post('/api/flagle/score', async (req, res) => {
    const token = extractBearer(req);
    if (!token) return res.status(401).json({ error: 'Unauthorised' });

    const { guesses, channelId } = req.body;

    // Basic shape validation
    if (!Array.isArray(guesses) || guesses.length < 1 || guesses.length > 3) {
        return res.status(400).json({ error: 'Invalid guesses array' });
    }
    for (const g of guesses) {
        if (typeof g.h !== 'number' || typeof g.s !== 'number' || typeof g.b !== 'number') {
            return res.status(400).json({ error: 'Each guess must have h, s, b numbers' });
        }
    }

    try {
        const user      = await fetchDiscordUser(token);
        const dateStr   = todayUTC();
        const flagIndex = db.getTodayFlagIndex(dateStr, FLAGS.length);
        const flag      = FLAGS[flagIndex];

        // Get only the guessable color groups (same order client used)
        const guessableGroups = flag.colorGroups.filter(g => g.isGuessable);

        if (guesses.length !== guessableGroups.length) {
            return res.status(400).json({
                error: `Expected ${guessableGroups.length} guesses for this flag, got ${guesses.length}`
            });
        }

        // Score each guess against its target color (server-side, cannot be faked)
        const scores = guessableGroups.map((group, i) => {
            const target = group.color;
            const guess  = guesses[i];
            const dist   = rgbDistanceHsb(target.h, target.s, target.b, guess.h, guess.s, guess.b);
            return calcFlagleScore(dist);
        });

        const total = scores.reduce((a, b) => a + b, 0);

        const result = db.saveFlagleScore({
            dateStr,
            userId:   user.id,
            username: user.global_name ?? user.username,
            avatar:   user.avatar ?? null,
            flagName: flag.name,
            scores,
            total,
        });

        if (!result.inserted) {
            return res.status(409).json({
                error:    'Already submitted today',
                existing: result.existing,
            });
        }

        if (channelId) {
            bot.sendFlagleLeaderboardToChannel(
                channelId,
                `@${user.global_name ?? user.username} guessed today's Flagle flag!`
            );
        }

        const board = db.getFlagleLeaderboard(dateStr);
        const rank  = board.findIndex((r) => r.userId === user.id) + 1;

        // Return scores AND the revealed color groups so the client can show the reveal
        const revealedGroups = flag.colorGroups.map(group => ({
            id:          group.id,
            label:       group.label,
            isGuessable: group.isGuessable,
            paths:       group.paths,
            color:       group.color, // Now revealed for all groups
        }));

        res.json({
            ok: true,
            scores,
            total,
            rank,
            totalPlayers: board.length,
            flagName: flag.name,
            colorGroups: revealedGroups,
        });
    } catch (err) {
        console.error('[flagle/score] Error:', err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * GET /api/flagle/leaderboard
 * Query: ?date=YYYY-MM-DD (optional)
 */
app.get('/api/flagle/leaderboard', async (req, res) => {
    const token = extractBearer(req);
    if (!token) return res.status(401).json({ error: 'Unauthorised' });

    const dateStr = typeof req.query.date === 'string'
        ? req.query.date
        : todayUTC();

    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        return res.status(400).json({ error: 'Invalid date format' });
    }

    try {
        const user  = await fetchDiscordUser(token);
        const board = db.getFlagleLeaderboard(dateStr);

        // Also send the flag name so the leaderboard can show "Today's flag: France"
        const flagIndex = db.getTodayFlagIndex(dateStr, FLAGS.length);
        const flagName  = FLAGS[flagIndex]?.name ?? 'Unknown';

        res.json({
            date:    dateStr,
            flagName,
            board: board.map((r, i) => ({
                rank:     i + 1,
                userId:   r.userId,
                username: r.username,
                avatar:   r.avatar,
                total:    r.total,
                scores:   r.scores,
                isMe:     r.userId === user.id,
            })),
        });
    } catch (err) {
        console.error('[flagle/leaderboard] Error:', err.message);
        res.status(502).json({ error: 'Failed to fetch user from Discord' });
    }
});

// ─── MIDNIGHT SEED CRON ───────────────────────────

function scheduleMidnightSeed() {
    const now = moment.tz('Europe/Brussels');
    const nextMidnight = now.clone().add(1, 'days').startOf('day');
    const msUntil = nextMidnight.diff(now);

    console.log(`[cron] Next seed in ${Math.round(msUntil / 1000)}s (${nextMidnight.format()})`);

    setTimeout(() => {
        const dateStr = todayUTC();
        try {
            db.seedColors(dateStr);
            db.seedFlagIndex(dateStr, FLAGS.length);
            console.log(`[cron] Midnight seed complete for ${dateStr}`);
        } catch (err) {
            console.error('[cron] Seed failed:', err);
        }
        scheduleMidnightSeed();
    }, msUntil);
}
