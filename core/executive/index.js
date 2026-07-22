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

const planner = new ExecutivePlanner();
const decomposer = new GoalDecomposer({ planner });
const projectManager = new ProjectManager({ planner });
const companyManager = new CompanyManager({ planner });
const consolidation = new MemoryConsolidation();

module.exports = {

    plan: (goal) => planner.plan(goal),

    roadmap: (filter) => planner.roadmap(filter),

    evaluateDeadlines: () => planner.evaluateDeadlines(),

    decompose: (projectId) => decomposer.decompose(projectId),

    getProject: (projectId) => projectManager.getProject(projectId),

    updateStatus: (id, status, note) => projectManager.updateStatus(id, status, note),

    addArtifact: (projectId, artifact) => projectManager.addArtifact(projectId, artifact),

    createCompany: (input) => companyManager.createCompany(input),

    listCompanies: () => companyManager.listCompanies(),

    getCompany: (companyId) => companyManager.getCompany(companyId),

    addEmployee: (companyId, employee) => companyManager.addEmployee(companyId, employee),

    addDocument: (companyId, document) => companyManager.addDocument(companyId, document),

    recordFinance: (companyId, entry) => companyManager.recordFinance(companyId, entry),

    addCompanyRelationship: (companyId, relationship) => companyManager.addRelationship(companyId, relationship),

    logCommunication: (companyId, communication) => companyManager.logCommunication(companyId, communication),

    consolidate: () => consolidation.run(),

    consolidationHistory: (limit) => consolidation.history(limit)

};
