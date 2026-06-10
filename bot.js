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
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
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

    // ─── 1. BUTTON CLICKS ─────────────────────────
    if (interaction.isButton()) {
        if (interaction.customId === 'launch_chroma') {
            // Instantly launch the activity when the button is clicked!
            await interaction.launchActivity();
        }
        return; // Stop processing so we don't accidentally run slash command code
    }

    // ─── 2. SLASH COMMANDS ────────────────────────
    if (interaction.isChatInputCommand()) {

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
                // Ensure we are using the bold font we downloaded earlier!
                const fontPath = require('path').join(__dirname, 'Roboto-Bold.ttf');
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
                    const rankPrefix = `${index + 1}.`;
                    const safeUsername = entry.username.replace(/[^\x20-\x7E]/g, '').trim() || 'Player';

                    // Username
                    ctx.fillStyle = '#FFFFFF';
                    ctx.font = '24pt Roboto';
                    ctx.fillText(`${rankPrefix} @${safeUsername}`, 40, y);

                    // Total Score
                    ctx.fillStyle = '#A6A7AB';
                    ctx.fillText(`${entry.total} pts`, 300, y);

                    // Draw Score Blocks
                    let xOffset = 450;
                    entry.scores.forEach((score, roundIndex) => {
                        const targetColor = dailyColors[roundIndex];

                        ctx.fillStyle = hsbToRgb(targetColor.h, targetColor.s, targetColor.b);

                        // Safely draw rounded rectangles using arcs
                        ctx.beginPath();
                        const r = 5;
                        const bx = xOffset, by = y - 24, bw = 50, bh = 30;
                        ctx.moveTo(bx + r, by);
                        ctx.lineTo(bx + bw - r, by);
                        ctx.arc(bx + bw - r, by + r, r, 1.5 * Math.PI, 2 * Math.PI);
                        ctx.lineTo(bx + bw, by + bh - r);
                        ctx.arc(bx + bw - r, by + bh - r, r, 0, 0.5 * Math.PI);
                        ctx.lineTo(bx + r, by + bh);
                        ctx.arc(bx + r, by + bh - r, r, 0.5 * Math.PI, Math.PI);
                        ctx.lineTo(bx, by + r);
                        ctx.arc(bx + r, by + r, r, Math.PI, 1.5 * Math.PI);
                        ctx.closePath();
                        ctx.fill();

                        ctx.fillStyle = targetColor.b > 0.65 ? '#000000' : '#FFFFFF';
                        ctx.font = '14pt Roboto';

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

                    // 🎮 CREATE THE PLAY BUTTON
                    const playButton = new ButtonBuilder()
                        .setCustomId('launch_chroma')
                        .setLabel('Play Chroma')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('🎮');

                    const row = new ActionRowBuilder().addComponents(playButton);

                    // Attach the button row to the final message!
                    await interaction.editReply({
                        content: "🎨 Here are today's top Chroma results:",
                        files: [attachment],
                        components: [row]
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
    }
});

// ─── STARTUP ──────────────────────────────────────

module.exports.startBot = async () => {
    await registerCommands();
    client.login(process.env.DISCORD_BOT_TOKEN);
    console.log('[bot] Discord bot initialized and logged in.');
};