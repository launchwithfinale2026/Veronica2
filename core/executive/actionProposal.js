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

// Phase 19 (External Integration): a second, separate action vocabulary
// for proposals that reach outside VERONICA entirely (a real GitHub API
// write, a real Discord post) rather than an internal roadmap-status
// change. Kept apart from ACTION_RISK/APPROVAL_REQUIRED above because
// these aren't recommendation "kind"s (see executiveRecommendations.js)
// -- they're proposed directly by a connector or automation job that
// wants to take a real external action. Only actions a connector can
// ACTUALLY perform are listed here: github.js has a real createIssue(),
// discord.js (webhook) has a real sendMessage() -- push_code/merge_pr/
// delete_file/send_email are deliberately NOT here, since no connector in
// this codebase implements those writes yet (see docs/EXTERNAL_INTEGRATIONS.md).
// Every entry requires approval; there is no "no approval needed" external
// action.
const EXTERNAL_ACTION_RISK = {
    create_github_issue: "medium",
    post_discord_message: "low",
    // Phase 20 (Capability Expansion Architecture): installing a new
    // capability package can add agents/tools that gain real
    // permissions (see a package's own manifest.json) -- treated as
    // "high" risk, same bucket as a real roadmap-changing action, not
    // "low" like an informational post.
    install_capability: "high",
    // Phase 41 (Marketing Division): the Publishing Queue. Same "only
    // actions a connector can ACTUALLY perform" rule this file's own
    // header comment establishes -- see performExternalAction()'s case
    // below for exactly which platforms that covers today.
    publish_content: "medium",
    // Phase 50 (Department Collaboration): a real cross-department task
    // delegation (core/collaboration/engine.js's own delegate()) --
    // "medium" because it spends a real LLM call on another
    // department's behalf, same bucket as publish_content.
    request_department_collaboration: "medium"
};

const EXTERNAL_APPROVAL_REQUIRED = {
    create_github_issue: true,
    post_discord_message: true,
    install_capability: true,
    publish_content: true,
    request_department_collaboration: true
};


class ActionProposalEngine {

    static TAG = PROPOSAL_TAG;
    static STATUSES = STATUSES;

    constructor({ planner, projectManager, recommendationEngine, blockerDetector, departments } = {}){

        this.planner = planner || new ExecutivePlanner();
        // Phase 50 (Department Collaboration): an optional already-
        // loaded `departments` array, same override pattern
        // core/collaboration/engine.js's own constructor already uses --
        // only consumed by the "request_department_collaboration" case
        // below (lazily loaded from the real registry when not given, so
        // every other caller's behavior is unchanged).
        this.departments = departments || null;
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


    // A pending proposal for a real EXTERNAL action -- the Phase 19
    // counterpart to fromRecommendation() above, for proposals that
    // don't originate from a Phase 11 recommendation (no `subject`
    // roadmap entity, just a connector call and its arguments). Same
    // persisted-to-memory, same PROPOSAL_TAG, same pending/approved/
    // rejected/executed status machine -- approve()/reject()/list()
    // below work on these identically, no changes needed. Execution is
    // via executeExternal() (below), not execute(), since these actions
    // need a real async connector call (see that method's own comment).
    proposeExternalAction({ action, reason, payload, risk } = {}){

        if(!EXTERNAL_ACTION_RISK.hasOwnProperty(action)){
            throw new Error(`Unknown external action: "${action}" -- supported: ${Object.keys(EXTERNAL_ACTION_RISK).join(", ")}`);
        }

        if(!reason){
            throw new Error("A reason is required");
        }

        const proposal = {
            action,
            reason,
            department: null,
            subject: null,
            payload: payload || {},
            risk: risk || EXTERNAL_ACTION_RISK[action],
            approvalRequired: EXTERNAL_APPROVAL_REQUIRED[action] !== false,
            status: "pending"
        };

        const entry = memory.remember({
            content: `External action proposal: ${reason}`,
            type: "decisions",
            importance: proposal.risk === "high" ? 5 : proposal.risk === "medium" ? 4 : 2,
            tags: [PROPOSAL_TAG, "external-action", `action:${action}`],
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


    // Async counterpart to performAction()/execute() above, for the
    // external action kinds registered in EXTERNAL_ACTION_RISK. Kept
    // entirely separate rather than making execute()/performAction()
    // themselves async: those are exercised synchronously by every
    // existing internal action kind (unblock_task/resolve_deadlock/
    // revisit_stalled_goal/high_urgency) and by tests that call
    // `assert.throws(() => engine.execute(...))` and read a plain
    // synchronous return value -- making execute() async would turn
    // those synchronous throws/returns into promise rejections/pending
    // promises and break them. Same unconditional "approved" gate, same
    // memory-backed proposal record either way.
    async performExternalAction(proposal){

        switch(proposal.action){

            case "create_github_issue": {

                // Required lazily, not at module top level, matching this
                // codebase's standing circular-require avoidance
                // convention (see core/automation/jobs.js's own comment) --
                // cheap insurance even though core/integrations/github.js
                // has no path back to core/executive today.
                const github = require("../integrations/github");
                const { owner, repo, title, body } = proposal.payload || {};

                const issue = await github.createIssue(owner, repo, { title, body });

                return `Created GitHub issue #${issue.number} in ${owner}/${repo}: ${issue.html_url}`;

            }

            case "post_discord_message": {

                const discord = require("../integrations/discord");
                const { content } = proposal.payload || {};

                await discord.sendMessage(content);

                return "Posted Discord message";

            }

            case "install_capability": {

                // Lazy require -- see core/capabilities/installer.js's
                // header comment for why this can't be a top-level
                // require (installer.js requires THIS file, for
                // proposeExternalAction(), creating a cycle otherwise).
                const installer = require("../capabilities/installer");
                const { packageDir } = proposal.payload || {};

                const capability = installer.completeInstall(packageDir);

                return `Installed and activated capability "${capability.name}" v${capability.version}`;

            }

            case "publish_content": {

                // Lazy require -- matches every other case's convention
                // in this switch (avoids a load-time cost/cycle for a
                // module this file only needs at execution time).
                const marketingCampaigns = require("../marketing/campaigns");
                const { campaignId, itemId, platform, content } = proposal.payload || {};

                // Only Discord has a real, working publishing connector
                // in this codebase today (core/integrations/discord.js).
                // Any other platform a campaign declares (twitter/email/
                // instagram/...) has none -- this honestly throws rather
                // than pretending to have posted anywhere, exactly this
                // file's own "only actions a connector can ACTUALLY
                // perform" rule (see this file's header comment).
                if(platform === "discord"){

                    const discord = require("../integrations/discord");
                    await discord.sendMessage(content);

                } else {

                    throw new Error(`No publishing connector is configured for platform "${platform}" -- this action cannot be completed until one exists.`);

                }

                marketingCampaigns.updateContentItem(campaignId, itemId, { status: "published" });
                marketingCampaigns.setPublishingStatus(campaignId, "published");

                return `Published content item "${itemId}" for campaign "${campaignId}" to ${platform}`;

            }

            // Phase 50 (Department Collaboration): actually runs the
            // delegated task via CollaborationEngine.delegate() -- the
            // exact same real-reasoning path a human-triggered
            // POST /api/collaboration/delegate call already uses (Phase
            // 21). Departments are loaded lazily here (matching
            // core/executive/dailyBriefing.js's own constructor
            // convention for this exact dependency) rather than at this
            // file's module top level -- avoids 9 more IntelligenceEngine/
            // Brain instances unless this specific action is actually
            // executed.
            case "request_department_collaboration": {

                const CollaborationEngine = require("../collaboration/engine");

                const { fromDepartmentId, toDepartmentId, task } = proposal.payload || {};

                if(!this.departments){
                    const loadAgents = require("../agents/loader");
                    const loadDepartments = require("../departments/loader");
                    this.departments = loadDepartments(loadAgents());
                }

                const collaboration = new CollaborationEngine(this.departments);

                const outcome = await collaboration.delegate(fromDepartmentId, toDepartmentId, task);

                return `"${fromDepartmentId}" delegated to "${toDepartmentId}": ${outcome.response}`;

            }

            default:

                throw new Error(`Unknown external proposal action: "${proposal.action}"`);

        }

    }


    // The external-action equivalent of execute() above -- same
    // unconditional "must be approved" gate, same persisted status
    // transition to "executed", just async (see performExternalAction()'s
    // comment for why this isn't just execute() itself).
    async executeExternal(id){

        const entry = this.requireProposal(id);

        if(entry.metadata.status !== "approved"){
            throw new Error(`Proposal "${id}" must be "approved" before it can be executed (current status: "${entry.metadata.status}")`);
        }

        const outcome = await this.performExternalAction(this.toRecord(entry));

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
