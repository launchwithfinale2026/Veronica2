const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

// Same real-state backup/restore pattern as tests/executive.test.js --
// relies on --test-concurrency=1 (see package.json).

const DB_PATH = path.join(__dirname, "..", "core", "memory", "database.json");
const DB_BACKUP = path.join(os.tmpdir(), `veronica-database-backup-companyctx-${process.pid}.json`);

const GRAPH_PATH = path.join(__dirname, "..", "core", "knowledge", "graph.json");
const GRAPH_BACKUP = path.join(os.tmpdir(), `veronica-graph-backup-companyctx-${process.pid}.json`);

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

function makeManager(){
    return new CompanyManager({});
}


test("companyManager.context() throws for an unknown company", () => {

    const manager = makeManager();

    assert.throws(() => manager.context("not-a-real-company"), /Unknown company/);

});


test("createCompany() rejects an unknown role in allowedRoles", () => {

    const manager = makeManager();

    assert.throws(
        () => manager.createCompany({ name: "Bad Roles Co XQZCTX1", allowedRoles: ["not-a-real-role"] }),
        /Unknown role/
    );

});


test("remember() force-tags every entry to this company, even if the caller tries to omit or override it", () => {

    const manager = makeManager();

    const companyA = manager.createCompany({ name: "Context Co A XQZCTX2" });
    const context = manager.context(companyA.id);

    const entry = context.remember({ content: "A secret note XQZCTX2", tags: ["some-other-tag"] });

    assert.ok(entry.tags.includes(`company:${companyA.id}`));
    assert.ok(entry.tags.includes("some-other-tag"));

});


test("search()/filter() only ever return this company's own entries", () => {

    const manager = makeManager();

    const companyA = manager.createCompany({ name: "Context Co A XQZCTX3" });
    const companyB = manager.createCompany({ name: "Context Co B XQZCTX3" });

    const contextA = manager.context(companyA.id);
    const contextB = manager.context(companyB.id);

    contextA.remember({ content: "Company A shared marker XQZCTX3" });
    contextB.remember({ content: "Company A shared marker XQZCTX3" });

    const resultsA = contextA.search("shared marker XQZCTX3");
    const resultsB = contextB.search("shared marker XQZCTX3");

    assert.strictEqual(resultsA.length, 1);
    assert.strictEqual(resultsB.length, 1);
    assert.notStrictEqual(resultsA[0].id, resultsB[0].id);

    // filter() with no query at all is still scoped to just this company.
    assert.ok(contextA.filter().every(entry => entry.tags.includes(`company:${companyA.id}`)));
    assert.ok(contextA.filter().every(entry => !entry.tags.includes(`company:${companyB.id}`)));

});


test("can()/requirePermission() are unrestricted by default regardless of role", () => {

    const manager = makeManager();
    const company = manager.createCompany({ name: "Unrestricted Co XQZCTX4" });
    const context = manager.context(company.id);

    assert.strictEqual(context.can(), true);
    assert.strictEqual(context.can("agent"), true);
    assert.strictEqual(context.can("not-a-real-role"), true);

    // No role passed at all -- requirePermission() is a no-op, not an
    // accidental denial.
    assert.doesNotThrow(() => context.remember({ content: "no role passed XQZCTX4" }));

});


test("a restricted company enforces allowedRoles on remember()/search()/filter()", () => {

    const manager = makeManager();

    const company = manager.createCompany({
        name: "Restricted Co XQZCTX5",
        allowedRoles: ["executive"]
    });

    const context = manager.context(company.id);

    assert.strictEqual(context.can("executive"), true);
    assert.strictEqual(context.can("agent"), false);
    assert.strictEqual(context.can(), false);

    assert.throws(
        () => context.remember({ content: "should be denied XQZCTX5" }, { role: "agent" }),
        /does not have access to company/
    );

    assert.throws(() => context.search("anything", { role: "agent" }), /does not have access to company/);
    assert.throws(() => context.filter({}, { role: "agent" }), /does not have access to company/);

    // The allowed role works fine.
    assert.doesNotThrow(() => context.remember({ content: "should be allowed XQZCTX5" }, { role: "executive" }));

});


test("knowledge() returns this company's knowledge graph neighborhood", () => {

    const manager = makeManager();
    const company = manager.createCompany({ name: "Graph Co XQZCTX6", departments: ["ares"] });
    const context = manager.context(company.id);

    const neighborhood = context.knowledge();

    assert.ok(neighborhood.entities.some(e => e.name === "Graph Co XQZCTX6"));

});
