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

const planner = new ExecutivePlanner();
const decomposer = new GoalDecomposer({ planner });
const projectManager = new ProjectManager({ planner });
const companyManager = new CompanyManager({ planner });
const consolidation = new MemoryConsolidation();

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

    consolidate: () => consolidation.run(),

    consolidationHistory: (limit) => consolidation.history(limit),

    // Manual trigger/read access -- the real scheduled self-monitor job
    // (with automation-health checking attached) lives in
    // core/automation/jobs.js; see core/executive/selfMonitor.js.
    runSelfCheck: () => selfMonitor.runSelfCheck(),

    selfMonitorHistory: (limit) => selfMonitor.history(limit)

};
