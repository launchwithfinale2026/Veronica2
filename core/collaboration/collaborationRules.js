// ==================================
// VERONICA DEPARTMENT COLLABORATION RULES
// ==================================
//
// Phase 50 (Department Collaboration). A generic, declarative RULE
// FRAMEWORK -- not hardcoded per-pair glue -- for detecting when one
// department's real state suggests requesting real work from another.
// Each rule is a plain { id, from, detect(companyId) } entry; the
// runner (detectCollaborationOpportunities()) is completely generic
// over however many rules exist, so adding "Finance advises the
// executive" or any future pair means adding one more rule object, not
// touching the runner. Every rule composes each Division's already-real
// analytics -- same principle core/executive/executiveIntelligence.js's
// crossDepartmentRecommendations() already established -- not a new
// signal, a new consumer of existing ones.
//
// Detected opportunities are NOT executed here. Each becomes a pending
// core/executive/actionProposal.js proposal (the
// "request_department_collaboration" external action, approval
// required) -- the same Observation -> Recommendation -> Proposal ->
// Approval -> Execution pipeline (Phase 15) every other autonomous
// suggestion in this codebase already goes through. A department never
// autonomously spends a real LLM call delegating to another department
// without a human approving it first.

// Each detect(companyId) returns an array (possibly empty) of
// { to, task } -- `to` is per-opportunity (not fixed per rule) because
// some rules (e.g. the KPI one below) route to whichever department
// actually owns the real signal, not one static target.
const RULES = [

    {
        id: "sales_requests_marketing",
        from: "sales-dept",
        detect(companyId){

            if(!companyId){
                return [];
            }

            const salesOpportunities = require("../sales/opportunities");
            const marketingCampaigns = require("../marketing/campaigns");

            const forecast = salesOpportunities.forecast(companyId);
            const activeCampaigns = marketingCampaigns.listCampaigns(companyId)
                .filter(campaign => campaign.publishingStatus === "published");

            if(forecast.totalOpenValue > 0 && !activeCampaigns.length){
                return [{
                    to: "marketing-dept",
                    task: `Create a marketing campaign to support ${forecast.totalOpenValue} in open sales pipeline value -- no published campaign currently supports it.`
                }];
            }

            return [];

        }
    },

    {
        id: "marketing_requests_research",
        from: "marketing-dept",
        detect(companyId){

            if(!companyId){
                return [];
            }

            const marketingCampaigns = require("../marketing/campaigns");
            const researchMissions = require("../research/missions");

            const campaignsWithAudience = marketingCampaigns.listCampaigns(companyId)
                .filter(campaign => campaign.audience);

            const missions = researchMissions.listMissions(companyId);

            if(campaignsWithAudience.length && !missions.length){

                const campaign = campaignsWithAudience[0];

                return [{
                    to: "research-dept",
                    task: `Research the target audience "${campaign.audience}" for campaign "${campaign.name}" -- no research mission exists for this company yet.`
                }];

            }

            return [];

        }
    },

    {
        id: "operations_requests_department",
        from: "bizops",
        // KPIs are system-wide, not company-scoped (Phase 46) -- this
        // rule ignores companyId, matching core/operations/kpis.js's own
        // design. Can return more than one opportunity (one per
        // off-track KPI whose department isn't bizops itself).
        detect(){

            const operationsKpis = require("../operations/kpis");

            return operationsKpis.listKPIs()
                .map(kpi => operationsKpis.kpiStatus(kpi.id))
                .filter(kpi => kpi.onTrack === false && kpi.department && kpi.department !== "bizops")
                .map(kpi => ({
                    to: kpi.department,
                    task: `Address off-track KPI "${kpi.name}": actual ${kpi.actual} vs. target ${kpi.target}.`
                }));

        }
    }

];


function detectCollaborationOpportunities(companyId){

    return RULES.flatMap(rule =>
        rule.detect(companyId).map(opportunity => ({
            ruleId: rule.id,
            from: rule.from,
            to: opportunity.to,
            task: opportunity.task
        }))
    );

}


// Turns every currently-detected opportunity into a real, pending
// ActionProposalEngine proposal -- mirrors
// core/executive/actionProposal.js's own generateProposals() (Phase
// 15), just for this new external action kind instead of internal
// recommendation kinds.
function generateCollaborationProposals(companyId, { actionProposalEngine } = {}){

    const ActionProposalEngine = require("../executive/actionProposal");
    const engine = actionProposalEngine || new ActionProposalEngine();

    return detectCollaborationOpportunities(companyId).map(opportunity =>
        engine.proposeExternalAction({
            action: "request_department_collaboration",
            reason: `[${opportunity.ruleId}] ${opportunity.task}`,
            payload: {
                fromDepartmentId: opportunity.from,
                toDepartmentId: opportunity.to,
                task: opportunity.task
            }
        })
    );

}


module.exports = { RULES, detectCollaborationOpportunities, generateCollaborationProposals };
