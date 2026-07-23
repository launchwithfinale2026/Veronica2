const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

const DB_PATH = path.join(__dirname, "..", "core", "memory", "database.json");
const DB_BACKUP = path.join(os.tmpdir(), `veronica-database-backup-tradingportfolio-${process.pid}.json`);

test.before(() => {
    fs.copyFileSync(DB_PATH, DB_BACKUP);
});

test.after(() => {
    fs.copyFileSync(DB_BACKUP, DB_PATH);
    fs.unlinkSync(DB_BACKUP);
});

const portfolio = require("../core/trading/portfolio");


test("createPortfolio() requires a name, and validates a real company if given", () => {

    assert.throws(() => portfolio.createPortfolio({}));
    assert.throws(() => portfolio.createPortfolio({ name: "X", companyId: "not-a-real-id" }));

    const p = portfolio.createPortfolio({ name: "Validation Portfolio XQZTP1", startingCash: 5000 });

    assert.strictEqual(p.cash, 5000);
    assert.deepStrictEqual(p.positions, []);
    assert.strictEqual(p.companyId, null);

});


test("listPortfolios() optionally scopes to a companyId", () => {

    const CompanyManager = require("../core/executive/companyManager");
    const company = new CompanyManager().createCompany({ name: "Trading Portfolio Co XQZTP2" });

    portfolio.createPortfolio({ name: "Company Portfolio XQZTP2", companyId: company.id });
    portfolio.createPortfolio({ name: "Global Portfolio XQZTP2" });

    const scoped = portfolio.listPortfolios(company.id);
    assert.strictEqual(scoped.length, 1);
    assert.strictEqual(scoped[0].companyId, company.id);

});


test("applyTrade() computes a real, correct weighted-average cost basis across multiple buys", () => {

    const p = portfolio.createPortfolio({ name: "Cost Basis Portfolio XQZTP3", startingCash: 10000 });

    portfolio.applyTrade(p.id, { symbol: "ACME", side: "buy", quantity: 10, price: 100 });
    const updated = portfolio.applyTrade(p.id, { symbol: "ACME", side: "buy", quantity: 10, price: 120 });

    assert.strictEqual(updated.positions[0].quantity, 20);
    assert.strictEqual(updated.positions[0].avgCost, 110);
    assert.strictEqual(updated.cash, 10000 - 1000 - 1200);

});


test("applyTrade() rejects a buy that costs more than the portfolio's real cash", () => {

    const p = portfolio.createPortfolio({ name: "Insufficient Cash Portfolio XQZTP4", startingCash: 100 });

    assert.throws(
        () => portfolio.applyTrade(p.id, { symbol: "ACME", side: "buy", quantity: 10, price: 100 }),
        /Insufficient cash/
    );

});


test("applyTrade() rejects selling more shares than the position actually holds, and closes a position fully sold", () => {

    const p = portfolio.createPortfolio({ name: "Sell Validation Portfolio XQZTP5", startingCash: 10000 });

    portfolio.applyTrade(p.id, { symbol: "ACME", side: "buy", quantity: 10, price: 100 });

    assert.throws(
        () => portfolio.applyTrade(p.id, { symbol: "ACME", side: "sell", quantity: 20, price: 100 }),
        /doesn't hold that many/
    );

    const updated = portfolio.applyTrade(p.id, { symbol: "ACME", side: "sell", quantity: 10, price: 110 });

    assert.deepStrictEqual(updated.positions, []);
    assert.strictEqual(updated.cash, 10000 - 1000 + 1100);

});


test("portfolioValue() computes real market value/unrealized P&L from caller-supplied current prices", () => {

    const p = portfolio.createPortfolio({ name: "Value Portfolio XQZTP6", startingCash: 10000 });
    portfolio.applyTrade(p.id, { symbol: "ACME", side: "buy", quantity: 10, price: 100 });

    const value = portfolio.portfolioValue(p.id, { ACME: 150 });

    assert.strictEqual(value.positionsValue, 1500);
    assert.strictEqual(value.totalValue, value.cash + 1500);
    assert.strictEqual(value.positions[0].unrealizedPnl, 500);

});


test("portfolioValue() reports null market value/P&L for a symbol with no supplied current price, rather than fabricating one", () => {

    const p = portfolio.createPortfolio({ name: "No Price Portfolio XQZTP7", startingCash: 10000 });
    portfolio.applyTrade(p.id, { symbol: "ACME", side: "buy", quantity: 10, price: 100 });

    const value = portfolio.portfolioValue(p.id, {});

    assert.strictEqual(value.positions[0].currentPrice, null);
    assert.strictEqual(value.positions[0].marketValue, null);
    assert.strictEqual(value.positionsValue, 0);

});


test("calculatePositionSize() applies the real, standard percent-risk formula", () => {

    const result = portfolio.calculatePositionSize({ accountValue: 10000, riskPercent: 0.02, entryPrice: 100, stopPrice: 90 });

    // Risk $200 (2% of 10000), $10 per-share risk -> 20 shares.
    assert.strictEqual(result.riskAmount, 200);
    assert.strictEqual(result.perShareRisk, 10);
    assert.strictEqual(result.shares, 20);
    assert.strictEqual(result.positionValue, 2000);

    assert.throws(() => portfolio.calculatePositionSize({ accountValue: 10000, riskPercent: 0.02, entryPrice: 100, stopPrice: 100 }));
    assert.throws(() => portfolio.calculatePositionSize({}));

});


test("createWatchlist()/addSymbol()/removeSymbol() manage a real, deduplicated symbol list", () => {

    const watchlist = portfolio.createWatchlist({ name: "Watchlist XQZTP8", symbols: ["ACME"] });

    portfolio.addSymbol(watchlist.id, "BETA");
    portfolio.addSymbol(watchlist.id, "ACME"); // duplicate, should not double up

    const listed = portfolio.listWatchlists().find(w => w.id === watchlist.id);
    assert.deepStrictEqual(listed.symbols, ["ACME", "BETA"]);

    portfolio.removeSymbol(watchlist.id, "ACME");
    const afterRemove = portfolio.listWatchlists().find(w => w.id === watchlist.id);
    assert.deepStrictEqual(afterRemove.symbols, ["BETA"]);

});
