const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

// Uses a throwaway temp vault (OBSIDIAN_VAULT_PATH override), not the real
// repo root -- indexing/writing against the real default vault would
// pollute the live memory/knowledge store with test notes, the same
// reason every other test file backs up/restores real state rather than
// operating on it directly.

const TEMP_VAULT = fs.mkdtempSync(path.join(os.tmpdir(), "veronica-vault-"));
fs.mkdirSync(path.join(TEMP_VAULT, ".obsidian"));

const DB_PATH = path.join(__dirname, "..", "core", "memory", "database.json");
const DB_BACKUP = path.join(os.tmpdir(), `veronica-database-backup-obsidian-${process.pid}.json`);

const GRAPH_PATH = path.join(__dirname, "..", "core", "knowledge", "graph.json");
const GRAPH_BACKUP = path.join(os.tmpdir(), `veronica-graph-backup-obsidian-${process.pid}.json`);

const ORIGINAL_VAULT_ENV = process.env.OBSIDIAN_VAULT_PATH;

test.before(() => {
    fs.copyFileSync(DB_PATH, DB_BACKUP);
    fs.copyFileSync(GRAPH_PATH, GRAPH_BACKUP);
    process.env.OBSIDIAN_VAULT_PATH = TEMP_VAULT;
});

test.after(() => {
    fs.copyFileSync(DB_BACKUP, DB_PATH);
    fs.unlinkSync(DB_BACKUP);
    fs.copyFileSync(GRAPH_BACKUP, GRAPH_PATH);
    fs.unlinkSync(GRAPH_BACKUP);
    fs.rmSync(TEMP_VAULT, { recursive: true, force: true });

    if(ORIGINAL_VAULT_ENV === undefined){
        delete process.env.OBSIDIAN_VAULT_PATH;
    } else {
        process.env.OBSIDIAN_VAULT_PATH = ORIGINAL_VAULT_ENV;
    }
});

const obsidian = require("../core/integrations/obsidian");
const knowledge = require("../core/knowledge");

test("requireVault() (via any operation) throws when the configured path has no .obsidian directory", () => {

    const notAVault = fs.mkdtempSync(path.join(os.tmpdir(), "veronica-not-a-vault-"));

    const realVault = process.env.OBSIDIAN_VAULT_PATH;
    process.env.OBSIDIAN_VAULT_PATH = notAVault;

    try {
        assert.throws(() => obsidian.listNotes(), /doesn't look like an Obsidian vault/);
    } finally {
        process.env.OBSIDIAN_VAULT_PATH = realVault;
        fs.rmSync(notAVault, { recursive: true, force: true });
    }

});

test("writeNote()/readNote()/listNotes() round-trip through the sandboxed vault", () => {

    obsidian.writeNote("Project Notes/XQZOBS1", "# XQZOBS1\n\nSome content.");

    const notes = obsidian.listNotes();
    assert.ok(notes.includes(path.join("Project Notes", "XQZOBS1.md")));

    const content = obsidian.readNote(path.join("Project Notes", "XQZOBS1.md"));
    assert.ok(content.includes("Some content."));

});

test("writeNote()/readNote() reject a path that escapes the vault", () => {

    assert.throws(() => obsidian.writeNote("../../etc/passwd", "pwned"));
    assert.throws(() => obsidian.readNote("../../../etc/passwd"));

});

test("indexVault() creates note entities, extracts [[wikilinks]] as relationships, and stores summaries in memory", () => {

    obsidian.writeNote("XQZOBS2 Source", "This note links to [[XQZOBS2 Target]] and has real content to summarize.");
    obsidian.writeNote("XQZOBS2 Target", "The target note.");

    const result = obsidian.indexVault();

    assert.ok(result.notesIndexed >= 2);
    assert.ok(result.entitiesCreated >= 2);
    assert.ok(result.relationshipsCreated >= 1);
    assert.ok(result.memoriesCreated >= 2);

    const connections = knowledge.connections("XQZOBS2 Source");
    assert.ok(connections.some(rel => rel.type === "links" && rel.to === "XQZOBS2 Target"));

    const memory = require("../core/memory");
    const memories = memory.filter({ tag: "obsidian" });
    assert.ok(memories.some(m => m.content.startsWith("XQZOBS2 Source:")));

});

test("indexVault() ignores .obsidian/node_modules/backups directories", () => {

    fs.mkdirSync(path.join(TEMP_VAULT, "node_modules"), { recursive: true });
    fs.writeFileSync(path.join(TEMP_VAULT, "node_modules", "should-not-be-indexed.md"), "noise");

    const notes = obsidian.listNotes();

    assert.ok(!notes.some(n => n.includes("node_modules")));

});


test("isConfigured()/status() report the real vault directory's actual presence, not a hardcoded default (Connector Hardening)", () => {

    assert.strictEqual(obsidian.isConfigured(), true);

    const status = obsidian.status();
    assert.strictEqual(status.id, "obsidian");
    assert.strictEqual(status.configured, true);
    assert.strictEqual(status.vaultPath, TEMP_VAULT);

    const missingVault = fs.mkdtempSync(path.join(os.tmpdir(), "veronica-missing-vault-"));
    const previous = process.env.OBSIDIAN_VAULT_PATH;
    process.env.OBSIDIAN_VAULT_PATH = missingVault;

    try {

        assert.strictEqual(obsidian.isConfigured(), false);
        assert.strictEqual(obsidian.status().configured, false);
        assert.match(obsidian.status().note, /No ".obsidian\/" directory/);

    } finally {
        process.env.OBSIDIAN_VAULT_PATH = previous;
        fs.rmSync(missingVault, { recursive: true, force: true });
    }

});
