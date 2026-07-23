// ==================================
// VERONICA DEPARTMENT SCORECARD + PROCESS ANALYSIS
// ==================================
//
// Phase 46 (Business Operations Division production-readiness). Both
// of these compose EXISTING real systems rather than duplicating them:
// department health comes from core/executive/organizationOverview.js's
// own departmentHealth() (already real per-department agent count/
// project counts/execution success rate), deadlocked-project detection
// comes from core/executive/blockerDetection.js (already real, Phase
// 11) -- this module only adds the two genuinely new pieces (KPIs,
// SOPs) on top.
//
// Every cross-subsystem require below is LAZY (inside the function that
// needs it, not at module load time) -- this module is reached from
// packages/business-operations/tools/bizops.workflow.review.js, a tool
// handler, and this codebase has now hit the exact same circular-
// require bug four times (Sales, Marketing, Research, and Research's
// own engine.js) whenever a module reachable from a tool handler
// top-level-requires anything in the core/learning/core/intelligence/
// core/brain chain -- staying lazy here avoids a fifth.

const sops = require("./sops");
const kpis = require("./kpis");


// Real per-department health (agent count, active/total projects,
// execution success rate) + real KPIs + real SOP count + real
// deadlocked projects for this department -- nothing here is
// recomputed; it's read from the systems that already compute it.
function departmentScorecard(departmentId, { organizationOverview, blockerDetector } = {}){

    const OrganizationOverview = require("../executive/organizationOverview");
    const BlockerDetector = require("../executive/blockerDetection");
    const loadAgents = require("../agents/loader");
    const loadDepartments = require("../departments/loader");

    const agents = loadAgents();

    const overview = organizationOverview || new OrganizationOverview({
        departments: loadDepartments(agents),
        agents
    });

    const health = overview.departmentHealth().find(department => department.id === departmentId) || null;

    const departmentKPIs = kpis.listKPIs(departmentId).map(kpi => kpis.kpiStatus(kpi.id));
    const departmentSOPs = sops.listSOPs(departmentId);

    const detector = blockerDetector || new BlockerDetector();
    const deadlockedProjects = detector.detect().deadlockedProjects
        .filter(entry => entry.project.department === departmentId);

    return {
        departmentId,
        health,
        kpis: departmentKPIs,
        sopCount: departmentSOPs.length,
        deadlockedProjects
    };

}


// Real Process Analysis for one documented SOP: its real content, its
// department's real execution health (if it has one -- reused from
// core/learning, department-agnostic, zero new tracking code), and any
// real KPIs already tracked for that same department.
function analyzeProcess(sopId){

    const sop = sops.getSOP(sopId);

    let executionHealth = null;

    if(sop.department){

        const learning = require("../learning");
        executionHealth = learning.departmentPerformance()
            .find(department => department.department === sop.department) || null;

    }

    const relatedKPIs = sop.department
        ? kpis.listKPIs(sop.department).map(kpi => kpis.kpiStatus(kpi.id))
        : [];

    return { sop, executionHealth, relatedKPIs };

}


module.exports = { departmentScorecard, analyzeProcess };
