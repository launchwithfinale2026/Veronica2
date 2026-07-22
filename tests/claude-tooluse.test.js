const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

// The memory.remember / knowledge.query tool handlers touch the same
// shared real files as other test files -- relies on --test-concurrency=1
// (package.json) plus its own backup/restore.

const DB_PATH = path.join(__dirname, "..", "core", "memory", "database.json");
const DB_BACKUP = path.join(os.tmpdir(), `veronica-database-backup-tooluse-${process.pid}.json`);

test.before(() => {
    fs.copyFileSync(DB_PATH, DB_BACKUP);
});

test.after(() => {
    fs.copyFileSync(DB_BACKUP, DB_PATH);
    fs.unlinkSync(DB_BACKUP);
});

const ClaudeProvider = require("../core/brain/providers/claude");


// A fake Anthropic client: messages.create() is a queue of canned
// responses, consumed in order, so each test can script exactly the
// multi-turn conversation it wants without any real API call.
function fakeAnthropicClient(scriptedResponses){

    let call = 0;

    return {
        messages: {
            create: async () => {
                const response = scriptedResponses[call];
                call++;
                return response;
            }
        },
        _callCount: () => call
    };

}


test("generate() without useTools makes a single call and returns text directly", async () => {

    const client = fakeAnthropicClient([
        { content: [{ type: "text", text: "plain answer" }] }
    ]);

    const provider = new ClaudeProvider(client);

    const result = await provider.generate("hello");

    assert.strictEqual(result.response, "plain answer");
    assert.strictEqual(result.provider, "claude");
    assert.strictEqual(client._callCount(), 1);

});


test("generateWithTools() returns immediately when Claude doesn't ask for a tool", async () => {

    const client = fakeAnthropicClient([
        {
            stop_reason: "end_turn",
            content: [{ type: "text", text: "no tool needed" }]
        }
    ]);

    const provider = new ClaudeProvider(client);

    const result = await provider.generate("hello", { useTools: true });

    assert.strictEqual(result.response, "no tool needed");
    assert.deepStrictEqual(result.toolCalls, []);
    assert.strictEqual(client._callCount(), 1);

});


test("generateWithTools() executes a real tool call and feeds the result back", async () => {

    const client = fakeAnthropicClient([
        {
            stop_reason: "tool_use",
            content: [
                { type: "tool_use", id: "call_1", name: "memory_remember", input: { content: "tool-use-loop marker LMNOP" } }
            ]
        },
        {
            stop_reason: "end_turn",
            content: [{ type: "text", text: "I stored that for you." }]
        }
    ]);

    const provider = new ClaudeProvider(client);

    const result = await provider.generate("remember this for me", { useTools: true });

    assert.strictEqual(result.response, "I stored that for you.");
    assert.strictEqual(result.toolCalls.length, 1);
    assert.strictEqual(result.toolCalls[0].tool, "memory.remember");
    assert.strictEqual(result.toolCalls[0].ok, true);
    assert.strictEqual(client._callCount(), 2);

    // the tool call actually ran through the real, permission-checked
    // memory system -- not simulated
    const store = require("../core/memory/store");
    assert.ok(store.recall().some(m => m.content.includes("LMNOP")));

});


test("generateWithTools() records a failed tool call without crashing the loop", async () => {

    const client = fakeAnthropicClient([
        {
            stop_reason: "tool_use",
            content: [
                { type: "tool_use", id: "call_1", name: "filesystem_readFile", input: { path: "../../etc/passwd" } }
            ]
        },
        {
            stop_reason: "end_turn",
            content: [{ type: "text", text: "That path isn't accessible." }]
        }
    ]);

    const provider = new ClaudeProvider(client);

    const result = await provider.generate("read /etc/passwd", { useTools: true });

    assert.strictEqual(result.response, "That path isn't accessible.");
    assert.strictEqual(result.toolCalls[0].ok, false);
    assert.ok(result.toolCalls[0].error.includes("escapes the sandboxed workspace"));

});


test("generateWithTools() stops after maxTurns without a final answer", async () => {

    const alwaysToolUse = {
        stop_reason: "tool_use",
        content: [
            { type: "tool_use", id: "call_x", name: "memory_recall", input: {} }
        ]
    };

    const client = fakeAnthropicClient([alwaysToolUse, alwaysToolUse, alwaysToolUse]);

    const provider = new ClaudeProvider(client);

    const result = await provider.generate("loop forever", { useTools: true, maxTurns: 3 });

    assert.strictEqual(result.response, "(tool use turn limit reached without a final answer)");
    assert.strictEqual(result.toolCalls.length, 3);
    assert.strictEqual(client._callCount(), 3);

});
