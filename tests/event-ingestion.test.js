const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

const DB_PATH = path.join(__dirname, "..", "core", "memory", "database.json");
const DB_BACKUP = path.join(os.tmpdir(), `veronica-database-backup-eventingest-${process.pid}.json`);

test.before(() => {
    fs.copyFileSync(DB_PATH, DB_BACKUP);
});

test.after(() => {
    fs.copyFileSync(DB_BACKUP, DB_PATH);
    fs.unlinkSync(DB_BACKUP);
});

const eventIngestion = require("../core/integrations/eventIngestion");


test("ingest() rejects an unknown source, a missing kind, and a missing summary", () => {

    assert.throws(() => eventIngestion.ingest({ source: "slack", kind: "message", summary: "x" }), /Unknown event source/);
    assert.throws(() => eventIngestion.ingest({ source: "github", summary: "x" }), /kind is required/);
    assert.throws(() => eventIngestion.ingest({ source: "github", kind: "commit" }), /summary is required/);

});


test("ingest() stores a normal memory entry tagged external-event/source/kind, via the real remember() pipeline", () => {

    const entry = eventIngestion.ingest({
        source: "github",
        kind: "pull_request",
        summary: "New PR XQZEVT1: Fix login bug",
        occurredAt: "2026-01-01T00:00:00.000Z",
        importance: 5,
        metadata: { owner: "octocat", repo: "hello-world", number: 7 }
    });

    assert.ok(entry.id);
    assert.strictEqual(entry.content, "New PR XQZEVT1: Fix login bug");
    assert.strictEqual(entry.importance, 5);
    assert.deepStrictEqual(entry.tags, ["external-event", "source:github", "kind:pull_request"]);
    assert.strictEqual(entry.source, "integration:github");
    assert.strictEqual(entry.metadata.owner, "octocat");
    assert.strictEqual(entry.metadata.occurredAt, "2026-01-01T00:00:00.000Z");

    // Phase 12 classification/importance/lifecycle still ran -- this is
    // an ordinary memory entry, not a second parallel system.
    assert.ok(entry.metadata.memoryClass);
    assert.strictEqual(entry.metadata.lifecycle, "temporary");

});


test("ingest() defaults importance to 3 and occurredAt to now when omitted", () => {

    const before = Date.now();
    const entry = eventIngestion.ingest({ source: "discord", kind: "message", summary: "XQZEVT2 incoming message" });
    const after = Date.now();

    assert.strictEqual(entry.importance, 3);
    const occurredAtMs = new Date(entry.metadata.occurredAt).getTime();
    assert.ok(occurredAtMs >= before && occurredAtMs <= after);

});


test("recentEvents() scopes by source and since, and sorts most-recent-first", () => {

    eventIngestion.ingest({ source: "gmail", kind: "email", summary: "XQZEVT3 old email", occurredAt: "2020-01-01T00:00:00.000Z" });
    eventIngestion.ingest({ source: "gmail", kind: "email", summary: "XQZEVT3 new email", occurredAt: "2026-06-01T00:00:00.000Z" });
    eventIngestion.ingest({ source: "calendar", kind: "event", summary: "XQZEVT3 calendar event", occurredAt: "2026-06-01T00:00:00.000Z" });

    const gmailOnly = eventIngestion.recentEvents({ source: "gmail" }).filter(e => e.content.includes("XQZEVT3"));
    assert.strictEqual(gmailOnly.length, 2);
    assert.strictEqual(gmailOnly[0].content, "XQZEVT3 new email"); // most recent first

    const sinceRecent = eventIngestion.recentEvents({ source: "gmail", since: "2025-01-01T00:00:00.000Z" }).filter(e => e.content.includes("XQZEVT3"));
    assert.strictEqual(sinceRecent.length, 1);
    assert.strictEqual(sinceRecent[0].content, "XQZEVT3 new email");

});


test("recentEvents() respects limit", () => {

    for(let i = 0; i < 3; i++){
        eventIngestion.ingest({ source: "drive", kind: "file", summary: `XQZEVT4 file ${i}` });
    }

    const limited = eventIngestion.recentEvents({ source: "drive", limit: 2 }).filter(e => e.content.includes("XQZEVT4"));
    assert.strictEqual(limited.length, 2);

});
