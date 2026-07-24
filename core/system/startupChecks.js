// ==================================
// VERONICA SYSTEM LIFECYCLE -- STARTUP CHECKS
// ==================================
//
// Phase 46. Real, boot-gating environment validation -- distinct from
// core/integrations/credentialManager.js's validateStartup() (which
// only reports connector credentials and never halts boot, by design:
// a missing API key disables one connector, never the whole system).
// This module checks the things that mean VERONICA genuinely CANNOT
// run at all if missing -- a minimum Node version, required real
// directories actually being writable, and package.json's own declared
// dependencies actually being resolvable -- and reports which of its
// findings are CRITICAL (should halt boot) versus advisory.
//
// Reuses credentialManager.validateStartup() and
// capabilitiesRegistry.validateStartup() for the connector/capability
// side rather than re-implementing either.

const fs = require("fs");
const path = require("path");

const credentialManager = require("../integrations/credentialManager");
const capabilitiesRegistry = require("../capabilities/registry");

const MIN_NODE_MAJOR_VERSION = 18;

const REQUIRED_DIRECTORIES = [
    path.join(__dirname, "..", "memory"),
    path.join(__dirname, "..", "logging"),
    path.join(__dirname, "..", "..", "data", "workspace")
];


function checkNodeVersion(){

    const major = Number(process.versions.node.split(".")[0]);
    const ok = major >= MIN_NODE_MAJOR_VERSION;

    return {
        name: "nodeVersion",
        ok,
        critical: true,
        detail: ok
            ? `Node ${process.versions.node}`
            : `Node ${process.versions.node} is below the minimum supported version (${MIN_NODE_MAJOR_VERSION}.x)`
    };

}


// Real: actually stats + checks read/write access on each real
// required directory (creating it if genuinely missing, same
// bootstrap-on-first-run convention core/device/deviceManager.js's
// ensureFile() already uses -- a fresh checkout shouldn't fail this
// check just because a directory hasn't been created yet).
function checkDirectories(){

    const problems = [];

    for(const directory of REQUIRED_DIRECTORIES){

        try {

            if(!fs.existsSync(directory)){
                fs.mkdirSync(directory, { recursive: true });
            }

            fs.accessSync(directory, fs.constants.R_OK | fs.constants.W_OK);

        } catch(error){
            problems.push(`${directory}: ${error.message}`);
        }

    }

    return {
        name: "directories",
        ok: problems.length === 0,
        critical: true,
        detail: problems.length === 0 ? `${REQUIRED_DIRECTORIES.length} required directories accessible` : problems.join("; ")
    };

}


// Real: require.resolve() on this project's own real declared
// dependencies -- catches a genuinely broken `node_modules` (a real
// deploy failure mode) without a full `npm ls` shell-out.
function checkDependencies(){

    const packageInfo = require("../../package.json");
    const names = Object.keys(packageInfo.dependencies || {});
    const missing = [];

    for(const name of names){
        try {
            require.resolve(name);
        } catch(error){
            missing.push(name);
        }
    }

    return {
        name: "dependencies",
        ok: missing.length === 0,
        critical: true,
        detail: missing.length === 0 ? `${names.length} declared dependencies resolve` : `missing: ${missing.join(", ")}`
    };

}


// Real: identity.json (this process's own real config file) must
// parse as valid JSON with the fields every real caller of it expects.
function checkConfigValidity(){

    try {

        const raw = fs.readFileSync(path.join(__dirname, "..", "veronica", "identity.json"), "utf8");
        const identity = JSON.parse(raw);

        const ok = Boolean(identity.name && identity.mission);

        return {
            name: "configValidity",
            ok,
            critical: true,
            detail: ok ? "identity.json valid" : "identity.json is missing required fields (name/mission)"
        };

    } catch(error){

        return {
            name: "configValidity",
            ok: false,
            critical: true,
            detail: `identity.json: ${error.message}`
        };

    }

}


// Advisory, not critical -- a missing connector credential disables
// exactly that one connector (already credentialManager's own
// documented behavior); it must never halt boot.
function checkEnvironmentVariables(){

    const results = credentialManager.validateStartup();
    const configuredCount = results.filter(r => r.configured).length;

    return {
        name: "environmentVariables",
        ok: true,
        critical: false,
        detail: `${configuredCount}/${results.length} connectors configured`
    };

}


// Advisory, not critical -- capabilitiesRegistry.validateStartup()
// already logs/never throws for a broken capability; a broken package
// disables that one capability, never the whole system.
function checkCapabilities(){

    const results = capabilitiesRegistry.validateStartup();
    const brokenCount = Array.isArray(results) ? results.filter(c => c.status === "error" || c.status === "disabled").length : 0;

    return {
        name: "capabilities",
        ok: true,
        critical: false,
        detail: brokenCount === 0 ? "no broken capabilities" : `${brokenCount} capability(ies) in error/disabled status`
    };

}


// Runs every real check. `passed` is false only when a real CRITICAL
// check failed -- boot should halt on that, never on an advisory one.
function runAll(){

    const checks = [
        checkNodeVersion(),
        checkDirectories(),
        checkDependencies(),
        checkConfigValidity(),
        checkEnvironmentVariables(),
        checkCapabilities()
    ];

    const criticalFailures = checks.filter(c => c.critical && !c.ok);

    return {
        passed: criticalFailures.length === 0,
        critical: criticalFailures.length > 0,
        checks,
        failures: criticalFailures
    };

}


module.exports = {
    MIN_NODE_MAJOR_VERSION,
    checkNodeVersion,
    checkDirectories,
    checkDependencies,
    checkConfigValidity,
    checkEnvironmentVariables,
    checkCapabilities,
    runAll
};
