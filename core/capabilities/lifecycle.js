// ==================================
// VERONICA CAPABILITY LIFECYCLE
// ==================================
//
// Phase 20. Status transition rules for an installed capability, plus
// rollback -- the "self-expansion safety" half of this phase's ask
// (backup snapshot before activation, allow rollback). registry.js
// stays a plain CRUD layer on purpose; this is where "is THIS
// transition legal" and "restore a prior snapshot" live.

const registry = require("./registry");

// installed -> active is the normal path. Both installed and active can
// end up in "error" (activation/health-check failed, or a runtime fault
// was reported). "disabled" is an operator choice, reachable only from
// "active", reversible back to "active". "error" can only be recovered
// by re-installing (back to "installed") -- there's no direct
// error -> active jump, so a broken capability can't silently resume
// without re-validating first.
const ALLOWED_TRANSITIONS = {
    installed: ["active", "error"],
    active: ["disabled", "error"],
    disabled: ["active"],
    error: ["installed"]
};


function transition(name, toStatus, note){

    const entry = registry.requireCapability(name);

    const allowed = ALLOWED_TRANSITIONS[entry.status] || [];

    if(!allowed.includes(toStatus)){
        throw new Error(`Capability "${name}" cannot go from "${entry.status}" to "${toStatus}" -- allowed: ${allowed.join(", ") || "(none)"}`);
    }

    return registry.setStatus(name, toStatus, note);

}


function activate(name, note){
    return transition(name, "active", note || "Activated");
}


function disable(name, note){
    return transition(name, "disabled", note || "Disabled");
}


function markError(name, note){

    const entry = registry.requireCapability(name);

    // Both "installed" and "active" can fail -- error is reachable from
    // either, so this bypasses the strict ALLOWED_TRANSITIONS lookup
    // above (which only lists ONE next status per current status for
    // the happy path) rather than special-casing both entries there.
    if(!["installed", "active"].includes(entry.status)){
        throw new Error(`Capability "${name}" cannot be marked "error" from "${entry.status}"`);
    }

    return registry.setStatus(name, "error", note || "Marked error");

}


// Restores the ENTIRE registry to a prior snapshot (see registry.js's
// snapshot()/restore()) -- used by installer.js when a fresh install's
// post-activation health check fails, undoing the registration
// entirely rather than leaving a half-installed capability behind.
function rollback(snapshotData){
    registry.restore(snapshotData);
    return { rolledBack: true };
}


module.exports = { ALLOWED_TRANSITIONS, transition, activate, disable, markError, rollback };
