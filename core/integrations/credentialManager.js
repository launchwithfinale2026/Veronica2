// ==================================
// VERONICA CREDENTIAL MANAGER
// ==================================
//
// Phase 19 (External Integration & Operational Deployment). Before this,
// every connector (core/integrations/github.js, discord.js, etc.)
// independently did `Boolean(process.env.X)` for its own isConfigured()
// check, and core/brain/providers/claude.js/openai.js each independently
// called require("dotenv").config() -- there was no single place that
// validated everything at startup or could answer "what's configured"
// without asking each connector separately. This is that single place:
// one static map of every credential this system knows about, keyed by
// connector, checked at boot (validateStartup(), logged via
// core/logging -- names only, never values) and queryable anytime
// (statusFor()/isConfigured()).
//
// Deliberately does NOT replace each connector's own isConfigured()/
// status() methods -- those stay (nothing calling them breaks), and now
// delegate to this module internally instead of duplicating the
// Boolean(process.env.X) check. "One centralized credential manager,"
// per this phase's own ask, not a second parallel one.
//
// Never logs or returns a credential's VALUE, only whether it's present
// and which named variable is missing -- the dashboard's connector
// status views (registry.js's overview(), the new "External Systems"
// panel) surface exactly that: configured/missing, never secrets.

const log = require("../logging");

// Every connector this system knows about and the env var(s) it needs.
// Adding a new connector means adding one entry here -- nothing else
// needs to duplicate this list.
const CONNECTORS = {

    claude: { required: ["ANTHROPIC_API_KEY"], label: "Claude (primary AI provider)" },
    openai: { required: ["OPENAI_API_KEY"], label: "OpenAI (embeddings fallback)" },
    github: { required: ["GITHUB_TOKEN"], label: "GitHub" },
    discord: { required: ["DISCORD_BOT_TOKEN"], label: "Discord bot" },
    google: {
        required: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REDIRECT_URI"],
        label: "Google Workspace (Gmail/Calendar/Drive)"
    }

};


function statusFor(connectorId){

    const spec = CONNECTORS[connectorId];

    if(!spec){
        throw new Error(`Unknown connector: "${connectorId}"`);
    }

    const missing = spec.required.filter(key => !process.env[key]);

    return {
        id: connectorId,
        label: spec.label,
        configured: missing.length === 0,
        missing, // variable NAMES only -- never a value
        requiredEnv: spec.required
    };

}


function isConfigured(connectorId){

    return statusFor(connectorId).configured;

}


// Every connector's status in one call -- the data behind the
// dashboard's "External Systems" panel and registry.js's overview().
function overview(){

    return Object.keys(CONNECTORS).map(statusFor);

}


// Called once at boot (dashboard/backend/server.js, core/interface/
// terminal.js). Logs exactly which variable is missing per
// unconfigured connector -- never crashes, never blocks the rest of the
// system from starting, matching this phase's own explicit requirement:
// "report exactly which variable is missing, disable only that
// connector, continue booting, never crash the system."
function validateStartup(){

    const results = overview();

    for(const result of results){

        if(result.configured){

            log.info("credential-manager", `${result.label} configured`);

        } else {

            log.warn(
                "credential-manager",
                `${result.label} not configured -- missing: ${result.missing.join(", ")}. This connector is disabled; VERONICA continues booting normally.`
            );

        }

    }

    return results;

}


module.exports = { validateStartup, statusFor, isConfigured, overview, CONNECTORS };
