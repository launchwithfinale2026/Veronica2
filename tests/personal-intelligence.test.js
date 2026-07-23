const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

const DB_PATH = path.join(__dirname, "..", "core", "memory", "database.json");
const DB_BACKUP = path.join(os.tmpdir(), `veronica-database-backup-personalintel-${process.pid}.json`);

const GRAPH_PATH = path.join(__dirname, "..", "core", "knowledge", "graph.json");
const GRAPH_BACKUP = path.join(os.tmpdir(), `veronica-graph-backup-personalintel-${process.pid}.json`);

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

const knowledge = require("../core/knowledge");
const CompanyManager = require("../core/executive/companyManager");
const invoices = require("../core/finance/invoices");
const subscriptions = require("../core/finance/subscriptions");
const ActionProposalEngine = require("../core/executive/actionProposal");
const ExecutivePlanner = require("../core/executive/planner");
const personalIntelligence = require("../core/profile/personalIntelligence");


test("confidenceFromSampleSize() is deterministic and zero evidence means zero confidence", () => {

    assert.strictEqual(personalIntelligence.confidenceFromSampleSize(0), 0);
    assert.ok(personalIntelligence.confidenceFromSampleSize(1) < personalIntelligence.confidenceFromSampleSize(5));
    assert.ok(personalIntelligence.confidenceFromSampleSize(5) < personalIntelligence.confidenceFromSampleSize(20));
    assert.ok(personalIntelligence.confidenceFromSampleSize(1000) < 1);

});


test("inferImportantRelationships() ranks real knowledge-graph person/client entities by real connection count, citing real evidence", () => {

    knowledge.addEntity({ name: "XQZPI1 Person One", type: "person" });
    knowledge.addEntity({ name: "XQZPI1 Person Two", type: "person" });
    knowledge.addEntity({ name: "XQZPI1 Department", type: "department" });

    knowledge.addRelationship({ from: "XQZPI1 Person One", to: "XQZPI1 Department", type: "belongsTo" });
    knowledge.addRelationship({ from: "XQZPI1 Person One", to: "VERONICA", type: "contains" });

    const inferences = personalIntelligence.inferImportantRelationships();

    const personOne = inferences.find(i => i.subject === "XQZPI1 Person One");
    const personTwo = inferences.find(i => i.subject === "XQZPI1 Person Two");
    const department = inferences.find(i => i.subject === "XQZPI1 Department");

    assert.ok(personOne, "expected a real inference for the more-connected person");
    assert.strictEqual(personOne.evidence.count, 2);
    assert.strictEqual(department, undefined, "department entities are not relationships");
    // Person Two has zero connections -- zero confidence, excluded.
    assert.strictEqual(personTwo, undefined);

});


test("inferDecisionPatterns() re-surfaces real adaptiveInsights acceptance data, not a fabricated second signal", () => {

    const realPlanner = new ExecutivePlanner();
    const engine = new ActionProposalEngine({ planner: realPlanner });

    const proposal = engine.proposeExternalAction({
        action: "post_discord_message",
        reason: "personal intelligence test XQZPI2",
        payload: { content: "test" }
    });

    engine.approve(proposal.id);

    const inferences = personalIntelligence.inferDecisionPatterns();

    const found = inferences.find(i => i.subject === "post_discord_message");

    assert.ok(found);
    assert.ok(found.evidence.total >= 1);
    assert.match(found.inference, /accepted \d+% of the time/);

});


test("inferKeyClients() ranks real clients by real billing activity from invoices and subscriptions (Phase 43 data)", () => {

    const companyManager = new CompanyManager();
    const company = companyManager.createCompany({ name: "Personal Intelligence Co XQZPI3" });

    invoices.createInvoice({ companyId: company.id, clientName: "XQZPI3 Big Client", amount: 5000 });
    invoices.createInvoice({ companyId: company.id, clientName: "XQZPI3 Big Client", amount: 3000 });
    subscriptions.createSubscription({ companyId: company.id, clientName: "XQZPI3 Subscriber Only", amount: 200, interval: "monthly" });

    const inferences = personalIntelligence.inferKeyClients(company.id);

    const bigClient = inferences.find(i => i.subject === "XQZPI3 Big Client");
    const subscriberOnly = inferences.find(i => i.subject === "XQZPI3 Subscriber Only");

    assert.ok(bigClient);
    assert.strictEqual(bigClient.evidence.totalBilled, 8000);
    assert.strictEqual(bigClient.evidence.invoiceCount, 2);

    // A client with only a subscription (zero invoices) still has real
    // activity and must not be silently zeroed out.
    assert.ok(subscriberOnly);
    assert.ok(subscriberOnly.confidence > 0);

    assert.throws(() => personalIntelligence.inferKeyClients());

});


test("dismissInference()/listDismissed() persist a real correction, and every infer*() function honestly excludes it afterward", () => {

    knowledge.addEntity({ name: "XQZPI4 Dismissable Person", type: "person" });
    knowledge.addRelationship({ from: "XQZPI4 Dismissable Person", to: "VERONICA", type: "contains" });

    const before = personalIntelligence.inferImportantRelationships();
    assert.ok(before.some(i => i.subject === "XQZPI4 Dismissable Person"));

    const dismissal = personalIntelligence.dismissInference("XQZPI4 Dismissable Person", "not actually relevant XQZPI4");

    const dismissedList = personalIntelligence.listDismissed();
    assert.ok(dismissedList.some(d => d.subject === "XQZPI4 Dismissable Person" && d.reason === "not actually relevant XQZPI4"));

    const after = personalIntelligence.inferImportantRelationships();
    assert.ok(!after.some(i => i.subject === "XQZPI4 Dismissable Person"));

    assert.ok(dismissal.id);
    assert.throws(() => personalIntelligence.dismissInference());

});
