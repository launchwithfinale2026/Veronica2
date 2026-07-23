// ==================================
// VERONICA ADAPTIVE INSIGHTS
// ==================================
//
// Phase 38 (Learning Engine). Tracks the specific signals this phase's
// own ask names -- accepted/rejected recommendations, automation
// success, package/tool usage, repeated behaviors -- by reading
// already-existing, already-persisted real records (Phase 15's
// ActionProposalEngine status history, Phase 11's
// ExecutiveRecommendationEngine history, Phase 8's automation job
// history, core/learning/log.js's tool-call telemetry). Nothing here
// invents a memory or fabricates a preference: every figure is a real
// count derived from records that were persisted for their own
// independent reasons, long before this file existed. Deliberately
// rule-based and fully explainable (a percentage, a count, a group-by)
// -- no LLM call, no fuzzy scoring, so every number here can be traced
// back to the exact records that produced it.
//
// This is a REPORTING layer, not a feedback loop wired into
// recommendation generation itself -- core/executive/executiveRecommendations.js's
// generate() is untouched. Feeding this data back into HOW future
// recommendations get generated is real future work (see
// docs/NEXT_STEPS.md), not something this file does silently.

const memory = require("../memory");
const automation = require("../automation");
const learningLog = require("./log");
const capabilitiesRegistry = require("../capabilities/registry");

// Lazy (inside each function, not at module top level): core/executive/index.js
// requires core/learning (this module's own facade) at its own top
// level, so a top-level require here of anything under core/executive/
// risks the exact ordering-dependent circular-require fragility this
// codebase has hit before (see docs/Architecture.md "Goal Decomposition
// Engine") -- both classes are only needed for their static TAG
// constant, not instantiated, so the cost of a lazy require here is
// negligible.


// "Accepted recommendations, rejected recommendations": every persisted
// action proposal (Phase 15) already records its own real status
// transition (pending -> approved/rejected -> executed) -- grouped by
// `action` (the same value as the recommendation `kind` that produced
// it, see actionProposal.js's fromRecommendation()), this is a real,
// explainable acceptance rate per recommendation type.
function recommendationAcceptance(){

    const ActionProposalEngine = require("../executive/actionProposal");
    const proposals = memory.filter({ tag: ActionProposalEngine.TAG });

    const byAction = {};

    for(const entry of proposals){

        const action = entry.metadata.action;

        if(!byAction[action]){
            byAction[action] = { action, total: 0, pending: 0, approved: 0, rejected: 0, executed: 0 };
        }

        byAction[action].total += 1;
        byAction[action][entry.metadata.status] = (byAction[action][entry.metadata.status] || 0) + 1;

    }

    return Object.values(byAction).map(entry => ({
        ...entry,
        // "Accepted" = approved OR already executed (executed implies
        // it was approved first) -- rejected is the only real refusal.
        acceptanceRate: entry.total ? Math.round(((entry.approved + entry.executed) / entry.total) * 100) : null
    }));

}


// "Repeated behaviors": the same (kind, subject) pair recommended more
// than once across separate recommendation runs -- either a signal it
// keeps getting ignored, or that it's a persistent, recurring issue.
// Either way, a real repetition count off real persisted history, not a
// guessed pattern.
function repeatedRecommendations(){

    const ExecutiveRecommendationEngine = require("../executive/executiveRecommendations");
    const history = memory.filter({ tag: ExecutiveRecommendationEngine.TAG });

    const counts = {};

    for(const record of history){

        for(const rec of (record.metadata.recommendations || [])){

            const key = `${rec.kind}::${rec.subject}`;

            if(!counts[key]){
                counts[key] = { kind: rec.kind, subject: rec.subject, count: 0, lastDetail: null };
            }

            counts[key].count += 1;
            counts[key].lastDetail = rec.detail;

        }

    }

    return Object.values(counts)
        .filter(entry => entry.count > 1)
        .sort((a, b) => b.count - a.count);

}


// "Automation success" (Phase 8's own job history, grouped by job name).
function automationSuccess(limit = 200){

    const byJob = {};

    for(const entry of automation.history(limit)){

        if(!byJob[entry.jobName]){
            byJob[entry.jobName] = { jobName: entry.jobName, total: 0, succeeded: 0, failed: 0 };
        }

        byJob[entry.jobName].total += 1;
        byJob[entry.jobName][entry.status === "completed" ? "succeeded" : "failed"] += 1;

    }

    return Object.values(byJob).map(entry => ({
        ...entry,
        successRate: entry.total ? Math.round((entry.succeeded / entry.total) * 100) : null
    }));

}


// "Package usage" as distinct from general tool usage: real tool-call
// telemetry (core/learning/log.js), filtered to tool ids an installed
// PACKAGE (not a built-in) declares -- "package usage" and "tool usage"
// are the same underlying data, scoped differently, not two separate
// tracking mechanisms.
function packageToolUsage(){

    const packageToolIds = new Set(
        capabilitiesRegistry.list()
            .filter(entry => !entry.core && entry.manifest)
            .flatMap(entry => (entry.manifest.tools || []).map(tool => tool.id))
    );

    const toolCalls = learningLog.readAll().filter(entry => entry.kind === "tool_call" && packageToolIds.has(entry.tool));

    const byTool = {};

    for(const entry of toolCalls){

        if(!byTool[entry.tool]){
            byTool[entry.tool] = { tool: entry.tool, total: 0, successes: 0, failures: 0 };
        }

        byTool[entry.tool].total += 1;
        byTool[entry.tool][entry.outcome === "success" ? "successes" : "failures"] += 1;

    }

    return Object.values(byTool);

}


function generate(){

    return {
        generatedAt: new Date().toISOString(),
        recommendationAcceptance: recommendationAcceptance(),
        repeatedRecommendations: repeatedRecommendations(),
        automationSuccess: automationSuccess(),
        packageToolUsage: packageToolUsage()
    };

}


module.exports = { recommendationAcceptance, repeatedRecommendations, automationSuccess, packageToolUsage, generate };
