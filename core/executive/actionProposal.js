// ==================================
// VERONICA ACTION PROPOSAL SYSTEM
// ==================================
//
// Phase 15 (Controlled Autonomy). Completes the pipeline this milestone
// asks for: Observation (Phase 11's PriorityRanking/GoalMonitor/
// BlockerDetector) -> Recommendation (Phase 11's
// ExecutiveRecommendationEngine) -> Proposal (this file) -> Approval
// (this file) -> Execution (this file). The first three steps already
// existed; this adds the last three.
//
// Hard rule, unconditional: execute() only ever runs for a proposal
// whose status is "approved" -- there is no code path that skips this,
// regardless of `approvalRequired` (see below). "No autonomous external
// actions without approval" is enforced structurally, not by convention.
//
// `approvalRequired` is a real, varying field (not a hardcoded true) --
// it signals review urgency to a human reviewer (does this change real
// roadmap state, or is it purely informational), but does NOT bypass
// the approval gate itself; that gate is unconditional either way.

const memory = require("../memory");
const ExecutivePlanner = require("./planner");
const ProjectManager = require("./projectManager");
const BlockerDetector = require("./blockerDetection");
const ExecutiveRecommendationEngine = require("./executiveRecommendations");

const PROPOSAL_TAG = "action-proposal";

const STATUSES = ["pending", "approved", "rejected", "executed"];

// Rule-based, per action kind (see executiveRecommendations.js's own
// `kind` values) -- explainable, not a guess: does this action change
// real roadmap state (medium) or is it purely informational (low)?
const ACTION_RISK = {
    resolve_deadlock: "medium",
    unblock_task: "medium",
    revisit_stalled_goal: "medium",
    high_urgency: "low"
};

// Only "high_urgency" needs no approval to review quickly -- it makes
// no state change at all (see performAction() below). Every action that
// actually touches roadmap state requires approval, no exceptions.
const APPROVAL_REQUIRED = {
    resolve_deadlock: true,
    unblock_task: true,
    revisit_stalled_goal: true,
    high_urgency: false
};


class ActionProposalEngine {

    static TAG = PROPOSAL_TAG;
    static STATUSES = STATUSES;

    constructor({ planner, projectManager, recommendationEngine, blockerDetector } = {}){

        this.planner = planner || new ExecutivePlanner();
        this.projectManager = projectManager || new ProjectManager({ planner: this.planner });
        this.recommendationEngine = recommendationEngine || new ExecutiveRecommendationEngine({
            planner: this.planner,
            projectManager: this.projectManager
        });
        this.blockerDetector = blockerDetector || new BlockerDetector({ planner: this.planner, projectManager: this.projectManager });

    }


    // The subject's own department tag, if it has one -- best-effort,
    // not required (a proposal about a project with no department tag
    // simply has department: null).
    departmentFor(subjectId){

        try {

            const entry = this.projectManager.requireEntry(subjectId);

            return entry.tags.find(tag => this.planner.departments.some(dept => dept.id === tag)) || null;

        } catch(error){

            return null;

        }

    }


    // Converts one fresh recommendation (Phase 11) into a persisted,
    // pending proposal.
    fromRecommendation(recommendation){

        const proposal = {
            action: recommendation.kind,
            reason: `${recommendation.detail} -- ${recommendation.reason}`,
            department: this.departmentFor(recommendation.subject),
            subject: recommendation.subject,
            risk: ACTION_RISK[recommendation.kind] || "medium",
            approvalRequired: APPROVAL_REQUIRED[recommendation.kind] !== false,
            status: "pending"
        };

        const entry = memory.remember({
            content: `Proposal: ${recommendation.detail}`,
            type: "decisions",
            importance: proposal.risk === "medium" ? 4 : 2,
            tags: [PROPOSAL_TAG],
            source: "action-proposal",
            metadata: proposal
        });

        return this.toRecord(entry);

    }


    // Observation -> Recommendation -> Proposal in one call -- generates
    // fresh recommendations (not persisted a second time here; this
    // engine's own persisted artifact IS the proposal) and turns each
    // into a pending proposal.
    generateProposals(){

        return this.recommendationEngine.generate().map(rec => this.fromRecommendation(rec));

    }


    requireProposal(id){

        const entry = memory.view().find(m => m.id === id && (m.tags || []).includes(PROPOSAL_TAG));

        if(!entry){
            throw new Error(`Unknown action proposal: "${id}"`);
        }

        return entry;

    }


    requirePendingStatus(entry, expected){

        if(entry.metadata.status !== "pending"){
            throw new Error(`Proposal "${entry.id}" is "${entry.metadata.status}", not "pending" -- ${expected} requires a pending proposal`);
        }

    }


    approve(id, note){

        const entry = this.requireProposal(id);
        this.requirePendingStatus(entry, "approval");

        const updated = memory.update(id, { metadata: { status: "approved", reviewNote: note || null, reviewedAt: new Date().toISOString() } });

        return this.toRecord(updated);

    }


    reject(id, note){

        const entry = this.requireProposal(id);
        this.requirePendingStatus(entry, "rejection");

        const updated = memory.update(id, { metadata: { status: "rejected", reviewNote: note || null, reviewedAt: new Date().toISOString() } });

        return this.toRecord(updated);

    }


    // The actual state change each action kind represents -- deliberately
    // administrative (roadmap status changes), not a second execution
    // pipeline: it hands eligible work back to the NORMAL orchestrator/
    // automation flow (already authorized per its own rules -- see
    // core/executive/orchestrator.js's authorizeExecution()) rather than
    // dispatching department work directly from here.
    performAction(proposal){

        switch(proposal.action){

            case "unblock_task": {

                this.projectManager.updateStatus(proposal.subject, "planned", `Unblocked via approved action proposal ${proposal.id}`);

                return `Task "${proposal.subject}" reset to "planned"`;

            }

            case "resolve_deadlock": {

                const deadlocked = this.blockerDetector.findDeadlockedProjects().find(d => d.project.id === proposal.subject);

                if(!deadlocked){
                    return "No longer deadlocked -- nothing to do";
                }

                const blockedHoldups = deadlocked.holdups.filter(h => h.holdup === "blocked");

                for(const holdup of blockedHoldups){
                    this.projectManager.updateStatus(holdup.task, "planned", `Unblocked via approved action proposal ${proposal.id}`);
                }

                return `Reset ${blockedHoldups.length} blocked task(s) to "planned"`;

            }

            case "revisit_stalled_goal": {

                this.projectManager.updateStatus(proposal.subject, "in_progress", `Re-activated via approved action proposal ${proposal.id}`);

                return `Project "${proposal.subject}" marked "in_progress"`;

            }

            case "high_urgency": {

                return "Acknowledged -- already correctly prioritized, no state change needed";

            }

            default:

                throw new Error(`Unknown proposal action: "${proposal.action}"`);

        }

    }


    // The one and only entry point that performs a real state change --
    // unconditionally requires "approved", regardless of
    // approvalRequired (see the class header comment). Leaves the
    // proposal at "approved" (not "executed") if the action itself
    // throws, so a transient failure is retriable rather than a
    // permanent dead end.
    execute(id){

        const entry = this.requireProposal(id);

        if(entry.metadata.status !== "approved"){
            throw new Error(`Proposal "${id}" must be "approved" before it can be executed (current status: "${entry.metadata.status}")`);
        }

        const outcome = this.performAction(this.toRecord(entry));

        const updated = memory.update(id, { metadata: { status: "executed", executionOutcome: outcome, executedAt: new Date().toISOString() } });

        return this.toRecord(updated);

    }


    toRecord(entry){

        return {
            id: entry.id,
            ...entry.metadata,
            created: entry.created
        };

    }


    list(status){

        const all = memory.filter({ tag: PROPOSAL_TAG }).map(entry => this.toRecord(entry));

        return status ? all.filter(proposal => proposal.status === status) : all;

    }

}


module.exports = ActionProposalEngine;
