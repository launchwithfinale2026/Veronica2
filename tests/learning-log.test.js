const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

const LOG_PATH = path.join(__dirname, "..", "core", "learning", "executions.log");
const LOG_EXISTED_BEFORE = fs.existsSync(LOG_PATH);
const LOG_BACKUP = path.join(os.tmpdir(), `veronica-executions-backup-log-${process.pid}.log`);

test.before(() => {
    if(LOG_EXISTED_BEFORE){
        fs.copyFileSync(LOG_PATH, LOG_BACKUP);
    }
});

test.after(() => {
    if(LOG_EXISTED_BEFORE){
        fs.copyFileSync(LOG_BACKUP, LOG_PATH);
        fs.unlinkSync(LOG_BACKUP);
    } else if(fs.existsSync(LOG_PATH)){
        fs.unlinkSync(LOG_PATH);
    }
});

const log = require("../core/learning/log");

test("record() appends a JSON-line entry with an id and timestamp, readable back via readAll()", () => {

    const before = log.readAll().length;

    const entry = log.record({ kind: "tool_call", tool: "test.marker.XQZLOG1", outcome: "success", durationMs: 12 });

    assert.ok(entry.id);
    assert.ok(entry.timestamp);
    assert.strictEqual(entry.tool, "test.marker.XQZLOG1");

    const all = log.readAll();
    assert.strictEqual(all.length, before + 1);
    assert.strictEqual(all[all.length - 1].id, entry.id);

});

test("readAll() returns an empty array when the log file doesn't exist yet", () => {

    if(fs.existsSync(LOG_PATH)){
        fs.unlinkSync(LOG_PATH);
    }

    assert.deepStrictEqual(log.readAll(), []);

});
