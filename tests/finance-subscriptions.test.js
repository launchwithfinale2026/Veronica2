const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

const DB_PATH = path.join(__dirname, "..", "core", "memory", "database.json");
const DB_BACKUP = path.join(os.tmpdir(), `veronica-database-backup-financesubs-${process.pid}.json`);

const GRAPH_PATH = path.join(__dirname, "..", "core", "knowledge", "graph.json");
const GRAPH_BACKUP = path.join(os.tmpdir(), `veronica-graph-backup-financesubs-${process.pid}.json`);

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
const subscriptions = require("../core/finance/subscriptions");


function makeCompany(name){
    return new CompanyManager().createCompany({ name });
}


test("createSubscription() requires companyId/clientName/amount/a real interval, and rejects an unknown company", () => {

    assert.throws(() => subscriptions.createSubscription({ clientName: "X", amount: 100, interval: "monthly" }));
    assert.throws(() => subscriptions.createSubscription({ companyId: "not-a-real-id", clientName: "X", amount: 100, interval: "monthly" }));

    const company = makeCompany("Sub Validation Co XQZFS1");
    assert.throws(() => subscriptions.createSubscription({ companyId: company.id, amount: 100, interval: "monthly" }));
    assert.throws(() => subscriptions.createSubscription({ companyId: company.id, clientName: "X", interval: "monthly" }));
    assert.throws(() => subscriptions.createSubscription({ companyId: company.id, clientName: "X", amount: 100, interval: "weekly" }));

});


test("createSubscription() starts \"active\"", () => {

    const company = makeCompany("Sub Shape Co XQZFS2");

    const subscription = subscriptions.createSubscription({ companyId: company.id, clientName: "Acme XQZFS2", amount: 100, interval: "monthly" });

    assert.strictEqual(subscription.status, "active");

});


test("cancelSubscription() sets status to \"canceled\"", () => {

    const company = makeCompany("Sub Cancel Co XQZFS3");
    const subscription = subscriptions.createSubscription({ companyId: company.id, clientName: "Acme XQZFS3", amount: 100, interval: "monthly" });

    assert.strictEqual(subscriptions.cancelSubscription(subscription.id), "canceled");
    assert.strictEqual(subscriptions.listSubscriptions(company.id).find(s => s.id === subscription.id).status, "canceled");

});


test("mrr()/arr() correctly normalize annual subscriptions and exclude canceled ones", () => {

    const company = makeCompany("Sub MRR Co XQZFS4");

    subscriptions.createSubscription({ companyId: company.id, clientName: "Monthly Client XQZFS4", amount: 100, interval: "monthly" });
    subscriptions.createSubscription({ companyId: company.id, clientName: "Annual Client XQZFS4", amount: 1200, interval: "annual" });

    const canceled = subscriptions.createSubscription({ companyId: company.id, clientName: "Canceled Client XQZFS4", amount: 500, interval: "monthly" });
    subscriptions.cancelSubscription(canceled.id);

    // 100 (monthly) + 1200/12 (annual normalized) = 200. Canceled
    // client's 500 must NOT be counted.
    assert.strictEqual(subscriptions.mrr(company.id), 200);
    assert.strictEqual(subscriptions.arr(company.id), 2400);

});
