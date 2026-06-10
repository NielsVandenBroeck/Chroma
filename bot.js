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
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require('discord.js');
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
        const playButton = new ButtonBuilder()
            // Directs users to the App profile where they can launch the Activity
            .setURL(`https://discord.com/application-directory/${process.env.DISCORD_CLIENT_ID}`)
            .setLabel('Play now!')
            .setStyle(ButtonStyle.Link);

        const row = new ActionRowBuilder().addComponents(playButton);

        await interaction.reply({
            content: "🎨 Ready to play Chroma? Click the button below or use the App Launcher (rocket icon) to start!",
            components: [row]
        });
    }

    // Command: /today
    if (interaction.commandName === 'today') {
        const todayUTC = new Date().toISOString().slice(0, 10);

        // Fetch top 50 players sorted by total descending
        const board = db.getLeaderboard(todayUTC);

        if (board.length === 0) {
            return interaction.reply({ content: "No one has played Chroma today yet! Be the first! 🔥" });
        }

        // Format leaderboard similarly to the Wordle example
        let description = `🔥 Here are today's results:\n\n`;

        board.forEach((entry, index) => {
            const rankPrefix = index === 0 ? '👑' : `${index + 1}.`;
            // Calculate a formatted summary from the scores JSON
            const scoresSummary = entry.scores.join(' | ');

            description += `${rankPrefix} Score: **${entry.total}** — @${entry.username}\n> Rounds: [ ${scoresSummary} ]\n\n`;
        });

        const embed = new EmbedBuilder()
            .setTitle(`Chroma Leaderboard - ${todayUTC}`)
            .setDescription(description)
            .setColor(0x5865F2);

        await interaction.reply({ embeds: [embed] });
    }
});

// ─── STARTUP ──────────────────────────────────────

module.exports.startBot = async () => {
    await registerCommands();
    client.login(process.env.DISCORD_BOT_TOKEN);
    console.log('[bot] Discord bot initialized and logged in.');
};