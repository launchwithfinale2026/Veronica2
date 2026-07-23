const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

const DB_PATH = path.join(__dirname, "..", "core", "memory", "database.json");
const DB_BACKUP = path.join(os.tmpdir(), `veronica-database-backup-financebudgets-${process.pid}.json`);

const GRAPH_PATH = path.join(__dirname, "..", "core", "knowledge", "graph.json");
const GRAPH_BACKUP = path.join(os.tmpdir(), `veronica-graph-backup-financebudgets-${process.pid}.json`);

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
const budgets = require("../core/finance/budgets");


function makeCompany(name){
    return new CompanyManager().createCompany({ name });
}


test("createBudget() requires companyId/category/period/limit, and rejects an unknown company", () => {

    assert.throws(() => budgets.createBudget({ category: "x", period: "2026-08", limit: 100 }));
    assert.throws(() => budgets.createBudget({ companyId: "not-a-real-id", category: "x", period: "2026-08", limit: 100 }));

    const company = makeCompany("Budget Validation Co XQZFB1");
    assert.throws(() => budgets.createBudget({ companyId: company.id, period: "2026-08", limit: 100 }));
    assert.throws(() => budgets.createBudget({ companyId: company.id, category: "x", limit: 100 }));
    assert.throws(() => budgets.createBudget({ companyId: company.id, category: "x", period: "2026-08" }));

});


test("listBudgets() scopes to only the given company", () => {

    const companyA = makeCompany("Budget List Co A XQZFB2");
    const companyB = makeCompany("Budget List Co B XQZFB2");

    budgets.createBudget({ companyId: companyA.id, category: "infrastructure", period: "2026-08", limit: 500 });
    budgets.createBudget({ companyId: companyB.id, category: "infrastructure", period: "2026-08", limit: 500 });

    assert.strictEqual(budgets.listBudgets(companyA.id).length, 1);

});


test("budgetStatus() computes real actual spend against the company's real ledger, scoped by category and period", () => {

    const memory = require("../core/memory");
    const companyManager = new CompanyManager();
    const company = makeCompany("Budget Status Co XQZFB3");

    companyManager.recordFinance(company.id, { label: "AWS Aug", amount: 300, type: "expense", category: "infrastructure" });
    companyManager.recordFinance(company.id, { label: "AWS Sep (different period)", amount: 9999, type: "expense", category: "infrastructure" });
    companyManager.recordFinance(company.id, { label: "Marketing spend (different category)", amount: 400, type: "expense", category: "marketing" });
    companyManager.recordFinance(company.id, { label: "Revenue (not an expense)", amount: 5000, type: "revenue", category: "infrastructure" });

    // Finance entries live inside the company entry's own
    // metadata.finances array (core/executive/companyManager.js), not as
    // separate memory entries -- backdate the "different period" one
    // directly there, so this test doesn't depend on real wall-clock
    // timing to exercise the period filter.
    const companyEntry = memory.view().find(m => m.id === company.id);
    const finances = companyEntry.metadata.finances.map(entry =>
        entry.label === "AWS Sep (different period)" ? { ...entry, timestamp: "2020-09-01T00:00:00.000Z" } : entry
    );
    memory.update(company.id, { metadata: { finances } });

    const currentMonth = companyManager.getCompany(company.id).finances
        .find(entry => entry.label === "AWS Aug").timestamp.slice(0, 7);

    const budget = budgets.createBudget({ companyId: company.id, category: "infrastructure", period: currentMonth, limit: 250 });

    const status = budgets.budgetStatus(company.id);

    assert.strictEqual(status.length, 1);
    assert.strictEqual(status[0].id, budget.id);
    assert.strictEqual(status[0].actualSpend, 300);
    assert.strictEqual(status[0].remaining, -50);
    assert.strictEqual(status[0].overBudget, true);

});


test("budgetStatus() reports overBudget: false when spend is within the limit", () => {

    const companyManager = new CompanyManager();
    const company = makeCompany("Budget Within Co XQZFB4");

    companyManager.recordFinance(company.id, { label: "Small expense", amount: 50, type: "expense", category: "office" });

    const currentMonth = companyManager.getCompany(company.id).finances[0].timestamp.slice(0, 7);

    budgets.createBudget({ companyId: company.id, category: "office", period: currentMonth, limit: 500 });

    const status = budgets.budgetStatus(company.id);

    assert.strictEqual(status[0].actualSpend, 50);
    assert.strictEqual(status[0].remaining, 450);
    assert.strictEqual(status[0].overBudget, false);

});
