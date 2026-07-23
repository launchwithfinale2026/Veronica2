// ==================================
// VERONICA MARKETING ANALYTICS ENGINE
// ==================================
//
// Phase 41 (Marketing Division production-readiness). Two genuinely
// different kinds of "analytics" exist for a department, per the Phase
// 41 architecture audit:
//
// 1. EXECUTION telemetry (did the department/agent/tool run succeed) --
//    core/learning already tracks this generically, department-agnostic,
//    for every department including "marketing-dept" -- zero new code
//    needed, just read it (executionHealth() below).
// 2. CAMPAIGN-DOMAIN metrics (impressions/clicks/conversions/engagement)
//    -- no existing system tracks this; it's genuinely new business data,
//    manually/API-recorded onto a campaign via
//    core/marketing/campaigns.js's recordMetrics() (there is no real ad
//    platform connector in this codebase to pull it from automatically --
//    see docs/EXTERNAL_DEPENDENCIES.md). This module just aggregates what
//    campaigns.js already stores, the same summarize-style rollup
//    core/learning/engine.js already uses, not a new store.

const campaigns = require("./campaigns");
const learning = require("../learning");

const MARKETING_DEPARTMENT_ID = "marketing-dept";


// Sums every numeric metric across every one of a company's campaigns --
// deliberately tolerant of campaigns that recorded different metric
// names (e.g. one tracked "impressions", another "opens") rather than
// requiring a fixed schema.
function totalMetrics(campaignList){

    const totals = {};

    for(const campaign of campaignList){
        for(const [key, value] of Object.entries(campaign.performanceMetrics || {})){
            if(typeof value === "number"){
                totals[key] = (totals[key] || 0) + value;
            }
        }
    }

    return totals;

}


// Real execution telemetry for the marketing department, if it's ever
// actually run a task -- department_run events are logged the same way
// for every department (see core/learning/log.js), so this needs no
// marketing-specific tracking of its own.
function executionHealth(){

    return learning.departmentPerformance()
        .find(dept => dept.department === MARKETING_DEPARTMENT_ID) || null;

}


function campaignPerformance(companyId){

    const campaignList = campaigns.listCampaigns(companyId);

    return {

        campaigns: campaignList.map(campaign => ({
            id: campaign.id,
            name: campaign.name,
            approvalStatus: campaign.approvalStatus,
            publishingStatus: campaign.publishingStatus,
            performanceMetrics: campaign.performanceMetrics,
            lessonsLearned: campaign.lessonsLearned
        })),

        totals: totalMetrics(campaignList),

        executionHealth: executionHealth()

    };

}


module.exports = { campaignPerformance, executionHealth };
