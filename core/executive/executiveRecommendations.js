// ==================================
// VERONICA EXECUTIVE RECOMMENDATIONS
// ==================================
//
// Phase 11 (Executive Intelligence Layer). Distinct from
// core/learning/engine.js's recommend() (LLM-narrated, about SYSTEM
// performance -- which department/agent/tool succeeds or fails) and
// core/executive/consolidation.js's recommendations field (LLM-narrated
// prose about recent activity). This is rule-based and about GOALS: it
// synthesizes priorityRanking.js/goalMonitor.js/blockerDetection.js's
// findings into a short list of concrete next actions, each one citing
// the exact data behind it -- no narration, no judgment call the
// operator can't independently verify. Matches this phase's explicit
// "all decisions must be explainable" requirement directly.
//
// Persisted the same way every other executive artifact is: an ordinary
// memory entry, tagged "executive-recommendation", no parallel store.

const memory = require("../memory");
const ExecutivePlanner = require("./planner");
const ProjectManager = require("./projectManager");
const PriorityRanking = require("./priorityRanking");
const GoalMonitor = require("./goalMonitor");
const BlockerDetector = require("./blockerDetection");

const RECOMMENDATION_TAG = "executive-recommendation";

// Projects at or above this urgency score are worth calling out even
// without a blocker/stall finding -- see priorityRanking.js's score().
const HIGH_URGENCY_THRESHOLD = 8;


class ExecutiveRecommendationEngine {

    static TAG = RECOMMENDATION_TAG;

    constructor({ planner, projectManager, priorityRanking, goalMonitor, blockerDetector } = {}){

        this.planner = planner || new ExecutivePlanner();
        this.projectManager = projectManager || new ProjectManager({ planner: this.planner });
        this.priorityRanking = priorityRanking || new PriorityRanking({ planner: this.planner, projectManager: this.projectManager });
        this.goalMonitor = goalMonitor || new GoalMonitor({ planner: this.planner, projectManager: this.projectManager });
        this.blockerDetector = blockerDetector || new BlockerDetector({ planner: this.planner, projectManager: this.projectManager });

    }


    fromDeadlocks(deadlockedProjects){

        return deadlockedProjects.map(entry => ({
            kind: "resolve_deadlock",
            subject: entry.project.id,
            detail: `"${entry.project.title}" is deadlocked: ${entry.reason}`,
            action: "Reassign or manually unblock the specific task(s) holding this project up",
            reason: entry.reason
        }));

    }


    fromBlockedTasks(blockedTasks){

        // Only the longest-stuck instance per task avoids duplicate
        // recommendations for the same task also caught by
        // findDeadlockedProjects() above -- a task blocked long enough
        // to warrant its own callout (not just as part of a deadlocked
        // project) gets one here.
        return blockedTasks
            .filter(task => task.blockedDays >= 1)
            .map(task => ({
                kind: "unblock_task",
                subject: task.id,
                detail: `Task "${task.title}" has been blocked for ${task.blockedDays} day(s): ${task.reason}`,
                action: "Resolve the blocker and reset the task to \"planned\", or reassign it",
                reason: task.reason
            }));

    }


    fromStalledProjects(stalledProjects){

        return stalledProjects.map(entry => ({
            kind: "revisit_stalled_goal",
            subject: entry.project.id,
            detail: `"${entry.project.title}" ${entry.reason}`,
            action: "Check in on this goal -- confirm it's still a priority, or update/close it",
            reason: entry.reason
        }));

    }


    fromPriorityRanking(ranked){

        return ranked
            .filter(entry => entry.score >= HIGH_URGENCY_THRESHOLD)
            .map(entry => ({
                kind: "high_urgency",
                subject: entry.project.id,
                detail: `"${entry.project.title}" now scores ${entry.score}/~14 in urgency`,
                action: "Prioritize this project's next task, or reassign resources to it",
                reason: entry.reasons.join("; ")
            }));

    }


    // Phase 47 (Organizational Learning): the recommendation feedback
    // loop core/learning/adaptiveInsights.js's own header comment
    // explicitly named as real future work -- "feeding this data back
    // into HOW future recommendations get generated." Annotates each
    // recommendation with real, already-persisted historical outcomes:
    // its kind's real acceptance rate (from every past proposal's own
    // status transition) and how many times this exact kind+subject has
    // been recommended before (a real recurrence, not a guessed
    // pattern). Deliberately does NOT silently drop or hide a
    // low-acceptance recommendation -- that would hide a real, current
    // issue from the operator, which is the opposite of "explainable."
    // Instead it annotates honestly and resurfaces genuinely recurring
    // issues more prominently (sorted to the front), leaving the
    // decision to act on a low-acceptance recommendation to the
    // operator, same as always.
    //
    // Lazy require -- adaptiveInsights.js itself lazily requires this
    // exact class back (for repeatedRecommendations()'s own TAG lookup),
    // so this stays a safe, symmetrical lazy pair rather than a
    // top-level cycle.
    applyAdaptiveInsights(recommendations){

        const adaptiveInsights = require("../learning/adaptiveInsights");

        const acceptanceByKind = new Map(
            adaptiveInsights.recommendationAcceptance().map(entry => [entry.action, entry])
        );

        const repeatedByKey = new Map(
            adaptiveInsights.repeatedRecommendations().map(entry => [`${entry.kind}::${entry.subject}`, entry])
        );

        return recommendations
            .map(rec => {

                const acceptance = acceptanceByKind.get(rec.kind);
                const repeated = repeatedByKey.get(`${rec.kind}::${rec.subject}`);

                return {
                    ...rec,
                    acceptanceRate: acceptance ? acceptance.acceptanceRate : null,
                    timesRecommendedBefore: repeated ? repeated.count : 0
                };

            })
            .sort((a, b) => b.timesRecommendedBefore - a.timesRecommendedBefore);

    }


    // Gathers fresh findings from all three engines and turns them into
    // recommendations -- no LLM call, no synthesis beyond the rules
    // above, so this is cheap enough to run as often as useful (every
    // daily briefing, see dailyBriefing.js).
    generate(){

        const ranked = this.priorityRanking.rank();
        const goalIssues = this.goalMonitor.check();
        const blockers = this.blockerDetector.detect();

        const recommendations = [
            ...this.fromDeadlocks(blockers.deadlockedProjects),
            ...this.fromBlockedTasks(blockers.blockedTasks),
            ...this.fromStalledProjects(goalIssues.stalledProjects),
            ...this.fromPriorityRanking(ranked)
        ];

        return this.applyAdaptiveInsights(recommendations);

    }


    persist(recommendations){

        const entry = memory.remember({
            content: recommendations.length
                ? `${recommendations.length} executive recommendation(s) generated`
                : "No executive recommendations -- nothing flagged",
            type: "decisions",
            importance: recommendations.length ? 4 : 2,
            tags: [RECOMMENDATION_TAG],
            source: "executive-recommendations",
            metadata: { recommendations }
        });

        return this.toRecord(entry);

    }


    toRecord(entry){

        return {
            id: entry.id,
            summary: entry.content,
            recommendations: entry.metadata.recommendations || [],
            created: entry.created
        };

    }


    // Generates fresh recommendations and persists them in one call --
    // the entry point dailyBriefing.js and the dashboard/terminal use.
    run(){

        return this.persist(this.generate());

    }


    history(limit = 10){

        return memory.filter({ tag: RECOMMENDATION_TAG }, { limit })
            .map(entry => this.toRecord(entry));

    }

}


module.exports = ExecutiveRecommendationEngine;
