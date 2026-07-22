const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

const EMBEDDINGS_PATH = path.join(__dirname, "..", "core", "memory", "embeddings.json");
const EMBEDDINGS_EXISTED_BEFORE = fs.existsSync(EMBEDDINGS_PATH);
const EMBEDDINGS_BACKUP = path.join(os.tmpdir(), `veronica-embeddings-backup-${process.pid}.json`);

test.before(() => {
    if(EMBEDDINGS_EXISTED_BEFORE){
        fs.copyFileSync(EMBEDDINGS_PATH, EMBEDDINGS_BACKUP);
    }
});

test.after(() => {
    if(EMBEDDINGS_EXISTED_BEFORE){
        fs.copyFileSync(EMBEDDINGS_BACKUP, EMBEDDINGS_PATH);
        fs.unlinkSync(EMBEDDINGS_BACKUP);
    } else if(fs.existsSync(EMBEDDINGS_PATH)){
        fs.unlinkSync(EMBEDDINGS_PATH);
    }
});

const EmbeddingIndex = require("../core/memory/embeddings");

// A fake OpenAI client -- vectors are hand-picked so cosine similarity
// ordering is predictable and verifiable, never a real API call.
function fakeClient(vectorFor){

    let calls = 0;

    return {
        embeddings: {
            create: async ({ input }) => {
                calls++;
                return { data: [{ embedding: vectorFor(input) }] };
            }
        },
        _callCount: () => calls
    };

}

function entry(id, content){
    return { id, content };
}

test("isConfigured()/requireClient() reflect whether a client is available", () => {

    const configured = new EmbeddingIndex(fakeClient(() => [1, 0]));
    assert.strictEqual(configured.isConfigured(), true);

    const unconfigured = new EmbeddingIndex(null);
    const originalKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;

    try {
        assert.strictEqual(unconfigured.isConfigured(), false);
        assert.throws(() => unconfigured.requireClient(), /OPENAI_API_KEY/);
    } finally {
        if(originalKey !== undefined){
            process.env.OPENAI_API_KEY = originalKey;
        }
    }

});

test("reindex() embeds new entries and skips unchanged ones on a second pass", async () => {

    const client = fakeClient(text => text.includes("XQZEMB1") ? [1, 0] : [0, 1]);
    const index = new EmbeddingIndex(client);

    const entries = [entry("e-xqzemb1", "content XQZEMB1"), entry("e-xqzemb2", "content XQZEMB2")];

    const first = await index.reindex(entries);
    assert.strictEqual(first.embedded, 2);
    assert.strictEqual(first.skipped, 0);
    assert.strictEqual(client._callCount(), 2);

    const second = await index.reindex(entries);
    assert.strictEqual(second.embedded, 0);
    assert.strictEqual(second.skipped, 2);
    assert.strictEqual(client._callCount(), 2); // no new calls -- both skipped

});

test("reindex() re-embeds an entry whose content changed", async () => {

    const client = fakeClient(text => [text.length, 0]);
    const index = new EmbeddingIndex(client);

    await index.reindex([entry("e-xqzemb3", "short")]);
    assert.strictEqual(client._callCount(), 1);

    const result = await index.reindex([entry("e-xqzemb3", "a much longer piece of content now")]);

    assert.strictEqual(result.embedded, 1);
    assert.strictEqual(client._callCount(), 2);

});

test("search() ranks entries by cosine similarity to the query, only among reindexed entries", async () => {

    // Orthogonal-ish vectors: "cats" content is near [1,0], "dogs" near
    // [0,1] -- a query embedding close to [1,0] should rank the cats
    // entry first regardless of insertion order.
    const client = fakeClient(text => {
        if(text.includes("query")) return [0.9, 0.1];
        if(text.includes("cats")) return [1, 0];
        return [0, 1];
    });

    const index = new EmbeddingIndex(client);

    const entries = [
        entry("e-dogs", "all about dogs XQZEMB4"),
        entry("e-cats", "all about cats XQZEMB4"),
        entry("e-not-indexed", "never reindexed XQZEMB4")
    ];

    await index.reindex(entries.slice(0, 2)); // deliberately skip e-not-indexed

    const results = await index.search("a query about pets", entries, { limit: 5 });

    assert.strictEqual(results.length, 2); // e-not-indexed can't surface, no stored embedding
    assert.strictEqual(results[0].id, "e-cats");
    assert.strictEqual(results[1].id, "e-dogs");
    assert.ok(results[0].similarityScore > results[1].similarityScore);

});

test("search() respects the limit option", async () => {

    const client = fakeClient(() => [1, Math.random()]);
    const index = new EmbeddingIndex(client);

    const entries = Array.from({ length: 5 }, (_, i) => entry(`e-xqzemb5-${i}`, `content ${i} XQZEMB5`));

    await index.reindex(entries);

    const results = await index.search("query XQZEMB5", entries, { limit: 2 });

    assert.strictEqual(results.length, 2);

});
