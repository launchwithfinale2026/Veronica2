const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

const maintenance = require("../core/system/maintenance");


test("archiveLogIfLarge() is a real no-op for a log file that doesn't exist yet", () => {

    const result = maintenance.archiveLogIfLarge(path.join(os.tmpdir(), "veronica-no-such-log-xqzmaint1.log"));

    assert.strictEqual(result.archived, false);
    assert.match(result.reason, /does not exist/);

});


test("archiveLogIfLarge() is a real no-op under the real size threshold", () => {

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "veronica-maintenance-xqzmaint2-"));
    const logPath = path.join(tmpDir, "small.log");

    try {

        fs.writeFileSync(logPath, "a small real log entry\n");

        const result = maintenance.archiveLogIfLarge(logPath, { maxBytes: 1024 * 1024 });

        assert.strictEqual(result.archived, false);
        assert.match(result.reason, /under threshold/);
        assert.ok(fs.existsSync(logPath));

    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    }

});


test("archiveLogIfLarge() renames (never deletes) a real log file once it crosses the real threshold", () => {

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "veronica-maintenance-xqzmaint3-"));
    const logPath = path.join(tmpDir, "big.log");

    try {

        fs.writeFileSync(logPath, "x".repeat(2000));

        const result = maintenance.archiveLogIfLarge(logPath, { maxBytes: 1000 });

        assert.strictEqual(result.archived, true);
        assert.strictEqual(result.sizeBytes, 2000);
        assert.ok(fs.existsSync(result.archivePath), "the archived copy must exist");
        assert.ok(!fs.existsSync(logPath), "the original path must no longer exist -- renamed, not copied");

        // The real content survived the move -- this is archival, not
        // destruction.
        assert.strictEqual(fs.readFileSync(result.archivePath, "utf8"), "x".repeat(2000));

    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    }

});


test("runLogArchival() covers the real executions.log and errors.log paths, and a fresh write recreates the file cleanly", () => {

    const learningLog = require("../core/learning/log");
    const log = require("../core/logging");

    const executionsBackup = fs.existsSync(learningLog.LOG_FILE) ? fs.readFileSync(learningLog.LOG_FILE) : null;
    const errorsBackup = fs.existsSync(log.LOG_FILE) ? fs.readFileSync(log.LOG_FILE) : null;

    try {

        // Force both real logs over an artificially tiny threshold so
        // this test exercises the real archival path against the real
        // files runLogArchival() actually targets, not a stand-in.
        fs.writeFileSync(learningLog.LOG_FILE, "x".repeat(2000));
        fs.writeFileSync(log.LOG_FILE, "x".repeat(2000));

        const result = maintenance.runLogArchival({ maxBytes: 1000 });

        assert.strictEqual(result.executionsLog.archived, true);
        assert.strictEqual(result.errorsLog.archived, true);
        assert.ok(!fs.existsSync(learningLog.LOG_FILE));
        assert.ok(!fs.existsSync(log.LOG_FILE));

        // A fresh append recreates the file at the same real path --
        // proves normal logging keeps working immediately after
        // archival, no restart or manual recovery needed.
        learningLog.record({ kind: "test_after_archival", outcome: "success" });
        assert.ok(fs.existsSync(learningLog.LOG_FILE));

        fs.unlinkSync(result.executionsLog.archivePath);
        fs.unlinkSync(result.errorsLog.archivePath);

    } finally {

        if(executionsBackup !== null){
            fs.writeFileSync(learningLog.LOG_FILE, executionsBackup);
        } else if(fs.existsSync(learningLog.LOG_FILE)){
            fs.unlinkSync(learningLog.LOG_FILE);
        }

        if(errorsBackup !== null){
            fs.writeFileSync(log.LOG_FILE, errorsBackup);
        } else if(fs.existsSync(log.LOG_FILE)){
            fs.unlinkSync(log.LOG_FILE);
        }

    }

});


test("consistencyReport() reuses real selfImprovement/marketplace checks -- report-only, never fixes anything itself", () => {

    const report = maintenance.consistencyReport();

    assert.ok(Array.isArray(report.duplicatedCapabilityTools));
    assert.ok(Array.isArray(report.brokenCapabilities));
    assert.ok(report.generatedAt);

});
