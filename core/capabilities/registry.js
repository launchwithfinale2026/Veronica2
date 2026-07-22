// ==================================
// VERONICA CAPABILITY REGISTRY
// ==================================
//
// Phase 20 (Capability Expansion Architecture). Tracks every capability
// VERONICA knows about -- what's built-in (memory, agents, automation,
// dashboard, the Phase 19 connectors) and what's been installed as a
// package (see ../../packages/ and manifest.js/installer.js in this
// directory) -- with a real status per capability (installed/active/
// disabled/error), not just a static list.
//
// Persisted the same way core/automation/engine.js persists its job
// queue: a plain JSON file, rewritten on every mutation, gitignored
// (per-installation runtime state, not source) with a bootstrap default
// on first read (same pattern as core/memory/store.js's ensureFile()).

const fs = require("fs");
const path = require("path");

const log = require("../logging");

const STATE_FILE = path.join(__dirname, "state.json");

const STATUSES = ["installed", "active", "disabled", "error"];

// What already exists in this codebase, seeded once so the registry's
// list() reflects reality from the start rather than only showing
// packages installed after this phase. `core: true` means
// uninstallable -- these aren't packages, they're the system itself.
const BUILT_IN_CAPABILITIES = [
    { name: "memory", description: "Classification/scoring/lifecycle memory system (Phase 3, 12)" },
    { name: "knowledge", description: "Knowledge graph (Phase 4)" },
    { name: "agents", description: "Agent roster and department framework (Phase 1-2)" },
    { name: "executive", description: "Executive intelligence layer (Phase 11, 14, 15)" },
    { name: "automation", description: "Job scheduling engine (Phase 8)" },
    { name: "dashboard", description: "Command center dashboard (Phase 9, 17)" },
    { name: "github", description: "GitHub connector (Phase 7, 19)" },
    { name: "discord", description: "Discord webhook + bot connectors (Phase 7, 19)" },
    { name: "google", description: "Google Workspace connector (Phase 19)" }
];


function seedDefault(){
    return {
        capabilities: BUILT_IN_CAPABILITIES.map(entry => ({
            name: entry.name,
            version: "core",
            description: entry.description,
            status: "active",
            core: true,
            installedAt: null,
            source: "built-in",
            history: []
        }))
    };
}


function ensureFile(){

    if(!fs.existsSync(STATE_FILE)){
        fs.writeFileSync(STATE_FILE, JSON.stringify(seedDefault(), null, 4));
    }

}


// Phase 33 (Core Stabilization): since Phase 25 wired this registry into
// core/agents/loader.js/core/tools/loader.js/core/departments/loader.js,
// a corrupted state.json (e.g. the process was killed mid-write) would
// otherwise crash EVERY loader -- meaning even the built-in agent
// roster couldn't load. Recovers the same way credentialManager fails
// closed on a missing connector: log the real problem (never silently
// swallowed), preserve the corrupt file for forensics (timestamped,
// alongside the good one), and reinitialize to the known-good default
// rather than taking the whole boot sequence down over one bad file.
function load(){

    ensureFile();

    const raw = fs.readFileSync(STATE_FILE, "utf8");

    try {
        return JSON.parse(raw);
    } catch(error){

        const corruptBackup = `${STATE_FILE}.corrupt-${Date.now()}`;
        fs.writeFileSync(corruptBackup, raw);

        log.error(
            "capabilities",
            `state.json was corrupt (${error.message}) -- preserved as ${path.basename(corruptBackup)} and reinitialized to defaults. Any packages installed since the last valid save must be reinstalled.`
        );

        const fresh = seedDefault();
        save(fresh);

        return fresh;

    }

}


function save(data){
    fs.writeFileSync(STATE_FILE, JSON.stringify(data, null, 4));
}


function list(){
    return load().capabilities;
}


function get(name){
    return list().find(c => c.name === name) || null;
}


function isInstalled(name){
    return Boolean(get(name));
}


// A full copy of current state -- installer.js snapshots this before
// activating a new package, so rollback() (lifecycle.js) can restore it
// exactly, per this phase's "self-expansion safety" requirement (create
// backup snapshot before any capability activates).
function snapshot(){
    return load();
}


function restore(snapshotData){
    save(snapshotData);
}


// Registers a NEW capability (installer.js, after validation passes) --
// throws on a duplicate name rather than silently overwriting, since a
// name collision usually means the package is already installed.
function register(entry){

    if(!entry || !entry.name){
        throw new Error("A capability name is required");
    }

    const data = load();

    if(data.capabilities.some(c => c.name === entry.name)){
        throw new Error(`Capability "${entry.name}" is already registered`);
    }

    const record = {
        name: entry.name,
        version: entry.version || "0.0.0",
        description: entry.description || "",
        status: entry.status || "installed",
        core: false,
        installedAt: new Date().toISOString(),
        source: entry.source || null,
        manifest: entry.manifest || null,
        history: [{ status: entry.status || "installed", at: new Date().toISOString(), note: "Registered" }]
    };

    data.capabilities.push(record);
    save(data);

    return record;

}


function requireCapability(name){

    const entry = get(name);

    if(!entry){
        throw new Error(`Unknown capability: "${name}"`);
    }

    return entry;

}


function setStatus(name, status, note){

    if(!STATUSES.includes(status)){
        throw new Error(`Unknown capability status: "${status}" -- expected one of: ${STATUSES.join(", ")}`);
    }

    const data = load();
    const entry = data.capabilities.find(c => c.name === name);

    if(!entry){
        throw new Error(`Unknown capability: "${name}"`);
    }

    entry.status = status;
    entry.history.push({ status, at: new Date().toISOString(), note: note || null });

    save(data);

    return entry;

}


// Only non-core (package-installed) capabilities can be removed --
// built-in ones aren't packages, there's nothing to uninstall.
function remove(name){

    const data = load();
    const entry = data.capabilities.find(c => c.name === name);

    if(!entry){
        throw new Error(`Unknown capability: "${name}"`);
    }

    if(entry.core){
        throw new Error(`Capability "${name}" is a built-in, not a package -- it cannot be removed`);
    }

    data.capabilities = data.capabilities.filter(c => c.name !== name);
    save(data);

    return { removed: name };

}


module.exports = {
    STATUSES,
    BUILT_IN_CAPABILITIES,
    list, get, isInstalled, register, requireCapability,
    setStatus, remove, snapshot, restore
};
