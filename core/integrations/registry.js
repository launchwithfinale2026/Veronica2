// ==================================
// VERONICA INTEGRATION REGISTRY
// ==================================
//
// Discovery/status layer over every connector in core/integrations/ --
// the "integration registry" this milestone asks for, alongside the
// individual connector modules themselves. Not a factory or a dependency
// injector: each connector is required directly by whatever code uses
// it (same as every other core/ module in this project), this just
// answers "what integrations exist and are any of them configured,"
// for a dashboard/terminal overview.
//
// core/integrations/obsidian.js, http.js, and fileIntelligence.js
// predate the isConfigured()/status() connector convention
// github.js/discord.js/calendar.js/email.js/cloudStorage.js follow, so
// their entries below describe status from what's already knowable
// about them rather than calling a method they don't have -- adding
// that convention to them retroactively isn't needed for this registry
// to be accurate, and doing so isn't this milestone's ask.

const http = require("./http");
const github = require("./github");
const discord = require("./discord");
const discordBot = require("./discordBot");
const googleOAuth = require("./google/oauth");
const calendar = require("./calendar");
const email = require("./email");
const cloudStorage = require("./cloudStorage");

// Phase 36 (Connector Completion): Claude/OpenAI are credential-gated
// external services exactly like every connector above, but had no
// entry in this registry -- credentialManager already tracks their
// configuration (see its own CONNECTORS map), so this reuses that
// directly rather than constructing a real BrainProvider just to read
// status (which would print its own real startup logs and initialize a
// real API client as a side effect of a status check -- core/brain
// would also need a lazy require here to avoid a real circular-require
// loop back through core/tools/handlers/integrations.js, which requires
// this exact file).
const credentialManager = require("./credentialManager");


// Phase 23 (Integration Framework): "sync history" for the connectors
// that poll (github, gmail/calendar/drive under the "google" entry) --
// the real timestamp of the most recently ingested event for that
// source, via the same shared pipeline every poller already writes to
// (core/integrations/eventIngestion.js), not a separately-tracked "last
// sync" field that could drift out of sync with what was actually
// ingested. Lazily required: eventIngestion -> memory has no path back
// to this file, but every other lazy require in this codebase follows
// the same defensive convention rather than assuming that stays true
// forever.
function lastSyncFor(sources){

    const eventIngestion = require("./eventIngestion");

    const events = sources
        .flatMap(source => eventIngestion.recentEvents({ source, limit: 1 }))
        .sort((a, b) => new Date(b.metadata.occurredAt) - new Date(a.metadata.occurredAt));

    return events.length ? events[0].metadata.occurredAt : null;

}


function list(){

    return [

        {
            id: "obsidian",
            kind: "filesystem",
            implemented: true,
            configured: true, // no credentials needed -- see core/integrations/obsidian.js
            note: "Reads/writes a local Obsidian vault (OBSIDIAN_VAULT_PATH, defaults to the repo root). No credentials required."
        },

        {
            id: "http",
            kind: "http",
            implemented: true,
            configured: http.allowlist().length > 0,
            note: http.allowlist().length
                ? `Allowlisted hosts: ${http.allowlist().join(", ")}`
                : "No hosts allowlisted -- set SERVICE_ALLOWLIST to enable any outbound request."
        },

        {
            id: "fileIntelligence",
            kind: "filesystem",
            implemented: true,
            configured: true, // no credentials needed -- see core/integrations/fileIntelligence.js
            note: "Indexes local files under data/workspace/ into memory. No credentials required."
        },

        {
            id: "claude",
            kind: "llm",
            implemented: true,
            configured: credentialManager.isConfigured("claude"),
            note: credentialManager.isConfigured("claude")
                ? "Configured -- primary reasoning provider (core/brain)."
                : "Not configured -- set ANTHROPIC_API_KEY to enable."
        },

        {
            id: "openai",
            kind: "llm",
            implemented: true,
            configured: credentialManager.isConfigured("openai"),
            note: credentialManager.isConfigured("openai")
                ? "Configured -- semantic memory embeddings + fallback reasoning provider."
                : "Not configured -- set OPENAI_API_KEY to enable (keyword memory search still works without it)."
        },

        { ...github.status(), lastSync: lastSyncFor(["github"]) },
        discord.status(),
        discordBot.status(),
        { ...googleOAuth.status(), lastSync: lastSyncFor(["gmail", "calendar", "drive"]) },
        calendar.status(),
        email.status(),
        cloudStorage.status()

    ];

}


function overview(){

    const integrations = list();

    return {
        total: integrations.length,
        configured: integrations.filter(i => i.configured).length,
        implemented: integrations.filter(i => i.implemented).length,
        integrations
    };

}


module.exports = { list, overview };
