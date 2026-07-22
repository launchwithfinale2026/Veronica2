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
