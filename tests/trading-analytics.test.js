const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

const DB_PATH = path.join(__dirname, "..", "core", "memory", "database.json");
const DB_BACKUP = path.join(os.tmpdir(), `veronica-database-backup-tradinganalytics-${process.pid}.json`);

const LOG_PATH = path.join(__dirname, "..", "core", "learning", "executions.log");
const LOG_EXISTED_BEFORE = fs.existsSync(LOG_PATH);
const LOG_BACKUP = path.join(os.tmpdir(), `veronica-executions-backup-tradinganalytics-${process.pid}.log`);

test.before(() => {
    fs.copyFileSync(DB_PATH, DB_BACKUP);
    if(LOG_EXISTED_BEFORE){
        fs.copyFileSync(LOG_PATH, LOG_BACKUP);
    }
});

test.after(() => {
    fs.copyFileSync(DB_BACKUP, DB_PATH);
    fs.unlinkSync(DB_BACKUP);

    if(LOG_EXISTED_BEFORE){
        fs.copyFileSync(LOG_BACKUP, LOG_PATH);
        fs.unlinkSync(LOG_BACKUP);
    } else if(fs.existsSync(LOG_PATH)){
        fs.unlinkSync(LOG_PATH);
    }
});

const portfolio = require("../core/trading/portfolio");
const paperTrading = require("../core/trading/paperTrading");
const analytics = require("../core/trading/analytics");
const log = require("../core/learning/log");


test("journalPerformance() computes real realized P&L via FIFO lot matching across a partial sell, hand-verified", () => {

    const p = portfolio.createPortfolio({ name: "FIFO Portfolio XQZTA1", startingCash: 100000 });

    paperTrading.executePaperTrade({ portfolioId: p.id, symbol: "ACME", side: "buy", quantity: 10, price: 100 });
    paperTrading.executePaperTrade({ portfolioId: p.id, symbol: "ACME", side: "buy", quantity: 10, price: 110 });
    // Sells 15 -- FIFO matches all 10 from the first lot (cost 1000)
    // plus 5 from the second lot (cost 550) = 1550 cost basis.
    // Proceeds = 15 * 120 = 1800. Realized P&L = 250.
    paperTrading.executePaperTrade({ portfolioId: p.id, symbol: "ACME", side: "sell", quantity: 15, price: 120 });

    const performance = analytics.journalPerformance(p.id);

    assert.strictEqual(performance.realizedPnl, 250);
    assert.strictEqual(performance.closedTrades, 1);
    assert.strictEqual(performance.wins, 1);
    assert.strictEqual(performance.losses, 0);
    assert.strictEqual(performance.winRate, 1);

});


test("journalPerformance() correctly attributes a loss on a losing round trip", () => {

    const p = portfolio.createPortfolio({ name: "Loss Portfolio XQZTA2", startingCash: 100000 });

    paperTrading.executePaperTrade({ portfolioId: p.id, symbol: "BETA", side: "buy", quantity: 10, price: 100 });
    paperTrading.executePaperTrade({ portfolioId: p.id, symbol: "BETA", side: "sell", quantity: 10, price: 80 });

    const performance = analytics.journalPerformance(p.id);

    assert.strictEqual(performance.realizedPnl, -200);
    assert.strictEqual(performance.wins, 0);
    assert.strictEqual(performance.losses, 1);
    assert.strictEqual(performance.winRate, 0);

});


test("journalPerformance() reports null winRate with zero closed trades for a portfolio with only open positions", () => {

    const p = portfolio.createPortfolio({ name: "Open Only Portfolio XQZTA3", startingCash: 10000 });
    paperTrading.executePaperTrade({ portfolioId: p.id, symbol: "GAMMA", side: "buy", quantity: 5, price: 50 });

    const performance = analytics.journalPerformance(p.id);

    assert.strictEqual(performance.realizedPnl, 0);
    assert.strictEqual(performance.closedTrades, 0);
    assert.strictEqual(performance.winRate, null);

});


test("executionHealth() reads trading-dept's real execution telemetry from core/learning, generically", () => {

    log.record({ kind: "department_run", department: "trading-dept", agent: "MarketAnalyst", outcome: "success", durationMs: 80 });

    const health = analytics.executionHealth();

    assert.ok(health);
    assert.strictEqual(health.department, "trading-dept");
    assert.ok(health.total >= 1);

});


test("tradingOverview() combines real portfolio value, real journal performance, and execution health in one call", () => {

    const p = portfolio.createPortfolio({ name: "Overview Portfolio XQZTA4", startingCash: 10000 });
    paperTrading.executePaperTrade({ portfolioId: p.id, symbol: "DELTA", side: "buy", quantity: 10, price: 50 });

    const overview = analytics.tradingOverview(p.id, { DELTA: 60 });

    assert.strictEqual(overview.value.positions[0].unrealizedPnl, 100);
    assert.strictEqual(overview.performance.closedTrades, 0);
    assert.ok("executionHealth" in overview);

});
