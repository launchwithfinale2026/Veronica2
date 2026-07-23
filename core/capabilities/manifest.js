// ==================================
// VERONICA CAPABILITY MANIFEST
// ==================================
//
// Phase 20. Reads and shape-checks a package's manifest.json (see
// ../../packages/example/manifest.json for a real, working reference).
// Deliberately separate from validator.js: this module only concerns
// itself with "is this valid JSON with the right shape" -- validator.js
// checks the shape against the actual package directory and the
// currently-installed capability registry (do the referenced agent/tool
// files exist, are dependencies satisfied).

const fs = require("fs");
const path = require("path");

const REQUIRED_FIELDS = ["name", "version", "description"];


function manifestPathFor(packageDir){
    return path.join(packageDir, "manifest.json");
}


function loadManifest(packageDir){

    const manifestPath = manifestPathFor(packageDir);

    if(!fs.existsSync(manifestPath)){
        throw new Error(`No manifest.json found at "${manifestPath}"`);
    }

    let manifest;

    try {
        manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    } catch(error){
        throw new Error(`manifest.json at "${manifestPath}" is not valid JSON: ${error.message}`);
    }

    return normalize(manifest);

}


// Fills in every optional field with its real default -- every other
// module in this directory can then assume the full shape exists,
// rather than each one repeating `manifest.agents || []` defensively.
function normalize(manifest){

    return {
        name: manifest.name,
        version: manifest.version,
        description: manifest.description,
        agents: manifest.agents || [],
        tools: manifest.tools || [],
        dependencies: manifest.dependencies || [],
        permissions: manifest.permissions || [],
        // Phase 25 added optional `department` ({id, name, domain}) and
        // `automations` ([{name, intervalMs}]) fields that
        // core/capabilities/activation.js reads back off the STORED
        // manifest (packageDepartmentConfigs()/packageAutomationConfigs())
        // -- this whitelist predates that and was never updated, so every
        // real package's department/automations silently vanished at
        // install time (present in the package's own manifest.json on
        // disk, but stripped before being persisted to the registry).
        // Found live: every one of the six Phase 35/41 production
        // packages that declares a department ended up with zero
        // departments actually created.
        department: manifest.department || null,
        automations: manifest.automations || [],
        approvalRequired: Boolean(manifest.approvalRequired)
    };

}


// Phase 33 (Core Stabilization -- "improve dependency validation").
// A minimal, dependency-free semver-ish comparison -- "1.10.0" > "1.9.0"
// (plain string comparison would get this backwards). Returns >0 if a
// is newer, <0 if b is newer, 0 if equal. Moved here (from
// marketplace.js, which re-exports it for backward compatibility) since
// validator.js also needs it for dependency version constraints, and
// this is the shared "version string" module both depend on.
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


// A manifest.dependencies entry is either a plain capability name
// (string -- "any installed version satisfies this"), or
// {name, minVersion} for a real version floor. Both shapes normalize to
// the same {name, minVersion} object so validator.js only has to handle
// one.
function normalizeDependency(dependency){

    if(typeof dependency === "string"){
        return { name: dependency, minVersion: null };
    }

    return { name: dependency.name, minVersion: dependency.minVersion || null };

}


function shapeErrors(manifest){

    const errors = [];

    for(const field of REQUIRED_FIELDS){
        if(!manifest || !manifest[field]){
            errors.push(`Missing required field: "${field}"`);
        }
    }

    if(manifest && manifest.agents && !Array.isArray(manifest.agents)){
        errors.push('"agents" must be an array');
    }

    if(manifest && manifest.tools && !Array.isArray(manifest.tools)){
        errors.push('"tools" must be an array');
    }

    return errors;

}


module.exports = { loadManifest, normalize, shapeErrors, manifestPathFor, REQUIRED_FIELDS, compareVersions, normalizeDependency };
