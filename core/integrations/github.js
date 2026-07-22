// ==================================
// VERONICA GITHUB CONNECTOR
// ==================================
//
// Real, functional connector (unlike calendar.js/email.js/cloudStorage.js
// in this same directory, which are interface-only placeholders) --
// GitHub's REST API is simple enough (a bearer token, JSON over HTTPS) to
// implement for real without guessing at a provider choice the way
// "calendar" or "email" would require.
//
// Built on core/integrations/http.js's existing allowlisted request()
// rather than a new HTTP client: api.github.com still has to be in
// SERVICE_ALLOWLIST for any of this to actually reach the network, same
// fail-closed posture as every other outbound call in this system. This
// connector adds its OWN gate on top (GITHUB_TOKEN), so both "is this
// host allowed at all" and "do we have this specific service's
// credentials" must be true.

const http = require("./http");

const API_ROOT = "https://api.github.com";


function isConfigured(){
    return Boolean(process.env.GITHUB_TOKEN);
}


function requireConfigured(){

    if(!isConfigured()){
        throw new Error("GitHub is not configured: set GITHUB_TOKEN to enable.");
    }

}


async function call(pathname, options = {}){

    requireConfigured();

    const response = await http.request(`${API_ROOT}${pathname}`, {
        ...options,
        headers: {
            Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
            "User-Agent": "VERONICA",
            Accept: "application/vnd.github+json",
            ...(options.headers || {})
        }
    });

    if(response.status >= 400){
        throw new Error(`GitHub API error ${response.status}: ${response.body}`);
    }

    return JSON.parse(response.body);

}


function getRepo(owner, repo){

    if(!owner || !repo){
        throw new Error("owner and repo are required");
    }

    return call(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`);

}


function listIssues(owner, repo){

    if(!owner || !repo){
        throw new Error("owner and repo are required");
    }

    return call(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues`);

}


function createIssue(owner, repo, { title, body } = {}){

    if(!owner || !repo){
        throw new Error("owner and repo are required");
    }

    if(!title){
        throw new Error("An issue title is required");
    }

    return call(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues`, {
        method: "POST",
        body: { title, body: body || "" }
    });

}


function status(){

    return {
        id: "github",
        configured: isConfigured(),
        requiredEnv: ["GITHUB_TOKEN"],
        note: isConfigured()
            ? "Configured. Also requires \"api.github.com\" in SERVICE_ALLOWLIST."
            : "Not configured -- set GITHUB_TOKEN to enable."
    };

}


module.exports = { isConfigured, status, getRepo, listIssues, createIssue };
