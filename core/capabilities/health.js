// ==================================
// VERONICA CAPABILITY HEALTH
// ==================================
//
// Phase 41. registry.status ("active") only means a package is wired
// into the loaders (Phase 25/33 already guarantee that) -- it says
// nothing about whether the package actually DOES anything yet. This
// module computes each package's real operational status: how many of
// its declared agents/tools actually loaded (a broken file is logged
// and skipped, not crashed -- Phase 33 resilience -- but that means a
// package can be "active" while quietly missing pieces), whether any
// of its dependencies are missing, and whether any of its tools are
// still core/capabilities/builder.js-generated skeletons rather than
// real implementations.
//
// "Mark any capability that lacks a real connector as 'Installed --
// Awaiting Integration' rather than pretending it functions" -- this is
// where that label is computed, as a REPORTING field. It never
// overwrites registry.status: a package with only skeleton tools is
// still correctly "active" in the sense that matters to the loaders
// (its department/agents are real and running) -- it just isn't fully
// implemented yet, which is a different, honest thing to say.

const registry = require("./registry");
const loadAgents = require("../agents/loader");
const loadTools = require("../tools/loader");
const { SKELETON_MARKER } = require("./builder");


// Detects a generated-skeleton tool handler by reading its own source
// (not by calling it -- a real tool could have side effects, and this
// needs to run as a passive health check, not a probe). See
// builder.js's SKELETON_MARKER for why this is a shared constant
// instead of two copies of the same string.
function isSkeletonHandler(handler){
    return typeof handler === "function" && handler.toString().includes(SKELETON_MARKER);
}


const STATUS_LABELS = {
    active: "Active",
    degraded: "Degraded -- Load Errors",
    installed_awaiting_integration: "Installed – Awaiting Integration",
    installed: "Installed (Inactive)",
    disabled: "Disabled"
};


function dependencyName(dependency){
    return typeof dependency === "string" ? dependency : dependency.name;
}


// One package's real health. `agents`/`tools` are the live, already-
// loaded rosters (passed in so report() below only loads them once for
// every package, not once per package).
function healthFor(entry, agents, tools){

    const manifest = entry.manifest || {};
    const declaredAgents = manifest.agents || [];
    const declaredTools = manifest.tools || [];
    const declaredDependencies = manifest.dependencies || [];

    const liveAgents = agents.filter(a => a.packageSource === entry.name);
    const liveTools = tools.filter(t => t.packageSource === entry.name);

    const skeletonTools = liveTools
        .filter(tool => isSkeletonHandler(tool.handler))
        .map(tool => tool.id);

    const missingAgents = declaredAgents
        .map(a => a.name)
        .filter(name => !liveAgents.some(a => a.name === name));

    const missingTools = declaredTools
        .map(t => t.id)
        .filter(id => !liveTools.some(t => t.id === id));

    const missingDependencies = declaredDependencies
        .map(dependencyName)
        .filter(name => !registry.isInstalled(name));

    let operationalStatus;

    if(entry.status !== "active"){
        operationalStatus = entry.status;
    } else if(missingAgents.length || missingTools.length || missingDependencies.length){
        operationalStatus = "degraded";
    } else if(skeletonTools.length){
        operationalStatus = "installed_awaiting_integration";
    } else {
        operationalStatus = "active";
    }

    return {
        name: entry.name,
        version: entry.version,
        registryStatus: entry.status,
        operationalStatus,
        operationalStatusLabel: STATUS_LABELS[operationalStatus] || operationalStatus,
        agentsDeclared: declaredAgents.length,
        agentsLoaded: liveAgents.length,
        toolsDeclared: declaredTools.length,
        toolsLoaded: liveTools.length,
        skeletonTools,
        missingAgents,
        missingTools,
        missingDependencies
    };

}


// Every installed (non-core) capability's health report. Core
// capabilities are excluded -- they aren't packages with declared
// agents/tools/dependencies in the same sense, and were never subject
// to the skeleton-generation path this module exists to detect.
function report(){

    const agents = loadAgents();
    const tools = loadTools();

    return registry.list()
        .filter(entry => !entry.core)
        .map(entry => healthFor(entry, agents, tools));

}


module.exports = { report, healthFor, isSkeletonHandler, STATUS_LABELS };
