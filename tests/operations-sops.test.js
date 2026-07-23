const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

const DB_PATH = path.join(__dirname, "..", "core", "memory", "database.json");
const DB_BACKUP = path.join(os.tmpdir(), `veronica-database-backup-opssops-${process.pid}.json`);

test.before(() => {
    fs.copyFileSync(DB_PATH, DB_BACKUP);
});

test.after(() => {
    fs.copyFileSync(DB_BACKUP, DB_PATH);
    fs.unlinkSync(DB_BACKUP);
});

const sops = require("../core/operations/sops");


test("createSOP() requires a name and at least one real step", () => {

    assert.throws(() => sops.createSOP({}));
    assert.throws(() => sops.createSOP({ name: "X" }));
    assert.throws(() => sops.createSOP({ name: "X", steps: [] }));

    const sop = sops.createSOP({ name: "Onboarding SOP XQZOP1", steps: ["Step 1", "Step 2"] });

    assert.strictEqual(sop.version, 1);
    assert.deepStrictEqual(sop.steps, ["Step 1", "Step 2"]);

});


test("listSOPs() optionally scopes to a department", () => {

    sops.createSOP({ name: "Bizops SOP XQZOP2", department: "bizops", steps: ["A"] });
    sops.createSOP({ name: "Other SOP XQZOP2", department: "sales-dept", steps: ["B"] });

    const scoped = sops.listSOPs("bizops").filter(s => s.name.includes("XQZOP2"));
    assert.strictEqual(scoped.length, 1);
    assert.strictEqual(scoped[0].name, "Bizops SOP XQZOP2");

});


test("updateSteps() revises the real document in place and increments its version", () => {

    const sop = sops.createSOP({ name: "Revision SOP XQZOP3", steps: ["Step 1"] });

    assert.throws(() => sops.updateSteps(sop.id, []));

    const updated = sops.updateSteps(sop.id, ["Step 1", "Step 2"]);

    assert.strictEqual(updated.version, 2);
    assert.deepStrictEqual(updated.steps, ["Step 1", "Step 2"]);

    const fetched = sops.getSOP(sop.id);
    assert.strictEqual(fetched.version, 2);

});


test("getSOP() rejects an unknown SOP", () => {
    assert.throws(() => sops.getSOP("not-a-real-id"));
});
