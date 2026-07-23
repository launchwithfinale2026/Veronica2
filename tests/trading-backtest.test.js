const test = require("node:test");
const assert = require("node:assert");

const backtest = require("../core/trading/backtest");


test("backtestMovingAverageCrossover() requires a real priceSeries, valid windows, and a positive startingCash", () => {

    assert.throws(() => backtest.backtestMovingAverageCrossover({}), /priceSeries/);
    assert.throws(() => backtest.backtestMovingAverageCrossover({ priceSeries: [] }), /priceSeries/);

    assert.throws(() => backtest.backtestMovingAverageCrossover({
        priceSeries: [{ date: "d1", price: 10 }],
        shortWindow: 10,
        longWindow: 5,
        startingCash: 1000
    }), /shortWindow must be a smaller/);

    assert.throws(() => backtest.backtestMovingAverageCrossover({
        priceSeries: [{ date: "d1", price: 10 }],
        shortWindow: 2,
        longWindow: 4,
        startingCash: -100
    }), /positive numeric startingCash/);

});


test("backtestMovingAverageCrossover() correctly detects a golden cross (buy) and a death cross (sell), hand-verified", () => {

    // Prices flat at 10 (x4), jump to 20 (x5), drop to 5 (x4).
    // shortWindow=2, longWindow=4 -- hand-verified crossover points:
    // golden cross at index 4 (first 20), death cross at index 9
    // (first 5). See docs/CHANGELOG.md's Phase 45 entry for the
    // by-hand math this test's expectations were derived from.
    const prices = [10, 10, 10, 10, 20, 20, 20, 20, 20, 5, 5, 5, 5];
    const priceSeries = prices.map((price, i) => ({ date: `day${i}`, price }));

    const result = backtest.backtestMovingAverageCrossover({
        priceSeries,
        shortWindow: 2,
        longWindow: 4,
        startingCash: 1000
    });

    assert.strictEqual(result.tradeCount, 2);
    assert.strictEqual(result.trades[0].side, "buy");
    assert.strictEqual(result.trades[0].date, "day4");
    assert.strictEqual(result.trades[0].price, 20);
    assert.strictEqual(result.trades[0].shares, 50); // floor(1000/20)

    assert.strictEqual(result.trades[1].side, "sell");
    assert.strictEqual(result.trades[1].date, "day9");
    assert.strictEqual(result.trades[1].price, 5);

    assert.strictEqual(result.finalValue, 250); // 50 shares * $5
    assert.strictEqual(result.totalReturn, -0.75);
    assert.strictEqual(result.completedRoundTrips, 1);
    assert.strictEqual(result.winRate, 0); // sold lower than bought
    assert.strictEqual(result.maxDrawdown, 0.75);

});


test("backtestMovingAverageCrossover() liquidates a still-open position at the last price, and never buys with more cash than available", () => {

    // Same golden cross as above, but the series ends WHILE still
    // holding the position (no death cross) -- the engine must
    // liquidate at the last real price to compute a real final value,
    // not leave the position unresolved.
    const prices = [10, 10, 10, 10, 20, 25, 30];
    const priceSeries = prices.map((price, i) => ({ date: `day${i}`, price }));

    const result = backtest.backtestMovingAverageCrossover({
        priceSeries,
        shortWindow: 2,
        longWindow: 4,
        startingCash: 1000
    });

    assert.strictEqual(result.tradeCount, 2);
    assert.strictEqual(result.trades[1].side, "sell");
    assert.strictEqual(result.trades[1].price, 30);
    assert.strictEqual(result.finalValue, 50 * 30); // 50 shares bought at 20, sold at 30
    assert.ok(result.totalReturn > 0);

});


test("backtestMovingAverageCrossover() reports a null winRate with zero completed round trips when no crossover ever occurs", () => {

    const priceSeries = [10, 10, 10, 10, 10, 10].map((price, i) => ({ date: `day${i}`, price }));

    const result = backtest.backtestMovingAverageCrossover({
        priceSeries,
        shortWindow: 2,
        longWindow: 4,
        startingCash: 1000
    });

    assert.strictEqual(result.tradeCount, 0);
    assert.strictEqual(result.completedRoundTrips, 0);
    assert.strictEqual(result.winRate, null);
    assert.strictEqual(result.finalValue, 1000);
    assert.strictEqual(result.totalReturn, 0);

});
