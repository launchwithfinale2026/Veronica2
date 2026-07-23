const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

const DB_PATH = path.join(__dirname, "..", "core", "memory", "database.json");
const DB_BACKUP = path.join(os.tmpdir(), `veronica-database-backup-salesopps-${process.pid}.json`);

const GRAPH_PATH = path.join(__dirname, "..", "core", "knowledge", "graph.json");
const GRAPH_BACKUP = path.join(os.tmpdir(), `veronica-graph-backup-salesopps-${process.pid}.json`);

test.before(() => {
    fs.copyFileSync(DB_PATH, DB_BACKUP);
    fs.copyFileSync(GRAPH_PATH, GRAPH_BACKUP);
});

test.after(() => {
    fs.copyFileSync(DB_BACKUP, DB_PATH);
    fs.unlinkSync(DB_BACKUP);
    fs.copyFileSync(GRAPH_BACKUP, GRAPH_PATH);
    fs.unlinkSync(GRAPH_BACKUP);
});

const CompanyManager = require("../core/executive/companyManager");
const opportunities = require("../core/sales/opportunities");


function makeCompany(name){
    return new CompanyManager().createCompany({ name });
}


test("createOpportunity() requires a companyId and name, and rejects an unknown company", () => {

    assert.throws(() => opportunities.createOpportunity({ name: "X" }));
    assert.throws(() => opportunities.createOpportunity({ companyId: "not-a-real-id", name: "X" }));

    const company = makeCompany("Opp Validation Co XQZO1");
    assert.throws(() => opportunities.createOpportunity({ companyId: company.id }));

});


test("createOpportunity() persists the real field shape, starting at \"prospecting\"", () => {

    const company = makeCompany("Opp Shape Co XQZO2");

    const opp = opportunities.createOpportunity({ companyId: company.id, name: "Deal XQZO2", value: 5000 });

    assert.strictEqual(opp.stage, "prospecting");
    assert.strictEqual(opp.value, 5000);
    assert.strictEqual(opp.stageHistory.length, 1);
    assert.deepStrictEqual(opp.contacts, []);
    assert.deepStrictEqual(opp.followUps, []);
    assert.strictEqual(opp.winReason, null);
    assert.strictEqual(opp.lossReason, null);

});


test("setStage() validates against the real enum and records stage history", () => {

    const company = makeCompany("Opp Stage Co XQZO3");
    const opp = opportunities.createOpportunity({ companyId: company.id, name: "Stage Deal XQZO3", value: 1000 });

    assert.throws(() => opportunities.setStage(opp.id, "not-a-real-stage"));

    opportunities.setStage(opp.id, "qualified");
    const updated = opportunities.setStage(opp.id, "proposal");

    assert.strictEqual(updated.stage, "proposal");
    assert.strictEqual(updated.stageHistory.length, 3);

});


test("setStage() requires a reason to close a deal, and records win/loss reasons distinctly", () => {

    const company = makeCompany("Opp Close Co XQZO4");

    const won = opportunities.createOpportunity({ companyId: company.id, name: "Won Deal XQZO4", value: 2000 });
    assert.throws(() => opportunities.setStage(won.id, "closed_won"));
    const wonResult = opportunities.setStage(won.id, "closed_won", { reason: "Great fit XQZO4" });
    assert.strictEqual(wonResult.winReason, "Great fit XQZO4");
    assert.strictEqual(wonResult.lossReason, null);

    const lost = opportunities.createOpportunity({ companyId: company.id, name: "Lost Deal XQZO4", value: 3000 });
    const lostResult = opportunities.setStage(lost.id, "closed_lost", { reason: "Chose a competitor XQZO4" });
    assert.strictEqual(lostResult.lossReason, "Chose a competitor XQZO4");
    assert.strictEqual(lostResult.winReason, null);

});


test("addContact() appends real stakeholders scoped to this opportunity", () => {

    const company = makeCompany("Opp Contact Co XQZO5");
    const opp = opportunities.createOpportunity({ companyId: company.id, name: "Contact Deal XQZO5", value: 1000 });

    assert.throws(() => opportunities.addContact(opp.id, {}));

    const contacts = opportunities.addContact(opp.id, { name: "Jane XQZO5", email: "jane@xqzo5.com", role: "Champion" });

    assert.strictEqual(contacts.length, 1);
    assert.strictEqual(contacts[0].role, "Champion");

});


test("scheduleFollowUp()/completeFollowUp() manage real follow-up tasks", () => {

    const company = makeCompany("Opp FollowUp Co XQZO6");
    const opp = opportunities.createOpportunity({ companyId: company.id, name: "FollowUp Deal XQZO6", value: 1000 });

    assert.throws(() => opportunities.scheduleFollowUp(opp.id, { date: "2026-08-01" }));

    opportunities.scheduleFollowUp(opp.id, { date: "2026-08-01", note: "Send proposal XQZO6" });
    const [item] = opportunities.getOpportunity(opp.id).followUps;

    assert.strictEqual(item.done, false);

    const completed = opportunities.completeFollowUp(opp.id, item.id);
    assert.strictEqual(completed.done, true);

    assert.throws(() => opportunities.completeFollowUp(opp.id, "not-a-real-followup"));

});


test("recordLessonLearned() appends a real, timestamped lesson", () => {

    const company = makeCompany("Opp Lessons Co XQZO7");
    const opp = opportunities.createOpportunity({ companyId: company.id, name: "Lessons Deal XQZO7", value: 1000 });

    opportunities.recordLessonLearned(opp.id, "Should have looped in the champion earlier XQZO7");

    const lessons = opportunities.getOpportunity(opp.id).lessonsLearned;
    assert.strictEqual(lessons.length, 1);
    assert.ok(lessons[0].timestamp);

});


test("forecast() computes a real, deterministic weighted-pipeline value, excluding closed deals", () => {

    const company = makeCompany("Opp Forecast Co XQZO8");

    const a = opportunities.createOpportunity({ companyId: company.id, name: "Forecast A XQZO8", value: 10000 });
    opportunities.setStage(a.id, "qualified");
    opportunities.setStage(a.id, "proposal");

    const b = opportunities.createOpportunity({ companyId: company.id, name: "Forecast B XQZO8", value: 4000 });
    opportunities.setStage(b.id, "qualified");

    const won = opportunities.createOpportunity({ companyId: company.id, name: "Forecast Won XQZO8", value: 50000 });
    opportunities.setStage(won.id, "closed_won", { reason: "Closed XQZO8" });

    const forecast = opportunities.forecast(company.id);

    // proposal (0.5 * 10000 = 5000) + qualified (0.25 * 4000 = 1000) = 6000.
    // closed_won's 50000 must NOT appear in the forward forecast.
    assert.strictEqual(forecast.weightedForecast, 6000);
    assert.strictEqual(forecast.totalOpenValue, 14000);
    assert.strictEqual(forecast.byStage.proposal.count, 1);
    assert.strictEqual(forecast.byStage.qualified.count, 1);
    assert.strictEqual(forecast.byStage.prospecting.count, 0);
    assert.ok(!("closed_won" in forecast.byStage));

});
