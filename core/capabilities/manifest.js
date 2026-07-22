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
        approvalRequired: Boolean(manifest.approvalRequired)
    };

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


module.exports = { loadManifest, normalize, shapeErrors, manifestPathFor, REQUIRED_FIELDS };
