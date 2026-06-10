// =====================================================
// bot.js — Chroma Discord Bot Companion
// =====================================================
require('dotenv').config();
const {
    Client,
    GatewayIntentBits,
    REST,
    Routes,
    SlashCommandBuilder,
    AttachmentBuilder,
} = require('discord.js');
const PImage = require('pureimage');
const { PassThrough } = require('stream');
const path = require('path');
const db = require('./db');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// ─── COMMAND DEFINITIONS ──────────────────────────

const commands = [
    new SlashCommandBuilder()
        .setName('chroma')
        .setDescription('Launch a game of Chroma!'),
    new SlashCommandBuilder()
        .setName('today')
        .setDescription("See today's Chroma leaderboard results")
].map(command => command.toJSON());

// ─── REGISTER COMMANDS ────────────────────────────

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN);

async function registerCommands() {
    try {
        console.log('[bot] Started refreshing application (/) commands.');
        if (process.env.DISCORD_GUILD_ID) {
            await rest.put(
                Routes.applicationGuildCommands(process.env.DISCORD_CLIENT_ID, process.env.DISCORD_GUILD_ID),
                { body: commands },
            );
            console.log(`[bot] Reloaded GUILD (/) commands for: ${process.env.DISCORD_GUILD_ID}`);
        } else {
            await rest.put(
                Routes.applicationCommands(process.env.DISCORD_CLIENT_ID),
                { body: commands },
            );
            console.log('[bot] Reloaded GLOBAL (/) commands. (Can take up to an hour to sync)');
        }
    } catch (error) {
        console.error('[bot] Error registering commands:', error);
    }
}

// ─── LEADERBOARD IMAGE GENERATOR ─────────────────

async function drawLeaderboard(topPlayers, todayUTC) {
    // ── Fonts ──────────────────────────────────────────────────────────────
    // IMPORTANT: pureimage requires absolute paths for fonts.
    // loadSync() works; relative paths silently fail.
    const fontReg  = PImage.registerFont(path.resolve(__dirname, 'Roboto-Regular.ttf'), 'Roboto');
    const fontBold = PImage.registerFont(path.resolve(__dirname, 'Roboto-Bold.ttf'), 'RobotoBold');
    fontReg.loadSync();
    fontBold.loadSync();

    // ── Layout constants ───────────────────────────────────────────────────
    const CANVAS_W   = 860;
    const PAD        = 32;    // outer left/right margin
    const CARD_GAP   = 14;    // vertical gap between cards
    const CARD_PAD_X = 22;    // horizontal padding inside card
    const CARD_PAD_Y = 18;    // vertical padding inside card
    const CARD_R     = 14;    // card corner radius
    const HEADER_H   = 88;    // height reserved for title + subtitle
    const NUM_ROUNDS = 5;
    const BLOCK_W    = 96;    // color block width
    const BLOCK_H    = 72;    // color block height
    const BLOCK_GAP  = 8;     // gap between color blocks
    const BLOCK_R    = 10;    // color block corner radius
    const ROW1_H     = 40;    // height of the rank/username/score row
    const CARD_H     = CARD_PAD_Y + ROW1_H + 10 + BLOCK_H + CARD_PAD_Y;
    const CANVAS_H   = HEADER_H + topPlayers.length * (CARD_H + CARD_GAP) + PAD;

    // ── Colors ─────────────────────────────────────────────────────────────
    const C_BG          = '#111214';
    const C_CARD        = '#1e1f22';
    const C_BORDER      = '#2e3035';
    const C_WHITE       = '#f2f3f5';
    const C_MUTED       = '#949ba4';
    const C_GOLD        = '#f0b132';
    const C_BLURPLE     = '#5865f2';

    // ── Canvas setup ──────────────────────────────────────────────────────
    const canvas = PImage.make(CANVAS_W, CANVAS_H);
    const ctx    = canvas.getContext('2d');

    // ── Helper: split-diagonal color block ────────────────────────────────
    // top-left triangle  = actualHex  (the real color shown in the game)
    // bottom-right triangle = guessHex (the player's guess)
    // NOTE: uses ctx.roundRect() — native in this version of pureimage.
    //       Do NOT use arcTo(); it is not supported and throws.
    function drawColorBlock(x, y, actualHex, guessHex, scoreText) {
        ctx.save();

        // Clip to rounded rectangle
        ctx.beginPath();
        ctx.roundRect(x, y, BLOCK_W, BLOCK_H, BLOCK_R);
        ctx.clip();

        // Base fill = guessed color (bottom-right triangle)
        ctx.fillStyle = guessHex;
        ctx.fillRect(x, y, BLOCK_W, BLOCK_H);

        // Top-left triangle = actual color
        ctx.fillStyle = actualHex;
        ctx.beginPath();
        ctx.moveTo(x,           y);
        ctx.lineTo(x + BLOCK_W, y);
        ctx.lineTo(x,           y + BLOCK_H);
        ctx.closePath();
        ctx.fill();

        ctx.restore();

        // Score text — centered on block
        ctx.fillStyle = C_WHITE;
        ctx.font = '13pt RobotoBold';
        const tw = ctx.measureText(scoreText).width || scoreText.length * 9;
        ctx.fillText(scoreText, x + (BLOCK_W - tw) / 2, y + BLOCK_H / 2 + 6);
    }

    // ── Helper: avatar circle ─────────────────────────────────────────────
    function drawAvatar(cx, cy, r, initial) {
        ctx.fillStyle = C_BLURPLE;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = C_WHITE;
        ctx.font = 'bold 13pt RobotoBold';
        const tw = ctx.measureText(initial).width || 10;
        ctx.fillText(initial, cx - tw / 2, cy + 6);
    }

    // ── Background ────────────────────────────────────────────────────────
    ctx.fillStyle = C_BG;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // ── Header ────────────────────────────────────────────────────────────
    ctx.fillStyle = C_WHITE;
    ctx.font = 'bold 30pt RobotoBold';
    ctx.fillText('results', PAD, 52);

    ctx.fillStyle = C_MUTED;
    ctx.font = '13pt Roboto';
    ctx.fillText(`Today's Chroma leaderboard · ${todayUTC}`, PAD, 76);

    // ── Player cards ──────────────────────────────────────────────────────
    topPlayers.forEach((entry, i) => {
        const cardX = PAD;
        const cardY = HEADER_H + i * (CARD_H + CARD_GAP);
        const cardW = CANVAS_W - PAD * 2;

        // Card border (1px larger on each side, drawn behind)
        ctx.fillStyle = C_BORDER;
        ctx.beginPath();
        ctx.roundRect(cardX - 1, cardY - 1, cardW + 2, CARD_H + 2, CARD_R + 1);
        ctx.fill();

        // Card body
        ctx.fillStyle = C_CARD;
        ctx.beginPath();
        ctx.roundRect(cardX, cardY, cardW, CARD_H, CARD_R);
        ctx.fill();

        // ── Row 1: rank · avatar · username · [WINNER] · score ───────────
        const row1Y   = cardY + CARD_PAD_Y;
        const midRowY = row1Y + ROW1_H / 2;  // vertical center of row
        const AVA_R   = 17;
        const AVA_CX  = cardX + CARD_PAD_X + 28 + AVA_R;  // leave room for rank num

        // Rank number
        ctx.fillStyle = i === 0 ? C_GOLD : C_MUTED;
        ctx.font = i === 0 ? 'bold 17pt RobotoBold' : '15pt Roboto';
        ctx.fillText(`${i + 1}.`, cardX + CARD_PAD_X, midRowY + 7);

        // Avatar
        const initial = (entry.username || '?')[0].toUpperCase();
        drawAvatar(AVA_CX, midRowY, AVA_R, initial);

        // Username
        const nameX = AVA_CX + AVA_R + 14;
        ctx.fillStyle = C_WHITE;
        ctx.font = 'bold 16pt RobotoBold';
        ctx.fillText(entry.username, nameX, midRowY + 7);

        // WINNER badge (rank 1 only)
        if (i === 0) {
            const tw = ctx.measureText(entry.username).width || entry.username.length * 11;
            const badgeX  = nameX + tw + 12;
            const badgeW  = 82;
            const badgeH  = 24;
            const badgeY  = midRowY - 14;
            ctx.fillStyle = C_BLURPLE;
            ctx.beginPath();
            ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 5);
            ctx.fill();
            ctx.fillStyle = C_WHITE;
            ctx.font = '10pt RobotoBold';
            ctx.fillText('WINNER', badgeX + 10, badgeY + 16);
        }

        // Total score — right-aligned
        const scoreStr = `${entry.total}/50`;
        const scoreTW  = ctx.measureText(scoreStr).width || scoreStr.length * 11;
        ctx.fillStyle = C_WHITE;
        ctx.font = 'bold 16pt RobotoBold';
        ctx.fillText(scoreStr, cardX + cardW - CARD_PAD_X - scoreTW, midRowY + 7);

        // ── Row 2: color blocks ───────────────────────────────────────────
        const blocksY = row1Y + ROW1_H + 10;
        const totalBW = NUM_ROUNDS * BLOCK_W + (NUM_ROUNDS - 1) * BLOCK_GAP;
        let blockX    = cardX + (cardW - totalBW) / 2;

        // entry.rounds = [{ score, actualColor, guessedColor }, ...]
        // Falls back gracefully if DB only has entry.scores (plain numbers)
        const rounds = entry.rounds
            ? entry.rounds
            : (entry.scores || []).map(s => ({
                score: s,
                actualColor:  '#4ecb84',
                guessedColor: '#4ecb84',
            }));

        rounds.slice(0, NUM_ROUNDS).forEach(round => {
            const label = typeof round.score === 'number'
                ? round.score.toFixed(2)
                : String(round.score);

            drawColorBlock(
                blockX, blocksY,
                round.actualColor  || '#555555',
                round.guessedColor || '#333333',
                label
            );

            blockX += BLOCK_W + BLOCK_GAP;
        });
    });

    return canvas;
}

// ─── EVENT LISTENER ───────────────────────────────

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    // Command: /chroma
    if (interaction.commandName === 'chroma') {
        await interaction.launchActivity();
    }

    // Command: /today
    if (interaction.commandName === 'today') {
        const todayUTC = new Date().toISOString().slice(0, 10);
        const board    = db.getLeaderboard(todayUTC);

        if (board.length === 0) {
            return interaction.reply({ content: "No one has played Chroma today yet! Be the first! 🔥" });
        }

        await interaction.deferReply();

        try {
            const topPlayers = board.slice(0, 10);
            const canvas     = await drawLeaderboard(topPlayers, todayUTC);

            const pass = new PassThrough();
            await PImage.encodePNGToStream(canvas, pass);

            const attachment = new AttachmentBuilder(pass, { name: 'chroma-leaderboard.png' });
            await interaction.editReply({
                content: "🎨 Here are today's top Chroma results:",
                files: [attachment]
            });
        } catch (err) {
            console.error('[bot] Leaderboard render error:', err);
            await interaction.editReply({ content: "Oops, something went wrong generating the leaderboard!" });
        }
    }
});

// ─── STARTUP ──────────────────────────────────────

module.exports.startBot = async () => {
    await registerCommands();
    client.login(process.env.DISCORD_BOT_TOKEN);
    console.log('[bot] Discord bot initialized and logged in.');
};