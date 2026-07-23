const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

const DB_PATH = path.join(__dirname, "..", "core", "memory", "database.json");
const DB_BACKUP = path.join(os.tmpdir(), `veronica-database-backup-opsmeetings-${process.pid}.json`);

test.before(() => {
    fs.copyFileSync(DB_PATH, DB_BACKUP);
});

test.after(() => {
    fs.copyFileSync(DB_BACKUP, DB_PATH);
    fs.unlinkSync(DB_BACKUP);
});

const meetings = require("../core/operations/meetings");


test("createMeeting() requires a title, and defaults attendees/decisions/actionItems to empty", () => {

    assert.throws(() => meetings.createMeeting({}));

    const meeting = meetings.createMeeting({ title: "Default Meeting XQZOM1" });

    assert.deepStrictEqual(meeting.attendees, []);
    assert.deepStrictEqual(meeting.decisions, []);
    assert.deepStrictEqual(meeting.actionItems, []);

});


test("createMeeting() persists real attendees, decisions, and structured action items", () => {

    const meeting = meetings.createMeeting({
        title: "Full Meeting XQZOM2",
        attendees: ["Alice", "Bob"],
        decisions: ["Adopt new SOP XQZOM2"],
        actionItems: [{ text: "Update docs XQZOM2", owner: "Alice" }]
    });

    assert.deepStrictEqual(meeting.attendees, ["Alice", "Bob"]);
    assert.deepStrictEqual(meeting.decisions, ["Adopt new SOP XQZOM2"]);
    assert.strictEqual(meeting.actionItems.length, 1);
    assert.strictEqual(meeting.actionItems[0].text, "Update docs XQZOM2");
    assert.strictEqual(meeting.actionItems[0].owner, "Alice");
    assert.strictEqual(meeting.actionItems[0].done, false);

});


test("listMeetings() returns every created meeting", () => {

    const before = meetings.listMeetings().length;

    meetings.createMeeting({ title: "List Meeting A XQZOM3" });
    meetings.createMeeting({ title: "List Meeting B XQZOM3" });

    assert.strictEqual(meetings.listMeetings().length, before + 2);

});


test("completeActionItem() marks the real, specific action item done without disturbing others", () => {

    const meeting = meetings.createMeeting({
        title: "Action Items Meeting XQZOM4",
        actionItems: [{ text: "First XQZOM4" }, { text: "Second XQZOM4" }]
    });

    const updated = meetings.completeActionItem(meeting.id, "action-0");

    assert.strictEqual(updated.actionItems[0].done, true);
    assert.strictEqual(updated.actionItems[1].done, false);

    assert.throws(() => meetings.completeActionItem(meeting.id, "not-a-real-action-item"));

});


test("getMeeting() rejects an unknown meeting", () => {
    assert.throws(() => meetings.getMeeting("not-a-real-id"));
});
