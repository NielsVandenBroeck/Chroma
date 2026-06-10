// =====================================================
// bot.js — Chroma Discord Bot Companion
// =====================================================
require('dotenv').config();
const moment = require('moment-timezone');
const {
    Client,
    GatewayIntentBits,
    REST,
    Routes,
    SlashCommandBuilder,
    AttachmentBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
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
            console.log(`[bot] Successfully reloaded INSTANT GUILD (/) commands for: ${process.env.DISCORD_GUILD_ID}`);
        } else {
            await rest.put(
                Routes.applicationCommands(process.env.DISCORD_CLIENT_ID),
                { body: commands },
            );
            console.log('[bot] Successfully reloaded GLOBAL (/) commands.');
        }
    } catch (error) {
        console.error('[bot] Error registering commands:', error);
    }
}

// ─── SAFE ROUNDED RECTANGLE HELPER ────────────────

function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arc(x + w - r, y + r, r, 1.5 * Math.PI, 2 * Math.PI);
    ctx.lineTo(x + w, y + h - r);
    ctx.arc(x + w - r, y + h - r, r, 0, 0.5 * Math.PI);
    ctx.lineTo(x + r, y + h);
    ctx.arc(x + r, y + h - r, r, 0.5 * Math.PI, Math.PI);
    ctx.lineTo(x, y + r);
    ctx.arc(x + r, y + r, r, Math.PI, 1.5 * Math.PI);
    ctx.closePath();
}

// ─── CORE IMAGE GENERATOR & SENDER ────────────────
// This handles BOTH the active commands and automated posts dynamically
async function displayLeaderboard(target, dateStr, messageText) {
    const board = db.getLeaderboard(dateStr);

    if (board.length === 0) {
        const fallbackText = `No one played Chroma on ${dateStr}! 😢`;
        return target.editReply ? target.editReply({ content: fallbackText }) : target.send({ content: fallbackText });
    }

    try {
        const dailyColors = db.getTodayColors(dateStr);
        const fontPath = path.join(__dirname, 'Roboto-Bold.ttf');
        const font = PImage.registerFont(fontPath, 'Roboto');
        font.loadSync();

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
        ctx.fillText(`Chroma Leaderboard — ${dateStr}`, 40, 60);

        const hsbToRgb = (h, s, b) => {
            const f = (n, k = (n + h / 60) % 6) => b - b * s * Math.max(Math.min(k, 4 - k, 1), 0);
            return `rgb(${Math.round(f(5) * 255)}, ${Math.round(f(3) * 255)}, ${Math.round(f(1) * 255)})`;
        };

        topPlayers.forEach((entry, index) => {
            const y = 140 + (index * 60);
            const rankPrefix = `${index + 1}.`;
            const safeUsername = entry.username.replace(/[^\x20-\x7E]/g, '').trim() || 'Player';

            ctx.fillStyle = '#FFFFFF';
            ctx.font = '24pt Roboto';
            ctx.fillText(`${rankPrefix} @${safeUsername}`, 40, y);

            ctx.fillStyle = '#A6A7AB';
            ctx.fillText(`${entry.total} pts`, 300, y);

            let xOffset = 450;
            entry.scores.forEach((score, roundIndex) => {
                const targetColor = dailyColors[roundIndex];
                ctx.fillStyle = hsbToRgb(targetColor.h, targetColor.s, targetColor.b);

                roundRect(ctx, xOffset, y - 24, 50, 30, 5);
                ctx.fill();

                ctx.fillStyle = targetColor.b > 0.65 ? '#000000' : '#FFFFFF';
                ctx.font = '14pt Roboto';

                const textX = score.toString().length === 3 ? xOffset + 5 :
                    score.toString().length === 2 ? xOffset + 12 : xOffset + 18;

                ctx.fillText(score.toString(), textX, y - 4);
                xOffset += 60;
            });
        });

        const pass = new PassThrough();
        const chunks = [];

        pass.on('data', chunk => chunks.push(chunk));
        pass.on('end', async () => {
            const buffer = Buffer.concat(chunks);
            const attachment = new AttachmentBuilder(buffer, { name: 'chroma-leaderboard.png' });

            const playButton = new ButtonBuilder()
                .setCustomId('launch_chroma')
                .setLabel('Play')
                .setStyle(ButtonStyle.Primary)

            const row = new ActionRowBuilder().addComponents(playButton);

            const payload = { content: messageText, files: [attachment], components: [row] };

            // If target has editReply, it's a command interaction. Otherwise, it's a native channel.
            if (target.editReply) {
                await target.editReply(payload);
            } else {
                await target.send(payload);
            }
        });

        PImage.encodePNGToStream(canvas, pass).catch(err => {
            console.error("Image encoding error:", err);
            const errorMsg = "Oops, an error occurred while saving the image!";
            if (target.editReply) target.editReply({ content: errorMsg });
        });

    } catch (err) {
        console.error("General canvas error:", err);
        const errorMsg = "Oops, an error occurred while preparing the canvas!";
        if (target.editReply) await target.editReply({ content: errorMsg });
    }
}

// ─── EVENT LISTENER ───────────────────────────────

client.on('interactionCreate', async interaction => {
    if (interaction.isButton() && interaction.customId === 'launch_chroma') {
        await interaction.launchActivity();
        return;
    }

    if (interaction.isChatInputCommand()) {
        if (interaction.commandName === 'chroma') {
            await interaction.launchActivity();
        }

        if (interaction.commandName === 'today') {
            await interaction.deferReply();
            const todayLocal = moment.tz('Europe/Brussels').format('YYYY-MM-DD');
            await displayLeaderboard(interaction, todayLocal, "🎨 Here are today's top Chroma results:");
        }
    }
});

// ─── AUTOMATED RECAP CRON ─────────────────────────

function scheduleYesterdayPost() {
    const now = moment.tz('Europe/Brussels');

    // Calculate exact target time for the next 00:00:00 in Belgium
    const nextMidnight = now.clone().add(1, 'days').startOf('day');
    const msUntil = nextMidnight.diff(now);

    console.log(`[bot-cron] Next automated leaderboard post in ${Math.round(msUntil / 1000)}s (${nextMidnight.format()})`);

    setTimeout(async () => {
        try {
            // At exactly midnight, look 1 minute into the past to safely get yesterday's date
            const yesterdayStr = moment.tz('Europe/Brussels').subtract(1, 'minutes').format('YYYY-MM-DD');
            const channelId = process.env.DISCORD_LEADERBOARD_CHANNEL_ID;

            if (channelId) {
                const channel = await client.channels.fetch(channelId);
                if (channel) {
                    await displayLeaderboard(channel, yesterdayStr, `🏆 **The Final Leaderboard results for ${yesterdayStr} are locked in!**`);
                }
            }
        } catch (err) {
            console.error('[bot-cron] Failed to execute automated post:', err);
        }
        // Loop the clock back up for the next day
        scheduleYesterdayPost();
    }, msUntil);
}

// ─── STARTUP ──────────────────────────────────────

module.exports.startBot = async () => {
    await registerCommands();
    client.login(process.env.DISCORD_BOT_TOKEN);

    // Changed 'ready' to 'clientReady' to fix the Deprecation Warning!
    client.once('clientReady', () => {
        console.log('[bot] Discord bot initialized and logged in.');
        scheduleYesterdayPost();
    });
};