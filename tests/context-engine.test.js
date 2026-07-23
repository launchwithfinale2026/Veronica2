const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

// Touches real memory/knowledge/executive state (roadmap, knowledge
// graph) -- same backup/restore pattern as the executive test files,
// relies on --test-concurrency=1 (see package.json).

const DB_PATH = path.join(__dirname, "..", "core", "memory", "database.json");
const DB_BACKUP = path.join(os.tmpdir(), `veronica-database-backup-ctx-${process.pid}.json`);

const GRAPH_PATH = path.join(__dirname, "..", "core", "knowledge", "graph.json");
const GRAPH_BACKUP = path.join(os.tmpdir(), `veronica-graph-backup-ctx-${process.pid}.json`);

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

const ContextEngine = require("../core/context/engine");
const ExecutivePlanner = require("../core/executive/planner");
const CompanyManager = require("../core/executive/companyManager");

// retrieve() is async as of Phase 14 (Advanced Memory) -- always returns
// a Promise now, even on the keyword-search fallback path (no
// OPENAI_API_KEY is configured in this test environment, so every
// retrieve() call below exercises that fallback, not real semantic
// search -- see tests/embeddings.test.js for the semantic path itself).

test("retrieve() returns memories/knowledge only when a query is given", async () => {

    const engine = new ContextEngine();

    const empty = await engine.retrieve();
    assert.deepStrictEqual(empty.memories, []);
    assert.deepStrictEqual(empty.knowledge, { entities: [], relationships: [] });

    const queried = await engine.retrieve("VERONICA");
    assert.ok(Array.isArray(queried.memories));
    assert.ok(Array.isArray(queried.knowledge.entities));

});

test("retrieve() always includes departments, device identity, activeGoals, and recentProjectActivity", async () => {

    const engine = new ContextEngine();

    const result = await engine.retrieve();

    // 9 built-in + 6 from the real, active production capability
    // packages (Phase 35/41) -- see tests/dashboard.test.js's own
    // comment on this same real machine-state change.
    assert.strictEqual(result.departments.length, 15);
    assert.ok(result.departments.every(d => d.id && d.name && d.domain));
    assert.ok(result.device && result.device.id);
    assert.ok(Array.isArray(result.activeGoals));
    assert.ok(Array.isArray(result.recentProjectActivity));

});

test("retrieve() caps memories/knowledge lists to keep the context compressed", async () => {

    const engine = new ContextEngine();
    const memory = require("../core/memory");

    for(let i = 0; i < 10; i++){
        memory.remember({ content: `context compression marker XQZCTX ${i}`, tags: ["xqzctx"] });
    }

    const result = await engine.retrieve("XQZCTX");

    assert.ok(result.memories.length <= 5);

});

test("retrieve() caps activeGoals to the top 5 by priority", async () => {

    const engine = new ContextEngine();
    const planner = new ExecutivePlanner();

    for(let i = 0; i < 8; i++){
        planner.plan({ title: `context cap project XQZCTX2 ${i}`, priority: 5 });
    }

    const result = await engine.retrieve();

    assert.ok(result.activeGoals.length <= 5);

});

test("retrieve() includes a trimmed company summary only when companyId is passed", async () => {

    const engine = new ContextEngine();
    const planner = new ExecutivePlanner();
    const companyManager = new CompanyManager({ planner });

    const company = companyManager.createCompany({ name: "Context Co XQZCTX3", industry: "testing" });

    const withoutCompany = await engine.retrieve("anything");
    assert.strictEqual(withoutCompany.company, null);

    const withCompany = await engine.retrieve("anything", { companyId: company.id });
    assert.strictEqual(withCompany.company.id, company.id);
    assert.strictEqual(withCompany.company.name, "Context Co XQZCTX3");
    assert.strictEqual(withCompany.company.industry, "testing");
    // Trimmed -- full finance/communication detail isn't in the prompt-sized summary.
    assert.strictEqual(withCompany.company.finances, undefined);

});

test("searchMemories() falls back to keyword search when semantic search isn't configured", async () => {

    const engine = new ContextEngine();
    const memory = require("../core/memory");

    assert.strictEqual(memory.semanticSearchAvailable(), false);

    memory.remember({ content: "keyword fallback marker XQZCTX4", tags: ["xqzctx4"] });

    const results = await engine.searchMemories("XQZCTX4");

    assert.ok(results.some(m => m.content.includes("XQZCTX4")));

});


// Phase 10 security audit: before this, a reasoning call scoped to one
// company still searched the ENTIRE shared memory store -- a task for
// Company A could surface Company B's data in its injected context. See
// core/context/engine.js's searchMemories()/visibleToCompany().
test("searchMemories() excludes entries tagged to a DIFFERENT company when companyId is given", async () => {

    const engine = new ContextEngine();
    const memory = require("../core/memory");

    memory.remember({ content: "shared marker XQZCTX5 for company A", tags: ["company:xqz-company-a"] });
    memory.remember({ content: "shared marker XQZCTX5 for company B", tags: ["company:xqz-company-b"] });
    memory.remember({ content: "shared marker XQZCTX5 with no company at all" });

    const resultsForA = await engine.searchMemories("XQZCTX5", "xqz-company-a");

    assert.ok(resultsForA.some(m => m.content.includes("for company A")));
    assert.ok(!resultsForA.some(m => m.content.includes("for company B")));
    assert.ok(resultsForA.some(m => m.content.includes("no company at all")));

    // No companyId at all -- unrestricted, same as before this fix.
    const resultsUnscoped = await engine.searchMemories("XQZCTX5");

    assert.ok(resultsUnscoped.some(m => m.content.includes("for company A")));
    assert.ok(resultsUnscoped.some(m => m.content.includes("for company B")));

});


test("retrieve() applies the same company scoping to its injected memories", async () => {

    const engine = new ContextEngine();
    const memory = require("../core/memory");
    const planner = new ExecutivePlanner();
    const companyManager = new CompanyManager({ planner });

    const companyC = companyManager.createCompany({ name: "Retrieve Scoping Co C XQZCTX6" });
    const companyD = companyManager.createCompany({ name: "Retrieve Scoping Co D XQZCTX6" });

    memory.remember({ content: "retrieve scoping marker XQZCTX6 for company C", tags: [`company:${companyC.id}`] });
    memory.remember({ content: "retrieve scoping marker XQZCTX6 for company D", tags: [`company:${companyD.id}`] });

    const result = await engine.retrieve("XQZCTX6", { companyId: companyC.id });

    assert.ok(result.memories.some(m => m.content.includes("for company C")));
    assert.ok(!result.memories.some(m => m.content.includes("for company D")));

});
