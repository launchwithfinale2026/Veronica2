const test = require("node:test");
const assert = require("node:assert");
const http = require("node:http");

// Tests against a real local server (127.0.0.1, not any external host) --
// exercises the real request/allowlist code path without making an
// actual outbound call to the internet, which would make this test
// flaky/slow/dependent on network access and would be exactly the kind
// of external-service dependency a test suite shouldn't have.

let server;
let baseUrl;

const ORIGINAL_ALLOWLIST = process.env.SERVICE_ALLOWLIST;

// Phase 36: how many times each /flaky-* path has been hit so far --
// each test uses its own path so counts never leak between tests.
const flakyHitCounts = {};

test.before(async () => {

    server = http.createServer((req, res) => {

        if(req.url.startsWith("/flaky-")){

            flakyHitCounts[req.url] = (flakyHitCounts[req.url] || 0) + 1;

            // Fails with a real, retryable status the first two times,
            // then succeeds -- proves requestWithRetry() actually
            // retries rather than just being lucky on one attempt.
            if(flakyHitCounts[req.url] <= 2){
                res.writeHead(503);
                return res.end("temporarily unavailable");
            }

            res.writeHead(200, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ ok: true, hitCount: flakyHitCounts[req.url] }));

        }

        if(req.url.startsWith("/always-503")){
            res.writeHead(503);
            return res.end("permanently unavailable");
        }

        if(req.method === "POST"){

            let body = "";
            req.on("data", chunk => { body += chunk; });
            req.on("end", () => {
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ echoed: body }));
            });

            return;

        }

        if(req.url === "/big"){
            res.writeHead(200);
            res.end("x".repeat(2 * 1024 * 1024));
            return;
        }

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, path: req.url }));

    });

    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));

    baseUrl = `http://127.0.0.1:${server.address().port}`;

});

test.after(async () => {

    await new Promise(resolve => server.close(resolve));

    if(ORIGINAL_ALLOWLIST === undefined){
        delete process.env.SERVICE_ALLOWLIST;
    } else {
        process.env.SERVICE_ALLOWLIST = ORIGINAL_ALLOWLIST;
    }

});

const externalHttp = require("../core/integrations/http");

test("request() fails closed when nothing is allowlisted", async () => {

    delete process.env.SERVICE_ALLOWLIST;

    await assert.rejects(() => externalHttp.request(`${baseUrl}/`), /No external services are allowlisted/);

});

test("request() rejects a host not on the allowlist", async () => {

    process.env.SERVICE_ALLOWLIST = "example.com";

    await assert.rejects(() => externalHttp.request(`${baseUrl}/`), /Host not allowlisted/);

});

test("request() succeeds against an allowlisted host (GET)", async () => {

    process.env.SERVICE_ALLOWLIST = "127.0.0.1";

    const result = await externalHttp.request(`${baseUrl}/hello`);

    assert.strictEqual(result.status, 200);
    const parsed = JSON.parse(result.body);
    assert.strictEqual(parsed.path, "/hello");

});

test("request() sends a JSON-encoded POST body", async () => {

    process.env.SERVICE_ALLOWLIST = "127.0.0.1";

    const result = await externalHttp.request(baseUrl, { method: "POST", body: { marker: "XQZHTTP1" } });

    const parsed = JSON.parse(result.body);
    assert.ok(parsed.echoed.includes("XQZHTTP1"));

});

test("request() rejects an invalid URL and an unsupported protocol", async () => {

    process.env.SERVICE_ALLOWLIST = "127.0.0.1";

    await assert.rejects(() => externalHttp.request("not a url"), /Invalid URL/);
    await assert.rejects(() => externalHttp.request("ftp://127.0.0.1/"), /Unsupported protocol/);

});

test("request() enforces the response size cap", async () => {

    process.env.SERVICE_ALLOWLIST = "127.0.0.1";

    await assert.rejects(() => externalHttp.request(`${baseUrl}/big`), /byte limit/);

});

test("requestWithRetry() retries a real transient failure (GET) and eventually succeeds", async () => {

    process.env.SERVICE_ALLOWLIST = "127.0.0.1";

    const result = await externalHttp.requestWithRetry(`${baseUrl}/flaky-xqzretry1`, {}, { backoffBaseMs: 5 });

    assert.strictEqual(result.status, 200);
    assert.strictEqual(JSON.parse(result.body).hitCount, 3); // failed twice, succeeded on the 3rd real attempt

});

test("requestWithRetry() surfaces the real failure after exhausting retries, never silently swallowing it", async () => {

    process.env.SERVICE_ALLOWLIST = "127.0.0.1";

    await assert.rejects(
        () => externalHttp.requestWithRetry(`${baseUrl}/always-503`, {}, { maxRetries: 2, backoffBaseMs: 5 }),
        /Retryable status 503/
    );

});

test("requestWithRetry() never retries a POST by default (avoids duplicate writes), but does when explicitly opted in", async () => {

    process.env.SERVICE_ALLOWLIST = "127.0.0.1";

    // Not opted in -- a POST to a flaky endpoint fails on the first real
    // 503, exactly like plain request() would, since retrying a write
    // automatically could double-execute it server-side.
    const notOptedIn = await externalHttp.requestWithRetry(`${baseUrl}/flaky-xqzretry2`, { method: "POST", body: { x: 1 } }, { backoffBaseMs: 5 });
    assert.strictEqual(notOptedIn.status, 503);
    assert.strictEqual(flakyHitCounts["/flaky-xqzretry2"], 1);

    // Explicitly opted in -- now it retries the POST the same as a GET.
    const optedIn = await externalHttp.requestWithRetry(`${baseUrl}/flaky-xqzretry3`, { method: "POST", body: { x: 1 } }, { backoffBaseMs: 5, retryNonIdempotent: true });
    assert.strictEqual(optedIn.status, 200);
    assert.strictEqual(flakyHitCounts["/flaky-xqzretry3"], 3);

});
