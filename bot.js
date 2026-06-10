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
    EmbedBuilder,
    AttachmentBuilder,
} = require('discord.js');
const PImage = require('pureimage');
const { PassThrough } = require('stream');
const db = require('./db'); // Reuse your existing database logic

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
            // ⚡ Guild deployment: Updates INSTANTLY in your test server!
            await rest.put(
                Routes.applicationGuildCommands(process.env.DISCORD_CLIENT_ID, process.env.DISCORD_GUILD_ID),
                { body: commands },
            );
            console.log(`[bot] Successfully reloaded INSTANT GUILD (/) commands for: ${process.env.DISCORD_GUILD_ID}`);
        } else {
            // 🌐 Global deployment: Takes up to 1 hour to propagate everywhere
            await rest.put(
                Routes.applicationCommands(process.env.DISCORD_CLIENT_ID),
                { body: commands },
            );
            console.log('[bot] Successfully reloaded GLOBAL (/) commands. (Can take up to an hour to sync)');
        }
    } catch (error) {
        console.error('[bot] Error registering commands:', error);
    }
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
        const board = db.getLeaderboard(todayUTC);

        if (board.length === 0) {
            return interaction.reply({ content: "No one has played Chroma today yet! Be the first! 🔥" });
        }

        // ⏱️ Defer the reply to give time to draw the image
        await interaction.deferReply();

        // 1. LOAD FONT
        const font = PImage.registerFont('Roboto-Regular.ttf', 'Roboto');
        font.loadSync();
        const fontBold = PImage.registerFont('Roboto-Bold.ttf', 'RobotoBold');
        fontBold.loadSync();

        // ─── LAYOUT CONSTANTS ───────────────────────────────────────────────
        const topPlayers = board.slice(0, 10);

        const PADDING        = 32;   // outer margin left/right
        const CARD_MARGIN    = 16;   // gap between cards
        const CARD_RADIUS    = 16;   // rounded corner radius of cards
        const CARD_PAD_X     = 24;   // horizontal padding inside card
        const CARD_PAD_Y     = 20;   // vertical padding inside card
        const HEADER_H       = 90;   // height of the "results" header area
        const BLOCK_W        = 88;   // width of each color block
        const BLOCK_H        = 72;   // height of each color block
        const BLOCK_GAP      = 10;   // gap between color blocks
        const BLOCK_RADIUS   = 10;   // rounded corners on color blocks
        const NUM_ROUNDS     = 5;
        const CARD_INNER_H   = 44 + BLOCK_H + CARD_PAD_Y; // header row + blocks row + bottom pad
        const CARD_H         = CARD_PAD_Y + CARD_INNER_H;

        const width  = PADDING * 2 + CARD_PAD_X * 2 + NUM_ROUNDS * BLOCK_W + (NUM_ROUNDS - 1) * BLOCK_GAP + 260;
        // width calculation: outer pads + card pads + blocks area + left info column (rank+name+score)
        // Let's use a fixed width that fits everything cleanly
        const CANVAS_W = 860;
        const totalHeight = HEADER_H + topPlayers.length * (CARD_H + CARD_MARGIN) + PADDING;

        const canvas = PImage.make(CANVAS_W, totalHeight);
        const ctx    = canvas.getContext('2d');

        // ─── COLOURS ────────────────────────────────────────────────────────
        const BG         = '#111214';  // near-black page background
        const CARD_BG    = '#1e1f22';  // slightly lighter card background
        const CARD_BORDER= '#2e3035';  // subtle card border
        const TEXT_WHITE = '#f2f3f5';
        const TEXT_MUTED = '#949ba4';
        const WINNER_BG  = '#5865f2';  // Discord blurple for WINNER badge

        // ─── HELPERS ────────────────────────────────────────────────────────

        // Draw a rounded rectangle path
        function roundRect(ctx, x, y, w, h, r) {
            ctx.beginPath();
            ctx.moveTo(x + r, y);
            ctx.lineTo(x + w - r, y);
            ctx.arcTo(x + w, y,     x + w, y + r,     r);
            ctx.lineTo(x + w, y + h - r);
            ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
            ctx.lineTo(x + r, y + h);
            ctx.arcTo(x,     y + h, x,     y + h - r, r);
            ctx.lineTo(x,     y + r);
            ctx.arcTo(x,     y,     x + r, y,         r);
            ctx.closePath();
        }

        // Draw a split-diagonal color block (actual = top-left triangle, guess = bottom-right triangle)
        // entry.rounds[i] = { score, actualColor, guessedColor }  e.g. { score: 9.63, actualColor: '#4ecb84', guessedColor: '#6a3fa0' }
        function drawColorBlock(ctx, x, y, w, h, r, actualHex, guessHex, scoreText) {
            // Clip to rounded rect
            ctx.save();
            roundRect(ctx, x, y, w, h, r);
            ctx.clip();

            // Bottom-right triangle = guessed color (drawn first, fills whole rect as base)
            ctx.fillStyle = guessHex;
            ctx.fillRect(x, y, w, h);

            // Top-left triangle = actual color
            ctx.fillStyle = actualHex;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + w, y);
            ctx.lineTo(x, y + h);
            ctx.closePath();
            ctx.fill();

            ctx.restore();

            // Score text centered on block
            ctx.fillStyle = TEXT_WHITE;
            ctx.font = 'bold 15pt RobotoBold';
            const textMetrics = ctx.measureText(scoreText);
            // pureimage measureText returns an object; use approximate width if needed
            const tw = textMetrics.width || (scoreText.length * 10);
            ctx.fillText(scoreText, x + (w - tw) / 2, y + h / 2 + 7);
        }

        // Draw avatar circle (just a coloured circle with initial since we have no avatar URLs)
        function drawAvatar(ctx, cx, cy, radius, initial) {
            ctx.fillStyle = '#5865f2';
            ctx.beginPath();
            ctx.arc(cx, cy, radius, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = TEXT_WHITE;
            ctx.font = 'bold 14pt RobotoBold';
            ctx.fillText(initial.toUpperCase(), cx - 9, cy + 6);
        }

        // ─── BACKGROUND ─────────────────────────────────────────────────────
        ctx.fillStyle = BG;
        ctx.fillRect(0, 0, CANVAS_W, totalHeight);

        // ─── HEADER ─────────────────────────────────────────────────────────
        ctx.fillStyle = TEXT_WHITE;
        ctx.font = 'bold 32pt RobotoBold';
        ctx.fillText('results', PADDING, 54);

        ctx.fillStyle = TEXT_MUTED;
        ctx.font = '14pt Roboto';
        ctx.fillText(`Today's Chroma leaderboard · ${todayUTC}`, PADDING, 80);

        // ─── PLAYER CARDS ────────────────────────────────────────────────────
        topPlayers.forEach((entry, index) => {
            const cardX = PADDING;
            const cardY = HEADER_H + index * (CARD_H + CARD_MARGIN);
            const cardW = CANVAS_W - PADDING * 2;

            // Card border (draw 1px larger rect underneath)
            ctx.fillStyle = CARD_BORDER;
            roundRect(ctx, cardX - 1, cardY - 1, cardW + 2, CARD_H + 2, CARD_RADIUS + 1);
            ctx.fill();

            // Card background
            ctx.fillStyle = CARD_BG;
            roundRect(ctx, cardX, cardY, cardW, CARD_H, CARD_RADIUS);
            ctx.fill();

            // ── Row 1: rank, avatar, username, score ────────────────────────
            const rowY   = cardY + CARD_PAD_Y;
            const avatarR = 18;
            const avatarCX = cardX + CARD_PAD_X + avatarR;
            const avatarCY = rowY + avatarR;

            // Rank number
            ctx.fillStyle = index === 0 ? '#f0b132' : TEXT_MUTED;
            ctx.font = index === 0 ? 'bold 18pt RobotoBold' : '16pt Roboto';
            ctx.fillText(`${index + 1}.`, cardX + CARD_PAD_X, avatarCY + 7);

            // Avatar circle
            const initial = (entry.username || '?')[0];
            drawAvatar(ctx, avatarCX + 28, avatarCY, avatarR, initial);

            // Username
            ctx.fillStyle = TEXT_WHITE;
            ctx.font = 'bold 17pt RobotoBold';
            ctx.fillText(entry.username, avatarCX + 56, avatarCY + 7);

            // WINNER badge for rank 1
            if (index === 0) {
                const badgeText = 'WINNER';
                const badgeX = avatarCX + 56 + (entry.username.length * 12) + 10;
                const badgeW = 90;
                const badgeH = 26;
                const badgeY = avatarCY - 18;

                ctx.fillStyle = WINNER_BG;
                roundRect(ctx, badgeX, badgeY, badgeW, badgeH, 6);
                ctx.fill();

                ctx.fillStyle = TEXT_WHITE;
                ctx.font = 'bold 11pt RobotoBold';
                ctx.fillText(badgeText, badgeX + 12, badgeY + 18);
            }

            // Total score (right-aligned)
            const scoreStr = `${entry.total}/50`;
            ctx.fillStyle = TEXT_WHITE;
            ctx.font = 'bold 17pt RobotoBold';
            ctx.fillText(scoreStr, cardX + cardW - CARD_PAD_X - 80, avatarCY + 7);

            // ── Row 2: color blocks ──────────────────────────────────────────
            const blocksY    = rowY + avatarR * 2 + 12;
            const totalBlocksW = NUM_ROUNDS * BLOCK_W + (NUM_ROUNDS - 1) * BLOCK_GAP;
            let blockX = cardX + (cardW - totalBlocksW) / 2;

            // entry.rounds is expected to be an array of { score, actualColor, guessedColor }
            // Fallback: if rounds not present, use entry.scores with grey colors
            const rounds = entry.rounds || entry.scores.map(s => ({
                score: s,
                actualColor: '#4ecb84',
                guessedColor: '#4ecb84',
            }));

            rounds.slice(0, NUM_ROUNDS).forEach(round => {
                const scoreLabel = typeof round.score === 'number'
                    ? round.score.toFixed(2)
                    : String(round.score);

                drawColorBlock(
                    ctx,
                    blockX, blocksY,
                    BLOCK_W, BLOCK_H,
                    BLOCK_RADIUS,
                    round.actualColor  || '#555',
                    round.guessedColor || '#333',
                    scoreLabel
                );

                blockX += BLOCK_W + BLOCK_GAP;
            });
        });

        // 3. PACKAGE AND SEND (Using streams)
        const pass = new PassThrough();

        PImage.encodePNGToStream(canvas, pass).then(async () => {
            const attachment = new AttachmentBuilder(pass, { name: 'chroma-leaderboard.png' });

            await interaction.editReply({
                content: "🎨 Here are today's top Chroma results:",
                files: [attachment]
            });
        }).catch(err => {
            console.error("Image encoding error:", err);
            interaction.editReply({ content: "Oops, an error occurred while generating the image!" });
        });
    }
});

// ─── STARTUP ──────────────────────────────────────

module.exports.startBot = async () => {
    await registerCommands();
    client.login(process.env.DISCORD_BOT_TOKEN);
    console.log('[bot] Discord bot initialized and logged in.');
};