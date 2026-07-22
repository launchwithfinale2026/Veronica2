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
const calendar = require("./calendar");
const email = require("./email");
const cloudStorage = require("./cloudStorage");


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

        github.status(),
        discord.status(),
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
