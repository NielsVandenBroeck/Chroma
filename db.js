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

    // ─── CHROMA TABLES ────────────────────────────
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

    // ─── FLAGLE TABLES ────────────────────────────
    // Which flag is shown each day
    db.run(`
        CREATE TABLE IF NOT EXISTS daily_flags (
            date        TEXT PRIMARY KEY,   -- 'YYYY-MM-DD'
            flag_index  INTEGER NOT NULL    -- Index into the FLAGS array
        )
    `);

    // Flagle scores — one row per user per day
    db.run(`
        CREATE TABLE IF NOT EXISTS flagle_scores (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            date        TEXT    NOT NULL,
            user_id     TEXT    NOT NULL,
            username    TEXT    NOT NULL,
            avatar      TEXT,
            flag_name   TEXT    NOT NULL,   -- Country name for the leaderboard
            scores_json TEXT    NOT NULL,   -- JSON array of per-color-group scores
            total       INTEGER NOT NULL,
            played_at   TEXT    NOT NULL,
            UNIQUE(date, user_id)
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

// ─── DAILY COLORS (CHROMA) ────────────────────────

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

// ─── DAILY FLAG (FLAGLE) ──────────────────────────

/** Return today's flag index, seeding it if needed */
function getTodayFlagIndex(dateStr, totalFlags) {
    const stmt = db.prepare('SELECT flag_index FROM daily_flags WHERE date = ?');
    stmt.bind([dateStr]);
    if (stmt.step()) {
        const row = stmt.getAsObject();
        stmt.free();
        return row.flag_index;
    }
    stmt.free();
    return seedFlagIndex(dateStr, totalFlags);
}

/** Force-seed a flag index for a specific date */
function seedFlagIndex(dateStr, totalFlags) {
    // Use a deterministic index based on the date so everyone gets the same flag
    // but it cycles through all flags over time
    const dateSeed = dateStr.replace(/-/g, '');
    const index = parseInt(dateSeed, 10) % totalFlags;

    db.run(
        'INSERT OR REPLACE INTO daily_flags (date, flag_index) VALUES (?, ?)',
        [dateStr, index]
    );
    flush();
    console.log(`[db] Seeded flag index ${index} for ${dateStr}`);
    return index;
}

// ─── FLAGLE SCORES ────────────────────────────────

/**
 * Save a user's Flagle result.
 * Returns { inserted: true } or { inserted: false, existing }
 */
function saveFlagleScore({ dateStr, userId, username, avatar, flagName, scores, total }) {
    const check = db.prepare(
        'SELECT total, scores_json, played_at FROM flagle_scores WHERE date = ? AND user_id = ?'
    );
    check.bind([dateStr, userId]);
    if (check.step()) {
        const existing = check.getAsObject();
        check.free();
        return { inserted: false, existing };
    }
    check.free();

    db.run(
        `INSERT INTO flagle_scores (date, user_id, username, avatar, flag_name, scores_json, total, played_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [dateStr, userId, username, avatar ?? null, flagName,
            JSON.stringify(scores), total, new Date().toISOString()]
    );
    flush();
    return { inserted: true };
}

/**
 * Has a specific user already submitted a Flagle today?
 */
function hasFlaglePlayed(dateStr, userId) {
    const stmt = db.prepare(
        'SELECT total, scores_json, flag_name FROM flagle_scores WHERE date = ? AND user_id = ?'
    );
    stmt.bind([dateStr, userId]);
    const played = stmt.step();
    const row    = played ? stmt.getAsObject() : null;
    stmt.free();
    if (!row) return null;
    return { total: row.total, scores: JSON.parse(row.scores_json), flagName: row.flag_name };
}

/**
 * Flagle leaderboard for a given day — top 50, sorted by total desc.
 */
function getFlagleLeaderboard(dateStr) {
    const stmt = db.prepare(`
        SELECT user_id, username, avatar, total, scores_json, flag_name, played_at
        FROM   flagle_scores
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
            flagName: r.flag_name,
            playedAt: r.played_at,
        });
    }
    stmt.free();
    return rows;
}

/**
 * Admin command: wipe a user's Flagle score for a date.
 */
function deleteFlagleScore(dateStr, userId) {
    db.run('DELETE FROM flagle_scores WHERE date = ? AND user_id = ?', [dateStr, userId]);
    const changes = db.getRowsModified();
    if (changes > 0) {
        flush();
        console.log(`[db] Wiped Flagle score for user ${userId} on ${dateStr}`);
        return true;
    }
    return false;
}

// ─── CHROMA SCORES ────────────────────────────────

/**
 * Save a user's completed Chroma game.
 * Returns { inserted: true } or { inserted: false, existing: <score row> }
 */
function saveScore({ dateStr, userId, username, avatar, scores, total }) {
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

/**
 * Admin command utility: Wipes a user's score for a specific date.
 */
function deleteScore(dateStr, userId) {
    db.run('DELETE FROM scores WHERE date = ? AND user_id = ?', [dateStr, userId]);
    const changes = db.getRowsModified();
    if (changes > 0) {
        flush();
        console.log(`[db] Wiped score for user ${userId} on ${dateStr}`);
        return true;
    }
    return false;
}


// ─── EXPORTS ──────────────────────────────────────

module.exports = {
    init,
    // Chroma
    getTodayColors, seedColors, saveScore, getLeaderboard, hasPlayed, deleteScore,
    // Flagle
    getTodayFlagIndex, seedFlagIndex, saveFlagleScore, hasFlaglePlayed,
    getFlagleLeaderboard, deleteFlagleScore,
};
