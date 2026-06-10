// =====================================================
// server.js — Chroma Discord Activity Backend
// =====================================================
// Discord Activities run inside an iframe on discord.com.
// The client SDK gives us a short-lived `code` which we
// exchange for an access_token here (server-side, so our
// client_secret never leaves this process).
//
// Endpoints
//   POST /api/token           — Discord OAuth2 token exchange
//   GET  /api/daily           — Today's colors + played status
//   POST /api/score           — Submit completed game score
//   GET  /api/leaderboard     — Today's leaderboard (top 50)
//   GET  /api/ping            — Health check
// =====================================================

require('dotenv').config();
const moment = require('moment-timezone');
const path = require('path');
const express = require('express');
const cors    = require('cors');
const db      = require('./db');

const bot = require('./bot.js');

db.init().then(() => {
    app.listen(PORT, () => {
        console.log(`[server] Chroma backend listening on :${PORT}`);
        scheduleMidnightSeed();
        bot.startBot(); // Boot up the chat bot alongside the API
    });
}).catch((err) => {
    console.error('[server] Failed to init DB:', err);
    process.exit(1);
});

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
    // In production, lock this down to your Activity's origin:
    // origin: `https://${process.env.DISCORD_CLIENT_ID}.discordsays.com`
    origin: true,
    credentials: true,
}));
app.use(express.json());

app.use(express.static(path.join(__dirname, 'dist')));
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});
// ─── HELPERS ──────────────────────────────────────

/** Today's date string in UTC, e.g. '2024-06-08' */
function todayUTC() {
    return moment.tz('Europe/Brussels').format('YYYY-MM-DD');
}

/**
 * Fetch the Discord user associated with an access_token.
 * Returns { id, username, global_name, avatar } or throws.
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
 * Validate that a submitted score array is plausible.
 * Prevents clients from sending fake scores.
 */
function validateScores(scores) {
    if (!Array.isArray(scores) || scores.length !== 5) return false;
    return scores.every(
        (s) => typeof s === 'number' && Number.isFinite(s) && s >= 0 && s <= 1000
    );
}

// ─── ROUTES ───────────────────────────────────────

/**
 * GET /api/ping
 * Simple health check — useful for uptime monitors.
 */
app.get('/api/ping', (_req, res) => {
    res.json({ ok: true, ts: new Date().toISOString() });
});

/**
 * POST /api/token
 * Body: { code: string }
 *
 * Discord's Embedded App SDK gives the client a one-time `code`.
 * We exchange it here (keeping client_secret server-side) and
 * return the access_token to the client so it can auth API calls.
 *
 * See: https://discord.com/developers/docs/activities/sdk-guide
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

        // Return only what the client needs
        res.json({ access_token: tokenData.access_token });
    } catch (err) {
        console.error('[token] Unexpected error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * GET /api/daily
 * Header: Authorization: Bearer <discord_access_token>
 *
 * Returns today's 5 colors (seeding them if this is the day's
 * first request) plus whether this user has already played.
 *
 * If already played, their previous scores are included so the
 * client can jump straight to the final screen.
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
            colors,          // Always return colors so client can pre-load
            alreadyPlayed:   !!played,
            previousResult:  played ?? null,  // { total, scores } if played
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
 * Header: Authorization: Bearer <discord_access_token>
 * Body:   { scores: number[5], total: number }
 *
 * Validates the submission server-side (scores must be 0–1000 each,
 * total must match sum) then persists it.
 *
 * Returns 409 if the user already submitted today.
 */
app.post('/api/score', async (req, res) => {
    const token = extractBearer(req);
    if (!token) return res.status(401).json({ error: 'Unauthorised' });

    const { scores, total } = req.body;

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

        // Return the leaderboard rank right away for that dopamine hit
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
 * Header: Authorization: Bearer <discord_access_token>
 * Query:  ?date=YYYY-MM-DD  (optional, defaults to today)
 *
 * Returns the top 50 players for the given day.
 */
app.get('/api/leaderboard', async (req, res) => {
    const token = extractBearer(req);
    if (!token) return res.status(401).json({ error: 'Unauthorised' });

    // Validate optional date param
    const dateStr = typeof req.query.date === 'string'
        ? req.query.date
        : todayUTC();

    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        return res.status(400).json({ error: 'Invalid date format' });
    }

    try {
        // Still auth the user so we can mark their own row
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
// No external cron library needed — we schedule the
// next midnight ourselves using a recursive setTimeout.
// This seeds colors at 00:00:00 UTC so they're ready
// before any player hits /api/daily.

function scheduleMidnightSeed() {
    const now = moment.tz('Europe/Brussels');

    // Calculate exact target time for the next 00:00:00 in Belgium
    const nextMidnight = now.clone().add(1, 'days').startOf('day');
    const msUntil = nextMidnight.diff(now);

    console.log(`[cron] Next seed in ${Math.round(msUntil / 1000)}s (${nextMidnight.format()})`);

    setTimeout(() => {
        const dateStr = todayUTC(); // Grabs the fresh new day in Belgium
        try {
            db.seedColors(dateStr);
            console.log(`[cron] Midnight seed complete for ${dateStr}`);
        } catch (err) {
            console.error('[cron] Seed failed:', err);
        }
        scheduleMidnightSeed(); // schedule the next one
    }, msUntil);
}
// ─── UTILITY ──────────────────────────────────────

function extractBearer(req) {
    const h = req.headers.authorization;
    if (!h || !h.startsWith('Bearer ')) return null;
    return h.slice(7);
}

// ─── STARTUP ──────────────────────────────────────

db.init().then(() => {
    app.listen(PORT, () => {
        console.log(`[server] Chroma backend listening on :${PORT}`);
        scheduleMidnightSeed();
    });
}).catch((err) => {
    console.error('[server] Failed to init DB:', err);
    process.exit(1);
});