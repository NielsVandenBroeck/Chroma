// =====================================================
// server.js — Chroma Discord Activity Backend
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
//   GET  /api/ping            — Health check
// =====================================================

require('dotenv').config();
const moment = require('moment-timezone');
const path = require('path');
const express = require('express');
const cors    = require('cors');
const db      = require('./db');

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
    res.sendFile(path.join(__dirname, 'dist', 'chroma.html'));
});

db.init().then(() => {
    app.listen(PORT, () => {
        console.log(`[server] Chroma backend listening on :${PORT}`);
        scheduleMidnightSeed();
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
            console.log(`[cron] Midnight seed complete for ${dateStr}`);
        } catch (err) {
            console.error('[cron] Seed failed:', err);
        }
        scheduleMidnightSeed();
    }, msUntil);
}
