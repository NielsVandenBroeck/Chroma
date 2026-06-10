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
const { createCanvas } = require('@napi-rs/canvas');
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

        // ⏱️ Defer the reply because image generation might take > 3 seconds
        await interaction.deferReply();

        // 🎨 CANVAS SETUP
        // Limit to Top 10 so the image doesn't get ridiculously tall
        const topPlayers = board.slice(0, 10);
        const width = 800;
        const height = 120 + (topPlayers.length * 60); // Dynamic height

        const canvas = createCanvas(width, height);
        const ctx = canvas.getContext('2d');

        // Draw Background (Discord Dark Theme Color)
        ctx.fillStyle = '#2B2D31';
        ctx.fillRect(0, 0, width, height);

        // Draw Header Title
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 36px sans-serif';
        ctx.fillText(`Chroma Leaderboard — ${todayUTC}`, 40, 60);

        // Draw Player Rows
        topPlayers.forEach((entry, index) => {
            const y = 140 + (index * 60);
            const rankPrefix = index === 0 ? '👑' : `${index + 1}.`;

            // Username
            ctx.fillStyle = '#FFFFFF';
            ctx.font = 'bold 24px sans-serif';
            ctx.fillText(`${rankPrefix} @${entry.username}`, 40, y);

            // Total Score
            ctx.fillStyle = '#A6A7AB'; // Light grey
            ctx.font = '24px sans-serif';
            ctx.fillText(`${entry.total} pts`, 300, y);

            // Draw Score Blocks (Wordle style!)
            let xOffset = 450;
            entry.scores.forEach(score => {
                // Determine block color based on score threshold
                if (score >= 180) {
                    ctx.fillStyle = '#43B581'; // Green (Great)
                } else if (score >= 100) {
                    ctx.fillStyle = '#FAA61A'; // Yellow/Orange (Okay)
                } else {
                    ctx.fillStyle = '#F04747'; // Red (Bad)
                }

                // Draw rounded rectangle block
                ctx.beginPath();
                ctx.roundRect(xOffset, y - 24, 50, 30, 5);
                ctx.fill();

                // Draw the specific round score text inside the block
                ctx.fillStyle = '#FFFFFF';
                ctx.font = 'bold 14px sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText(score.toString(), xOffset + 25, y - 4);
                ctx.textAlign = 'left'; // Reset alignment

                xOffset += 60; // Space between blocks
            });
        });

        // 📦 PACKAGE AND SEND
        const attachment = new AttachmentBuilder(canvas.toBuffer('image/png'), { name: 'chroma-leaderboard.png' });

        await interaction.editReply({
            content: "🔥 Here are today's top Chroma results:",
            files: [attachment]
        });
    }
});

// ─── STARTUP ──────────────────────────────────────

module.exports.startBot = async () => {
    await registerCommands();
    client.login(process.env.DISCORD_BOT_TOKEN);
    console.log('[bot] Discord bot initialized and logged in.');
};