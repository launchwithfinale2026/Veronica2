// ==================================
// VERONICA WEEKLY OPERATING REPORT
// ==================================
//
// Phase 11 (Executive Intelligence Layer). Distinct from
// core/executive/consolidation.js (a nightly, LLM-narrated synthesis of
// recent activity) and dailyBriefing.js (a daily, forward-looking
// snapshot of what needs attention today): this looks BACKWARD over a
// full week and reports what actually happened, in structured, rule-
// based counts an operator can verify against the underlying data --
// no narration. Reuses consolidation.js's and selfMonitor.js's own
// history rather than re-gathering raw activity a second time.
//
// Persisted the same way every other executive artifact is: an ordinary
// memory entry, tagged "executive-weekly-report".

const memory = require("../memory");
const eventIngestion = require("../integrations/eventIngestion");
const ExecutivePlanner = require("./planner");
const GoalDecomposer = require("./decomposer");
const ProjectManager = require("./projectManager");
const MemoryConsolidation = require("./consolidation");
const SelfMonitor = require("./selfMonitor");
const DailyBriefingEngine = require("./dailyBriefing");
const ExecutiveRecommendationEngine = require("./executiveRecommendations");

const REPORT_TAG = "executive-weekly-report";
const WINDOW_DAYS = 7;


class WeeklyOperatingReport {

    static TAG = REPORT_TAG;

    constructor({ planner, projectManager, dailyBriefingEngine, recommendationEngine, consolidation, selfMonitor, learning } = {}){

        this.planner = planner || new ExecutivePlanner();
        this.projectManager = projectManager || new ProjectManager({ planner: this.planner });
        this.learning = learning || require("../learning");

        this.dailyBriefingEngine = dailyBriefingEngine || new DailyBriefingEngine({
            planner: this.planner,
            projectManager: this.projectManager
        });

        this.recommendationEngine = recommendationEngine || new ExecutiveRecommendationEngine({
            planner: this.planner,
            projectManager: this.projectManager
        });

        this.consolidation = consolidation || new MemoryConsolidation();

        // Same minimal-stand-in pattern core/executive/index.js's facade
        // already uses for SelfMonitor -- avoids requiring the full
        // "../executive" facade, which would be circular from inside
        // core/executive itself.
        this.selfMonitor = selfMonitor || new SelfMonitor({
            executive: { evaluateDeadlines: () => this.planner.evaluateDeadlines() },
            learning: this.learning
        });

    }


    windowStart(){

        const start = new Date();
        start.setDate(start.getDate() - WINDOW_DAYS);

        return start;

    }


    completedThisWindow(sinceTime){

        const projects = this.planner.roadmap()
            .filter(p => p.status === "completed" && new Date(p.updated).getTime() >= sinceTime)
            .map(p => ({ id: p.id, title: p.title }));

        const tasks = memory.filter({ tag: GoalDecomposer.TAG })
            .filter(entry =>
                entry.tags.includes("task") &&
                entry.metadata.status === "completed" &&
                new Date(entry.updated).getTime() >= sinceTime
            );

        return { projects, taskCount: tasks.length };

    }


    newProjectsThisWindow(sinceTime){

        return this.planner.roadmap()
            .filter(p => new Date(p.created).getTime() >= sinceTime)
            .map(p => ({ id: p.id, title: p.title }));

    }


    // Every history entry (project/milestone/task) that transitioned
    // TO "blocked" within the window -- distinct from
    // blockerDetection.js's findBlockedTasks(), which only reports what's
    // blocked RIGHT NOW. A task blocked and then resolved within the
    // week still counts as "encountered" here, even though it wouldn't
    // show up in a live blocker check anymore.
    blockersEncounteredThisWindow(sinceTime){

        const items = [
            ...this.planner.roadmap().map(p => this.projectManager.requireEntry(p.id)),
            ...memory.filter({ tag: GoalDecomposer.TAG })
        ];

        let count = 0;

        for(const item of items){

            for(const transition of (item.metadata.history || [])){

                if(transition.to === "blocked" && new Date(transition.timestamp).getTime() >= sinceTime){
                    count += 1;
                }

            }

        }

        return count;

    }


    // Phase 19: every external connector event ingested within the
    // window, grouped by source -- reuses
    // core/integrations/eventIngestion.js's recentEvents() rather than
    // re-reading memory directly.
    externalEventsThisWindow(sinceTime){

        const events = eventIngestion.recentEvents({ since: new Date(sinceTime).toISOString() });

        const bySource = {};

        for(const event of events){
            const source = event.metadata.source;
            bySource[source] = (bySource[source] || 0) + 1;
        }

        return { total: events.length, bySource };

    }


    // Reuses already-persisted history rather than re-running anything
    // -- a weekly report describes what already happened, it doesn't
    // trigger new consolidation/self-monitor/briefing runs itself.
    withinWindow(records, sinceTime, dateField = "created"){

        return records.filter(record => new Date(record[dateField]).getTime() >= sinceTime);

    }


    generate(){

        const since = this.windowStart();
        const sinceTime = since.getTime();

        const completed = this.completedThisWindow(sinceTime);
        const newProjects = this.newProjectsThisWindow(sinceTime);
        const blockersEncountered = this.blockersEncounteredThisWindow(sinceTime);
        const externalEvents = this.externalEventsThisWindow(sinceTime);

        const briefingsThisWeek = this.withinWindow(this.dailyBriefingEngine.history(50), sinceTime);
        const recommendationsThisWeek = this.withinWindow(this.recommendationEngine.history(50), sinceTime);
        const consolidationsThisWeek = this.withinWindow(this.consolidation.history(50), sinceTime);
        const selfMonitorIssuesThisWeek = this.withinWindow(this.selfMonitor.history(50), sinceTime);

        const totalRecommendations = recommendationsThisWeek.reduce(
            (sum, record) => sum + record.recommendations.length, 0
        );

        return {

            weekStart: since.toISOString(),
            weekEnd: new Date().toISOString(),

            completed,
            newProjects,
            blockersEncountered,
            externalEvents,

            briefingsGenerated: briefingsThisWeek.length,

            recommendationRunsGenerated: recommendationsThisWeek.length,
            totalRecommendationsIssued: totalRecommendations,

            consolidationRuns: consolidationsThisWeek.length,

            selfMonitorIssueRuns: selfMonitorIssuesThisWeek.length,

            currentRoadmap: {
                totalProjects: this.planner.roadmap().length,
                deadlines: this.planner.evaluateDeadlines()
            },

            learningOverview: this.learning.overview()

        };

    }


    persist(report){

        const entry = memory.remember({
            content: `Weekly operating report (${new Date(report.weekStart).toDateString()} - ${new Date(report.weekEnd).toDateString()}): ${report.completed.projects.length} project(s) and ${report.completed.taskCount} task(s) completed`,
            type: "decisions",
            importance: 4,
            tags: [REPORT_TAG],
            source: "weekly-report",
            metadata: report
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

        return memory.filter({ tag: REPORT_TAG }, { limit })
            .map(entry => this.toRecord(entry));

    }

}


module.exports = WeeklyOperatingReport;
