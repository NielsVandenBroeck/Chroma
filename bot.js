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
    new SlashCommandBuilder()
        .setName('chroma')
        .setDescription('Launch a game of Chroma!'),
    new SlashCommandBuilder()
        .setName('today')
        .setDescription("See today's Chroma leaderboard results"),
    new SlashCommandBuilder()
        .setName('reset')
        .setDescription("Admin only: Wipe a player's score for today so they can test/replay.")
        .addUserOption(option =>
            option.setName('player')
                .setDescription('The player whose score you want to wipe')
                .setRequired(true)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
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

// This handles BOTH the active commands and automated posts dynamically
async function displayLeaderboard(target, dateStr, messageText) {
    const board = db.getLeaderboard(dateStr);

    if (board.length === 0) {
        const fallbackText = `No one played Chroma on ${dateStr}...`;
        return target.editReply ? target.editReply({ content: fallbackText }) : target.send({ content: fallbackText });
    }

    try {
        const topPlayers = board.slice(0, 10);

        // Build the text message using Discord Markdown
        let leaderboardText = `### ${messageText}\n ### Leaderboard - ${dateStr}:\n`;

        topPlayers.forEach((entry, index) => {
            // Format score to out of 50
            const formattedScore = (entry.total / 100).toFixed(2);

            // Add medals for the top 3 players
            let rankIcon = `${index + 1}.`;
            if (index === 0) rankIcon = '🥇';
            if (index === 1) rankIcon = '🥈';
            if (index === 2) rankIcon = '🥉';

            // We use the raw username here because Discord handles custom fonts natively!
            leaderboardText += `${rankIcon} **@${entry.username}** — ${formattedScore} / 50\n`;
        });

        // Keep the Play button
        const playButton = new ButtonBuilder()
            .setCustomId('launch_chroma')
            .setLabel('Play Chroma')
            .setStyle(ButtonStyle.Primary);

        const row = new ActionRowBuilder().addComponents(playButton);

        const payload = { content: leaderboardText, components: [row] };

        // If target has editReply, it's a command interaction. Otherwise, it's a native channel.
        if (target.editReply) {
            await target.editReply(payload);
        } else {
            await target.send(payload);
        }

    } catch (err) {
        console.error("Leaderboard posting error:", err);
        const errorMsg = "Oops, an error occurred while fetching the leaderboard!";
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
            await displayLeaderboard(interaction, todayLocal, "Today's Scores:");
        }
        if (interaction.commandName === 'reset') {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            const targetUser = interaction.options.getUser('player');
            const todayLocal = moment.tz('Europe/Brussels').format('YYYY-MM-DD');

            try {
                // Call a new db function to delete the score
                const success = db.deleteScore(todayLocal, targetUser.id);

                if (success) {
                    await interaction.editReply({ content: `✅ Successfully wiped today's score for <@${targetUser.id}>. They can now refresh and play again!` });
                } else {
                    await interaction.editReply({ content: `⚠️ Could not find a score for <@${targetUser.id}> today. They might not have played yet.` });
                }
            } catch (err) {
                console.error('[bot] Error resetting score:', err);
                await interaction.editReply({ content: `❌ An error occurred while trying to wipe the score.` });
            }
        }
    }
});

// ─── AUTOMATED RECAP CRON ─────────────────────────

function scheduleYesterdayPost() {
    const now = moment.tz('Europe/Brussels');

    // Set target time to exactly 00:10:00 today
    let nextPost = now.clone().startOf('day').add(10, 'minutes');

    // If it is already past 00:10 today, schedule it for 00:10 tomorrow!
    if (now.isAfter(nextPost)) {
        nextPost.add(1, 'days');
    }

    const msUntil = nextPost.diff(now);

    console.log(`[bot-cron] Next automated leaderboard post in ${Math.round(msUntil / 1000)}s (${nextPost.format()})`);

    setTimeout(async () => {
        try {
            // Because we are at 00:10, we safely subtract exactly 1 day to get yesterday's date
            const yesterdayStr = moment.tz('Europe/Brussels').subtract(1, 'days').format('YYYY-MM-DD');
            const channelId = process.env.DISCORD_LEADERBOARD_CHANNEL_ID;

            if (channelId) {
                const channel = await client.channels.fetch(channelId);
                if (channel) {
                    await displayLeaderboard(channel, yesterdayStr, `The Final Leaderboard results for yesterday:`);
                }
            } else {
                console.log('[bot-cron] Skipping auto-post: DISCORD_LEADERBOARD_CHANNEL_ID missing from environment variables.');
            }
        } catch (err) {
            console.error('[bot-cron] Failed to execute automated post:', err);
        }
        // Loop the clock back up for the next day
        scheduleYesterdayPost();
    }, msUntil);
}


module.exports.sendLeaderboardToChannel = async (channelId, messageText) => {
    try {
        const channel = await client.channels.fetch(channelId);
        if (!channel) return;

        // Get today's date in Belgium time to match the database
        const todayLocal = moment.tz('Europe/Brussels').format('YYYY-MM-DD');

        await displayLeaderboard(channel, todayLocal, messageText);
    } catch (err) {
        console.error('[bot] Failed to auto-post leaderboard to channel:', err);
    }
};


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