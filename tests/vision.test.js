const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

// Writes a real test image into the real sandboxed workspace
// (data/workspace/), same pattern tests/tools.test.js already uses for
// the filesystem tool -- cleaned up in test.after().

const WORKSPACE = path.join(__dirname, "..", "data", "workspace");
const TEST_IMAGE_PATH = path.join(WORKSPACE, "vision-test-image.png");

const DB_PATH = path.join(__dirname, "..", "core", "memory", "database.json");
const DB_BACKUP = path.join(os.tmpdir(), `veronica-database-backup-vision-${process.pid}.json`);

const GRAPH_PATH = path.join(__dirname, "..", "core", "knowledge", "graph.json");
const GRAPH_BACKUP = path.join(os.tmpdir(), `veronica-graph-backup-vision-${process.pid}.json`);

test.before(() => {
    fs.copyFileSync(DB_PATH, DB_BACKUP);
    fs.copyFileSync(GRAPH_PATH, GRAPH_BACKUP);
    // Contents don't need to be a decodable PNG -- the Anthropic client is
    // faked in every test below, so nothing ever actually renders these
    // bytes; only that a real file exists at a real path matters here.
    fs.writeFileSync(TEST_IMAGE_PATH, Buffer.from("fake png bytes for testing"));
});

test.after(() => {
    fs.copyFileSync(DB_BACKUP, DB_PATH);
    fs.unlinkSync(DB_BACKUP);
    fs.copyFileSync(GRAPH_BACKUP, GRAPH_PATH);
    fs.unlinkSync(GRAPH_BACKUP);
    if(fs.existsSync(TEST_IMAGE_PATH)){
        fs.unlinkSync(TEST_IMAGE_PATH);
    }
});

const Vision = require("../core/vision/engine");
const memory = require("../core/memory");
const knowledge = require("../core/knowledge");

// A fake Anthropic client scripted to return a canned vision analysis --
// never a real, paid API call. Also captures the request so tests can
// assert the image content block was built correctly.
function fakeAnthropicClient(responseText){

    let lastRequest = null;

    return {
        messages: {
            create: async (request) => {
                lastRequest = request;
                return { content: [{ type: "text", text: responseText }] };
            }
        },
        _lastRequest: () => lastRequest
    };

}

test("analyzeImage() sends the image as a base64 content block and records the result", async () => {

    const client = fakeAnthropicClient("A diagram showing three boxes connected by arrows XQZVIS1.");
    const vision = new Vision(client);

    const result = await vision.analyzeImage("vision-test-image.png");

    assert.strictEqual(result.path, "vision-test-image.png");
    assert.ok(result.analysis.includes("XQZVIS1"));
    assert.ok(result.memoryEntryId);

    const request = client._lastRequest();
    const imageBlock = request.messages[0].content.find(block => block.type === "image");
    assert.strictEqual(imageBlock.source.media_type, "image/png");
    assert.strictEqual(imageBlock.source.type, "base64");
    assert.ok(imageBlock.source.data.length > 0);

    const memories = memory.filter({ tag: "vision" });
    assert.ok(memories.some(m => m.metadata.fullAnalysis.includes("XQZVIS1")));

    const found = knowledge.find("vision-test-image.png");
    assert.strictEqual(found.length, 1);
    assert.strictEqual(found[0].type, "image");

});

test("analyzeImage() uses a custom prompt when given one", async () => {

    const client = fakeAnthropicClient("custom prompt response XQZVIS2");
    const vision = new Vision(client);

    await vision.analyzeImage("vision-test-image.png", "Extract only the numbers XQZVIS2PROMPT");

    const request = client._lastRequest();
    const textBlock = request.messages[0].content.find(block => block.type === "text");
    assert.strictEqual(textBlock.text, "Extract only the numbers XQZVIS2PROMPT");

});

test("analyzeImage() rejects a missing file, an unsupported extension, and a path escaping the sandbox", async () => {

    const vision = new Vision(fakeAnthropicClient("unused"));

    await assert.rejects(() => vision.analyzeImage("does-not-exist.png"), /not found/);
    await assert.rejects(() => vision.analyzeImage("../../etc/passwd"), /escapes the sandboxed workspace/);

    const unsupportedPath = path.join(WORKSPACE, "vision-test.txt");
    fs.writeFileSync(unsupportedPath, "not an image");

    try {
        await assert.rejects(() => vision.analyzeImage("vision-test.txt"), /Unsupported image type/);
    } finally {
        fs.unlinkSync(unsupportedPath);
    }

});
