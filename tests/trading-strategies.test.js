const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

const DB_PATH = path.join(__dirname, "..", "core", "memory", "database.json");
const DB_BACKUP = path.join(os.tmpdir(), `veronica-database-backup-tradingstrategies-${process.pid}.json`);

test.before(() => {
    fs.copyFileSync(DB_PATH, DB_BACKUP);
});

test.after(() => {
    fs.copyFileSync(DB_BACKUP, DB_PATH);
    fs.unlinkSync(DB_BACKUP);
});

const strategies = require("../core/trading/strategies");


test("createStrategy() requires a name, and defaults description/rules to null", () => {

    assert.throws(() => strategies.createStrategy({}));

    const strategy = strategies.createStrategy({ name: "Simple Strategy XQZTS1" });

    assert.strictEqual(strategy.description, null);
    assert.strictEqual(strategy.rules, null);

});


test("createStrategy() persists real, free-form rules", () => {

    const strategy = strategies.createStrategy({
        name: "MA Crossover XQZTS2",
        description: "Buy on golden cross",
        rules: { shortWindow: 10, longWindow: 50 }
    });

    const fetched = strategies.getStrategy(strategy.id);
    assert.deepStrictEqual(fetched.rules, { shortWindow: 10, longWindow: 50 });

});


test("listStrategies() returns every created strategy", () => {

    const before = strategies.listStrategies().length;

    strategies.createStrategy({ name: "List Strategy A XQZTS3" });
    strategies.createStrategy({ name: "List Strategy B XQZTS3" });

    assert.strictEqual(strategies.listStrategies().length, before + 2);

});


test("getStrategy() rejects an unknown strategy", () => {

    assert.throws(() => strategies.getStrategy("not-a-real-id"));

});
