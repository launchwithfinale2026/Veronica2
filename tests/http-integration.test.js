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

test.before(async () => {

    server = http.createServer((req, res) => {

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
