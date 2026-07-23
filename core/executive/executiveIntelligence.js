// ==================================
// VERONICA EXECUTIVE INTELLIGENCE
// ==================================
//
// Phase 48. With all six Divisions production-ready (Phase 41-46) and
// the recommendation feedback loop closed (Phase 47), this is the
// cross-department synthesis layer -- Company Health Scoring, Risk
// Forecasting, Cross-Department Recommendations, Quarterly/Annual
// Planning, and Executive Brief generation. Every piece here composes
// EXISTING real division analytics (Sales/Finance/Marketing/Research/
// Trading/Operations) rather than tracking anything new -- this
// module's only job is combining what's already real across
// departments, per its own charter.
//
// "All recommendations must be explainable" (the phase's own
// requirement): every score/risk/recommendation below traces back to a
// specific number from a specific division's real data, always with
// that number attached -- never a bare verdict.

const memory = require("../memory");

const BRIEF_TAG = "executive-brief";

// A synthetic "agent" identity for Intelligence.think() -- the
// executive brief isn't owned by any one department, same reasoning as
// core/executive/decomposer.js's DECOMPOSITION_AGENT and
// core/research/missions.js's SUMMARY_AGENT.
const BRIEF_AGENT = {
    name: "EXECUTIVE",
    role: "Executive Brief Writer",
    capabilities: ["cross-department synthesis", "executive communication"]
};


// Deterministic bucketing of a real runway status/months into a 0-100
// score -- explainable arithmetic, not a black-box classifier.
function financeScore(companyId){

    const financeReports = require("../finance/reports");
    const kpis = financeReports.kpis(companyId);

    if(kpis.runway.status === "no_data"){
        return null;
    }

    if(kpis.runway.status === "profitable"){
        return { score: 100, reason: "Profitable (non-negative recent net)" };
    }

    const months = kpis.runway.runwayMonths;

    if(months >= 12) return { score: 80, reason: `${Math.round(months)} months of runway remaining` };
    if(months >= 6) return { score: 60, reason: `${Math.round(months)} months of runway remaining` };
    if(months >= 3) return { score: 40, reason: `${Math.round(months)} months of runway remaining` };
    return { score: 20, reason: `${Math.round(months)} months of runway remaining -- critical` };

}


function salesScore(companyId){

    const salesAnalytics = require("../sales/analytics");
    const overview = salesAnalytics.salesOverview(companyId);

    if(overview.winLoss.totalClosed === 0){
        return null;
    }

    const winRatePercent = Math.round(overview.winLoss.winRate * 100);

    return { score: winRatePercent, reason: `${winRatePercent}% win rate across ${overview.winLoss.totalClosed} closed deal(s)` };

}


function marketingScore(companyId){

    const marketingCampaigns = require("../marketing/campaigns");
    const campaigns = marketingCampaigns.listCampaigns(companyId);

    if(!campaigns.length){
        return null;
    }

    const activeOrPublished = campaigns.filter(
        campaign => campaign.approvalStatus === "approved" || campaign.publishingStatus === "published"
    ).length;

    const score = Math.round((activeOrPublished / campaigns.length) * 100);

    return { score, reason: `${activeOrPublished}/${campaigns.length} campaign(s) approved or published` };

}


// Company Health Scoring: a composite 0-100 score averaging only the
// categories that have real data -- a company with no sales history
// yet doesn't get penalized for it, it's just excluded, with that
// exclusion reported honestly.
function companyHealthScore(companyId){

    const categories = {
        finance: financeScore(companyId),
        sales: salesScore(companyId),
        marketing: marketingScore(companyId)
    };

    const scored = Object.entries(categories).filter(([, value]) => value !== null);

    const overallScore = scored.length
        ? Math.round(scored.reduce((sum, [, value]) => sum + value.score, 0) / scored.length)
        : null;

    return {
        companyId,
        overallScore,
        categories,
        scoredCategories: scored.map(([name]) => name),
        unscoredCategories: Object.entries(categories).filter(([, value]) => value === null).map(([name]) => name)
    };

}


// Risk Forecasting: composes BlockerDetector's real deadlocked projects
// (scoped to this company via Phase 48's new `project.company` field),
// Finance's real burning-cash status, and Operations' real off-track
// KPIs -- each risk cites the exact real data it came from.
function riskForecast(companyId){

    const BlockerDetector = require("./blockerDetection");
    const financeReports = require("../finance/reports");
    const operationsKpis = require("../operations/kpis");

    const risks = [];

    const deadlocks = new BlockerDetector().detect().deadlockedProjects
        .filter(entry => entry.project.company === companyId);

    for(const entry of deadlocks){
        risks.push({
            kind: "deadlocked_project",
            severity: "high",
            detail: `"${entry.project.title}" is deadlocked: ${entry.reason}`
        });
    }

    const runway = financeReports.kpis(companyId).runway;

    if(runway.status === "burning" && runway.runwayMonths !== null && runway.runwayMonths < 6){
        risks.push({
            kind: "low_runway",
            severity: runway.runwayMonths < 3 ? "high" : "medium",
            detail: `Only ${Math.round(runway.runwayMonths)} months of cash runway remaining at the current burn rate`
        });
    }

    const offTrackKPIs = operationsKpis.listKPIs()
        .map(kpi => operationsKpis.kpiStatus(kpi.id))
        .filter(kpi => kpi.onTrack === false);

    for(const kpi of offTrackKPIs){
        risks.push({
            kind: "kpi_off_track",
            severity: "medium",
            detail: `KPI "${kpi.name}" is off track: actual ${kpi.actual} vs. target ${kpi.target}`
        });
    }

    return { companyId, risks };

}


// Cross-Department Recommendations: a small, deliberately conservative
// set of REAL rule-based cross-references between divisions' actual
// data -- e.g. a strong sales pipeline with no supporting active
// campaign is a genuine, explainable observation two divisions'
// separate data makes visible together, not a fabricated insight.
function crossDepartmentRecommendations(companyId){

    const salesOpportunities = require("../sales/opportunities");
    const marketingCampaigns = require("../marketing/campaigns");

    const recommendations = [];

    const forecast = salesOpportunities.forecast(companyId);
    const activeCampaigns = marketingCampaigns.listCampaigns(companyId)
        .filter(campaign => campaign.publishingStatus === "published");

    if(forecast.totalOpenValue > 0 && !activeCampaigns.length){
        recommendations.push({
            kind: "sales_pipeline_without_marketing_support",
            departments: ["sales-dept", "marketing-dept"],
            detail: `Sales has ${forecast.totalOpenValue} in open pipeline value but Marketing has no published campaigns supporting it`,
            action: "Consider a supporting campaign, or confirm the pipeline doesn't need one"
        });
    }

    return { companyId, recommendations };

}


// Quarterly/Annual Planning: real roadmap projects and real KPIs whose
// deadline/period falls in the requested real calendar range -- a
// filtered view over already-real data, not a new planning store.
function periodPlan(companyId, { start, end } = {}){

    if(!start || !end){
        throw new Error("A real start and end date are required");
    }

    const ExecutivePlanner = require("./planner");
    const operationsKpis = require("../operations/kpis");

    const planner = new ExecutivePlanner();
    const startTime = new Date(start).getTime();
    const endTime = new Date(end).getTime();

    const projects = planner.roadmap({ company: companyId }).filter(project => {
        if(!project.deadline) return false;
        const deadlineTime = new Date(project.deadline).getTime();
        return deadlineTime >= startTime && deadlineTime <= endTime;
    });

    const kpis = operationsKpis.listKPIs().filter(kpi => kpi.period && kpi.period >= start.slice(0, 7) && kpi.period <= end.slice(0, 7));

    return { companyId, start, end, projects, kpis };

}


function quarterlyPlan(companyId, { year, quarter } = {}){

    if(!Number.isInteger(year) || ![1, 2, 3, 4].includes(quarter)){
        throw new Error("A real year and quarter (1-4) are required");
    }

    const startMonth = (quarter - 1) * 3 + 1;
    const endMonth = startMonth + 2;

    return periodPlan(companyId, {
        start: `${year}-${String(startMonth).padStart(2, "0")}-01`,
        end: `${year}-${String(endMonth).padStart(2, "0")}-28`
    });

}


function annualPlan(companyId, { year } = {}){

    if(!Number.isInteger(year)){
        throw new Error("A real year is required");
    }

    return periodPlan(companyId, { start: `${year}-01-01`, end: `${year}-12-31` });

}


function briefPrompt({ companyId, health, risk, crossDepartment }){

    return `Write a real executive brief for company ${companyId}, synthesizing the following actual data. Cite specific numbers where relevant -- do not invent anything not listed here.

Company Health Score: ${health.overallScore === null ? "no data yet" : `${health.overallScore}/100`}
Scored categories: ${JSON.stringify(health.categories)}

Real risks identified:
${risk.risks.length ? risk.risks.map(r => `- [${r.severity}] ${r.detail}`).join("\n") : "None identified."}

Real cross-department observations:
${crossDepartment.recommendations.length ? crossDepartment.recommendations.map(r => `- ${r.detail} -- ${r.action}`).join("\n") : "None identified."}

Return ONLY the executive brief text -- no preamble, no markdown fences.`;

}


// intelligence: optional IntelligenceEngine instance (same pattern
// every other real content-generation call in this codebase uses).
async function generateExecutiveBrief(companyId, { intelligence } = {}){

    const health = companyHealthScore(companyId);
    const risk = riskForecast(companyId);
    const crossDepartment = crossDepartmentRecommendations(companyId);

    const IntelligenceEngine = require("../intelligence");
    const engine = intelligence || new IntelligenceEngine();

    const thought = await engine.think(
        BRIEF_AGENT,
        { task: briefPrompt({ companyId, health, risk, crossDepartment }), companyId },
        { useTools: false, companyId }
    );

    const brief = thought.cognition.response.response.trim();

    const entry = memory.remember({
        content: `Executive brief for ${companyId}`,
        type: "decisions",
        importance: 4,
        tags: [BRIEF_TAG, `company:${companyId}`],
        source: "executive-intelligence",
        metadata: { companyId, brief, health, risk, crossDepartment }
    });

    return { id: entry.id, brief, health, risk, crossDepartment, created: entry.created };

}


function briefHistory(companyId, limit = 10){

    return memory.filter({ tag: BRIEF_TAG })
        .filter(entry => !companyId || (entry.tags || []).includes(`company:${companyId}`))
        .slice(0, limit)
        .map(entry => ({
            id: entry.id,
            companyId: entry.metadata.companyId,
            brief: entry.metadata.brief,
            health: entry.metadata.health,
            risk: entry.metadata.risk,
            crossDepartment: entry.metadata.crossDepartment,
            created: entry.created
        }));

}


module.exports = {
    BRIEF_TAG,
    companyHealthScore,
    riskForecast,
    crossDepartmentRecommendations,
    quarterlyPlan,
    annualPlan,
    generateExecutiveBrief,
    briefHistory
};
