const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

const NETWORK_PATH = path.join(__dirname, "..", "core", "device", "network.json");
const NETWORK_EXISTED_BEFORE = fs.existsSync(NETWORK_PATH);
const NETWORK_BACKUP = path.join(os.tmpdir(), `veronica-network-backup-${process.pid}.json`);

test.before(() => {
    if(NETWORK_EXISTED_BEFORE){
        fs.copyFileSync(NETWORK_PATH, NETWORK_BACKUP);
    }
});

test.after(() => {
    if(NETWORK_EXISTED_BEFORE){
        fs.copyFileSync(NETWORK_BACKUP, NETWORK_PATH);
        fs.unlinkSync(NETWORK_BACKUP);
    } else if(fs.existsSync(NETWORK_PATH)){
        fs.unlinkSync(NETWORK_PATH);
    }
});

const DeviceManager = require("../core/device/deviceManager");


test("registerDevice() creates a new device with the requested schema", () => {

    const dm = new DeviceManager();

    const registered = dm.registerDevice({
        name: "Test Desktop XQZDEV1",
        type: "desktop",
        capabilities: ["gui", "always_on"]
    });

    assert.ok(registered.id);
    assert.strictEqual(registered.name, "Test Desktop XQZDEV1");
    assert.strictEqual(registered.type, "desktop");
    assert.strictEqual(registered.role, "desktop");
    assert.deepStrictEqual(registered.capabilities, ["gui", "always_on"]);
    assert.ok(registered.lastSeen);
    assert.strictEqual(registered.status, "online");

});


test("registerDevice() rejects an unknown type or role", () => {

    const dm = new DeviceManager();

    assert.throws(() => dm.registerDevice({ name: "Bad Device XQZDEV2", type: "toaster" }), /Unknown device type/);
    assert.throws(() => dm.registerDevice({ name: "Bad Role Device XQZDEV2", type: "laptop", role: "toaster" }), /Unknown device role/);

});


test("registerDevice() is idempotent: re-registering by name updates the existing device, not a duplicate", () => {

    const dm = new DeviceManager();

    const first = dm.registerDevice({ name: "Idempotent Device XQZDEV3", type: "laptop" });
    const second = dm.registerDevice({ name: "Idempotent Device XQZDEV3", type: "laptop", capabilities: ["gui"] });

    assert.strictEqual(first.id, second.id);

    const all = dm.list().filter(d => d.name === "Idempotent Device XQZDEV3");
    assert.strictEqual(all.length, 1);
    assert.deepStrictEqual(all[0].capabilities, ["gui"]);

});


test("heartbeat() refreshes lastSeen/status and rejects an unknown device", () => {

    const dm = new DeviceManager();

    const registered = dm.registerDevice({ name: "Heartbeat Device XQZDEV4", type: "phone" });
    const beforeHeartbeat = registered.lastSeen;

    const updated = dm.heartbeat(registered.id);

    assert.strictEqual(updated.status, "online");
    assert.ok(new Date(updated.lastSeen).getTime() >= new Date(beforeHeartbeat).getTime());

    assert.throws(() => dm.heartbeat("not-a-real-device-id"), /Unknown device/);

});


test("deviceStatus() computes a live status from real elapsed time, not just the stored field", () => {

    const dm = new DeviceManager();

    const registered = dm.registerDevice({ name: "Stale Device XQZDEV5", type: "laptop" });

    // Backdate lastSeen directly on disk -- same technique used
    // throughout this suite (e.g. tests/goal-monitor.test.js) wherever a
    // module's own update path always stamps "now."
    const data = JSON.parse(fs.readFileSync(NETWORK_PATH, "utf8"));
    const entry = data.devices.find(d => d.id === registered.id);
    entry.lastSeen = new Date(Date.now() - (DeviceManager.ONLINE_THRESHOLD_MINUTES + 5) * 60 * 1000).toISOString();
    fs.writeFileSync(NETWORK_PATH, JSON.stringify(data, null, 2));

    const status = dm.deviceStatus(registered.id);

    assert.strictEqual(status.status, "offline");
    assert.ok(status.minutesSinceLastSeen > DeviceManager.ONLINE_THRESHOLD_MINUTES);

});


test("assignRole() changes a device's role and rejects an unknown role", () => {

    const dm = new DeviceManager();

    const registered = dm.registerDevice({ name: "Reassign Device XQZDEV6", type: "laptop" });

    const updated = dm.assignRole(registered.id, "server");
    assert.strictEqual(updated.role, "server");

    assert.throws(() => dm.assignRole(registered.id, "not-a-real-role"), /Unknown device role/);
    assert.throws(() => dm.assignRole("not-a-real-device-id", "laptop"), /Unknown device/);

});


test("networkStatus() returns every device with its live status", () => {

    const dm = new DeviceManager();

    const registered = dm.registerDevice({ name: "Network Status Device XQZDEV7", type: "chromebook" });

    const network = dm.networkStatus();
    const found = network.find(d => d.id === registered.id);

    assert.ok(found);
    assert.strictEqual(found.status, "online");
    assert.ok(Number.isFinite(found.minutesSinceLastSeen));

});
