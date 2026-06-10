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

        // ⏱️ Defer the reply to give the Pi time to draw the image
        await interaction.deferReply();

        try {
            // 1. FETCH TODAY'S COLORS & SETUP FONT
            const dailyColors = db.getTodayColors(todayUTC);
            const fontPath = path.join(__dirname, 'Roboto-Regular.ttf');
            const font = PImage.registerFont(fontPath, 'Roboto');
            font.loadSync();

            // 2. CANVAS SETUP
            const topPlayers = board.slice(0, 10);
            const width = 800;
            const height = 120 + (topPlayers.length * 60);

            const canvas = PImage.make(width, height);
            const ctx = canvas.getContext('2d');

            // Draw Background
            ctx.fillStyle = '#2B2D31';
            ctx.fillRect(0, 0, width, height);

            // Draw Header Title
            ctx.fillStyle = '#FFFFFF';
            ctx.font = '36pt Roboto';
            ctx.fillText(`Chroma Leaderboard — ${todayUTC}`, 40, 60);

            // Helper: Convert HSB to CSS RGB string
            const hsbToRgb = (h, s, b) => {
                const f = (n, k = (n + h / 60) % 6) => b - b * s * Math.max(Math.min(k, 4 - k, 1), 0);
                return `rgb(${Math.round(f(5) * 255)}, ${Math.round(f(3) * 255)}, ${Math.round(f(1) * 255)})`;
            };

            // Draw Player Rows
            topPlayers.forEach((entry, index) => {
                const y = 140 + (index * 60);

                // Use standard numbers instead of the crown emoji to prevent broken characters
                const rankPrefix = `${index + 1}.`;

                // Strip emojis/special characters out of the username so they don't render as boxes
                const safeUsername = entry.username.replace(/[^\x20-\x7E]/g, '').trim() || 'Player';

                // Username
                ctx.fillStyle = '#FFFFFF';
                ctx.font = '24pt Roboto';
                ctx.fillText(`${rankPrefix} @${safeUsername}`, 40, y);

                // Total Score
                ctx.fillStyle = '#A6A7AB';
                ctx.fillText(`${entry.total} pts`, 300, y);

                // Draw Score Blocks using TODAY'S COLORS!
                let xOffset = 450;
                entry.scores.forEach((score, roundIndex) => {
                    // Grab the target color for this specific round
                    const targetColor = dailyColors[roundIndex];

                    // Paint the block the actual color of the round
                    ctx.fillStyle = hsbToRgb(targetColor.h, targetColor.s, targetColor.b);
                    ctx.fillRect(xOffset, y - 24, 50, 30);

                    // Check brightness: if the color is really bright/light, use black text. Otherwise, use white text.
                    ctx.fillStyle = targetColor.b > 0.65 ? '#000000' : '#FFFFFF';
                    ctx.font = '14pt Roboto';

                    // Center the text based on digit count
                    const textX = score.toString().length === 3 ? xOffset + 5 :
                        score.toString().length === 2 ? xOffset + 12 : xOffset + 18;

                    ctx.fillText(score.toString(), textX, y - 4);

                    xOffset += 60;
                });
            });

            // 3. PACKAGE AND SEND
            const pass = new PassThrough();
            const chunks = [];

            pass.on('data', chunk => chunks.push(chunk));

            pass.on('end', async () => {
                const buffer = Buffer.concat(chunks);
                const attachment = new AttachmentBuilder(buffer, { name: 'chroma-leaderboard.png' });

                await interaction.editReply({
                    content: "🎨 Here are today's top Chroma results:",
                    files: [attachment]
                });
            });

            PImage.encodePNGToStream(canvas, pass).catch(err => {
                console.error("Image encoding error:", err);
                interaction.editReply({ content: "Oops, an error occurred while saving the image!" });
            });

        } catch (err) {
            console.error("General canvas error:", err);
            await interaction.editReply({ content: "Oops, an error occurred while preparing the canvas!" });
        }
    }
});

// ─── STARTUP ──────────────────────────────────────

module.exports.startBot = async () => {
    await registerCommands();
    client.login(process.env.DISCORD_BOT_TOKEN);
    console.log('[bot] Discord bot initialized and logged in.');
};