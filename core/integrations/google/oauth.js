// ==================================
// VERONICA GOOGLE OAUTH2 FRAMEWORK
// ==================================
//
// Phase 19 (External Integration & Operational Deployment). Real,
// functional OAuth2 authorization-code flow for Google Workspace
// (Gmail/Calendar/Drive) -- built on core/integrations/http.js's
// existing allowlisted request(), same as github.js, rather than adding
// the `googleapis` package: Google's OAuth and Gmail/Calendar/Drive
// REST APIs are all plain HTTPS + JSON, no different in kind from
// GitHub's API that github.js already talks to directly.
//
// Two distinct states, not one: `isConfigured()` (GOOGLE_CLIENT_ID/
// SECRET/REDIRECT_URI are set -- an app registration exists) vs.
// `isAuthorized()` (a real human has completed Google's consent screen
// in a real browser and we're holding a real refresh token). The first
// is something an operator sets in .env; the second is something ONLY
// a human can do by visiting getAuthUrl()'s URL and clicking "Allow" --
// no code path here can complete it, by design (that's the whole point
// of OAuth). See docs/EXTERNAL_INTEGRATIONS.md for the exact human
// steps.
//
// Tokens are real, sensitive credentials -- stored in tokens.json,
// gitignored like every other real per-machine secret this project
// already keeps out of git (core/memory/database.json,
// core/device/network.json, etc.).

const fs = require("fs");
const path = require("path");

const http = require("../http");
const credentialManager = require("../credentialManager");

const TOKEN_FILE = path.join(__dirname, "tokens.json");

const AUTH_BASE = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

// Read-only across the board, matching this phase's explicit
// capability list (read Gmail, read Calendar, discover Drive files --
// never delete, never send without approval, and "send" isn't
// implemented at all yet -- see gmail.js).
const DEFAULT_SCOPES = [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/calendar.readonly",
    "https://www.googleapis.com/auth/drive.readonly"
];

// Refresh this many ms before the token's own reported expiry, so a
// call in flight doesn't race an access token expiring mid-request.
const REFRESH_SKEW_MS = 60 * 1000;


function isConfigured(){
    return credentialManager.isConfigured("google");
}


function requireConfigured(){

    if(!isConfigured()){
        const { missing } = credentialManager.statusFor("google");
        throw new Error(`Google is not configured: set ${missing.join(", ")} to enable.`);
    }

}


function loadTokens(){

    if(!fs.existsSync(TOKEN_FILE)){
        return null;
    }

    return JSON.parse(fs.readFileSync(TOKEN_FILE, "utf8"));

}


function saveTokens(tokens){

    fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokens, null, 2));

    return tokens;

}


// True only once a real human has completed the consent flow and a
// refresh token is on disk -- distinct from isConfigured() (app
// credentials present) on purpose.
function isAuthorized(){

    return isConfigured() && Boolean(loadTokens()?.refresh_token);

}


// Step 1 of the flow the OPERATOR performs in a real browser -- this
// function only builds the URL; nothing in this codebase can visit it
// or click "Allow" on the operator's behalf.
function getAuthUrl(scopes = DEFAULT_SCOPES){

    requireConfigured();

    const params = new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID,
        redirect_uri: process.env.GOOGLE_REDIRECT_URI,
        response_type: "code",
        scope: scopes.join(" "),
        access_type: "offline",
        prompt: "consent"
    });

    return `${AUTH_BASE}?${params.toString()}`;

}


// Step 2: Google redirects the operator's browser back to
// GOOGLE_REDIRECT_URI with a one-time `code` -- the dashboard's
// callback route (see dashboard/backend/server.js) hands that code to
// this function to complete the exchange.
async function exchangeCode(code){

    requireConfigured();

    if(!code){
        throw new Error("An authorization code is required");
    }

    const body = new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: process.env.GOOGLE_REDIRECT_URI,
        grant_type: "authorization_code"
    }).toString();

    const response = await http.request(TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body
    });

    if(response.status >= 400){
        throw new Error(`Google OAuth token exchange failed ${response.status}: ${response.body}`);
    }

    const tokens = JSON.parse(response.body);

    return saveTokens({ ...tokens, obtainedAt: new Date().toISOString() });

}


async function refreshAccessToken(){

    requireConfigured();

    const tokens = loadTokens();

    if(!tokens || !tokens.refresh_token){
        throw new Error("No refresh token available -- complete the OAuth consent flow first (see getAuthUrl()).");
    }

    const body = new URLSearchParams({
        refresh_token: tokens.refresh_token,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        grant_type: "refresh_token"
    }).toString();

    const response = await http.request(TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body
    });

    if(response.status >= 400){
        throw new Error(`Google OAuth token refresh failed ${response.status}: ${response.body}`);
    }

    const refreshed = JSON.parse(response.body);

    // Google's refresh response often omits refresh_token (it doesn't
    // change) -- keep the existing one rather than losing it.
    return saveTokens({ ...tokens, ...refreshed, obtainedAt: new Date().toISOString() });

}


// Every Gmail/Calendar/Drive call goes through this, never reading
// tokens.access_token directly -- refreshes first if expired (or about
// to be) so callers never have to think about token lifetime.
async function getAccessToken(){

    requireConfigured();

    let tokens = loadTokens();

    if(!tokens){
        throw new Error("Google is not authorized yet -- complete the OAuth consent flow (see getAuthUrl()/exchangeCode()).");
    }

    const obtainedAt = new Date(tokens.obtainedAt).getTime();
    // `tokens.expires_in || 3600` would be wrong here: an explicit 0
    // (a token that's already expired) is falsy, and `||` would treat
    // it as "not provided," silently defaulting to a full hour instead
    // of correctly treating it as already-expired.
    const expiresInMs = (Number.isFinite(tokens.expires_in) ? tokens.expires_in : 3600) * 1000;
    const isExpired = Date.now() >= (obtainedAt + expiresInMs - REFRESH_SKEW_MS);

    if(isExpired){
        tokens = await refreshAccessToken();
    }

    return tokens.access_token;

}


function status(){

    const configured = isConfigured();
    const authorized = isAuthorized();

    let note;

    if(!configured){
        note = `Not configured -- set ${credentialManager.statusFor("google").missing.join(", ")} to enable.`;
    } else if(!authorized){
        note = "Configured, but not yet authorized -- a human must visit the URL from getAuthUrl() and complete Google's consent screen.";
    } else {
        note = "Connected.";
    }

    return {
        id: "google",
        configured,
        authorized,
        requiredEnv: credentialManager.CONNECTORS.google.required,
        note
    };

}


module.exports = {
    isConfigured,
    isAuthorized,
    getAuthUrl,
    exchangeCode,
    refreshAccessToken,
    getAccessToken,
    status,
    DEFAULT_SCOPES
};
