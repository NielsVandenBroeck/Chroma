// =====================================================
// bot.js — Chroma + Flagle Discord Bot Companion
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
    ButtonStyle,
    PermissionFlagsBits,
    MessageFlags
} = require('discord.js');
const PImage = require('pureimage');
const { PassThrough } = require('stream');
const path = require('path');
const db = require('./db');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// ─── COMMAND DEFINITIONS ──────────────────────────

const commands = [
    // ── Chroma commands ──────────────────────────
    new SlashCommandBuilder()
        .setName('chroma')
        .setDescription('Launch a game of Chroma!'),
    new SlashCommandBuilder()
        .setName('today')
        .setDescription("See today's Chroma leaderboard results"),
    new SlashCommandBuilder()
        .setName('reset')
        .setDescription("Admin only: Wipe a player's Chroma score for today so they can test/replay.")
        .addUserOption(option =>
            option.setName('player')
                .setDescription('The player whose score you want to wipe')
                .setRequired(true)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    // ── Flagle commands ──────────────────────────
    new SlashCommandBuilder()
        .setName('flagle')
        .setDescription('Launch a game of Flagle — guess today\'s flag colors!'),
    new SlashCommandBuilder()
        .setName('flagtoday')
        .setDescription("See today's Flagle leaderboard results"),
    new SlashCommandBuilder()
        .setName('resetflagle')
        .setDescription("Admin only: Wipe a player's Flagle score for today so they can test/replay.")
        .addUserOption(option =>
            option.setName('player')
                .setDescription('The player whose score you want to wipe')
                .setRequired(true)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

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

// ─── CHROMA LEADERBOARD ───────────────────────────

async function displayLeaderboard(target, dateStr, messageText) {
    const board = db.getLeaderboard(dateStr);

    if (board.length === 0) {
        const fallbackText = `No one played Chroma on ${dateStr}...`;
        return target.editReply ? target.editReply({ content: fallbackText }) : target.send({ content: fallbackText });
    }

    try {
        const topPlayers = board.slice(0, 10);

        let leaderboardText = `### ${messageText}\n ### Chroma Leaderboard - ${dateStr}:\n`;

        topPlayers.forEach((entry, index) => {
            const formattedScore = (entry.total / 100).toFixed(2);

            let rankIcon = `${index + 1}.`;
            if (index === 0) rankIcon = '🥇';
            if (index === 1) rankIcon = '🥈';
            if (index === 2) rankIcon = '🥉';

            leaderboardText += `${rankIcon} **@${entry.username}** — ${formattedScore} / 50\n`;
        });

        leaderboardText += `\n`;

        const playButton = new ButtonBuilder()
            .setCustomId('launch_chroma')
            .setLabel('Play Chroma')
            .setStyle(ButtonStyle.Primary);

        const flagleButton = new ButtonBuilder()
            .setCustomId('launch_flagle')
            .setLabel('Play Flagle')
            .setStyle(ButtonStyle.Secondary);

        const row = new ActionRowBuilder().addComponents(playButton, flagleButton);

        const payload = { content: leaderboardText, components: [row] };

        if (target.editReply) {
            await target.editReply(payload);
        } else {
            await target.send(payload);
        }

    } catch (err) {
        console.error("Chroma leaderboard posting error:", err);
        const errorMsg = "Oops, an error occurred while fetching the Chroma leaderboard!";
        if (target.editReply) await target.editReply({ content: errorMsg });
    }
}

// ─── FLAGLE LEADERBOARD ───────────────────────────

async function displayFlagleLeaderboard(target, dateStr, messageText) {
    const board = db.getFlagleLeaderboard(dateStr);

    if (board.length === 0) {
        const fallbackText = `No one played Flagle on ${dateStr}...`;
        return target.editReply ? target.editReply({ content: fallbackText }) : target.send({ content: fallbackText });
    }

    try {
        const topPlayers = board.slice(0, 10);
        // All entries share the same flag name for the day
        const flagName = topPlayers[0]?.flagName ?? 'today\'s flag';

        let leaderboardText = `### ${messageText}\n### 🏳️ Flagle Leaderboard - ${flagName} (${dateStr}):\n`;

        topPlayers.forEach((entry, index) => {
            // Flagle max score = guessable groups × 1000, normalized to /30 for display
            const maxScore = entry.scores.length * 1000;
            const formattedScore = (entry.total / (maxScore / 10)).toFixed(1);

            let rankIcon = `${index + 1}.`;
            if (index === 0) rankIcon = '🥇';
            if (index === 1) rankIcon = '🥈';
            if (index === 2) rankIcon = '🥉';

            leaderboardText += `${rankIcon} **@${entry.username}** — ${formattedScore} / 10\n`;
        });

        leaderboardText += `\n`;

        const playButton = new ButtonBuilder()
            .setCustomId('launch_flagle')
            .setLabel('Play Flagle')
            .setStyle(ButtonStyle.Primary);

        const chromaButton = new ButtonBuilder()
            .setCustomId('launch_chroma')
            .setLabel('Play Chroma')
            .setStyle(ButtonStyle.Secondary);

        const row = new ActionRowBuilder().addComponents(playButton, chromaButton);

        const payload = { content: leaderboardText, components: [row] };

        if (target.editReply) {
            await target.editReply(payload);
        } else {
            await target.send(payload);
        }

    } catch (err) {
        console.error("Flagle leaderboard posting error:", err);
        const errorMsg = "Oops, an error occurred while fetching the Flagle leaderboard!";
        if (target.editReply) await target.editReply({ content: errorMsg });
    }
}

// ─── EVENT LISTENER ───────────────────────────────

client.on('interactionCreate', async interaction => {
    // Button presses
    if (interaction.isButton()) {
        if (interaction.customId === 'launch_chroma') {
            await interaction.launchActivity();
            return;
        }
        if (interaction.customId === 'launch_flagle') {
            // Flagle runs as its own Activity — requires its own Discord Application ID
            // If you have a separate app, use launchActivity with the appId parameter.
            // For now, we reply with a message directing them to use /flagle
            await interaction.reply({
                content: 'Use the `/flagle` command to launch Flagle!',
                flags: MessageFlags.Ephemeral
            });
            return;
        }
    }

    if (interaction.isChatInputCommand()) {
        // ── Chroma commands ──────────────────────
        if (interaction.commandName === 'chroma') {
            await interaction.launchActivity();
        }

        if (interaction.commandName === 'today') {
            await interaction.deferReply();
            const todayLocal = moment.tz('Europe/Brussels').format('YYYY-MM-DD');
            await displayLeaderboard(interaction, todayLocal, "Today's Chroma Scores:");
        }

        if (interaction.commandName === 'reset') {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            const targetUser = interaction.options.getUser('player');
            const todayLocal = moment.tz('Europe/Brussels').format('YYYY-MM-DD');

            try {
                const success = db.deleteScore(todayLocal, targetUser.id);
                if (success) {
                    await interaction.editReply({ content: `✅ Successfully wiped today's Chroma score for <@${targetUser.id}>. They can now refresh and play again!` });
                } else {
                    await interaction.editReply({ content: `⚠️ Could not find a Chroma score for <@${targetUser.id}> today. They might not have played yet.` });
                }
            } catch (err) {
                console.error('[bot] Error resetting Chroma score:', err);
                await interaction.editReply({ content: `❌ An error occurred while trying to wipe the score.` });
            }
        }

        // ── Flagle commands ──────────────────────
        if (interaction.commandName === 'flagle') {
            // Flagle is a separate Discord Activity — launch it
            // If it shares the same Application ID as Chroma, you can use launchActivity().
            // If it's a separate app, you'd need a different client with that app's token.
            await interaction.launchActivity();
        }

        if (interaction.commandName === 'flagtoday') {
            await interaction.deferReply();
            const todayLocal = moment.tz('Europe/Brussels').format('YYYY-MM-DD');
            await displayFlagleLeaderboard(interaction, todayLocal, "Today's Flagle Scores:");
        }

        if (interaction.commandName === 'resetflagle') {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            const targetUser = interaction.options.getUser('player');
            const todayLocal = moment.tz('Europe/Brussels').format('YYYY-MM-DD');

            try {
                const success = db.deleteFlagleScore(todayLocal, targetUser.id);
                if (success) {
                    await interaction.editReply({ content: `✅ Successfully wiped today's Flagle score for <@${targetUser.id}>. They can now refresh and play again!` });
                } else {
                    await interaction.editReply({ content: `⚠️ Could not find a Flagle score for <@${targetUser.id}> today. They might not have played yet.` });
                }
            } catch (err) {
                console.error('[bot] Error resetting Flagle score:', err);
                await interaction.editReply({ content: `❌ An error occurred while trying to wipe the score.` });
            }
        }
    }
});

// ─── AUTOMATED RECAP CRONS ────────────────────────

function scheduleYesterdayPost() {
    const now = moment.tz('Europe/Brussels');
    let nextPost = now.clone().startOf('day').add(10, 'minutes');
    if (now.isAfter(nextPost)) nextPost.add(1, 'days');
    const msUntil = nextPost.diff(now);

    console.log(`[bot-cron] Next automated leaderboard post in ${Math.round(msUntil / 1000)}s (${nextPost.format()})`);

    setTimeout(async () => {
        try {
            const yesterdayStr = moment.tz('Europe/Brussels').subtract(1, 'days').format('YYYY-MM-DD');
            const channelId = process.env.DISCORD_LEADERBOARD_CHANNEL_ID;

            if (channelId) {
                const channel = await client.channels.fetch(channelId);
                if (channel) {
                    // Post both Chroma and Flagle results
                    await displayLeaderboard(channel, yesterdayStr, `Final Chroma results for yesterday:`);
                    // Small delay between posts
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    await displayFlagleLeaderboard(channel, yesterdayStr, `Final Flagle results for yesterday:`);
                }
            } else {
                console.log('[bot-cron] Skipping auto-post: DISCORD_LEADERBOARD_CHANNEL_ID missing.');
            }
        } catch (err) {
            console.error('[bot-cron] Failed to execute automated post:', err);
        }
        scheduleYesterdayPost();
    }, msUntil);
}

// ─── EXPORTED HELPERS ─────────────────────────────

module.exports.sendLeaderboardToChannel = async (channelId, messageText) => {
    try {
        const channel = await client.channels.fetch(channelId);
        if (!channel) return;
        const todayLocal = moment.tz('Europe/Brussels').format('YYYY-MM-DD');
        await displayLeaderboard(channel, todayLocal, messageText);
    } catch (err) {
        console.error('[bot] Failed to auto-post Chroma leaderboard:', err);
    }
};

module.exports.sendFlagleLeaderboardToChannel = async (channelId, messageText) => {
    try {
        const channel = await client.channels.fetch(channelId);
        if (!channel) return;
        const todayLocal = moment.tz('Europe/Brussels').format('YYYY-MM-DD');
        await displayFlagleLeaderboard(channel, todayLocal, messageText);
    } catch (err) {
        console.error('[bot] Failed to auto-post Flagle leaderboard:', err);
    }
};

// ─── STARTUP ──────────────────────────────────────

module.exports.startBot = async () => {
    await registerCommands();
    client.login(process.env.DISCORD_BOT_TOKEN);

    client.once('clientReady', () => {
        console.log('[bot] Discord bot initialized and logged in.');
        scheduleYesterdayPost();
    });
};
