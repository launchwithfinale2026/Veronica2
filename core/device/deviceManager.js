// ==================================
// VERONICA DEVICE MANAGER
// ==================================
//
// Phase 16 (Device Network). Distinct from core/device/registry.js's
// known-devices roster, which is specifically "which other devices have
// I ever synced with, and when" (sighting history, written by
// core/device/sync.js). This is a general-purpose device network:
// register a device, heartbeat it, ask its live status, assign it a
// role -- with the schema this phase asked for (id/name/type/role/
// capabilities/lastSeen/status), which doesn't line up field-for-field
// with registry.js's sync-sighting shape (lastSeenAt, syncCount, etc.).
// Rather than overload one file with two different schemas two
// different modules both write to, this keeps its own file
// (network.json) -- registry.js/known-devices.json are untouched.
//
// Per-machine, real device data -- gitignored like device.local.json/
// known-devices.json already are.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const device = require("./index");

const NETWORK_FILE = path.join(__dirname, "network.json");

// A device not heard from in this long reads as "offline" in
// deviceStatus()'s live computation -- explainable, rule-based, same
// convention as core/executive/goalMonitor.js's STALE_DAYS.
const ONLINE_THRESHOLD_MINUTES = 15;


function ensureFile(){

    if(!fs.existsSync(NETWORK_FILE)){
        fs.writeFileSync(NETWORK_FILE, JSON.stringify({ devices: [] }, null, 2) + "\n");
    }

}


function load(){

    ensureFile();

    return JSON.parse(fs.readFileSync(NETWORK_FILE, "utf8"));

}


function save(data){

    fs.writeFileSync(NETWORK_FILE, JSON.stringify(data, null, 2) + "\n");

}


class DeviceManager {

    static ONLINE_THRESHOLD_MINUTES = ONLINE_THRESHOLD_MINUTES;


    requireDevice(data, id){

        const found = data.devices.find(d => d.id === id);

        if(!found){
            throw new Error(`Unknown device: "${id}"`);
        }

        return found;

    }


    // Registers a new device, or updates an existing one's static
    // fields (matched by id if given, otherwise by name) -- idempotent,
    // same "upsert by identity" pattern registry.js's recordSighting()
    // already established. type/role both validated against
    // registry/devices.json's real role vocabulary (core/device/index.js's
    // VALID_ROLES) -- "type" and "role" share that vocabulary today
    // (desktop/laptop/phone/server/chromebook is both a hardware
    // category and a permission-bearing role); nothing requires them to
    // be the same value, a device could plausibly be type "laptop" but
    // assigned role "server" if it's being used as one.
    registerDevice({ id, name, type, role, capabilities } = {}){

        if(!name || !type){
            throw new Error("A name and type are required");
        }

        if(!device.VALID_ROLES.includes(type)){
            throw new Error(`Unknown device type: "${type}" (expected one of ${device.VALID_ROLES.join(", ")})`);
        }

        const resolvedRole = role || type;

        if(!device.VALID_ROLES.includes(resolvedRole)){
            throw new Error(`Unknown device role: "${resolvedRole}" (expected one of ${device.VALID_ROLES.join(", ")})`);
        }

        const data = load();

        const existing = data.devices.find(d => d.id === id || d.name === name);

        const now = new Date().toISOString();

        const entry = {
            id: existing ? existing.id : (id || crypto.randomUUID()),
            name,
            type,
            role: resolvedRole,
            capabilities: capabilities || [],
            lastSeen: now,
            status: "online",
            registeredAt: existing ? existing.registeredAt : now
        };

        if(existing){
            Object.assign(existing, entry);
        } else {
            data.devices.push(entry);
        }

        save(data);

        return existing || entry;

    }


    // Marks a device as freshly seen -- the recurring "I'm still here"
    // signal a real device network needs. Does NOT register a new
    // device if the id is unknown (that's registerDevice()'s job) --
    // heartbeating an unregistered device is almost certainly a bug in
    // the caller, not something to silently paper over.
    heartbeat(id){

        const data = load();
        const found = this.requireDevice(data, id);

        found.lastSeen = new Date().toISOString();
        found.status = "online";

        save(data);

        return found;

    }


    // The stored `status` reflects whatever the last register()/
    // heartbeat() call said; this recomputes a LIVE status from how long
    // ago that actually was -- a device that heartbeated an hour ago and
    // hasn't since is not still "online" just because nobody told it
    // otherwise.
    deviceStatus(id){

        const data = load();
        const found = this.requireDevice(data, id);

        const minutesSinceLastSeen = (Date.now() - new Date(found.lastSeen).getTime()) / (60 * 1000);
        const liveStatus = minutesSinceLastSeen <= ONLINE_THRESHOLD_MINUTES ? "online" : "offline";

        return {
            ...found,
            status: liveStatus,
            minutesSinceLastSeen: Math.round(minutesSinceLastSeen * 10) / 10
        };

    }


    // Changes a device's functional role (and therefore its
    // permissions, via registry/devices.json) without re-registering it
    // -- e.g. a laptop temporarily pressed into service as a server.
    assignRole(id, role){

        if(!device.VALID_ROLES.includes(role)){
            throw new Error(`Unknown device role: "${role}" (expected one of ${device.VALID_ROLES.join(", ")})`);
        }

        const data = load();
        const found = this.requireDevice(data, id);

        found.role = role;

        save(data);

        return found;

    }


    list(){

        return load().devices;

    }


    // Every registered device, with its LIVE (recomputed) status -- the
    // "device network" dashboard view actually wants this, not the
    // possibly-stale stored field.
    networkStatus(){

        return this.list().map(entry => this.deviceStatus(entry.id));

    }

}


module.exports = DeviceManager;
