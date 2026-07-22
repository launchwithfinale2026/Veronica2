const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

const DB_PATH = path.join(__dirname, "..", "core", "memory", "database.json");
const DB_BACKUP = path.join(os.tmpdir(), `veronica-database-backup-gpoll-${process.pid}.json`);

const TOKEN_PATH = path.join(__dirname, "..", "core", "integrations", "google", "tokens.json");
const TOKEN_EXISTED_BEFORE = fs.existsSync(TOKEN_PATH);
const TOKEN_BACKUP = path.join(os.tmpdir(), `veronica-google-tokens-backup-gpoll-${process.pid}.json`);

test.before(() => {
    fs.copyFileSync(DB_PATH, DB_BACKUP);
    if(TOKEN_EXISTED_BEFORE){
        fs.copyFileSync(TOKEN_PATH, TOKEN_BACKUP);
    }
});

test.after(() => {
    fs.copyFileSync(DB_BACKUP, DB_PATH);
    fs.unlinkSync(DB_BACKUP);
    if(TOKEN_EXISTED_BEFORE){
        fs.copyFileSync(TOKEN_BACKUP, TOKEN_PATH);
        fs.unlinkSync(TOKEN_BACKUP);
    } else if(fs.existsSync(TOKEN_PATH)){
        fs.unlinkSync(TOKEN_PATH);
    }
});

test.afterEach(() => {
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    delete process.env.GOOGLE_REDIRECT_URI;
});

const http = require("../core/integrations/http");
const oauth = require("../core/integrations/google/oauth");
const eventIngestion = require("../core/integrations/eventIngestion");
const poll = require("../core/integrations/google/poll");

function configureAndAuthorize(){

    process.env.GOOGLE_CLIENT_ID = "fake-client-xqzgpoll1";
    process.env.GOOGLE_CLIENT_SECRET = "fake-secret-xqzgpoll1";
    process.env.GOOGLE_REDIRECT_URI = "https://example.test/callback";

    return oauth.exchangeCode("fake-code-xqzgpoll1");

}


test("pollAll() no-ops cleanly when Google isn't authorized yet", async () => {

    const result = await poll.pollAll();

    assert.strictEqual(result.polled, false);
    assert.match(result.reason, /not authorized/);

});


test("pollGmail()/pollCalendar()/pollDrive() ingest new items and dedupe on repeat polls", async () => {

    const originalRequest = http.request;

    http.request = async () => ({ status: 200, headers: {}, body: JSON.stringify({ access_token: "a-xqzgpoll2", refresh_token: "b-xqzgpoll2", expires_in: 3600 }) });

    try {
        await configureAndAuthorize();
    } finally {
        http.request = originalRequest;
    }

    http.request = async (url) => {

        // listMessages() always appends a query string (?maxResults=...);
        // getMessage() hits a plain /messages/{id} path with none -- the
        // simplest real distinguisher between the two real endpoints.
        if(url.includes("gmail.googleapis.com") && url.includes("?")){
            return { status: 200, headers: {}, body: JSON.stringify({ messages: [{ id: "m-xqzgpoll2", threadId: "t1" }] }) };
        }

        if(url.includes("gmail.googleapis.com")){
            return { status: 200, headers: {}, body: JSON.stringify({ id: "m-xqzgpoll2", snippet: "Hello XQZGPOLL2" }) };
        }

        if(url.includes("calendar/v3")){
            return { status: 200, headers: {}, body: JSON.stringify({ items: [{ id: "e-xqzgpoll2", summary: "Meeting XQZGPOLL2", start: { dateTime: "2026-08-01T10:00:00.000Z" } }] }) };
        }

        if(url.includes("drive/v3")){
            return { status: 200, headers: {}, body: JSON.stringify({ files: [{ id: "f-xqzgpoll2", name: "doc-XQZGPOLL2.txt", modifiedTime: "2026-08-01T09:00:00.000Z" }] }) };
        }

        throw new Error(`Unexpected URL in test: ${url}`);

    };

    try {

        const gmailFirst = await poll.pollGmail();
        assert.strictEqual(gmailFirst.length, 1);
        assert.match(gmailFirst[0].content, /Hello XQZGPOLL2/);

        const calendarFirst = await poll.pollCalendar();
        assert.strictEqual(calendarFirst.length, 1);
        assert.match(calendarFirst[0].content, /Meeting XQZGPOLL2/);

        const driveFirst = await poll.pollDrive();
        assert.strictEqual(driveFirst.length, 1);
        assert.match(driveFirst[0].content, /doc-XQZGPOLL2\.txt/);

        // Second poll: same items already ingested -- should dedupe to zero.
        const gmailSecond = await poll.pollGmail();
        assert.strictEqual(gmailSecond.length, 0);

        const events = eventIngestion.recentEvents({}).filter(e => e.content.includes("XQZGPOLL2"));
        assert.strictEqual(events.length, 3); // gmail + calendar + drive, not double-counted

    } finally {
        http.request = originalRequest;
    }

});


test("pollAll() authorized end-to-end returns per-source counts", async () => {

    const originalRequest = http.request;

    http.request = async () => ({ status: 200, headers: {}, body: JSON.stringify({ access_token: "a-xqzgpoll3", refresh_token: "b-xqzgpoll3", expires_in: 3600 }) });

    try {
        await configureAndAuthorize();
    } finally {
        http.request = originalRequest;
    }

    http.request = async (url) => {

        if(url.includes("gmail.googleapis.com")){
            return { status: 200, headers: {}, body: JSON.stringify({ messages: [] }) };
        }

        if(url.includes("calendar/v3")){
            return { status: 200, headers: {}, body: JSON.stringify({ items: [] }) };
        }

        return { status: 200, headers: {}, body: JSON.stringify({ files: [] }) };

    };

    try {

        const result = await poll.pollAll();

        assert.strictEqual(result.polled, true);
        assert.strictEqual(result.gmail, 0);
        assert.strictEqual(result.calendar, 0);
        assert.strictEqual(result.drive, 0);

    } finally {
        http.request = originalRequest;
    }

});
