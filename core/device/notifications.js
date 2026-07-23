// ==================================
// VERONICA DEVICE NOTIFICATIONS
// ==================================
//
// Project C (Device Ecosystem) / Project A (Notification Center). A
// real, persisted, POLL-based notification queue -- no push
// infrastructure exists here, and none is fabricated. A phone-role
// device (registry/devices.json's own real "phone" role, with real
// push_notifications/camera/gps capabilities already defined) has no
// real push channel without a real mobile app and a real push service
// this project has no credentials for -- so every device, phone
// included, gets real notifications the same honest way: polling
// `GET /api/notifications`, same "day-one honest, not fabricated"
// posture every connector in this codebase already takes for a
// capability it can't fully deliver yet.
//
// An ordinary memory entry per notification, tagged and read/unread --
// not a new parallel store.

const memory = require("../memory");
const bus = require("../bus");

const NOTIFICATION_TAG = "device-notification";

const SEVERITIES = ["info", "warning", "critical"];


function toNotification(entry){

    return {
        id: entry.id,
        title: entry.metadata.title,
        message: entry.metadata.message,
        severity: entry.metadata.severity,
        targetRole: entry.metadata.targetRole,
        read: entry.metadata.read,
        created: entry.created
    };

}


// targetRole is optional -- null means "every device," matching
// registry/devices.json's own role vocabulary (desktop/laptop/phone/
// server/chromebook) when a notification is meant for one kind of
// device specifically (e.g. only phone-role devices care about a
// push-style alert).
function create({ title, message, severity = "info", targetRole = null } = {}){

    if(!title){
        throw new Error("A title is required");
    }

    if(!SEVERITIES.includes(severity)){
        throw new Error(`Invalid severity: "${severity}" (must be one of ${SEVERITIES.join(", ")})`);
    }

    const entry = memory.remember({
        content: title,
        type: "decisions",
        importance: severity === "critical" ? 5 : severity === "warning" ? 3 : 2,
        tags: [NOTIFICATION_TAG],
        source: "device-notifications",
        metadata: { title, message: message || null, severity, targetRole, read: false }
    });

    bus.publish("notification.created", { id: entry.id, title, severity, targetRole });

    return toNotification(entry);

}


// role is optional -- omitting it returns every unread notification
// (any device polling generically); a real role filters to
// notifications either targeted at that role specifically, or targeted
// at no role in particular (everyone).
function pending({ role } = {}){

    return memory.filter({ tag: NOTIFICATION_TAG })
        .filter(entry => !entry.metadata.read)
        .filter(entry => !role || !entry.metadata.targetRole || entry.metadata.targetRole === role)
        .map(toNotification);

}


function markRead(notificationId){

    const entry = memory.view().find(m => m.id === notificationId && (m.tags || []).includes(NOTIFICATION_TAG));

    if(!entry){
        throw new Error(`Unknown notification: "${notificationId}"`);
    }

    const updated = memory.update(notificationId, { metadata: { read: true } });

    return toNotification(updated);

}


function all(limit = 50){
    return memory.filter({ tag: NOTIFICATION_TAG }, { limit }).map(toNotification);
}


module.exports = { NOTIFICATION_TAG, SEVERITIES, create, pending, markRead, all };
