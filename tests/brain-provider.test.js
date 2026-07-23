const test = require("node:test");
const assert = require("node:assert");

const BrainProvider = require("../core/brain/provider");

test("generate() uses the active provider directly when it succeeds", async () => {
    const bp = new BrainProvider();

    bp.providers = {
        claude: { generate: async () => ({ response: "ok", provider: "claude" }) },
        local: { generate: async () => ({ response: "canned", provider: "local" }) }
    };
    bp.active = "claude";

    const result = await bp.generate("hello");
    assert.strictEqual(result.provider, "claude");
});

test("generate() falls back through the chain until one provider succeeds", async () => {
    const bp = new BrainProvider();

    bp.providers = {
        claude: { generate: async () => { throw new Error("claude down"); } },
        openai: { generate: async () => { throw new Error("openai down"); } },
        local: { generate: async () => ({ response: "canned", provider: "local" }) }
    };
    bp.active = "claude";

    const result = await bp.generate("hello");
    assert.strictEqual(result.provider, "local");
});

test("status() reports which providers are really configured and which is active (Phase 36 -- report status)", () => {

    const bp = new BrainProvider();

    bp.providers = {
        claude: { generate: async () => ({}) },
        local: { generate: async () => ({}) }
        // openai deliberately absent -- as if its API key were missing,
        // same as the real constructor's try/catch skip.
    };
    bp.active = "claude";

    const status = bp.status();

    assert.deepStrictEqual(status.find(p => p.name === "claude"), { name: "claude", configured: true, active: true });
    assert.deepStrictEqual(status.find(p => p.name === "openai"), { name: "openai", configured: false, active: false });
    assert.deepStrictEqual(status.find(p => p.name === "local"), { name: "local", configured: true, active: false });

});


test("generate() throws the last error when every provider fails", async () => {
    const bp = new BrainProvider();

    bp.providers = {
        local: { generate: async () => { throw new Error("even local is down"); } }
    };
    bp.active = "local";

    await assert.rejects(
        () => bp.generate("hello"),
        /even local is down/
    );
});
