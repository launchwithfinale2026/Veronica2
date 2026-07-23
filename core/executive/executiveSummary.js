// ==================================
// VERONICA EXECUTIVE SUMMARY
// ==================================
//
// Phase 34 (Production Dashboard). "Today's Priorities" and "Critical
// Alerts" -- the two sections the dashboard's information hierarchy
// puts first, per this phase's own "a single glance tells the operator
// exactly what requires attention" principle. Composes already-existing
// facades (core/executive's priorityRank()/goalIssues()/blockers()/
// listProposals(), core/capabilities/registry.js's error/disabled
// capabilities, core/system/health.js's real resource figures) -- no
// new scoring or detection logic, just the top-line view across what
// already gets computed separately.

const executive = require("./index");
const capabilitiesRegistry = require("../capabilities/registry");


// How many top-ranked projects count as "today's priorities" -- same
// reasoning/limit as dailyBriefing.js's own TOP_PRIORITIES_LIMIT (a
// morning read should be short).
const TOP_PRIORITIES_LIMIT = 5;

// A resource is only a critical alert once it's genuinely tight -- most
// machines idle well above this, so this is a real, meaningful
// threshold, not noise on every single dashboard load.
const RESOURCE_ALERT_THRESHOLD_PERCENT = 90;


function todaysPriorities(){

    return executive.priorityRank()
        .slice(0, TOP_PRIORITIES_LIMIT)
        .map(entry => ({ project: entry.project.id, title: entry.project.title, score: entry.score, reasons: entry.reasons }));

}


// Every real thing that needs a human's attention right now, from
// already-existing detectors -- stalled goals, blockers, pending
// approvals, capabilities in error, and (if a health snapshot is
// supplied) tight resources. Deliberately does not re-detect any of
// these itself.
function criticalAlerts({ health } = {}){

    const alerts = [];

    for(const issue of executive.goalIssues().stalledProjects || []){
        alerts.push({ kind: "stalled_goal", severity: "warning", detail: `Project "${issue.project.title}" has been stalled`, subject: issue.project.id });
    }

    for(const blocker of executive.blockers().deadlockedProjects || []){
        alerts.push({ kind: "deadlocked_project", severity: "warning", detail: `Project "${blocker.project.title}" is deadlocked`, subject: blocker.project.id });
    }

    const pendingApprovals = executive.listProposals("pending");

    if(pendingApprovals.length){
        alerts.push({ kind: "pending_approvals", severity: "info", detail: `${pendingApprovals.length} action proposal(s) awaiting approval`, count: pendingApprovals.length });
    }

    for(const capability of capabilitiesRegistry.list().filter(c => c.status === "error")){
        alerts.push({ kind: "capability_error", severity: "critical", detail: `Capability "${capability.name}" is in error status`, subject: capability.name });
    }

    if(health){

        if(typeof health.memory?.usedPercent === "number" && health.memory.usedPercent >= RESOURCE_ALERT_THRESHOLD_PERCENT){
            alerts.push({ kind: "high_memory_usage", severity: "warning", detail: `Memory usage at ${health.memory.usedPercent}%` });
        }

        if(typeof health.disk?.usedPercent === "number" && health.disk.usedPercent >= RESOURCE_ALERT_THRESHOLD_PERCENT){
            alerts.push({ kind: "high_disk_usage", severity: "warning", detail: `Disk usage at ${health.disk.usedPercent}%` });
        }

    }

    return alerts;

}


function generate({ health } = {}){

    return {
        generatedAt: new Date().toISOString(),
        todaysPriorities: todaysPriorities(),
        criticalAlerts: criticalAlerts({ health })
    };

}


module.exports = { todaysPriorities, criticalAlerts, generate, TOP_PRIORITIES_LIMIT, RESOURCE_ALERT_THRESHOLD_PERCENT };
