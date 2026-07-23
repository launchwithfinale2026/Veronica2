const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

const DB_PATH = path.join(__dirname, "..", "core", "memory", "database.json");
const DB_BACKUP = path.join(os.tmpdir(), `veronica-database-backup-tradingpaper-${process.pid}.json`);

test.before(() => {
    fs.copyFileSync(DB_PATH, DB_BACKUP);
});

test.after(() => {
    fs.copyFileSync(DB_BACKUP, DB_PATH);
    fs.unlinkSync(DB_BACKUP);
});

const portfolio = require("../core/trading/portfolio");
const strategies = require("../core/trading/strategies");
const paperTrading = require("../core/trading/paperTrading");


test("executePaperTrade() applies the trade to the real portfolio and records a real journal entry", () => {

    const p = portfolio.createPortfolio({ name: "Paper Trade Portfolio XQZPT1", startingCash: 10000 });
    const strategy = strategies.createStrategy({ name: "Strategy XQZPT1" });

    const result = paperTrading.executePaperTrade({
        portfolioId: p.id,
        symbol: "ACME",
        side: "buy",
        quantity: 10,
        price: 100,
        strategyId: strategy.id,
        notes: "Test entry XQZPT1"
    });

    assert.strictEqual(result.portfolio.cash, 9000);
    assert.strictEqual(result.portfolio.positions[0].quantity, 10);
    assert.strictEqual(result.trade.strategyId, strategy.id);
    assert.strictEqual(result.trade.notes, "Test entry XQZPT1");

    const journal = paperTrading.journal(p.id);
    assert.strictEqual(journal.length, 1);
    assert.strictEqual(journal[0].id, result.trade.id);

});


test("executePaperTrade() does NOT record a journal entry for a trade that fails real validation", () => {

    const p = portfolio.createPortfolio({ name: "Failed Trade Portfolio XQZPT2", startingCash: 100 });

    assert.throws(() => paperTrading.executePaperTrade({
        portfolioId: p.id,
        symbol: "ACME",
        side: "buy",
        quantity: 10,
        price: 100 // costs 1000, only 100 cash available
    }));

    assert.strictEqual(paperTrading.journal(p.id).length, 0);

});


test("journal() returns a portfolio's real trades sorted oldest first, scoped to only that portfolio", () => {

    const p1 = portfolio.createPortfolio({ name: "Journal Scope Portfolio A XQZPT3", startingCash: 10000 });
    const p2 = portfolio.createPortfolio({ name: "Journal Scope Portfolio B XQZPT3", startingCash: 10000 });

    paperTrading.executePaperTrade({ portfolioId: p1.id, symbol: "ACME", side: "buy", quantity: 1, price: 10 });
    paperTrading.executePaperTrade({ portfolioId: p1.id, symbol: "BETA", side: "buy", quantity: 1, price: 20 });
    paperTrading.executePaperTrade({ portfolioId: p2.id, symbol: "GAMMA", side: "buy", quantity: 1, price: 30 });

    const journal1 = paperTrading.journal(p1.id);

    assert.strictEqual(journal1.length, 2);
    assert.strictEqual(journal1[0].symbol, "ACME");
    assert.strictEqual(journal1[1].symbol, "BETA");
    assert.ok(new Date(journal1[0].timestamp) <= new Date(journal1[1].timestamp));

});
