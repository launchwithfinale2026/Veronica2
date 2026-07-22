const test = require("node:test");
const assert = require("node:assert");

const Agent = require("../core/agents/base");

test("Agent boots online and process() returns a structured analysis", async () => {
    const agent = new Agent({
        name: "METIS",
        department: "athena",
        role: "Chief Knowledge Analyst",
        capabilities: ["research"]
    });

    assert.strictEqual(agent.status, "online");

    const result = await agent.process("summarize this", {
        memories: [],
        knowledge: []
    });

    assert.strictEqual(result.agent, "METIS");
    assert.strictEqual(result.department, "athena");
    assert.ok(result.response.includes("METIS"));
});
