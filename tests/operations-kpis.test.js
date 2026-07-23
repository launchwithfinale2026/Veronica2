const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

const DB_PATH = path.join(__dirname, "..", "core", "memory", "database.json");
const DB_BACKUP = path.join(os.tmpdir(), `veronica-database-backup-opskpis-${process.pid}.json`);

test.before(() => {
    fs.copyFileSync(DB_PATH, DB_BACKUP);
});

test.after(() => {
    fs.copyFileSync(DB_BACKUP, DB_PATH);
    fs.unlinkSync(DB_BACKUP);
});

const kpis = require("../core/operations/kpis");


test("createKPI() requires a name and numeric target, and validates the real direction enum", () => {

    assert.throws(() => kpis.createKPI({}));
    assert.throws(() => kpis.createKPI({ name: "X" }));
    assert.throws(() => kpis.createKPI({ name: "X", target: 10, direction: "not-a-real-direction" }));

    const kpi = kpis.createKPI({ name: "Default Direction KPI XQZOK1", target: 100 });
    assert.strictEqual(kpi.direction, "higher_is_better");
    assert.strictEqual(kpi.actual, null);

});


test("listKPIs() optionally scopes to a department", () => {

    kpis.createKPI({ name: "Bizops KPI XQZOK2", department: "bizops", target: 10 });
    kpis.createKPI({ name: "Other KPI XQZOK2", department: "sales-dept", target: 20 });

    const scoped = kpis.listKPIs("bizops").filter(k => k.name.includes("XQZOK2"));
    assert.strictEqual(scoped.length, 1);

});


test("kpiStatus() reports null onTrack before any actual is recorded, honestly", () => {

    const kpi = kpis.createKPI({ name: "No Actual KPI XQZOK3", target: 100 });

    const status = kpis.kpiStatus(kpi.id);
    assert.strictEqual(status.onTrack, null);

});


test("kpiStatus() correctly grades \"higher_is_better\" and \"lower_is_better\" KPIs", () => {

    const higher = kpis.createKPI({ name: "Higher KPI XQZOK4", target: 100, direction: "higher_is_better" });
    kpis.recordActual(higher.id, 120);
    assert.strictEqual(kpis.kpiStatus(higher.id).onTrack, true);

    const higherMiss = kpis.createKPI({ name: "Higher Miss KPI XQZOK4", target: 100, direction: "higher_is_better" });
    kpis.recordActual(higherMiss.id, 80);
    assert.strictEqual(kpis.kpiStatus(higherMiss.id).onTrack, false);

    const lower = kpis.createKPI({ name: "Lower KPI XQZOK4", target: 5, direction: "lower_is_better" });
    kpis.recordActual(lower.id, 3);
    assert.strictEqual(kpis.kpiStatus(lower.id).onTrack, true);

    const lowerMiss = kpis.createKPI({ name: "Lower Miss KPI XQZOK4", target: 5, direction: "lower_is_better" });
    kpis.recordActual(lowerMiss.id, 8);
    assert.strictEqual(kpis.kpiStatus(lowerMiss.id).onTrack, false);

});


test("recordActual() requires a numeric value, and rejects an unknown KPI", () => {

    const kpi = kpis.createKPI({ name: "Validation KPI XQZOK5", target: 100 });

    assert.throws(() => kpis.recordActual(kpi.id, "not-a-number"));
    assert.throws(() => kpis.recordActual("not-a-real-id", 50));

});
