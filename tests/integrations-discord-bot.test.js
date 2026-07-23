const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

// Incoming slash commands ingest real memory entries via
// core/integrations/eventIngestion.js -> core/memory's remember(), same
// backup/restore discipline as every other test touching this shared
// file.
const DB_PATH = path.join(__dirname, "..", "core", "memory", "database.json");
const DB_BACKUP = path.join(os.tmpdir(), `veronica-database-backup-discordbot-${process.pid}.json`);

test.before(() => {
    fs.copyFileSync(DB_PATH, DB_BACKUP);
});

test.after(() => {
    fs.copyFileSync(DB_BACKUP, DB_PATH);
    fs.unlinkSync(DB_BACKUP);
});

test.afterEach(() => {
    delete process.env.DISCORD_BOT_TOKEN;
    delete process.env.DISCORD_CLIENT_ID;
});

const { Events } = require("discord.js");
const eventIngestion = require("../core/integrations/eventIngestion");
const discordBot = require("../core/integrations/discordBot");

// A minimal, event-emitter-shaped stand-in for a real discord.js Client
// -- never opens a real Gateway connection. Mirrors just the surface
// discordBot.js actually touches (once/on/login/destroy/isReady/ws/
// guilds/channels/user), same "fake the dependency boundary" approach
// this suite already uses for http.request.
class FakeClient {

    constructor(){
        this.handlers = {};
        this._ready = false;
        this.ws = { ping: 17 };
        this.guilds = { cache: { size: 2 } };
        this.channels = {
            fetch: async (id) => ({
                send: async (content) => ({ channelId: id, content })
            })
        };
    }

    once(event, handler){
        (this.handlers[event] = this.handlers[event] || []).push(handler);
    }

    on(event, handler){
        (this.handlers[event] = this.handlers[event] || []).push(handler);
    }

    async login(token){
        this.loginToken = token;
        this._ready = true;
        for(const handler of (this.handlers[Events.ClientReady] || [])){
            await handler({ user: { tag: "VeronicaBot#0001" } });
        }
        return "fake-session";
    }

    isReady(){
        return this._ready;
    }

    destroy(){
        this.destroyed = true;
        this._ready = false;
    }

    async emitInteraction(interaction){
        for(const handler of (this.handlers[Events.InteractionCreate] || [])){
            await handler(interaction);
        }
    }

    async emit(event, payload){
        for(const handler of (this.handlers[event] || [])){
            await handler(payload);
        }
    }

}

function fakeInteraction({ commandName = "status", userTag = "human#0001", userId = "u1", guildId = "g1", reply } = {}){
    return {
        isChatInputCommand: () => true,
        commandName,
        user: { tag: userTag, id: userId },
        guildId,
        reply: reply || (async () => {})
    };
}


test("start() no-ops without DISCORD_BOT_TOKEN, and never constructs a client", async () => {

    let factoryCalled = false;

    const result = await discordBot.start({ clientFactory: () => { factoryCalled = true; return new FakeClient(); } });

    assert.strictEqual(result.started, false);
    assert.match(result.reason, /not configured/);
    assert.strictEqual(factoryCalled, false);

    const status = discordBot.status();
    assert.strictEqual(status.configured, false);
    assert.strictEqual(status.connected, false);

});


test("start() logs in via the real login() call once configured, and status() reflects a real connected client", async () => {

    process.env.DISCORD_BOT_TOKEN = "fake-bot-token-xqzdb1";

    let fake;
    const result = await discordBot.start({ clientFactory: () => { fake = new FakeClient(); return fake; } });

    try {

        assert.strictEqual(result.started, true);
        assert.strictEqual(fake.loginToken, "fake-bot-token-xqzdb1");

        const status = discordBot.status();
        assert.strictEqual(status.configured, true);
        assert.strictEqual(status.connected, true);
        assert.strictEqual(status.latencyMs, 17);
        assert.strictEqual(status.guildCount, 2);
        assert.ok(status.readyAt);
        assert.strictEqual(status.note, "Connected.");

    } finally {
        discordBot.stop();
    }

});


test("start() skips slash command registration cleanly when DISCORD_CLIENT_ID is unset", async () => {

    process.env.DISCORD_BOT_TOKEN = "fake-bot-token-xqzdb2";

    const result = await discordBot.start({ clientFactory: () => new FakeClient() });

    try {
        assert.strictEqual(result.registration.registered, false);
        assert.match(result.registration.reason, /DISCORD_CLIENT_ID/);
    } finally {
        discordBot.stop();
    }

});


test("an incoming slash command interaction becomes a real VERONICA event and gets a real reply", async () => {

    process.env.DISCORD_BOT_TOKEN = "fake-bot-token-xqzdb3";

    let fake;
    await discordBot.start({ clientFactory: () => { fake = new FakeClient(); return fake; } });

    try {

        let repliedWith = null;
        const interaction = fakeInteraction({
            commandName: "approvals",
            userTag: "operator#XQZDB3",
            reply: async (content) => { repliedWith = content; }
        });

        await fake.emitInteraction(interaction);

        assert.match(repliedWith, /approvals/);

        const events = eventIngestion.recentEvents({ source: "discord" }).filter(e => e.content.includes("XQZDB3"));
        assert.strictEqual(events.length, 1);
        assert.strictEqual(events[0].metadata.command, "approvals");
        assert.strictEqual(events[0].metadata.userTag, "operator#XQZDB3");

        const status = discordBot.status();
        assert.ok(status.lastEventAt);

    } finally {
        discordBot.stop();
    }

});


test("stop() tears down the client, and status() reflects it", async () => {

    process.env.DISCORD_BOT_TOKEN = "fake-bot-token-xqzdb4";

    let fake;
    await discordBot.start({ clientFactory: () => { fake = new FakeClient(); return fake; } });

    discordBot.stop();

    assert.strictEqual(fake.destroyed, true);
    assert.strictEqual(discordBot.status().connected, false);

});


test("sendMessage() throws clearly when the bot isn't running, and sends for real once it is", async () => {

    await assert.rejects(() => discordBot.sendMessage("chan1", "hi"), /not running/);

    process.env.DISCORD_BOT_TOKEN = "fake-bot-token-xqzdb5";
    await discordBot.start({ clientFactory: () => new FakeClient() });

    try {

        const sent = await discordBot.sendMessage("chan-xqzdb5", "hello XQZDB5");
        assert.strictEqual(sent.channelId, "chan-xqzdb5");
        assert.strictEqual(sent.content, "hello XQZDB5");

        await assert.rejects(() => discordBot.sendMessage(), /channelId and content are required/);

    } finally {
        discordBot.stop();
    }

});


test("a real gateway 'error' event does not crash the process, and status() reflects it (Connector Hardening -- real bug fix)", async () => {

    process.env.DISCORD_BOT_TOKEN = "fake-bot-token-xqzdb6";

    let fake;
    await discordBot.start({ clientFactory: () => { fake = new FakeClient(); return fake; } });

    try {

        // Before this fix, a real discord.js Client with no "error"
        // listener would let Node throw this as an uncaught exception --
        // this only proves it resolves cleanly (no throw) and is
        // observable afterward, not that a crash is impossible in
        // principle (Node's own EventEmitter guarantee is what actually
        // prevents it once a listener exists).
        await fake.emit(Events.Error, new Error("simulated gateway error XQZDB6"));

        const status = discordBot.status();
        assert.strictEqual(status.lastErrorMessage, "simulated gateway error XQZDB6");

    } finally {
        discordBot.stop();
    }

});


test("gateway disconnect/reconnecting/resume events are tracked in real status() fields", async () => {

    process.env.DISCORD_BOT_TOKEN = "fake-bot-token-xqzdb7";

    let fake;
    await discordBot.start({ clientFactory: () => { fake = new FakeClient(); return fake; } });

    try {

        await fake.emit(Events.ShardDisconnect);
        assert.ok(discordBot.status().lastDisconnectedAt);

        await fake.emit(Events.ShardReconnecting);
        await fake.emit(Events.ShardReconnecting);
        assert.strictEqual(discordBot.status().reconnectAttempts, 2);

        await fake.emit(Events.ShardResume);

    } finally {
        discordBot.stop();
    }

});
