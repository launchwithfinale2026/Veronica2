// ==================================
// VERONICA CAPABILITY MARKETPLACE
// ==================================
//
// Phase 26. A read-only view layer over the existing capability
// registry (Phase 20) and the real packages/ directory on disk --
// categorizes every capability (installed and not-yet-installed alike)
// the way this phase's own dashboard ask frames it (Installed/
// Available/Disabled/Experimental/Updates Available/Deprecated/Broken),
// and surfaces the metadata that ask lists (version, health,
// dependencies, permissions, install size, install date, update
// history) -- all read from real state, nothing fabricated:
//
//   - install size: an actual recursive byte count of the package's
//     directory on disk.
//   - update history: the SAME history array registry.js already
//     tracks on every status transition (installer.upgrade() already
//     writes a note like "Upgraded from vX to vY" there) -- not a new
//     tracking mechanism.
//   - updates available: compares a REGISTERED package's version
//     against its manifest.json's version ON DISK right now -- if
//     someone dropped a newer manifest.json into the same source
//     directory without running installer.upgrade() yet, this is how
//     it'd be detected.
//   - experimental / deprecated: optional manifest.json flags a package
//     author sets -- not inferred.

const fs = require("fs");
const path = require("path");

const registry = require("./registry");
const manifestModule = require("./manifest");

const PACKAGE_ROOTS = [path.join(__dirname, "..", "..", "packages")];


function discoverPackageDirs(){

    const dirs = [];

    for(const root of PACKAGE_ROOTS){

        if(!fs.existsSync(root)){
            continue;
        }

        for(const entry of fs.readdirSync(root, { withFileTypes: true })){
            if(entry.isDirectory()){
                dirs.push(path.join(root, entry.name));
            }
        }

    }

    return dirs;

}


function directorySize(dir){

    let total = 0;

    for(const entry of fs.readdirSync(dir, { withFileTypes: true })){

        const full = path.join(dir, entry.name);

        if(entry.isDirectory()){
            total += directorySize(full);
        } else if(entry.isFile()){
            total += fs.statSync(full).size;
        }

    }

    return total;

}


// A minimal, dependency-free semver-ish comparison -- "1.10.0" > "1.9.0"
// (plain string comparison would get this backwards). Returns >0 if a
// is newer, <0 if b is newer, 0 if equal.
function compareVersions(a, b){

    const partsA = String(a).split(".").map(Number);
    const partsB = String(b).split(".").map(Number);

    for(let i = 0; i < Math.max(partsA.length, partsB.length); i++){

        const numA = partsA[i] || 0;
        const numB = partsB[i] || 0;

        if(numA !== numB){
            return numA - numB;
        }

    }

    return 0;

}


// Every package directory under packages/ whose manifest.json declares
// a name NOT already in the registry -- "Available," per this phase's
// dashboard categories. A directory with no manifest.json, or an
// unparseable one, is silently skipped: this is a discovery scan, not a
// validation pass (installer.js's validator.js does the real
// validation, at actual install time).
function listAvailable(){

    const installedNames = new Set(registry.list().map(entry => entry.name));
    const available = [];

    for(const dir of discoverPackageDirs()){

        let manifest;

        try {
            manifest = manifestModule.loadManifest(dir);
        } catch(error){
            continue;
        }

        if(!installedNames.has(manifest.name)){
            available.push({
                name: manifest.name,
                version: manifest.version,
                description: manifest.description,
                status: "available",
                core: false,
                installedAt: null,
                source: dir,
                manifest,
                history: []
            });
        }

    }

    return available;

}


function metadataFor(entry){

    const manifest = entry.manifest || {};

    let onDiskVersion = null;
    let updateAvailable = false;

    // Only meaningful for something ALREADY installed -- an "available"
    // package has nothing installed yet to compare against.
    if(entry.status !== "available" && entry.source && fs.existsSync(path.join(entry.source, "manifest.json"))){

        try {
            const onDiskManifest = manifestModule.loadManifest(entry.source);
            onDiskVersion = onDiskManifest.version;
            updateAvailable = compareVersions(onDiskVersion, entry.version) > 0;
        } catch(error){
            // Source manifest no longer parses -- can't compare; leave
            // updateAvailable false rather than guessing.
        }

    }

    let installSizeBytes = null;

    if(entry.source && fs.existsSync(entry.source)){
        try {
            installSizeBytes = directorySize(entry.source);
        } catch(error){
            installSizeBytes = null;
        }
    }

    return {
        name: entry.name,
        version: entry.version,
        status: entry.status,
        core: entry.core,
        description: entry.description,
        dependencies: manifest.dependencies || [],
        permissions: manifest.permissions || [],
        experimental: Boolean(manifest.experimental),
        deprecated: Boolean(manifest.deprecated),
        installedAt: entry.installedAt,
        updateHistory: entry.history || [],
        installSizeBytes,
        onDiskVersion,
        updateAvailable
    };

}


// Every category this phase's dashboard ask names, each a real,
// non-overlapping (except "updatesAvailable"/"experimental"/"deprecated",
// which are properties of an installed package, not separate states)
// slice of real state.
function categorize(){

    const installedMetadata = registry.list().filter(entry => !entry.core).map(metadataFor);
    const availableMetadata = listAvailable().map(metadataFor);

    return {
        installed: installedMetadata.filter(c => c.status === "installed" || c.status === "active"),
        available: availableMetadata,
        disabled: installedMetadata.filter(c => c.status === "disabled"),
        experimental: installedMetadata.filter(c => c.experimental),
        updatesAvailable: installedMetadata.filter(c => c.updateAvailable),
        deprecated: installedMetadata.filter(c => c.deprecated),
        broken: installedMetadata.filter(c => c.status === "error")
    };

}


function search(query){

    if(!query){
        throw new Error("A search query is required");
    }

    const lower = query.toLowerCase();

    const all = [
        ...registry.list().filter(entry => !entry.core).map(metadataFor),
        ...listAvailable().map(metadataFor)
    ];

    return all.filter(c =>
        c.name.toLowerCase().includes(lower) ||
        (c.description || "").toLowerCase().includes(lower)
    );

}


module.exports = { listAvailable, categorize, search, metadataFor, compareVersions, directorySize };
