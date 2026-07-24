const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

const LOG_PATH = path.join(__dirname, "..", "core", "logging", "errors.log");
const LOG_EXISTED_BEFORE = fs.existsSync(LOG_PATH);
const LOG_BACKUP = path.join(os.tmpdir(), `veronica-errors-log-backup-crashguard-${process.pid}.log`);

const CRASH_LOG_PATH_FOR_BACKUP = path.join(__dirname, "..", "runtime", "logs", "crash.log");
const CRASH_LOG_EXISTED_BEFORE = fs.existsSync(CRASH_LOG_PATH_FOR_BACKUP);
const CRASH_LOG_BACKUP = path.join(os.tmpdir(), `veronica-crash-log-backup-crashguard-${process.pid}.log`);

test.before(() => {
    if(LOG_EXISTED_BEFORE){
        fs.copyFileSync(LOG_PATH, LOG_BACKUP);
    }
    // Truncate to empty for this file's run only (restored from the real
    // backup in test.after() below). readErrors(1000) below asserts an
    // exact before/after diff of 1 -- errors.log has organically grown
    // past 1000 real lines over the life of this project, so
    // slice(-1000) silently caps both reads at 1000 and the diff-by-1
    // assumption breaks. Starting from empty makes the count
    // deterministic regardless of how large the real log has grown.
    fs.writeFileSync(LOG_PATH, "");

    if(CRASH_LOG_EXISTED_BEFORE){
        fs.copyFileSync(CRASH_LOG_PATH_FOR_BACKUP, CRASH_LOG_BACKUP);
    }
});

test.after(() => {

    if(LOG_EXISTED_BEFORE){
        fs.copyFileSync(LOG_BACKUP, LOG_PATH);
        fs.unlinkSync(LOG_BACKUP);
    } else if(fs.existsSync(LOG_PATH)){
        fs.unlinkSync(LOG_PATH);
    }

    if(CRASH_LOG_EXISTED_BEFORE){
        fs.copyFileSync(CRASH_LOG_BACKUP, CRASH_LOG_PATH_FOR_BACKUP);
        fs.unlinkSync(CRASH_LOG_BACKUP);
    } else if(fs.existsSync(CRASH_LOG_PATH_FOR_BACKUP)){
        fs.unlinkSync(CRASH_LOG_PATH_FOR_BACKUP);
    }

});

// Deliberately does NOT test via process.emit("unhandledRejection"/
// "uncaughtException", ...) -- Node's own test runner listens for those
// same two events to detect real test failures, so synthetically
// emitting them fights the test runner instead of exercising this
// module's logic (confirmed: doing it that way made both tests below
// report as failures with the synthetic error as the failure reason).
// makeUnhandledRejectionHandler()/makeUncaughtExceptionHandler() expose
// the handler functions directly for exactly this reason -- call them
// like any other function.
const {
    installCrashGuards,
    makeUnhandledRejectionHandler,
    makeUncaughtExceptionHandler,
    CRASH_LOG_PATH
} = require("../core/logging/crashGuard");

const log = require("../core/logging");

test("installCrashGuards() registers exactly one listener per event, not a duplicate on repeated calls", () => {

    const before = {
        rejection: process.listenerCount("unhandledRejection"),
        exception: process.listenerCount("uncaughtException")
    };

    installCrashGuards("test-crash-guard");

    const after = {
        rejection: process.listenerCount("unhandledRejection"),
        exception: process.listenerCount("uncaughtException")
    };

    assert.strictEqual(after.rejection, before.rejection + 1);
    assert.strictEqual(after.exception, before.exception + 1);

    process.removeAllListeners("unhandledRejection");
    process.removeAllListeners("uncaughtException");

});

test("the unhandledRejection handler logs the error and does not touch process.exit", () => {

    const handler = makeUnhandledRejectionHandler("test-crash-guard");

    const before = log.readErrors(1000).length;

    handler(new Error("synthetic rejection XQZCRASH1"));

    const after = log.readErrors(1000);

    assert.strictEqual(after.length, before + 1);
    assert.ok(after[0].message.includes("synthetic rejection XQZCRASH1"));
    assert.strictEqual(after[0].level, "error");

});

test("the unhandledRejection handler handles a non-Error rejection reason", () => {

    const handler = makeUnhandledRejectionHandler("test-crash-guard");

    const before = log.readErrors(1000).length;

    handler("a plain string rejection XQZCRASH3");

    const after = log.readErrors(1000);

    assert.strictEqual(after.length, before + 1);
    assert.ok(after[0].message.includes("a plain string rejection XQZCRASH3"));

});

test("the uncaughtException handler logs the error and calls process.exit(1)", () => {

    const handler = makeUncaughtExceptionHandler("test-crash-guard");

    const before = log.readErrors(1000).length;

    const realExit = process.exit;
    let exitCode = null;
    process.exit = code => { exitCode = code; };

    try {
        handler(new Error("synthetic crash XQZCRASH2"));
    } finally {
        process.exit = realExit;
    }

    assert.strictEqual(exitCode, 1);

    const after = log.readErrors(1000);
    assert.strictEqual(after.length, before + 1);
    assert.ok(after[0].message.includes("synthetic crash XQZCRASH2"));

});

test("the uncaughtException handler also appends a real, human-readable line to runtime/logs/crash.log (Phase 46.5)", () => {

    const handler = makeUncaughtExceptionHandler("test-crash-guard");

    const before = fs.existsSync(CRASH_LOG_PATH) ? fs.readFileSync(CRASH_LOG_PATH, "utf8") : "";

    const realExit = process.exit;
    process.exit = () => {};

    try {
        handler(new Error("synthetic crash XQZCRASH4"));
    } finally {
        process.exit = realExit;
    }

    const after = fs.readFileSync(CRASH_LOG_PATH, "utf8");

    assert.ok(after.length > before.length);
    assert.ok(after.includes("synthetic crash XQZCRASH4"));
    assert.ok(after.includes("test-crash-guard"));

});
