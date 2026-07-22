// ==================================
// VERONICA EXTERNAL HTTP CONNECTOR
// ==================================
//
// VERONICA's first ability to reach anything outside Claude's own API --
// every other tool operates on local state (memory/knowledge/filesystem
// sandbox). An agent-triggered outbound HTTP call is a real SSRF-shaped
// risk (an agent could be tricked, via a prompt injection in some
// document it's reasoning over, into exfiltrating data to an attacker-
// controlled URL, or hitting internal network services) -- so this fails
// closed by default, same posture as the dashboard's write endpoints
// (API_TOKEN unset = disabled) and the sandboxed filesystem tool.
//
// Allowlist-based, not a generic fetch: SERVICE_ALLOWLIST (env var,
// comma-separated hostnames) must explicitly include a host before any
// request to it is permitted. Empty/unset means nothing is allowed --
// the connector exists but is inert until configured, not "on by
// default with no limits."

const https = require("https");
const http = require("http");

const MAX_RESPONSE_BYTES = 1024 * 1024; // 1MB -- plenty for a JSON API response, not enough to be a DoS vector
const REQUEST_TIMEOUT_MS = 10000;


function allowlist(){

    return (process.env.SERVICE_ALLOWLIST || "")
        .split(",")
        .map(host => host.trim().toLowerCase())
        .filter(Boolean);

}


function assertAllowed(url){

    const allowed = allowlist();

    if(!allowed.length){
        throw new Error("No external services are allowlisted. Set SERVICE_ALLOWLIST (comma-separated hostnames) to enable.");
    }

    let parsed;

    try {
        parsed = new URL(url);
    } catch(error){
        throw new Error(`Invalid URL: "${url}"`);
    }

    if(parsed.protocol !== "https:" && parsed.protocol !== "http:"){
        throw new Error(`Unsupported protocol: "${parsed.protocol}"`);
    }

    if(!allowed.includes(parsed.hostname.toLowerCase())){
        throw new Error(`Host not allowlisted: "${parsed.hostname}". Add it to SERVICE_ALLOWLIST to permit requests to it.`);
    }

    return parsed;

}


// method: "GET"|"POST". body (POST only) is JSON-stringified if it's an
// object. Response body is read as text and capped at MAX_RESPONSE_BYTES
// -- callers that need JSON parse it themselves (a non-JSON response
// shouldn't be a connector-level error). Declared `async` specifically so
// assertAllowed()'s validation throws become rejected promises rather
// than synchronous exceptions -- a caller doing `await request(...)` or
// `request(...).catch(...)` shouldn't need a separate try/catch for
// "bad input" vs. "the request itself failed."
async function request(url, { method = "GET", body, headers = {} } = {}){

    const parsed = assertAllowed(url);

    const transport = parsed.protocol === "https:" ? https : http;

    const payload = body && typeof body === "object" ? JSON.stringify(body) : body;

    return new Promise((resolve, reject) => {

        const req = transport.request(parsed, {
            method,
            timeout: REQUEST_TIMEOUT_MS,
            headers: {
                ...(payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {}),
                ...headers
            }
        }, res => {

            let received = 0;
            const chunks = [];

            res.on("data", chunk => {

                received += chunk.length;

                if(received > MAX_RESPONSE_BYTES){
                    req.destroy(new Error(`Response exceeded ${MAX_RESPONSE_BYTES} byte limit`));
                    return;
                }

                chunks.push(chunk);

            });

            res.on("end", () => {
                resolve({
                    status: res.statusCode,
                    headers: res.headers,
                    body: Buffer.concat(chunks).toString("utf8")
                });
            });

        });

        req.on("timeout", () => req.destroy(new Error(`Request to "${parsed.hostname}" timed out after ${REQUEST_TIMEOUT_MS}ms`)));
        req.on("error", reject);

        if(payload){
            req.write(payload);
        }

        req.end();

    });

}


module.exports = { request, allowlist };
