// ==================================
// VERONICA DAILY CYCLE ENGINE
// ==================================
//
// Phase 14 (Daily Operating System). A thin orchestrator over the two
// halves of the day this milestone asks for -- the morning briefing
// (Phase 11's DailyBriefingEngine, unchanged) and the evening review
// (this phase's new DailyReviewEngine) -- not a rebuild of either.
//
// Known limitation, not a fake solution: core/automation/engine.js's
// scheduler is purely interval-based ("every N ms since last run"), with
// no concept of time-of-day. There is no real "run at 8am" / "run at
// 6pm" distinction to wire morning/evening into yet -- both
// daily-briefing and daily-review are registered on the same 24h
// interval (see core/automation/jobs.js), just from whenever each was
// first registered. Real clock-time scheduling would need to be added
// to AutomationEngine itself; documented here rather than pretended
// around.

const DailyBriefingEngine = require("./dailyBriefing");
const DailyReviewEngine = require("./dailyReview");


class DailyCycleEngine {

    constructor({ briefingEngine, reviewEngine } = {}){

        this.briefingEngine = briefingEngine || new DailyBriefingEngine();
        this.reviewEngine = reviewEngine || new DailyReviewEngine();

    }


    runMorning(){
        return this.briefingEngine.run();
    }


    runEvening(){
        return this.reviewEngine.run();
    }


    morningHistory(limit){
        return this.briefingEngine.history(limit);
    }


    eveningHistory(limit){
        return this.reviewEngine.history(limit);
    }

}


module.exports = DailyCycleEngine;
