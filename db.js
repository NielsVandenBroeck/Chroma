// =====================================================
// db.js — SQLite persistence via sql.js (pure JS)
// =====================================================
// sql.js runs SQLite compiled to WASM — no native
// bindings needed. We flush to disk after every write.
// =====================================================

const fs         = require('fs');
const path       = require('path');
const initSqlJs  = require('sql.js');

const DB_PATH = path.join(__dirname, 'data', 'chroma.sqlite');

let db = null; // sql.js Database instance

// ─── INIT ─────────────────────────────────────────

async function init() {
    const SQL = await initSqlJs();

    // Ensure data directory exists
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

    // Load existing DB from disk, or create fresh
    if (fs.existsSync(DB_PATH)) {
        const fileBuffer = fs.readFileSync(DB_PATH);
        db = new SQL.Database(fileBuffer);
    } else {
        db = new SQL.Database();
    }

    // Create tables if they don't exist yet
    db.run(`
        CREATE TABLE IF NOT EXISTS daily_colors (
            date        TEXT PRIMARY KEY,   -- 'YYYY-MM-DD'
            colors_json TEXT NOT NULL        -- JSON array of 5 {h,s,b} objects
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS scores (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            date        TEXT    NOT NULL,   -- 'YYYY-MM-DD'
            user_id     TEXT    NOT NULL,   -- Discord user ID (snowflake)
            username    TEXT    NOT NULL,   -- Display name at time of play
            avatar      TEXT,              -- Avatar hash (nullable)
            scores_json TEXT    NOT NULL,   -- JSON array of 5 per-round scores
            total       INTEGER NOT NULL,
            played_at   TEXT    NOT NULL,   -- ISO timestamp
            UNIQUE(date, user_id)           -- One submission per user per day
        )
    `);

    flush();
    console.log('[db] Initialised — DB path:', DB_PATH);
}

/** Persist in-memory DB back to disk */
function flush() {
    const data = db.export();
    fs.writeFileSync(DB_PATH, Buffer.from(data));
}

// ─── DAILY COLORS ─────────────────────────────────

/** Return today's colors, seeding them if this is the first request today */
function getTodayColors(dateStr) {
    const stmt = db.prepare('SELECT colors_json FROM daily_colors WHERE date = ?');
    stmt.bind([dateStr]);
    if (stmt.step()) {
        const row = stmt.getAsObject();
        stmt.free();
        return JSON.parse(row.colors_json);
    }
    stmt.free();

    // First request of the day — seed 5 random colors
    const colors = Array.from({ length: 5 }, randomTarget);
    db.run(
        'INSERT INTO daily_colors (date, colors_json) VALUES (?, ?)',
        [dateStr, JSON.stringify(colors)]
    );
    flush();
    console.log(`[db] Seeded colors for ${dateStr}:`, colors);
    return colors;
}

/** Force-seed colors for a specific date (used by the midnight cron) */
function seedColors(dateStr) {
    const colors = Array.from({ length: 5 }, randomTarget);
    db.run(
        'INSERT OR REPLACE INTO daily_colors (date, colors_json) VALUES (?, ?)',
        [dateStr, JSON.stringify(colors)]
    );
    flush();
    console.log(`[db] Cron-seeded colors for ${dateStr}`);
    return colors;
}

// ─── SCORES ───────────────────────────────────────

/**
 * Save a user's completed game.
 * Returns { inserted: true } or { inserted: false, existing: <score row> }
 * so the caller can decide whether to show "already played" UI.
 */
function saveScore({ dateStr, userId, username, avatar, scores, total }) {
    // Check for existing submission
    const check = db.prepare(
        'SELECT total, scores_json, played_at FROM scores WHERE date = ? AND user_id = ?'
    );
    check.bind([dateStr, userId]);
    if (check.step()) {
        const existing = check.getAsObject();
        check.free();
        return { inserted: false, existing };
    }
    check.free();

    db.run(
        `INSERT INTO scores (date, user_id, username, avatar, scores_json, total, played_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [dateStr, userId, username, avatar ?? null,
            JSON.stringify(scores), total, new Date().toISOString()]
    );
    flush();
    return { inserted: true };
}

/**
 * Leaderboard for a given day — top 50, sorted by total desc.
 */
function getLeaderboard(dateStr) {
    const stmt = db.prepare(`
        SELECT user_id, username, avatar, total, scores_json, played_at
        FROM   scores
        WHERE  date = ?
        ORDER  BY total DESC
        LIMIT  50
    `);
    stmt.bind([dateStr]);

    const rows = [];
    while (stmt.step()) {
        const r = stmt.getAsObject();
        rows.push({
            userId:   r.user_id,
            username: r.username,
            avatar:   r.avatar,
            total:    r.total,
            scores:   JSON.parse(r.scores_json),
            playedAt: r.played_at,
        });
    }
    stmt.free();
    return rows;
}

/**
 * Has a specific user already submitted today?
 */
function hasPlayed(dateStr, userId) {
    const stmt = db.prepare(
        'SELECT total, scores_json FROM scores WHERE date = ? AND user_id = ?'
    );
    stmt.bind([dateStr, userId]);
    const played = stmt.step();
    const row    = played ? stmt.getAsObject() : null;
    stmt.free();
    if (!row) return null;
    return { total: row.total, scores: JSON.parse(row.scores_json) };
}

// ─── COLOR MATH (server-side mirror of client logic) ──

function randomTarget() {
    return {
        h: Math.random() * 360,
        s: 0.45 + Math.random() * 0.55,
        b: 0.40 + Math.random() * 0.60,
    };
}

// ─── EXPORTS ──────────────────────────────────────

module.exports = { init, getTodayColors, seedColors, saveScore, getLeaderboard, hasPlayed };