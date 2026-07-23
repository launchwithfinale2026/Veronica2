const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

const LOG_PATH = path.join(__dirname, "..", "core", "logging", "errors.log");
const LOG_EXISTED_BEFORE = fs.existsSync(LOG_PATH);
const LOG_BACKUP = path.join(os.tmpdir(), `veronica-errors-log-backup-${process.pid}.log`);

test.before(() => {
    if(LOG_EXISTED_BEFORE){
        fs.copyFileSync(LOG_PATH, LOG_BACKUP);
    }
    // Truncate to empty for this file's run only (restored from the real
    // backup in test.after() below) -- see tests/crash-guard.test.js's
    // identical comment: readErrors(1000)'s before/after diff-by-N
    // assumption breaks once the real log has grown past 1000 lines,
    // which it now has.
    fs.writeFileSync(LOG_PATH, "");
});

test.after(() => {
    if(LOG_EXISTED_BEFORE){
        fs.copyFileSync(LOG_BACKUP, LOG_PATH);
        fs.unlinkSync(LOG_BACKUP);
    } else if(fs.existsSync(LOG_PATH)){
        fs.unlinkSync(LOG_PATH);
    }
});

const log = require("../core/logging");

test("debug()/info() do not persist to errors.log", () => {

    const before = fs.existsSync(LOG_PATH) ? log.readErrors().length : 0;

    log.debug("test-module", "a debug line XQZLOG1");
    log.info("test-module", "an info line XQZLOG1");

    const after = fs.existsSync(LOG_PATH) ? log.readErrors().length : 0;

    assert.strictEqual(after, before);

});

test("warn()/error() persist a structured entry to errors.log", () => {

    const before = log.readErrors(1000).length;

    log.warn("test-module", "a warning XQZLOG2", { detail: "something" });
    log.error("test-module", "an error XQZLOG2", { stack: "fake stack" });

    const after = log.readErrors(1000);

    assert.strictEqual(after.length, before + 2);

    const warnEntry = after.find(e => e.message === "a warning XQZLOG2");
    const errorEntry = after.find(e => e.message === "an error XQZLOG2");

    assert.strictEqual(warnEntry.level, "warn");
    assert.strictEqual(warnEntry.module, "test-module");
    assert.deepStrictEqual(warnEntry.meta, { detail: "something" });

    assert.strictEqual(errorEntry.level, "error");
    assert.deepStrictEqual(errorEntry.meta, { stack: "fake stack" });

});

test("readErrors() returns most-recent-first and respects limit", () => {

    log.error("test-module", "first XQZLOG3");
    log.error("test-module", "second XQZLOG3");
    log.error("test-module", "third XQZLOG3");

    const results = log.readErrors(2);

    assert.strictEqual(results.length, 2);
    assert.strictEqual(results[0].message, "third XQZLOG3");
    assert.strictEqual(results[1].message, "second XQZLOG3");

});

test("readErrors() returns an empty array when the log file doesn't exist yet", () => {

    if(fs.existsSync(LOG_PATH)){
        fs.unlinkSync(LOG_PATH);
    }

    assert.deepStrictEqual(log.readErrors(), []);

});
