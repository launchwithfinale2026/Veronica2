const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

const DB_PATH = path.join(__dirname, "..", "core", "memory", "database.json");
const DB_BACKUP = path.join(os.tmpdir(), `veronica-database-backup-notifications-${process.pid}.json`);

test.before(() => {
    fs.copyFileSync(DB_PATH, DB_BACKUP);
});

test.after(() => {
    fs.copyFileSync(DB_BACKUP, DB_PATH);
    fs.unlinkSync(DB_BACKUP);
});

const bus = require("../core/bus");
const notifications = require("../core/device/notifications");


test("create() requires a real title and a valid severity, and publishes a real bus event", () => {

    assert.throws(() => notifications.create({}), /title is required/);
    assert.throws(() => notifications.create({ title: "test", severity: "not-a-real-severity" }), /Invalid severity/);

    const captured = [];
    const listener = data => captured.push(data);
    bus.on("notification.created", listener);

    try {

        const created = notifications.create({ title: "Real notification XQZNOTIF1", severity: "warning" });

        assert.strictEqual(created.title, "Real notification XQZNOTIF1");
        assert.strictEqual(created.severity, "warning");
        assert.strictEqual(created.read, false);
        assert.strictEqual(captured.length, 1);
        assert.strictEqual(captured[0].title, "Real notification XQZNOTIF1");

    } finally {
        bus.off("notification.created", listener);
    }

});


test("pending() returns only unread notifications, and role filtering includes both role-targeted and untargeted ones", () => {

    notifications.create({ title: "XQZNOTIF2 for everyone" });
    const phoneOnly = notifications.create({ title: "XQZNOTIF2 for phone", targetRole: "phone" });
    notifications.create({ title: "XQZNOTIF2 for desktop", targetRole: "desktop" });

    const forPhone = notifications.pending({ role: "phone" }).filter(n => n.title.includes("XQZNOTIF2"));

    assert.ok(forPhone.some(n => n.title === "XQZNOTIF2 for everyone"));
    assert.ok(forPhone.some(n => n.title === "XQZNOTIF2 for phone"));
    assert.ok(!forPhone.some(n => n.title === "XQZNOTIF2 for desktop"));

    notifications.markRead(phoneOnly.id);

    const afterRead = notifications.pending({ role: "phone" }).filter(n => n.title.includes("XQZNOTIF2"));
    assert.ok(!afterRead.some(n => n.id === phoneOnly.id));

});


test("markRead() marks a real notification read, and throws for an unknown id", () => {

    const created = notifications.create({ title: "XQZNOTIF3 to be read" });

    assert.strictEqual(created.read, false);

    const updated = notifications.markRead(created.id);
    assert.strictEqual(updated.read, true);

    assert.throws(() => notifications.markRead("not-a-real-id-xqznotif3"), /Unknown notification/);

});


test("all() returns real notifications regardless of read status", () => {

    const created = notifications.create({ title: "XQZNOTIF4 listed regardless" });
    notifications.markRead(created.id);

    const history = notifications.all(100);
    assert.ok(history.some(n => n.id === created.id));

});
