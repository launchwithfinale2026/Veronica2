// Facade over the executive subsystem's classes -- callers (tools,
// dashboard, terminal) get one flat object with every executive
// capability, without needing to know it's backed by collaborating
// classes (ExecutivePlanner for scheduling, GoalDecomposer for breakdown,
// ProjectManager for lifecycle/status, CompanyManager for the company
// layer above projects, MemoryConsolidation for nightly synthesis).
// Existing callers of plan()/roadmap()/evaluateDeadlines()/decompose()/
// getProject()/updateStatus()/addArtifact()/create*/add*/record*/
// logCommunication() are unaffected; the MemoryConsolidation methods are a
// pure addition.

const ExecutivePlanner = require("./planner");
const GoalDecomposer = require("./decomposer");
const ProjectManager = require("./projectManager");
const CompanyManager = require("./companyManager");
const MemoryConsolidation = require("./consolidation");
const SelfMonitor = require("./selfMonitor");
const PriorityRanking = require("./priorityRanking");
const GoalMonitor = require("./goalMonitor");
const BlockerDetector = require("./blockerDetection");
const ExecutiveRecommendationEngine = require("./executiveRecommendations");
const DailyBriefingEngine = require("./dailyBriefing");
const WeeklyOperatingReport = require("./weeklyReport");
const DailyReviewEngine = require("./dailyReview");
const DailyCycleEngine = require("./dailyCycle");
const ActionProposalEngine = require("./actionProposal");
const MissionEngine = require("./missionEngine");

const planner = new ExecutivePlanner();
const decomposer = new GoalDecomposer({ planner });
const projectManager = new ProjectManager({ planner });
const companyManager = new CompanyManager({ planner });
const consolidation = new MemoryConsolidation();

// Phase 11 (Executive Intelligence Layer) -- all five read-only/rule-
// based, none need real departments, so they're safe to construct
// eagerly here exactly like planner/decomposer/projectManager above.
const priorityRanking = new PriorityRanking({ planner, projectManager });
const goalMonitor = new GoalMonitor({ planner, projectManager });
const blockerDetector = new BlockerDetector({ planner, projectManager });
const recommendationEngine = new ExecutiveRecommendationEngine({ planner, projectManager, priorityRanking, goalMonitor, blockerDetector });
const dailyBriefingEngine = new DailyBriefingEngine({ planner, projectManager, priorityRanking, goalMonitor, blockerDetector, recommendationEngine });
const weeklyReport = new WeeklyOperatingReport({ planner, projectManager, dailyBriefingEngine, recommendationEngine, consolidation });

// Phase 14 (Daily Operating System) -- the evening half of the daily
// cycle, plus a thin orchestrator over both halves.
const dailyReviewEngine = new DailyReviewEngine({ planner, projectManager, priorityRanking, recommendationEngine });
const dailyCycle = new DailyCycleEngine({ briefingEngine: dailyBriefingEngine, reviewEngine: dailyReviewEngine });

// Phase 15 (Controlled Autonomy) -- Observation -> Recommendation ->
// Proposal -> Approval -> Execution. No autonomous external action
// without approval; see actionProposal.js's own header comment.
const actionProposalEngine = new ActionProposalEngine({ planner, projectManager, recommendationEngine, blockerDetector });

// Phase 31 (Mission Engine) -- composes the SAME planner/projectManager/
// decomposer/recommendationEngine instances this facade already
// constructed above, rather than each mission building its own.
const missionEngine = new MissionEngine({ planner, projectManager, decomposer, recommendationEngine });

// SelfMonitor's constructor would otherwise default `executive` to
// require("../executive") -- this exact file, still mid-load right now.
// Passed a minimal object exposing just the one method it actually calls
// instead, sidestepping the self-reference. `learning` has no such issue
// (core/learning doesn't depend on core/executive), so it's required
// directly. No automationEngine here -- this facade instance is for
// read access/manual triggers only; the real scheduled job (core/
// automation/jobs.js) constructs its own SelfMonitor with the live engine
// instance attached, so its automation-health check actually works.
const selfMonitor = new SelfMonitor({
    executive: { evaluateDeadlines: () => planner.evaluateDeadlines() },
    learning: require("../learning")
});

module.exports = {

    plan: (goal) => planner.plan(goal),

    roadmap: (filter) => planner.roadmap(filter),

    evaluateDeadlines: () => planner.evaluateDeadlines(),

    decompose: (projectId) => decomposer.decompose(projectId),

    getProject: (projectId) => projectManager.getProject(projectId),

    updateStatus: (id, status, note) => projectManager.updateStatus(id, status, note),

    addArtifact: (projectId, artifact) => projectManager.addArtifact(projectId, artifact),

    reassignDepartment: (projectId, toDepartmentId, note) => projectManager.reassignDepartment(projectId, toDepartmentId, note),

    createCompany: (input) => companyManager.createCompany(input),

    listCompanies: () => companyManager.listCompanies(),

    getCompany: (companyId) => companyManager.getCompany(companyId),

    addEmployee: (companyId, employee) => companyManager.addEmployee(companyId, employee),

    addDocument: (companyId, document) => companyManager.addDocument(companyId, document),

    recordFinance: (companyId, entry) => companyManager.recordFinance(companyId, entry),

    addCompanyRelationship: (companyId, relationship) => companyManager.addRelationship(companyId, relationship),

    logCommunication: (companyId, communication) => companyManager.logCommunication(companyId, communication),

    // Enforced logical isolation boundary (v1 release audit's answer to
    // "each company must have separate memory/knowledge/permissions" --
    // see core/executive/companyContext.js). Every read/write made
    // through the returned context is scoped to just this company.
    companyContext: (companyId) => companyManager.context(companyId),

    consolidate: () => consolidation.run(),

    consolidationHistory: (limit) => consolidation.history(limit),

    // Manual trigger/read access -- the real scheduled self-monitor job
    // (with automation-health checking attached) lives in
    // core/automation/jobs.js; see core/executive/selfMonitor.js.
    runSelfCheck: () => selfMonitor.runSelfCheck(),

    selfMonitorHistory: (limit) => selfMonitor.history(limit),

    // Phase 11 -- Executive Intelligence Layer. All five are rule-based
    // and explainable (see each module's own header comment): live views
    // (priorityRank/goalIssues/blockers) recomputed fresh on every call,
    // and persisted artifacts (recommendations/dailyBriefing/weeklyReport)
    // that accumulate real history in memory.
    priorityRank: () => priorityRanking.rank(),

    goalIssues: () => goalMonitor.check(),

    blockers: () => blockerDetector.detect(),

    recommendations: () => recommendationEngine.run(),

    recommendationHistory: (limit) => recommendationEngine.history(limit),

    dailyBriefing: () => dailyBriefingEngine.run(),

    dailyBriefingHistory: (limit) => dailyBriefingEngine.history(limit),

    weeklyOperatingReport: () => weeklyReport.run(),

    weeklyOperatingReportHistory: (limit) => weeklyReport.history(limit),

    // Phase 14 -- Daily Operating System. dailyBriefing() above IS the
    // morning half; these add the evening half and a combined view.
    dailyReview: () => dailyReviewEngine.run(),

    dailyReviewHistory: (limit) => dailyReviewEngine.history(limit),

    runMorningCycle: () => dailyCycle.runMorning(),

    runEveningCycle: () => dailyCycle.runEvening(),

    // Phase 15 -- Controlled Autonomy.
    generateProposals: () => actionProposalEngine.generateProposals(),

    listProposals: (status) => actionProposalEngine.list(status),

    approveProposal: (id, note) => actionProposalEngine.approve(id, note),

    rejectProposal: (id, note) => actionProposalEngine.reject(id, note),

    executeProposal: (id) => actionProposalEngine.execute(id),

    // Phase 19/20 -- the async counterpart to executeProposal() above,
    // for external actions (create_github_issue, post_discord_message,
    // install_capability) that need a real connector/installer call.
    // See core/executive/actionProposal.js's executeExternal() for why
    // this is a separate method rather than making execute() itself
    // async.
    executeExternalProposal: (id) => actionProposalEngine.executeExternal(id),

    // Phase 31 -- Mission Engine.
    defineMission: (objective, options) => missionEngine.defineMission(objective, options),

    missionStatus: (id) => missionEngine.status(id),

    missionRecommendations: (id) => missionEngine.recommendNextActions(id),

    missionHistory: (limit) => missionEngine.history(limit)

};
