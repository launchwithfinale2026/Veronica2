// ==================================
// VERONICA SALES ANALYTICS ENGINE
// ==================================
//
// Phase 42 (Sales Division production-readiness). Same two-kinds-of-
// analytics split core/marketing/analytics.js already established:
// execution telemetry (did sales-dept's agents/tools actually run
// successfully) is already tracked generically by core/learning, zero
// new code needed; win/loss and pipeline analytics are genuinely new
// business data, computed here from core/sales/opportunities.js's real,
// already-persisted state -- not a new store.
//
// `../learning` is required LAZILY (inside executionHealth() below),
// not at module load time -- a real, found-live circular require: this
// module is reached from packages/sales/tools/sales.pipeline.review.js,
// a TOOL HANDLER loaded by core/tools/loader.js. core/learning's own
// chain (-> core/intelligence -> core/brain ->
// core/brain/providers/claude.js) requires core/tools/index.js at ITS
// top level (to offer the tool registry to Claude's tool-use loop) --
// if core/tools/index.js is what triggered this whole require chain in
// the first place (its own loadTools() call, requiring this very tool
// handler), that nested require("../../tools") lands on an
// incompletely-initialized module and Node silently hands back a
// partial/empty object, corrupting whichever tool happened to be
// mid-load at that exact moment. Moving this one require inside the
// function that actually needs it breaks the cycle at the same point
// every other lazy-require in this codebase already does (see
// core/executive/actionProposal.js's installer.js require for the
// canonical example of this exact class of bug).
const opportunities = require("./opportunities");
const leads = require("./leads");

const SALES_DEPARTMENT_ID = "sales-dept";

const CLOSED_STAGES = ["closed_won", "closed_lost"];


// Deterministic, explainable: win rate, average won deal size, and a
// real breakdown of loss reasons (every closed_lost opportunity requires
// one -- see opportunities.js's setStage()) -- never an estimate.
function winLossAnalytics(companyId){

    const closed = opportunities.listOpportunities(companyId)
        .filter(opportunity => CLOSED_STAGES.includes(opportunity.stage));

    const won = closed.filter(opportunity => opportunity.stage === "closed_won");
    const lost = closed.filter(opportunity => opportunity.stage === "closed_lost");

    const lossReasons = {};

    for(const opportunity of lost){
        const reason = opportunity.lossReason || "unspecified";
        lossReasons[reason] = (lossReasons[reason] || 0) + 1;
    }

    return {
        totalClosed: closed.length,
        won: won.length,
        lost: lost.length,
        winRate: closed.length ? won.length / closed.length : null,
        avgWonValue: won.length ? won.reduce((sum, opportunity) => sum + opportunity.value, 0) / won.length : 0,
        lossReasons
    };

}


// Real execution telemetry for sales-dept, if it's ever actually run a
// task -- same department-agnostic core/learning aggregation every
// other department analytics module already reuses for free.
function executionHealth(){

    const learning = require("../learning");

    return learning.departmentPerformance()
        .find(department => department.department === SALES_DEPARTMENT_ID) || null;

}


function salesOverview(companyId){

    return {
        winLoss: winLossAnalytics(companyId),
        pipeline: opportunities.forecast(companyId),
        leadCount: leads.listLeads(companyId).length,
        executionHealth: executionHealth()
    };

}


module.exports = { winLossAnalytics, executionHealth, salesOverview };
