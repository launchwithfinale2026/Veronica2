// ==================================
// VERONICA UNIFIED SYSTEM HEALTH SCORE
// ==================================
//
// Project F (Self Diagnostics). core/system/health.js (CPU/RAM/disk/
// running services), core/system/connectorHealth.js (real connector
// status-transition detection), and core/system/selfImprovement.js
// (poor performers, broken/outdated capabilities, architecture debt)
// each already compute a real signal -- but each reports separately,
// with no single combined view of "how healthy is VERONICA right now."
// This is that combination: a deterministic, explainable 0-100 score
// with a real breakdown of every deduction, not a fabricated or
// LLM-guessed number. Matches this codebase's standing "rule-based
// where a decision can be explained by rules" principle (see
// core/executive/planner.js's own department-assignment scoring for
// the established precedent).
//
// Every deduction in `breakdown` names the exact real metric that
// caused it -- an operator (or VERONICA herself, via a daily briefing
// or startup diagnostic) can always trace a low score back to a
// specific, real cause, never just a bare number.

const systemHealth = require("./health");
const integrationRegistry = require("../integrations/registry");

// Thresholds and point deductions are fixed, documented constants --
// changeable by editing this file, not a hidden or fabricated model.
const THRESHOLDS = {
    cpuLoadPercent: 90,
    memoryUsedPercent: 90,
    diskUsedPercent: 90
};

const PENALTIES = {
    cpu: 15,
    memory: 15,
    disk: 15,
    diskUnavailable: 5,
    serviceDown: 10,
    poorDepartment: 10,
    poorTool: 5,
    brokenCapability: 10
};

const STATUS_THRESHOLDS = [
    { min: 90, status: "healthy" },
    { min: 70, status: "fair" },
    { min: 40, status: "degraded" },
    { min: 0, status: "critical" }
];


function statusFor(score){
    return STATUS_THRESHOLDS.find(entry => score >= entry.min).status;
}


// Real, bounded 0-100 arithmetic -- every subtraction is pushed onto
// `breakdown` with the exact real detail and penalty that caused it, so
// the final number is always traceable, never opaque.
//
// `health`/`poorPerformers`/`broken` are optional overrides -- the same
// dependency-injection convention core/executive/actionProposal.js's
// Phase 50 `departments` override and core/system/gitObserver.js's
// Phase 52 `cwd`/`stateFile` overrides already established: real
// production behavior when omitted (every value is computed live from
// the actual system), but a test can supply an exact, deterministic
// shape (a real 95%-loaded CPU reading, a real poor-performer entry)
// without needing to actually spike this machine's CPU or manufacture
// a real failing department to prove threshold/deduction behavior.
async function score({ diskPath = "/", health, poorPerformers, broken } = {}){

    health = health || await systemHealth.generate({ diskPath });

    if(!poorPerformers){
        const SelfImprovementEngine = require("./selfImprovement");
        poorPerformers = new SelfImprovementEngine().poorPerformers();
    }

    if(!broken){
        const marketplace = require("../capabilities/marketplace");
        broken = marketplace.categorize().broken;
    }

    const breakdown = [];
    let points = 100;

    function deduct(category, detail, penalty){
        points -= penalty;
        breakdown.push({ category, detail, penalty });
    }

    if(health.cpu.loadPercent1m !== null && health.cpu.loadPercent1m > THRESHOLDS.cpuLoadPercent){
        deduct("cpu", `1-minute load average is ${health.cpu.loadPercent1m}% of real capacity`, PENALTIES.cpu);
    }

    if(health.memory.usedPercent > THRESHOLDS.memoryUsedPercent){
        deduct("memory", `${health.memory.usedPercent}% of real RAM in use`, PENALTIES.memory);
    }

    if(health.disk.error){
        deduct("disk", `Real disk stats unavailable: ${health.disk.error}`, PENALTIES.diskUnavailable);
    } else if(health.disk.usedPercent !== null && health.disk.usedPercent > THRESHOLDS.diskUsedPercent){
        deduct("disk", `${health.disk.usedPercent}% of real disk in use`, PENALTIES.disk);
    }

    for(const service of health.services){
        if(!service.running){
            deduct("service", `"${service.name}" is not running`, PENALTIES.serviceDown);
        }
    }

    for(const department of poorPerformers.departments){
        deduct("department_performance", `Department "${department.department}" has a real ${100 - department.successRate}% failure rate over ${department.total} run(s)`, PENALTIES.poorDepartment);
    }

    for(const tool of poorPerformers.tools){
        deduct("tool_performance", `Tool "${tool.tool}" has a real ${100 - tool.successRate}% failure rate over ${tool.total} call(s)`, PENALTIES.poorTool);
    }

    for(const capability of broken){
        deduct("capability", `Capability "${capability.name}" is in a real error state`, PENALTIES.brokenCapability);
    }

    points = Math.max(0, Math.min(100, points));

    const connectors = integrationRegistry.list();

    return {
        generatedAt: new Date().toISOString(),
        score: points,
        status: statusFor(points),
        breakdown,
        raw: {
            cpu: health.cpu,
            memory: health.memory,
            disk: health.disk,
            services: health.services,
            connectors: {
                total: connectors.length,
                configured: connectors.filter(c => c.configured).length,
                unconfigured: connectors.filter(c => !c.configured).map(c => c.id)
            },
            poorPerformers,
            brokenCapabilities: broken.map(c => c.name)
        }
    };

}


module.exports = { score, statusFor, THRESHOLDS, PENALTIES };
