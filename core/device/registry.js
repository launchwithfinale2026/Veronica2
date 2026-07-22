// ==================================
// VERONICA KNOWN DEVICES ROSTER
// ==================================
//
// The gap this fills: core/device/index.js knows this device's own
// identity, and core/device/sync.js already receives another device's
// full identity inside every sync package (syncPackage.device) -- but
// nothing ever recorded that. Two VERONICA instances could sync
// repeatedly and neither would be able to answer "which other devices
// have I ever synced with, and when" -- there was no actual multi-device
// *awareness*, just a one-shot merge mechanism. This is per-machine
// state (like core/device/device.local.json), not something synced
// itself -- each device's roster of "who I've seen" is naturally local.

const fs = require("fs");
const path = require("path");

const REGISTRY_FILE = path.join(__dirname, "known-devices.json");


function load(){

    if(!fs.existsSync(REGISTRY_FILE)){
        return { devices: [] };
    }

    return JSON.parse(fs.readFileSync(REGISTRY_FILE, "utf8"));

}


function save(data){

    fs.writeFileSync(REGISTRY_FILE, JSON.stringify(data, null, 2) + "\n");

}


// Upserts a device (matched by id) into the roster -- direction is
// "import" (we pulled their export) or "export" (they pulled ours, if a
// caller ever identifies itself on that path). First sighting is
// preserved; lastSeenAt/lastSyncDirection always reflect the most recent.
function recordSighting(deviceIdentity, direction = "import"){

    if(!deviceIdentity || !deviceIdentity.id){
        throw new Error("A device identity with an id is required");
    }

    const data = load();

    const existing = data.devices.find(d => d.id === deviceIdentity.id);

    const now = new Date().toISOString();

    if(existing){

        existing.name = deviceIdentity.name;
        existing.role = deviceIdentity.role;
        existing.lastSeenAt = now;
        existing.lastSyncDirection = direction;
        existing.syncCount += 1;

        save(data);

        return existing;

    }

    const entry = {
        id: deviceIdentity.id,
        name: deviceIdentity.name,
        role: deviceIdentity.role,
        firstSeenAt: now,
        lastSeenAt: now,
        lastSyncDirection: direction,
        syncCount: 1
    };

    data.devices.push(entry);

    save(data);

    return entry;

}


function listKnownDevices(){

    return load().devices;

}


module.exports = { recordSighting, listKnownDevices };
