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


// Phase 36 (Connector Completion -- "retry safely"). A transient
// failure (a network blip, a 503, a rate limit) shouldn't turn into a
// permanent connector failure or a skipped polling cycle -- but
// retrying is only safe by default for GET, which HTTP itself defines
// as idempotent. A POST/PUT/PATCH/DELETE is NOT retried unless the
// caller explicitly opts in (`retryNonIdempotent: true`), since this
// module has no way to know whether a prior attempt's response was
// simply lost after the write already succeeded server-side (e.g.
// retrying an already-created GitHub issue could create a duplicate).
// Every connector built on request() (github.js, the google/ connectors)
// gets this for free by switching their own shared call() helper to use
// this instead -- the retry logic lives in exactly one place, not
// reimplemented per connector.
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_BACKOFF_BASE_MS = 500;
const RETRYABLE_STATUS_CODES = [429, 500, 502, 503, 504];


function sleep(ms){
    return new Promise(resolve => setTimeout(resolve, ms));
}


async function requestWithRetry(url, options = {}, { maxRetries = DEFAULT_MAX_RETRIES, backoffBaseMs = DEFAULT_BACKOFF_BASE_MS, retryNonIdempotent = false } = {}){

    const method = (options.method || "GET").toUpperCase();
    const canRetry = method === "GET" || retryNonIdempotent;
    const attempts = canRetry ? maxRetries : 0;

    for(let attempt = 0; attempt <= attempts; attempt++){

        const isLastAttempt = attempt === attempts;

        try {

            // Calls through module.exports.request (not the bare local
            // `request` binding) specifically so every existing test's
            // established mocking convention -- reassigning
            // `http.request = fakeFn` for the duration of one test (see
            // github.js/discord.js/google/*'s own test files) -- still
            // intercepts calls made via requestWithRetry(), the same as
            // it already intercepts direct request() calls.
            const response = await module.exports.request(url, options);

            if(canRetry && RETRYABLE_STATUS_CODES.includes(response.status)){

                // On the last allowed attempt, a still-retryable status is
                // a real, final failure -- throwing here (rather than
                // returning the failed response) is caught by this same
                // try's catch block immediately below, where
                // isLastAttempt is true, so it rethrows and propagates
                // out. Returning the response instead would have silently
                // handed a 503 back to the caller as if it were a normal
                // result -- exactly the "silent failure" this phase's own
                // ask is about avoiding.
                if(isLastAttempt){
                    throw new Error(`Retryable status ${response.status} from ${url}`);
                }

                await sleep(backoffBaseMs * (2 ** attempt));
                continue;

            }

            return response;

        } catch(error){

            if(!canRetry || isLastAttempt){
                throw error;
            }

            await sleep(backoffBaseMs * (2 ** attempt));

        }

    }

}


module.exports = { request, allowlist, requestWithRetry };
