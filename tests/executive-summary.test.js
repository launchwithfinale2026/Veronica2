const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

const DB_PATH = path.join(__dirname, "..", "core", "memory", "database.json");
const DB_BACKUP = path.join(os.tmpdir(), `veronica-database-backup-execsummary-${process.pid}.json`);

const GRAPH_PATH = path.join(__dirname, "..", "core", "knowledge", "graph.json");
const GRAPH_BACKUP = path.join(os.tmpdir(), `veronica-graph-backup-execsummary-${process.pid}.json`);

const STATE_PATH = path.join(__dirname, "..", "core", "capabilities", "state.json");
const STATE_EXISTED_BEFORE = fs.existsSync(STATE_PATH);
const STATE_BACKUP = path.join(os.tmpdir(), `veronica-capabilities-state-backup-execsummary-${process.pid}.json`);

test.before(() => {
    fs.copyFileSync(DB_PATH, DB_BACKUP);
    fs.copyFileSync(GRAPH_PATH, GRAPH_BACKUP);
    if(STATE_EXISTED_BEFORE){
        fs.copyFileSync(STATE_PATH, STATE_BACKUP);
    }
});

test.after(() => {
    fs.copyFileSync(DB_BACKUP, DB_PATH);
    fs.unlinkSync(DB_BACKUP);
    fs.copyFileSync(GRAPH_BACKUP, GRAPH_PATH);
    fs.unlinkSync(GRAPH_BACKUP);
    if(STATE_EXISTED_BEFORE){
        fs.copyFileSync(STATE_BACKUP, STATE_PATH);
        fs.unlinkSync(STATE_BACKUP);
    } else if(fs.existsSync(STATE_PATH)){
        fs.unlinkSync(STATE_PATH);
    }
});

const registry = require("../core/capabilities/registry");
const executiveSummary = require("../core/executive/executiveSummary");


test("criticalAlerts() flags real high memory/disk usage only above threshold", () => {

    const belowThreshold = executiveSummary.criticalAlerts({ health: { memory: { usedPercent: 50 }, disk: { usedPercent: 50 } } });
    assert.ok(!belowThreshold.some(a => a.kind === "high_memory_usage"));
    assert.ok(!belowThreshold.some(a => a.kind === "high_disk_usage"));

    const aboveThreshold = executiveSummary.criticalAlerts({ health: { memory: { usedPercent: 95 }, disk: { usedPercent: 99 } } });
    assert.ok(aboveThreshold.some(a => a.kind === "high_memory_usage"));
    assert.ok(aboveThreshold.some(a => a.kind === "high_disk_usage"));

});


test("criticalAlerts() surfaces a real capability in error status", () => {

    registry.register({ name: "test-cap-execsummary1", version: "1.0.0", description: "test" });
    registry.setStatus("test-cap-execsummary1", "active");
    registry.setStatus("test-cap-execsummary1", "error", "simulated");

    const alerts = executiveSummary.criticalAlerts({});
    assert.ok(alerts.some(a => a.kind === "capability_error" && a.subject === "test-cap-execsummary1"));

    registry.remove("test-cap-execsummary1");

});


test("generate() assembles todaysPriorities/criticalAlerts against real executive state without throwing", () => {

    const summary = executiveSummary.generate({ health: { memory: { usedPercent: 10 }, disk: { usedPercent: 10 } } });

    assert.ok(summary.generatedAt);
    assert.ok(Array.isArray(summary.todaysPriorities));
    assert.ok(Array.isArray(summary.criticalAlerts));

});
