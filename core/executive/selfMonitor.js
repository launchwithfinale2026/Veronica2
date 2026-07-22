// ==================================
// VERONICA SELF-MONITORING LOOP
// ==================================
//
// The "self-monitoring" and "improvement loop" half of Autonomous
// Operations -- ties together three things that already existed
// separately (ExecutivePlanner's deadline tracking, LearningEngine's
// performance stats, AutomationEngine's job history) into one periodic
// check: observe -> flag concrete issues -> if any were found, generate
// optimization recommendations for them (LearningEngine.recommend(),
// already built in Phase 7). Deliberately stops there -- it does NOT
// take any autonomous remediating action (reassigning a project,
// canceling a job, changing anything). Detecting a problem and
// generating a recommendation about it is safe to automate; acting on
// that recommendation is a human decision, per this milestone's own
// standing instruction to stop for anything destructive or requiring
// approval. See docs/Architecture.md "Autonomous Operations".

const memory = require("../memory");
const bus = require("../bus");

const SELF_MONITOR_TAG = "self-monitoring";

const FAILURE_RATE_THRESHOLD = 0.3;
const MIN_EXECUTIONS_FOR_SIGNAL = 5; // don't flag on a tiny sample
const REPEATED_FAILURE_THRESHOLD = 3;


class SelfMonitor {

    static TAG = SELF_MONITOR_TAG;

    // executive/learning default to the ordinary facade requires (safe,
    // no circular risk -- see docs/Architecture.md). automationEngine has
    // NO such default: this class is constructed from inside
    // core/automation/jobs.js's registerBuiltInJobs(engine), which
    // already holds the live AutomationEngine *instance* as a parameter --
    // require("../automation") from there would re-enter core/automation/
    // index.js while it's still mid-load (the same circular-require class
    // documented in "Goal Decomposition Engine"), so the instance must
    // always be passed in explicitly instead.
    constructor({ executive, learning, automationEngine } = {}){

        this.executive = executive || require("../executive");
        this.learning = learning || require("../learning");
        this.automationEngine = automationEngine || null;

    }


    checkDeadlines(){

        const grouped = this.executive.evaluateDeadlines();

        if(!grouped.overdue.length){
            return [];
        }

        return [{
            kind: "overdue_projects",
            severity: "warning",
            detail: `${grouped.overdue.length} project(s) overdue`,
            projects: grouped.overdue.map(p => ({ id: p.id, title: p.title, department: p.department }))
        }];

    }


    checkPerformance(){

        const overview = this.learning.overview();

        if(overview.total < MIN_EXECUTIONS_FOR_SIGNAL){
            return [];
        }

        const failureRate = overview.failures / overview.total;

        if(failureRate <= FAILURE_RATE_THRESHOLD){
            return [];
        }

        return [{
            kind: "high_failure_rate",
            severity: "warning",
            detail: `${overview.failures}/${overview.total} logged executions failed (${Math.round(failureRate * 100)}%)`
        }];

    }


    checkAutomation(){

        if(!this.automationEngine){
            return [];
        }

        const failed = this.automationEngine.history(20).filter(entry => entry.status === "failed");

        if(failed.length < REPEATED_FAILURE_THRESHOLD){
            return [];
        }

        return [{
            kind: "repeated_job_failures",
            severity: "warning",
            detail: `${failed.length} automation job run(s) failed permanently in recent history`,
            jobs: [...new Set(failed.map(entry => entry.jobName))]
        }];

    }


    // Runs every check, and -- only if something was actually found --
    // asks LearningEngine for recommendations, the same way a human
    // reviewing these issues would go look for guidance. Skips that real
    // API call entirely when there's nothing to report, same
    // cost-conscious posture as MemoryConsolidation/LearningEngine's own
    // skip-when-no-activity behavior.
    async runSelfCheck(){

        const issues = [
            ...this.checkDeadlines(),
            ...this.checkPerformance(),
            ...this.checkAutomation()
        ];

        if(!issues.length){
            return { issuesFound: 0, issues: [], recommendations: null };
        }

        const recommendations = await this.learning.recommend();

        const entry = memory.remember({
            content: `Self-monitoring found ${issues.length} issue(s): ${issues.map(i => i.kind).join(", ")}`,
            type: "decisions",
            importance: 4,
            tags: [SELF_MONITOR_TAG],
            source: "self-monitor",
            metadata: { issues, recommendationId: recommendations.id }
        });

        bus.publish("selfMonitor.issuesFound", { id: entry.id, issues, recommendationId: recommendations.id });

        return { issuesFound: issues.length, issues, recommendations, memoryEntryId: entry.id };

    }


    history(limit = 10){

        return memory.filter({ tag: SELF_MONITOR_TAG }, { limit });

    }

}


module.exports = SelfMonitor;
