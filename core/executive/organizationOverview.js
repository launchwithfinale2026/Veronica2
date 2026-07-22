// ==================================
// VERONICA ORGANIZATION OVERVIEW
// ==================================
//
// Phase 32 (Organization Operating System). Multi-company/department/
// project/goal/employee/agent/capability/permission/knowledge/executive-
// reporting support already exists, spread across a dozen already-built
// systems (CompanyManager, department framework, ExecutivePlanner,
// LearningEngine, the knowledge graph, capability registry/marketplace,
// MissionEngine, AutomationEngine, DeviceManager, ActionProposalEngine,
// credentialManager). This file does not add a new capability -- it's
// the one aggregation point across all of them, answering the specific
// questions this phase's dashboard ask names (Organization Tree,
// Department Health, Executive KPIs, Cross-department Dependencies,
// Resource Allocation, Capability Map, Mission Status, Knowledge Growth,
// Automation Status, Device Network, Approval Queue, Live System
// Health), each section a thin read over a system that already existed
// before this phase.
//
// Requires real, already-loaded `departments`/`agents` (the same
// instances a host's boot sequence already constructs via
// core/agents/loader.js + core/departments/loader.js) -- there's no
// meaningful default to construct these from scratch here, the same
// reason core/collaboration/engine.js's constructor takes `departments`
// as a required argument rather than defaulting it.

const ExecutivePlanner = require("./planner");
const ProjectManager = require("./projectManager");
const CompanyManager = require("./companyManager");
const MissionEngine = require("./missionEngine");
const ActionProposalEngine = require("./actionProposal");
const DeviceManager = require("../device/deviceManager");


class OrganizationOverview {

    constructor({ departments, agents, planner, projectManager, companyManager, missionEngine, actionProposalEngine, deviceManager, learning, automation, knowledge, credentialManager, capabilitiesRegistry, capabilitiesMarketplace } = {}){

        if(!departments || !agents){
            throw new Error("Real, already-loaded departments and agents are required");
        }

        this.departments = departments;
        this.agents = agents;

        this.planner = planner || new ExecutivePlanner();
        this.projectManager = projectManager || new ProjectManager({ planner: this.planner });
        this.companyManager = companyManager || new CompanyManager({ planner: this.planner });
        this.missionEngine = missionEngine || new MissionEngine({ planner: this.planner, projectManager: this.projectManager });
        this.actionProposalEngine = actionProposalEngine || new ActionProposalEngine({ planner: this.planner, projectManager: this.projectManager });
        this.deviceManager = deviceManager || new DeviceManager();

        // Lazy-safe requires (facades with no path back to core/executive)
        // -- same defensive convention as every other cross-subsystem
        // default in this codebase.
        this.learning = learning || require("../learning");
        this.automation = automation || require("../automation");
        this.knowledge = knowledge || require("../knowledge");
        this.credentialManager = credentialManager || require("../integrations/credentialManager");
        this.capabilitiesRegistry = capabilitiesRegistry || require("../capabilities/registry");
        this.capabilitiesMarketplace = capabilitiesMarketplace || require("../capabilities/marketplace");

    }


    organizationTree(){

        return {
            companies: this.companyManager.listCompanies(),
            departments: this.departments.map(dept => ({
                id: dept.id,
                name: dept.name,
                domain: dept.domain,
                agents: dept.agents.map(agent => agent.name)
            }))
        };

    }


    // Reuses each department's own statusReport() plus LearningEngine's
    // real per-department stats (Phase 7) -- not a new health metric.
    departmentHealth(){

        const performance = this.learning.departmentPerformance();
        const roadmap = this.planner.roadmap();

        return this.departments.map(dept => {

            const stats = performance.find(entry => entry.department === dept.id);
            const deptProjects = roadmap.filter(project => project.department === dept.id);

            return {
                id: dept.id,
                name: dept.name,
                domain: dept.domain,
                agentCount: dept.agents.length,
                activeProjects: deptProjects.filter(p => p.status === "in_progress").length,
                totalProjects: deptProjects.length,
                executions: stats ? stats.total : 0,
                successRate: stats ? stats.successRate : null
            };

        });

    }


    // Reuses ExecutivePlanner.roadmap()/evaluateDeadlines() (Phase 2)
    // and ActionProposalEngine.list() (Phase 15) -- real counts, no new
    // scoring.
    executiveKPIs(){

        const roadmap = this.planner.roadmap();
        const completed = roadmap.filter(p => p.status === "completed").length;

        return {
            totalProjects: roadmap.length,
            completedProjects: completed,
            completionRate: roadmap.length ? Math.round((completed / roadmap.length) * 100) : 0,
            deadlines: this.planner.evaluateDeadlines(),
            pendingApprovals: this.actionProposalEngine.list("pending").length
        };

    }


    // Real cross-department edges: for every agent, every real knowledge-
    // graph relationship (Phase 4) touching it, kept only when the other
    // side is an agent in a DIFFERENT department -- the same
    // relationship data Phase 17's "Agent network" dashboard view
    // already reads, just filtered to cross-department ones specifically.
    crossDepartmentDependencies(){

        const dependencies = [];

        for(const dept of this.departments){

            for(const agent of dept.agents){

                for(const relationship of this.knowledge.connections(agent.name)){

                    const otherName = relationship.from === agent.name ? relationship.to : relationship.from;
                    const otherAgent = this.agents.find(a => a.name === otherName);

                    if(otherAgent && otherAgent.department && otherAgent.department !== dept.id){
                        dependencies.push({
                            fromDepartment: dept.id,
                            toDepartment: otherAgent.department,
                            viaAgent: agent.name,
                            toAgent: otherAgent.name,
                            relationshipType: relationship.type
                        });
                    }

                }

            }

        }

        return dependencies;

    }


    // Agent count + real active/total project counts per department --
    // "resource allocation" read straight from the same roadmap/agent
    // data organizationTree()/departmentHealth() already use.
    resourceAllocation(){

        const roadmap = this.planner.roadmap();

        return this.departments.map(dept => ({
            id: dept.id,
            agentCount: dept.agents.length,
            activeProjects: roadmap.filter(p => p.department === dept.id && p.status === "in_progress").length,
            totalProjects: roadmap.filter(p => p.department === dept.id).length
        }));

    }


    // Reuses Phase 26's marketplace categorization wholesale.
    capabilityMap(){
        return this.capabilitiesMarketplace.categorize();
    }


    // Reuses Phase 31's MissionEngine.history()/status() -- a mission
    // whose project was somehow removed since (shouldn't happen in
    // practice) falls back to the plain history record rather than
    // throwing and breaking the whole overview.
    missionStatus(){

        return this.missionEngine.history(50).map(mission => {
            try {
                return this.missionEngine.status(mission.id);
            } catch(error){
                return mission;
            }
        });

    }


    // Current real totals -- honestly a snapshot, not a trend: this
    // codebase has no time-series tracking of graph size over time, so
    // "growth" is reported as of right now rather than fabricating a
    // history that doesn't exist.
    knowledgeGrowth(){

        const graph = this.knowledge.read();

        return { entityCount: graph.entities.length, relationshipCount: graph.relationships.length };

    }


    automationStatus(){
        return this.automation.status();
    }


    deviceNetwork(){
        return this.deviceManager.networkStatus();
    }


    approvalQueue(){
        return this.actionProposalEngine.list("pending");
    }


    // Credential/capability status -- reuses Phase 19/20's own registries
    // wholesale, same "one source of truth" reasoning as every other
    // section here.
    liveSystemHealth(){

        return {
            credentials: this.credentialManager.overview(),
            capabilities: this.capabilitiesRegistry.list().map(entry => ({ name: entry.name, status: entry.status, core: entry.core }))
        };

    }


    generate(){

        return {
            generatedAt: new Date().toISOString(),
            organizationTree: this.organizationTree(),
            departmentHealth: this.departmentHealth(),
            executiveKPIs: this.executiveKPIs(),
            crossDepartmentDependencies: this.crossDepartmentDependencies(),
            resourceAllocation: this.resourceAllocation(),
            capabilityMap: this.capabilityMap(),
            missionStatus: this.missionStatus(),
            knowledgeGrowth: this.knowledgeGrowth(),
            automationStatus: this.automationStatus(),
            deviceNetwork: this.deviceNetwork(),
            approvalQueue: this.approvalQueue(),
            liveSystemHealth: this.liveSystemHealth()
        };

    }

}


module.exports = OrganizationOverview;
