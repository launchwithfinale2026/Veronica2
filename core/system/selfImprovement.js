// ==================================
// VERONICA SELF-IMPROVEMENT ENGINE
// ==================================
//
// Phase 30. VERONICA evaluating herself -- what exists, what's missing,
// what's duplicated, what's outdated, what performs poorly, what should
// be optimized -- by reading REAL state from already-existing systems
// (Phase 20's capability registry/marketplace, Phase 7's learning
// engine, Phase 19's credential manager/http allowlist), not a fourth
// parallel analysis system and not fabricated findings. Produces an
// Optimization Queue, a Refactor Queue, a Performance Report, a
// Security Report, and Improvement Recommendations -- all PROPOSALS,
// per this phase's explicit "no autonomous execution" constraint. This
// engine never changes anything; it only reports.
//
// Architecture Debt is the one section that ISN'T derived from live
// state -- knowing that "company isolation is logical, not physical" is
// an architectural judgment call made once (across this whole session's
// work), not something re-derivable from a database query every time
// this runs. KNOWN_ARCHITECTURE_DEBT below is a manually curated
// snapshot, explicitly labeled as such -- update it as items are
// resolved; docs/CHANGELOG.md's per-phase "Remaining limitations"
// sections remain the authoritative, detailed history.

const memory = require("../memory");
const learning = require("../learning");
const capabilitiesRegistry = require("../capabilities/registry");
const marketplace = require("../capabilities/marketplace");
const credentialManager = require("../integrations/credentialManager");
const http = require("../integrations/http");

const SELF_IMPROVEMENT_TAG = "self-improvement";

// A department/tool needs at least this many logged executions before
// its failure rate is treated as a real signal rather than noise from a
// tiny sample -- same threshold and reasoning as
// core/executive/selfMonitor.js's own MIN_EXECUTIONS_FOR_SIGNAL.
const MIN_EXECUTIONS_FOR_SIGNAL = 5;
const FAILURE_RATE_THRESHOLD = 0.3;

const KNOWN_ARCHITECTURE_DEBT = [
    { area: "Generic connectors", detail: "Calendar/Email/Cloud storage placeholders (non-Google providers) remain interface-only -- see docs/EXTERNAL_DEPENDENCIES.md." },
    { area: "Autonomous execution", detail: "No operator-facing pause switch beyond not registering the execute-tasks job or stopping automation entirely." },
    { area: "Company isolation", detail: "Logical/tag-based, not physical -- the knowledge graph has no company-level scoping (Phase 10 finding, still open)." },
    { area: "UI testing", detail: "No browser-based visual verification anywhere in this project -- endpoint/content-level checks only (no browser available in this environment)." },
    { area: "External writes", detail: "Only create_github_issue/post_discord_message/install_capability are approval-executable; email send/PR merge/code push/file delete have no connector implementation at all." }
];


class SelfImprovementEngine {

    static TAG = SELF_IMPROVEMENT_TAG;


    // Reuses the EXISTING learning engine's own stats -- not a second
    // performance-tracking mechanism.
    performanceReport(){

        return {
            overview: learning.overview(),
            departments: learning.departmentPerformance(),
            tools: learning.toolPerformance()
        };

    }


    // A real, live security posture check -- is the dashboard's write
    // surface actually gated, is outbound HTTP actually restricted, and
    // which connectors are missing credentials right now. Not a
    // fabricated audit finding; every field here is read straight from
    // real env/config state.
    securityReport(){

        return {
            apiTokenConfigured: Boolean(process.env.API_TOKEN),
            serviceAllowlistConfigured: http.allowlist().length > 0,
            allowlistedHosts: http.allowlist(),
            unconfiguredConnectors: credentialManager.overview().filter(entry => !entry.configured).map(entry => entry.id)
        };

    }


    // "What is duplicated": any tool id declared by more than one
    // installed, non-core capability package -- a real, checkable
    // overlap (two packages both trying to provide the same tool),
    // not a fuzzy similarity guess.
    duplicatedCapabilities(){

        const installed = capabilitiesRegistry.list().filter(entry => !entry.core && entry.manifest);
        const toolOwners = {};

        for(const capability of installed){
            for(const tool of (capability.manifest.tools || [])){
                (toolOwners[tool.id] = toolOwners[tool.id] || []).push(capability.name);
            }
        }

        return Object.entries(toolOwners)
            .filter(([, owners]) => owners.length > 1)
            .map(([toolId, owners]) => ({ toolId, declaredBy: owners }));

    }


    // "What is outdated": reuses Phase 26's marketplace categorization
    // rather than re-detecting version drift a second way.
    outdatedCapabilities(){
        return marketplace.categorize().updatesAvailable;
    }


    // "What performs poorly": departments/tools with enough volume to
    // be a real signal AND a failure rate above threshold -- same
    // reasoning/thresholds as core/executive/selfMonitor.js's
    // checkPerformance(), applied per-department/per-tool instead of
    // system-wide.
    poorPerformers(){

        const departments = learning.departmentPerformance()
            .filter(entry => entry.total >= MIN_EXECUTIONS_FOR_SIGNAL && (entry.failures / entry.total) > FAILURE_RATE_THRESHOLD);

        const tools = learning.toolPerformance()
            .filter(entry => entry.total >= MIN_EXECUTIONS_FOR_SIGNAL && (entry.failures / entry.total) > FAILURE_RATE_THRESHOLD);

        return { departments, tools };

    }


    // Assembles every section above into the buckets this phase names --
    // Optimization Queue, Refactor Queue, Improvement Recommendations --
    // WITHOUT executing any of them. Every item is a plain, inspectable
    // proposal object; nothing here calls performAction()/executeExternal()
    // or any other execution path.
    generate(){

        const duplicated = this.duplicatedCapabilities();
        const outdated = this.outdatedCapabilities();
        const poor = this.poorPerformers();
        const broken = marketplace.categorize().broken;

        const optimizationQueue = [
            ...poor.departments.map(entry => ({ kind: "optimize_department", detail: `Department "${entry.department}" has a ${100 - entry.successRate}% failure rate over ${entry.total} run(s)` })),
            ...poor.tools.map(entry => ({ kind: "optimize_tool", detail: `Tool "${entry.tool}" has a ${100 - entry.successRate}% failure rate over ${entry.total} call(s)` }))
        ];

        const refactorQueue = duplicated.map(entry => ({
            kind: "refactor_duplicate_tool",
            detail: `Tool "${entry.toolId}" is declared by multiple packages: ${entry.declaredBy.join(", ")} -- consolidate or rename to avoid collision`
        }));

        const improvementRecommendations = [
            ...outdated.map(entry => ({ kind: "upgrade_available", detail: `"${entry.name}" v${entry.onDiskVersion} is available (installed: v${entry.version})` })),
            ...broken.map(entry => ({ kind: "fix_broken_capability", detail: `"${entry.name}" is in error status and needs investigation` })),
            ...KNOWN_ARCHITECTURE_DEBT.map(entry => ({ kind: "architecture_debt", detail: `${entry.area}: ${entry.detail}` }))
        ];

        return {

            generatedAt: new Date().toISOString(),

            duplicated,
            outdated,
            poorPerformers: poor,
            architectureDebt: KNOWN_ARCHITECTURE_DEBT,

            performanceReport: this.performanceReport(),
            securityReport: this.securityReport(),

            optimizationQueue,
            refactorQueue,
            improvementRecommendations

        };

    }


    persist(report){

        const entry = memory.remember({
            content: `Self-improvement report: ${report.optimizationQueue.length} optimization item(s), ${report.refactorQueue.length} refactor item(s), ${report.improvementRecommendations.length} recommendation(s)`,
            type: "decisions",
            importance: report.optimizationQueue.length || report.refactorQueue.length ? 4 : 2,
            tags: [SELF_IMPROVEMENT_TAG],
            source: "self-improvement",
            metadata: report
        });

        return this.toRecord(entry);

    }


    toRecord(entry){
        return { id: entry.id, summary: entry.content, ...entry.metadata, created: entry.created };
    }


    run(){
        return this.persist(this.generate());
    }


    history(limit = 10){
        return memory.filter({ tag: SELF_IMPROVEMENT_TAG }, { limit }).map(entry => this.toRecord(entry));
    }

}


module.exports = SelfImprovementEngine;
