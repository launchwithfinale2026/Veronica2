// ==================================
// VERONICA DAILY BRIEFING ENGINE
// ==================================
//
// Phase 11 (Executive Intelligence Layer): the "read this each morning"
// artifact that turns VERONICA from a command-driven system (you ask,
// it answers) into one that proactively tells an operator what today
// looks like. Composes the other five Phase 11 pieces -- priority
// ranking, goal monitoring, blocker detection, and executive
// recommendations -- into one snapshot, plus a plain roadmap status
// count for context. No LLM call: every one of those is already
// rule-based and explainable, so the briefing just assembles their
// output rather than re-summarizing it through a model.
//
// Persisted the same way every other executive artifact is: an ordinary
// memory entry, tagged "executive-briefing", accumulating a real daily
// history to look back over -- not a live-only view.

const memory = require("../memory");
const eventIngestion = require("../integrations/eventIngestion");
const ExecutivePlanner = require("./planner");
const ProjectManager = require("./projectManager");
const PriorityRanking = require("./priorityRanking");
const GoalMonitor = require("./goalMonitor");
const BlockerDetector = require("./blockerDetection");
const ExecutiveRecommendationEngine = require("./executiveRecommendations");

const BRIEFING_TAG = "executive-briefing";

// How many top-ranked items the briefing surfaces -- an operator's
// morning read should be short, not the entire roadmap.
const TOP_PRIORITIES_LIMIT = 5;

// Phase 19: everything ingested from an external connector since
// yesterday's briefing -- a new email, GitHub PR, Discord command,
// calendar meeting, Drive document. Same 24h window as this briefing's
// own daily cadence (see DAILY_BRIEFING_INTERVAL_MS in
// core/automation/jobs.js).
const EXTERNAL_EVENTS_WINDOW_MS = 24 * 60 * 60 * 1000;
const EXTERNAL_EVENTS_LIMIT = 20;


class DailyBriefingEngine {

    static TAG = BRIEFING_TAG;

    constructor({ planner, projectManager, priorityRanking, goalMonitor, blockerDetector, recommendationEngine } = {}){

        this.planner = planner || new ExecutivePlanner();
        this.projectManager = projectManager || new ProjectManager({ planner: this.planner });
        this.priorityRanking = priorityRanking || new PriorityRanking({ planner: this.planner, projectManager: this.projectManager });
        this.goalMonitor = goalMonitor || new GoalMonitor({ planner: this.planner, projectManager: this.projectManager });
        this.blockerDetector = blockerDetector || new BlockerDetector({ planner: this.planner, projectManager: this.projectManager });
        this.recommendationEngine = recommendationEngine || new ExecutiveRecommendationEngine({
            planner: this.planner,
            projectManager: this.projectManager,
            priorityRanking: this.priorityRanking,
            goalMonitor: this.goalMonitor,
            blockerDetector: this.blockerDetector
        });

    }


    roadmapSummary(){

        const roadmap = this.planner.roadmap();

        const byStatus = { planned: 0, in_progress: 0, blocked: 0, completed: 0 };

        for(const project of roadmap){
            byStatus[project.status] = (byStatus[project.status] || 0) + 1;
        }

        return { totalProjects: roadmap.length, byStatus, deadlines: this.planner.evaluateDeadlines() };

    }


    // "Executive awareness" of external connector activity (Phase 19) --
    // reuses core/integrations/eventIngestion.js's recentEvents() rather
    // than re-reading memory directly, same "one shared read path" this
    // pipeline exists for.
    externalEvents(){

        return eventIngestion.recentEvents({
            since: new Date(Date.now() - EXTERNAL_EVENTS_WINDOW_MS).toISOString(),
            limit: EXTERNAL_EVENTS_LIMIT
        }).map(entry => ({
            id: entry.id,
            source: entry.metadata.source,
            kind: entry.metadata.kind,
            summary: entry.content,
            occurredAt: entry.metadata.occurredAt
        }));

    }


    // Assembles the briefing's contents WITHOUT persisting -- exposed
    // separately so a caller (or a test) can inspect what would be
    // generated without adding to the daily history.
    generate(){

        const ranked = this.priorityRanking.rank();

        return {
            date: new Date().toISOString(),
            roadmap: this.roadmapSummary(),
            topPriorities: ranked.slice(0, TOP_PRIORITIES_LIMIT).map(entry => ({
                project: entry.project.id,
                title: entry.project.title,
                score: entry.score,
                reasons: entry.reasons
            })),
            goalIssues: this.goalMonitor.check(),
            blockers: this.blockerDetector.detect(),
            // Reuses the same generate() the recommendation engine's own
            // run() calls, so the briefing's recommendations and a
            // standalone executive.recommendations() call are always
            // computed identically -- persisted separately below via
            // recommendationEngine.run(), not duplicated here.
            recommendations: this.recommendationEngine.generate(),
            externalEvents: this.externalEvents()
        };

    }


    persist(briefing){

        const headline = briefing.recommendations.length
            ? `${briefing.recommendations.length} item(s) need attention`
            : "Nothing needs attention";

        const entry = memory.remember({
            content: `Daily briefing (${new Date(briefing.date).toDateString()}): ${headline}`,
            type: "decisions",
            importance: briefing.recommendations.length ? 4 : 2,
            tags: [BRIEFING_TAG],
            source: "daily-briefing",
            metadata: briefing
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


    // Generates and persists a briefing -- also runs and persists a
    // fresh set of executive recommendations at the same time, so
    // executive.recommendationHistory() reflects every daily briefing
    // too, not just standalone executive.recommendations() calls. Also
    // runs the Phase 12 memory lifecycle sweep here -- this IS "the
    // daily cycle" Phase 12 asked memory evolution to connect to; a
    // fresh set of promotions lands in the same briefing an operator
    // already reads every morning, rather than needing a second thing
    // to check.
    run(){

        const briefing = this.generate();

        this.recommendationEngine.persist(briefing.recommendations);

        const memoryEvolution = memory.runLifecyclePromotion();

        return this.persist({ ...briefing, memoryEvolution });

    }


    history(limit = 10){

        return memory.filter({ tag: BRIEFING_TAG }, { limit })
            .map(entry => this.toRecord(entry));

    }

}


module.exports = DailyBriefingEngine;
