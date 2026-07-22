const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

const REGISTRY_PATH = path.join(__dirname, "..", "core", "device", "known-devices.json");
const REGISTRY_EXISTED_BEFORE = fs.existsSync(REGISTRY_PATH);
const REGISTRY_BACKUP = path.join(os.tmpdir(), `veronica-known-devices-backup-${process.pid}.json`);

test.before(() => {
    if(REGISTRY_EXISTED_BEFORE){
        fs.copyFileSync(REGISTRY_PATH, REGISTRY_BACKUP);
    }
});

test.after(() => {
    if(REGISTRY_EXISTED_BEFORE){
        fs.copyFileSync(REGISTRY_BACKUP, REGISTRY_PATH);
        fs.unlinkSync(REGISTRY_BACKUP);
    } else if(fs.existsSync(REGISTRY_PATH)){
        fs.unlinkSync(REGISTRY_PATH);
    }
});

const deviceRegistry = require("../core/device/registry");

test("recordSighting() adds a new device on first sighting", () => {

    const entry = deviceRegistry.recordSighting({ id: "device-xqzdev1", name: "Test Phone", role: "phone" });

    assert.strictEqual(entry.id, "device-xqzdev1");
    assert.strictEqual(entry.syncCount, 1);
    assert.strictEqual(entry.firstSeenAt, entry.lastSeenAt);
    assert.strictEqual(entry.lastSyncDirection, "import");

    const known = deviceRegistry.listKnownDevices();
    assert.ok(known.some(d => d.id === "device-xqzdev1"));

});

test("recordSighting() upserts an existing device, incrementing syncCount and preserving firstSeenAt", async () => {

    const first = deviceRegistry.recordSighting({ id: "device-xqzdev2", name: "Test Laptop", role: "laptop" });

    // Ensure a real, measurable time gap so lastSeenAt can differ from
    // firstSeenAt below.
    await new Promise(resolve => setTimeout(resolve, 5));

    const second = deviceRegistry.recordSighting({ id: "device-xqzdev2", name: "Test Laptop (renamed)", role: "laptop" });

    assert.strictEqual(second.syncCount, 2);
    assert.strictEqual(second.firstSeenAt, first.firstSeenAt);
    assert.strictEqual(second.name, "Test Laptop (renamed)");

    const known = deviceRegistry.listKnownDevices();
    assert.strictEqual(known.filter(d => d.id === "device-xqzdev2").length, 1);

});

test("recordSighting() requires a device identity with an id", () => {

    assert.throws(() => deviceRegistry.recordSighting(null));
    assert.throws(() => deviceRegistry.recordSighting({ name: "no id" }));

});

test("listKnownDevices() returns an empty array before any sighting is recorded", () => {

    if(fs.existsSync(REGISTRY_PATH)){
        fs.unlinkSync(REGISTRY_PATH);
    }

    assert.deepStrictEqual(deviceRegistry.listKnownDevices(), []);

});
