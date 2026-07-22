// ==================================
// VERONICA DISCORD CONNECTOR
// ==================================
//
// Real, functional connector via Discord's incoming webhooks -- the
// simplest real integration (a single POST to a per-channel webhook URL,
// no bot gateway/session to manage), so this doesn't require guessing at
// a broader Discord bot integration this milestone didn't ask for.
//
// Built on core/integrations/http.js's existing allowlisted request(),
// same reasoning as core/integrations/github.js: "discord.com" (or
// "discordapp.com", depending on the webhook URL's host) still has to be
// in SERVICE_ALLOWLIST for this to reach the network at all.

const http = require("./http");
const credentialManager = require("./credentialManager");
const log = require("../logging");


function isConfigured(){
    return credentialManager.isConfigured("discordWebhook");
}


function requireConfigured(){

    if(!isConfigured()){
        throw new Error("Discord is not configured: set DISCORD_WEBHOOK_URL to enable.");
    }

}


async function sendMessage(content){

    requireConfigured();

    if(!content){
        throw new Error("Message content is required");
    }

    const response = await http.request(process.env.DISCORD_WEBHOOK_URL, {
        method: "POST",
        body: { content }
    });

    if(response.status >= 400){
        log.error("discord-webhook", `Send failed: ${response.status}`);
        throw new Error(`Discord webhook error ${response.status}: ${response.body}`);
    }

    log.info("discord-webhook", "Message sent");

    return { sent: true };

}


function status(){

    return {
        id: "discord",
        implemented: true,
        configured: isConfigured(),
        requiredEnv: ["DISCORD_WEBHOOK_URL"],
        note: isConfigured()
            ? "Configured. Also requires the webhook's host in SERVICE_ALLOWLIST."
            : "Not configured -- set DISCORD_WEBHOOK_URL to enable."
    };

}


module.exports = { isConfigured, status, sendMessage };
