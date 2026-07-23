// ==================================
// VERONICA DAILY REVIEW ENGINE
// ==================================
//
// Phase 14 (Daily Operating System) -- the evening half of the daily
// cycle. core/executive/dailyBriefing.js is the forward-looking morning
// half (what needs attention today); this looks BACKWARD at what
// actually happened today and forward one step to tomorrow. Distinct
// from core/executive/weeklyReport.js's 7-day rollup: same rule-based,
// no-LLM-call approach, but a single day's granularity, and it captures
// something the weekly report doesn't -- failures (from
// core/learning/log.js's raw execution telemetry) and a same-day
// preview of tomorrow's top priorities.
//
// Persisted as a memory entry tagged both "daily-review" (its own
// history) and "organizational" (per this phase's own framing: "Store
// reviews as organizational/personal memories") with type "personal" --
// a daily review is fundamentally the operator's own end-of-day
// reflection, even though it covers organizational activity too.

const memory = require("../memory");
const learningLog = require("../learning/log");
const eventIngestion = require("../integrations/eventIngestion");
const ExecutivePlanner = require("./planner");
const ProjectManager = require("./projectManager");
const GoalDecomposer = require("./decomposer");
const PriorityRanking = require("./priorityRanking");
const ExecutiveRecommendationEngine = require("./executiveRecommendations");

const REVIEW_TAG = "daily-review";
const TOMORROW_PRIORITIES_LIMIT = 5;


function isToday(timestamp){
    return new Date(timestamp).toDateString() === new Date().toDateString();
}


class DailyReviewEngine {

    static TAG = REVIEW_TAG;

    constructor({ planner, projectManager, priorityRanking, recommendationEngine } = {}){

        this.planner = planner || new ExecutivePlanner();
        this.projectManager = projectManager || new ProjectManager({ planner: this.planner });
        this.priorityRanking = priorityRanking || new PriorityRanking({ planner: this.planner, projectManager: this.projectManager });
        this.recommendationEngine = recommendationEngine || new ExecutiveRecommendationEngine({
            planner: this.planner,
            projectManager: this.projectManager,
            priorityRanking: this.priorityRanking
        });

    }


    // Every project/milestone/task whose status transitioned to
    // "completed" today -- scans history the same way
    // weeklyReport.js's blockersEncounteredThisWindow() does, just at a
    // one-day granularity and for a different transition.
    completedToday(){

        const items = [
            ...this.planner.roadmap().map(p => this.projectManager.requireEntry(p.id)),
            ...memory.filter({ tag: GoalDecomposer.TAG })
        ];

        const completed = [];

        for(const item of items){

            for(const transition of (item.metadata.history || [])){

                if(transition.to === "completed" && isToday(transition.timestamp)){
                    completed.push({ id: item.id, title: item.content, note: transition.note });
                }

            }

        }

        return completed;

    }


    // Real execution failures (department runs, tool calls) from
    // today's raw telemetry -- core/learning/log.js, not memory (see its
    // own header comment for why that's a separate, high-frequency log).
    failedToday(){

        return learningLog.readAll()
            .filter(entry => entry.outcome === "failure" && isToday(entry.timestamp))
            .map(entry => ({
                kind: entry.kind,
                subject: entry.department || entry.tool || entry.job || null,
                error: entry.error || null
            }));

    }


    // "Learned" = concrete, actionable recommendations VERONICA itself
    // generated today (Phase 11) -- a real record of what it noticed,
    // not a vague or fabricated "insight."
    learnedToday(){

        return memory.filter({ tag: ExecutiveRecommendationEngine.TAG })
            .filter(entry => isToday(entry.created))
            .flatMap(entry => (entry.metadata.recommendations || []).map(rec => rec.detail));

    }


    newMemoriesToday(){

        return memory.view().filter(entry => isToday(entry.created)).length;

    }


    // Phase 37 ("knowledge evolution"): real entities/relationships added
    // to the knowledge graph today, the same isToday()-filtered-by-
    // created-timestamp approach newMemoriesToday() already uses --
    // reported as a real delta (today's additions), not a fabricated
    // "growth trend" this codebase has no time-series to back up (see
    // core/executive/organizationOverview.js's knowledgeGrowth(), which
    // reports current TOTALS for the same honest reason).
    knowledgeEvolutionToday(){

        const knowledge = require("../knowledge");
        const graph = knowledge.read();

        return {
            newEntities: graph.entities.filter(entity => isToday(entity.created)).length,
            newRelationships: graph.relationships.filter(rel => isToday(rel.created)).length
        };

    }


    // Phase 19: everything ingested from an external connector today --
    // reuses core/integrations/eventIngestion.js's recentEvents() rather
    // than re-reading memory directly.
    externalEventsToday(){

        return eventIngestion.recentEvents({})
            .filter(entry => isToday(entry.metadata.occurredAt))
            .map(entry => ({
                id: entry.id,
                source: entry.metadata.source,
                kind: entry.metadata.kind,
                summary: entry.content,
                occurredAt: entry.metadata.occurredAt
            }));

    }


    // Project J (Daily Executive Operating System): real, TODAY-scoped
    // performance metrics -- distinct from failedToday() above (which
    // lists individual failures) and core/learning's own overview()
    // (which is all-time, not scoped to today). Reuses
    // core/learning/engine.js's own real summarize() arithmetic over a
    // pre-filtered, today-only event list, rather than re-implementing
    // the same success/failure/avgDuration calculation a second time.
    performanceMetrics(){

        const LearningEngine = require("../learning/engine");

        const todayEvents = learningLog.readAll().filter(entry => isToday(entry.timestamp));

        return LearningEngine.summarize(todayEvents);

    }


    // A same-day preview of what tomorrow's morning briefing will open
    // with -- reuses Phase 11's live priority ranking rather than a
    // second calculation.
    tomorrowPriorities(){

        return this.priorityRanking.rank()
            .slice(0, TOMORROW_PRIORITIES_LIMIT)
            .map(entry => ({ project: entry.project.id, title: entry.project.title, score: entry.score }));

    }


    generate(){

        return {
            date: new Date().toISOString(),
            completed: this.completedToday(),
            failed: this.failedToday(),
            learned: this.learnedToday(),
            newMemoriesCount: this.newMemoriesToday(),
            tomorrowPriorities: this.tomorrowPriorities(),
            externalEvents: this.externalEventsToday(),
            knowledgeEvolution: this.knowledgeEvolutionToday(),
            // Project J (Daily Executive Operating System) addition.
            performanceMetrics: this.performanceMetrics()
        };

    }


    persist(review){

        const entry = memory.remember({
            content: `Daily review (${new Date(review.date).toDateString()}): ${review.completed.length} completed, ${review.failed.length} failed, ${review.newMemoriesCount} new memories`,
            type: "personal",
            importance: 3,
            tags: [REVIEW_TAG, "organizational"],
            source: "daily-review",
            metadata: review
        });

        return this.toRecord(entry);

    }


    toRecord(entry){

        return {
            id: entry.id,
            summary: entry.content,
            ...entry.metadata,
            created: entry.created
        };

    }


    run(){

        return this.persist(this.generate());

    }


    history(limit = 10){

        return memory.filter({ tag: REVIEW_TAG }, { limit })
            .map(entry => this.toRecord(entry));

    }

}


module.exports = DailyReviewEngine;
