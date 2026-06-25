import { DiscordSDK } from "@discord/embedded-app-sdk";

// Use the same Client ID from your other game files
const DISCORD_CLIENT_ID = '1513482392503980063';
const sdk = new DiscordSDK(DISCORD_CLIENT_ID);

// Tell Discord the menu is alive
sdk.ready().then(() => {
    console.log("[HUB] Discord SDK ready!");
});