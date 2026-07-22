// ==================================
// VERONICA DEVICE IDENTITY
// ==================================
//
// Each machine VERONICA runs on gets its own persisted identity
// (id/name/role), separate from the user/agent roles in core/identity —
// this is "which machine is this," not "who is acting." device.local.json
// is machine-specific and gitignored, same treatment as .env: it
// shouldn't be shared or committed, each device generates its own on
// first run.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const os = require("os");

const DEVICE_FILE = path.join(__dirname, "device.local.json");
const REGISTRY_FILE = path.join(__dirname, "../../registry/devices.json");

const VALID_ROLES = ["laptop", "desktop", "phone", "server"];


function loadDeviceRoles(){

    return JSON.parse(
        fs.readFileSync(REGISTRY_FILE, "utf8")
    ).roles;

}


function permissionsForDeviceRole(roleId){

    const role = loadDeviceRoles().find(r => r.id === roleId);

    return role ? role.permissions : [];

}


// Capabilities describe what a device role can physically/functionally
// do (has a screen, can run vision, is always reachable) -- distinct
// from permissions, which gate what actions are ALLOWED. A phone has
// different capabilities than a desktop for reasons that have nothing to
// do with authorization (it has a camera; it isn't always on).
function capabilitiesForDeviceRole(roleId){

    const role = loadDeviceRoles().find(r => r.id === roleId);

    return role ? (role.capabilities || []) : [];

}


// Best-effort default: a headless Linux box with no display is far more
// likely to be a server than a laptop. There's no reliable way to detect
// "phone" from Node itself — that role is for a caller to set explicitly.
function detectDefaultRole(){

    return (process.platform === "linux" && !process.env.DISPLAY)
        ? "server"
        : "laptop";

}


function currentIdentity(){

    if(fs.existsSync(DEVICE_FILE)){
        return JSON.parse(fs.readFileSync(DEVICE_FILE, "utf8"));
    }

    const identity = {
        id: crypto.randomUUID(),
        name: os.hostname(),
        role: detectDefaultRole(),
        createdAt: new Date().toISOString()
    };

    fs.writeFileSync(
        DEVICE_FILE,
        JSON.stringify(identity, null, 2) + "\n"
    );

    return identity;

}


function setRole(roleId){

    if(!VALID_ROLES.includes(roleId)){
        throw new Error(`Unknown device role: "${roleId}"`);
    }

    const identity = currentIdentity();

    identity.role = roleId;

    fs.writeFileSync(
        DEVICE_FILE,
        JSON.stringify(identity, null, 2) + "\n"
    );

    return identity;

}


function permissions(){

    return permissionsForDeviceRole(currentIdentity().role);

}


function capabilities(){

    return capabilitiesForDeviceRole(currentIdentity().role);

}


module.exports = {

    currentIdentity,

    setRole,

    permissions,

    permissionsForDeviceRole,

    capabilities,

    capabilitiesForDeviceRole,

    loadDeviceRoles,

    VALID_ROLES

};
