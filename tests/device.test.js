const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

// core/device/index.js persists device.local.json on the real machine
// this test runs on -- back it up/restore it so this test suite doesn't
// permanently change the real device's identity/role.

const DEVICE_FILE = path.join(__dirname, "..", "core", "device", "device.local.json");
const DEVICE_EXISTED_BEFORE = fs.existsSync(DEVICE_FILE);
const DEVICE_BACKUP = path.join(os.tmpdir(), `veronica-device-backup-${process.pid}.json`);

test.before(() => {
    if(DEVICE_EXISTED_BEFORE){
        fs.copyFileSync(DEVICE_FILE, DEVICE_BACKUP);
    }
});

test.after(() => {
    if(DEVICE_EXISTED_BEFORE){
        fs.copyFileSync(DEVICE_BACKUP, DEVICE_FILE);
        fs.unlinkSync(DEVICE_BACKUP);
    } else if(fs.existsSync(DEVICE_FILE)){
        fs.unlinkSync(DEVICE_FILE);
    }
});

const device = require("../core/device");

test("currentIdentity() creates a persisted identity and is idempotent", () => {

    const first = device.currentIdentity();
    const second = device.currentIdentity();

    assert.strictEqual(first.id, second.id);
    assert.ok(device.VALID_ROLES.includes(first.role));
    assert.ok(fs.existsSync(DEVICE_FILE));

});

test("setRole() persists a new role and rejects unknown roles", () => {

    device.setRole("server");
    assert.strictEqual(device.currentIdentity().role, "server");

    assert.throws(() => device.setRole("tablet"));

});

test("permissionsForDeviceRole() reflects registry/devices.json", () => {

    const phonePerms = device.permissionsForDeviceRole("phone");
    assert.ok(phonePerms.includes("sync"));
    assert.ok(!phonePerms.includes("write_memory"));

    const serverPerms = device.permissionsForDeviceRole("server");
    assert.ok(serverPerms.includes("manage_agents"));

});

test("permissions() reflects the current device's role", () => {

    device.setRole("phone");
    assert.deepStrictEqual(device.permissions(), device.permissionsForDeviceRole("phone"));

});
