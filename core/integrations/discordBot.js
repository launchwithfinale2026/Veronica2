// ==================================
// VERONICA DISCORD BOT CONNECTOR
// ==================================
//
// Phase 19 (External Integration & Operational Deployment). A real
// discord.js bot -- slash commands, notifications, alerts, executive
// reports, approval requests, command routing -- distinct from
// core/integrations/discord.js (the existing outgoing-webhook connector,
// kept as-is: different credential, DISCORD_WEBHOOK_URL vs.
// DISCORD_BOT_TOKEN, different capability, one-way POST vs. a real
// bidirectional bot session). That decision (add discord.js as a real
// dependency rather than hand-roll the Gateway protocol or an HTTP
// Interactions endpoint) was made explicitly by the project owner: this
// codebase otherwise avoids adding dependencies beyond
// @anthropic-ai/sdk/dotenv/openai, but a real-time Discord bot genuinely
// needs either a persistent Gateway connection or a publicly-reachable
// HTTPS endpoint for Interactions, and only discord.js makes the former
// practical without hand-rolling a fragile reimplementation of Discord's
// own protocol.
//
// Never constructs a discord.js Client, let alone calls login(), unless
// DISCORD_BOT_TOKEN is actually set -- start() is a no-op (not a throw,
// not a crash) otherwise, matching every other connector's fail-closed
// posture (see core/integrations/credentialManager.js).
//
// Incoming slash-command interactions become VERONICA events through the
// same shared pipeline as every other connector (see
// core/integrations/eventIngestion.js) -- tagged `source:discord`,
// never a second memory system. Outgoing sends (sendMessage()) are a
// low-level primitive here, same as github.js's createIssue() -- the
// approval gate for an AUTONOMOUS decision to post lives in
// core/executive/actionProposal.js's "post_discord_message" external
// action, not inside this connector; a slash command's own direct reply
// (acknowledging the command that was just typed) is not "VERONICA
// deciding to reach out," so it isn't gated the same way.
//
// Testability: start() accepts an injectable `clientFactory` (default:
// a real discord.js Client) so tests can supply a fake, event-emitter-
// shaped stand-in without opening a real Gateway connection -- same
// dependency-injection shape core/executive/actionProposal.js's
// constructor already uses for planner/projectManager/etc.

const { Client, GatewayIntentBits, Events, REST, Routes } = require("discord.js");

const credentialManager = require("./credentialManager");
const eventIngestion = require("./eventIngestion");
const log = require("../logging");

// Minimal on purpose -- only what this phase's capability list actually
// asks for (status, and a way to see pending approval requests). More
// commands can be added here later without touching anything else in
// this file.
const COMMANDS = [
    { name: "status", description: "Show VERONICA's current status" },
    { name: "approvals", description: "List pending action approval requests" }
];

let client = null;
let readyAt = null;
let lastEventAt = null;
let lastDisconnectedAt = null;
let reconnectAttempts = 0;
let lastErrorMessage = null;


function isConfigured(){
    return credentialManager.isConfigured("discord");
}


function defaultClientFactory(){
    return new Client({ intents: [GatewayIntentBits.Guilds] });
}


// Real Discord REST call to register this bot's slash commands --
// requires DISCORD_CLIENT_ID (the application id, distinct from the bot
// token) in addition to DISCORD_BOT_TOKEN. Optional: a bot can log in
// and receive events without ever calling this, it just won't have
// registered slash commands for a human to type.
async function registerSlashCommands(){

    if(!process.env.DISCORD_CLIENT_ID){
        log.warn("discord-bot", "DISCORD_CLIENT_ID not set -- skipping slash command registration (the bot will still log in and can still send messages).");
        return { registered: false, reason: "DISCORD_CLIENT_ID not set" };
    }

    const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_BOT_TOKEN);

    await rest.put(Routes.applicationCommands(process.env.DISCORD_CLIENT_ID), { body: COMMANDS });

    return { registered: true, count: COMMANDS.length };

}


// Connector Hardening (real bug found live): `client` is a Node
// EventEmitter, and discord.js emits a real "error" event for gateway/
// WebSocket-level failures. With no listener registered, an unhandled
// "error" event on an EventEmitter is a real, uncaught Node exception --
// this would have crashed VERONICA's ENTIRE process the first time the
// Discord gateway connection had a real network hiccup, not just this
// one connector. discord.js's own WebSocketManager already retries the
// gateway connection automatically underneath these events -- this
// isn't reimplementing reconnection, it's making sure the automatic
// reconnection discord.js already does is observable (real status
// fields below) and, more importantly, that a real error never takes
// down the whole process just because nothing was listening for it.
function wireEvents(realClient){

    realClient.once(Events.ClientReady, readyClient => {
        readyAt = new Date().toISOString();
        lastDisconnectedAt = null;
        reconnectAttempts = 0;
        log.info("discord-bot", `Logged in as ${readyClient.user.tag}`);
    });

    realClient.on(Events.Error, error => {
        lastErrorMessage = error.message;
        log.error("discord-bot", `Client error: ${error.message}`);
    });

    realClient.on(Events.ShardDisconnect, () => {
        lastDisconnectedAt = new Date().toISOString();
        log.warn("discord-bot", "Gateway connection disconnected -- discord.js will attempt to reconnect automatically.");
    });

    realClient.on(Events.ShardReconnecting, () => {
        reconnectAttempts += 1;
        log.info("discord-bot", `Gateway reconnecting (attempt ${reconnectAttempts})...`);
    });

    realClient.on(Events.ShardResume, () => {
        log.info("discord-bot", "Gateway connection resumed.");
    });

    // Every incoming slash-command interaction becomes a VERONICA event
    // -- "incoming Discord commands become VERONICA events," per this
    // phase's explicit ask.
    realClient.on(Events.InteractionCreate, async interaction => {

        if(!interaction.isChatInputCommand || !interaction.isChatInputCommand()){
            return;
        }

        lastEventAt = new Date().toISOString();

        eventIngestion.ingest({
            source: "discord",
            kind: "command",
            summary: `Discord command /${interaction.commandName} from ${interaction.user.tag}`,
            metadata: {
                command: interaction.commandName,
                userId: interaction.user.id,
                userTag: interaction.user.tag,
                guildId: interaction.guildId
            }
        });

        log.info("discord-bot", `Received /${interaction.commandName} from ${interaction.user.tag}`);

        try {
            await interaction.reply(`Received \`/${interaction.commandName}\` -- VERONICA is processing it.`);
        } catch(error){
            log.error("discord-bot", `Failed to reply to /${interaction.commandName}: ${error.message}`);
        }

    });

}


// Logs in for real -- a no-op (never a throw) when DISCORD_BOT_TOKEN
// isn't set, matching every other connector's boot-time posture (see
// credentialManager.validateStartup()'s own "disable only that
// connector, continue booting" rule).
async function start({ clientFactory = defaultClientFactory } = {}){

    if(!isConfigured()){
        log.warn("discord-bot", "Not configured -- missing DISCORD_BOT_TOKEN. Bot not started; VERONICA continues normally.");
        return { started: false, reason: "not configured" };
    }

    if(client){
        return { started: true, reason: "already running" };
    }

    client = clientFactory();

    wireEvents(client);

    await client.login(process.env.DISCORD_BOT_TOKEN);

    const registration = await registerSlashCommands().catch(error => {
        log.error("discord-bot", `Slash command registration failed: ${error.message}`);
        return { registered: false, reason: error.message };
    });

    return { started: true, registration };

}


function stop(){

    if(client){
        client.destroy();
        client = null;
        readyAt = null;
    }

    lastDisconnectedAt = null;
    reconnectAttempts = 0;
    lastErrorMessage = null;

    return { stopped: true };

}


// Real runtime status -- connected/latency/guild count/last event, per
// this phase's explicit dashboard ask. No fake values: every field is
// either null/0 (nothing running yet) or read straight off the real
// discord.js Client.
function status(){

    const configured = isConfigured();
    const connected = Boolean(client && typeof client.isReady === "function" && client.isReady());

    let note;

    if(!configured){
        note = "Not configured -- set DISCORD_BOT_TOKEN to enable.";
    } else if(!connected){
        note = client ? "Configured, connecting..." : "Configured, not started.";
    } else {
        note = "Connected.";
    }

    return {
        id: "discordBot",
        implemented: true,
        configured,
        connected,
        latencyMs: (client && client.ws && typeof client.ws.ping === "number") ? client.ws.ping : null,
        guildCount: (client && client.guilds && client.guilds.cache) ? client.guilds.cache.size : 0,
        readyAt,
        lastEventAt,
        lastDisconnectedAt,
        reconnectAttempts,
        lastErrorMessage,
        note
    };

}


// Low-level send primitive (see this file's header comment for why the
// approval gate lives in actionProposal.js, not here).
async function sendMessage(channelId, content){

    if(!client){
        throw new Error("Discord bot is not running -- call start() first.");
    }

    if(!channelId || !content){
        throw new Error("A channelId and content are required");
    }

    const channel = await client.channels.fetch(channelId);

    return channel.send(content);

}


module.exports = { isConfigured, start, stop, status, sendMessage, COMMANDS };
