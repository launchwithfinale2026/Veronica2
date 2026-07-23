const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

const DB_PATH = path.join(__dirname, "..", "core", "memory", "database.json");
const DB_BACKUP = path.join(os.tmpdir(), `veronica-database-backup-financereports-${process.pid}.json`);

const GRAPH_PATH = path.join(__dirname, "..", "core", "knowledge", "graph.json");
const GRAPH_BACKUP = path.join(os.tmpdir(), `veronica-graph-backup-financereports-${process.pid}.json`);

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

const memory = require("../core/memory");
const CompanyManager = require("../core/executive/companyManager");
const subscriptions = require("../core/finance/subscriptions");
const invoices = require("../core/finance/invoices");
const reports = require("../core/finance/reports");


function makeCompany(name){
    return new CompanyManager().createCompany({ name });
}


// Backdates every finance entry currently on the company to a specific
// month, so cash-flow/runway tests don't depend on real wall-clock
// timing or accumulate across multiple test months.
function backdateAllFinances(companyId, isoMonth){

    const entry = memory.view().find(m => m.id === companyId);

    const finances = entry.metadata.finances.map((financeEntry, index) => ({
        ...financeEntry,
        timestamp: `${isoMonth}-0${(index % 9) + 1}T00:00:00.000Z`
    }));

    memory.update(companyId, { metadata: { finances } });

}


test("cashFlow() groups real ledger entries into real monthly revenue/expense/net", () => {

    const companyManager = new CompanyManager();
    const company = makeCompany("CashFlow Co XQZFR1");

    companyManager.recordFinance(company.id, { label: "Rev 1", amount: 1000, type: "revenue" });
    companyManager.recordFinance(company.id, { label: "Exp 1", amount: 400, type: "expense" });

    backdateAllFinances(company.id, "2026-05");

    const flow = reports.cashFlow(company.id);

    assert.strictEqual(flow.length, 1);
    assert.strictEqual(flow[0].month, "2026-05");
    assert.strictEqual(flow[0].revenue, 1000);
    assert.strictEqual(flow[0].expense, 400);
    assert.strictEqual(flow[0].net, 600);

});


test("runway() reports \"profitable\" with a null runwayMonths when the recent average net is non-negative", () => {

    const companyManager = new CompanyManager();
    const company = makeCompany("Runway Profitable Co XQZFR2");

    companyManager.recordFinance(company.id, { label: "Rev", amount: 5000, type: "revenue" });
    companyManager.recordFinance(company.id, { label: "Exp", amount: 1000, type: "expense" });

    backdateAllFinances(company.id, "2026-06");

    const result = reports.runway(company.id);

    assert.strictEqual(result.status, "profitable");
    assert.strictEqual(result.runwayMonths, null);
    assert.strictEqual(result.avgMonthlyBurn, 0);

});


test("runway() computes a real, deterministic months-remaining figure when the recent trend is burning but cash on hand (all-time) is still positive", () => {

    const companyManager = new CompanyManager();
    const company = makeCompany("Runway Burning Co XQZFR3");

    // A big revenue entry OUTSIDE the runway lookback window (default 3
    // months) builds real cash on hand (financialSummary.net is always
    // all-time, unaffected by lookback) -- then a real expense-only
    // entry INSIDE the lookback window is what the recent-average burn
    // rate is actually computed from.
    companyManager.recordFinance(company.id, { label: "Big early revenue", amount: 10000, type: "revenue" });
    companyManager.recordFinance(company.id, { label: "Recent burn", amount: 2000, type: "expense" });

    const entry = memory.view().find(m => m.id === company.id);
    const finances = entry.metadata.finances.map(financeEntry =>
        financeEntry.label === "Big early revenue"
            ? { ...financeEntry, timestamp: "2026-01-01T00:00:00.000Z" }
            : { ...financeEntry, timestamp: "2026-06-01T00:00:00.000Z" }
    );
    memory.update(company.id, { metadata: { finances } });

    // months: 1 -- only the single most recent real month (June) feeds
    // the burn-rate average; January's revenue is real history that
    // built cashOnHand, but is deliberately outside this lookback.
    const result = reports.runway(company.id, { months: 1 });

    assert.strictEqual(result.cashOnHand, 8000);
    assert.strictEqual(result.status, "burning");
    assert.strictEqual(result.avgMonthlyBurn, 2000);
    assert.strictEqual(result.runwayMonths, 4);

});


test("runway() reports \"no_data\" for a company with no recorded finances at all", () => {

    const company = makeCompany("Runway No Data Co XQZFR4");

    const result = reports.runway(company.id);

    assert.strictEqual(result.status, "no_data");
    assert.strictEqual(result.runwayMonths, null);

});


test("forecast() is a real, deterministic linear extrapolation of the recent average net trend", () => {

    const companyManager = new CompanyManager();
    const company = makeCompany("Forecast Co XQZFR5");

    companyManager.recordFinance(company.id, { label: "Rev", amount: 1000, type: "revenue" });
    companyManager.recordFinance(company.id, { label: "Exp", amount: 1500, type: "expense" });

    backdateAllFinances(company.id, "2026-03");

    const result = reports.forecast(company.id, { months: 2 });

    // Only one month of history, net = -500 -- that IS the trend.
    assert.strictEqual(result.avgMonthlyNetTrend, -500);
    assert.strictEqual(result.projection.length, 2);
    assert.strictEqual(result.projection[0].projectedCashOnHand, -500 + -500);
    assert.strictEqual(result.projection[1].projectedCashOnHand, -500 + -500 + -500);

});


test("kpis() combines real financialSummary, MRR/ARR, accounts receivable, and runway in one call", () => {

    const companyManager = new CompanyManager();
    const company = makeCompany("KPIs Co XQZFR6");

    companyManager.recordFinance(company.id, { label: "Rev", amount: 2000, type: "revenue" });

    subscriptions.createSubscription({ companyId: company.id, clientName: "Sub Client XQZFR6", amount: 100, interval: "monthly" });

    const invoice = invoices.createInvoice({ companyId: company.id, clientName: "Invoice Client XQZFR6", amount: 500 });
    invoices.setInvoiceStatus(invoice.id, "sent");

    const result = reports.kpis(company.id);

    assert.strictEqual(result.financialSummary.revenue, 2000);
    assert.strictEqual(result.mrr, 100);
    assert.strictEqual(result.arr, 1200);
    assert.strictEqual(result.accountsReceivable, 500);
    assert.ok(result.runway);

});
