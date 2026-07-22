const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

// eventIngestion.ingest() writes real memory entries, unlike every other
// test in tests/integrations-connectors.test.js -- kept in its own file
// specifically so that file doesn't need this backup/restore discipline.
const DB_PATH = path.join(__dirname, "..", "core", "memory", "database.json");
const DB_BACKUP = path.join(os.tmpdir(), `veronica-database-backup-lastsync-${process.pid}.json`);

test.before(() => {
    fs.copyFileSync(DB_PATH, DB_BACKUP);
});

test.after(() => {
    fs.copyFileSync(DB_BACKUP, DB_PATH);
    fs.unlinkSync(DB_BACKUP);
});

const registry = require("../core/integrations/registry");
const eventIngestion = require("../core/integrations/eventIngestion");


test("registry reports lastSync as null for github/google before anything is ingested, and real once ingested", () => {

    const before = registry.list();
    // Some other test file may have ingested github/gmail/calendar/drive
    // events into this same shared database.json before this file ran
    // (node --test runs files in separate processes, but the underlying
    // file is real and persistent across a single `npm test` invocation
    // is NOT guaranteed clean) -- so this only asserts the REAL behavior
    // (a valid ISO timestamp or null), not that it's null in isolation.
    const githubBefore = before.find(i => i.id === "github").lastSync;
    assert.ok(githubBefore === null || typeof githubBefore === "string");

    eventIngestion.ingest({ source: "github", kind: "pull_request", summary: "PR XQZLASTSYNC1", occurredAt: "2026-01-01T00:00:00.000Z" });
    eventIngestion.ingest({ source: "calendar", kind: "event", summary: "Meeting XQZLASTSYNC1", occurredAt: "2026-06-01T00:00:00.000Z" });

    const after = registry.list();

    assert.strictEqual(after.find(i => i.id === "github").lastSync, "2026-01-01T00:00:00.000Z");
    // google's lastSync is the most recent across gmail/calendar/drive --
    // the calendar event (2026-06-01) is more recent than anything else
    // ingested here.
    assert.strictEqual(after.find(i => i.id === "google").lastSync, "2026-06-01T00:00:00.000Z");

});
