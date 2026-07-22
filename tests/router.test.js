const test = require("node:test");
const assert = require("node:assert");

const Router = require("../core/router");

const AGENTS = [
    {
        name: "METIS",
        department: "athena",
        role: "Chief Knowledge Analyst",
        capabilities: ["research"]
    },
    {
        name: "PLUTUS",
        department: "hades",
        role: "Financial Agent",
        capabilities: ["budgets"]
    }
];

const NULL_CONTEXT = { retrieve: () => ({}) };

test("findAgent matches by agent name", () => {
    const router = new Router(AGENTS, NULL_CONTEXT);
    const match = router.findAgent("ask plutus about budgets");
    assert.strictEqual(match.name, "PLUTUS");
});

test("findAgent matches by capability keyword", () => {
    const router = new Router(AGENTS, NULL_CONTEXT);
    const match = router.findAgent("I need research done");
    assert.strictEqual(match.name, "METIS");
});

test("findAgent falls back to the first agent when nothing matches", () => {
    const router = new Router(AGENTS, NULL_CONTEXT);
    const match = router.findAgent("completely unrelated gibberish xyz");
    assert.strictEqual(match.name, "METIS");
});

test("findAgent prefers a stronger match (name) over a weaker one (role word)", () => {
    const agents = [
        {
            name: "NIKE",
            department: "ares",
            role: "Execution Commander",
            capabilities: ["planning", "execution"]
        },
        {
            name: "PLUTUS",
            department: "hades",
            role: "Financial Intelligence",
            capabilities: ["finance", "budgeting"]
        }
    ];

    const router = new Router(agents, NULL_CONTEXT);

    // "execution" is a capability word for NIKE, but PLUTUS is named
    // explicitly -- the explicit name mention should win.
    const match = router.findAgent("plutus, plan the execution of the budget");
    assert.strictEqual(match.name, "PLUTUS");
});

test("findAgent breaks ties using registry order", () => {
    const agents = [
        { name: "A", department: "x", role: "First Responder", capabilities: [] },
        { name: "B", department: "x", role: "Second Responder", capabilities: [] }
    ];

    const router = new Router(agents, NULL_CONTEXT);

    // Neither name is mentioned; both share the department, so both score
    // equally from that alone. The first-declared agent should win.
    const match = router.findAgent("something about x");
    assert.strictEqual(match.name, "A");
});
