// ==================================
// VERONICA BLOCKER DETECTION
// ==================================
//
// Phase 11 (Executive Intelligence Layer). Two distinct kinds of "stuck":
//
// 1. A task explicitly marked "blocked" -- ExecutiveOrchestrator.executeTask()
//    already does this when a department run fails or an authorization
//    check denies it (see docs/Architecture.md "Company access control
//    in the executive pipeline"). Nothing before this collected those
//    into one place with how long they've sat there.
// 2. A project that's quietly deadlocked: every remaining task is either
//    blocked or waiting on a dependency that's itself incomplete, so
//    nothing in it will ever become ready without intervention -- not
//    something any existing status field flags on its own.
//
// Read-only and rule-based: this module only needs planner/
// projectManager (no departments), consistent with priorityRanking.js/
// goalMonitor.js -- detection doesn't require the ability to act.

const memory = require("../memory");
const ExecutivePlanner = require("./planner");
const ProjectManager = require("./projectManager");
const GoalDecomposer = require("./decomposer");

const MS_PER_DAY = 24 * 60 * 60 * 1000;


function daysSince(timestamp){
    return (Date.now() - new Date(timestamp).getTime()) / MS_PER_DAY;
}


class BlockerDetector {

    constructor({ planner, projectManager } = {}){

        this.planner = planner || new ExecutivePlanner();
        this.projectManager = projectManager || new ProjectManager({ planner: this.planner });

    }


    // Every task currently in "blocked" status, with how long it's been
    // stuck and why -- the reason is whatever note the last status
    // transition recorded (executeTask() always leaves one: an
    // "Execution failed: ..." or "Access denied: ..." message).
    findBlockedTasks(){

        return memory.filter({ tag: GoalDecomposer.TAG })
            .filter(entry => entry.tags.includes("task") && entry.metadata.status === "blocked")
            .map(entry => {

                const lastTransition = (entry.metadata.history || []).at(-1);

                return {
                    id: entry.id,
                    title: entry.content,
                    parentMilestone: entry.metadata.parentMilestone,
                    blockedSince: entry.updated,
                    blockedDays: Math.round(daysSince(entry.updated) * 10) / 10,
                    reason: lastTransition && lastTransition.note ? lastTransition.note : "Marked blocked"
                };

            });

    }


    // A task is ready the same way ExecutiveOrchestrator.isReady()
    // defines it: still "planned", and every declared dependency within
    // this same project's task graph is "completed" (a dependency
    // outside the graph is treated as satisfied -- gating only applies
    // within the project's own tasks). Re-implemented here rather than
    // depending on ExecutiveOrchestrator, which requires real
    // departments this detector has no need for.
    isReady(task, byId){

        if(task.metadata.status !== "planned"){
            return false;
        }

        return (task.relationships || []).every(depId => {
            const dep = byId.get(depId);
            return !dep || dep.metadata.status === "completed";
        });

    }


    // Active projects where NOTHING is ready to run -- every remaining
    // task is either blocked outright, or "planned" but waiting on a
    // dependency that hasn't completed. Explains the specific holdup:
    // which task, and what it's waiting on or blocked by.
    findDeadlockedProjects(){

        const deadlocked = [];

        for(const project of this.planner.roadmap().filter(p => p.status !== "completed")){

            const tasks = this.projectManager.tasksForProject(project.id);
            const remaining = tasks.filter(t => t.metadata.status !== "completed");

            if(!remaining.length){
                continue;
            }

            const byId = new Map(tasks.map(t => [t.id, t]));
            const anyReady = remaining.some(t => this.isReady(t, byId));

            if(anyReady){
                continue;
            }

            const holdups = remaining.map(task => {

                if(task.metadata.status === "blocked"){
                    return { task: task.id, title: task.content, holdup: "blocked", detail: (task.metadata.history || []).at(-1)?.note || "Marked blocked" };
                }

                const unmetDep = (task.relationships || []).find(depId => {
                    const dep = byId.get(depId);
                    return dep && dep.metadata.status !== "completed";
                });

                return {
                    task: task.id,
                    title: task.content,
                    holdup: "waiting_on_dependency",
                    detail: unmetDep ? `Waiting on "${byId.get(unmetDep).content}" (${byId.get(unmetDep).metadata.status})` : `Status: ${task.metadata.status}`
                };

            });

            deadlocked.push({
                // `company` added Phase 48 (Executive Intelligence) --
                // additive, already on the real roadmap project object
                // (ExecutivePlanner.plan()'s own `goal.company` field),
                // needed to scope deadlocked projects to one company for
                // riskForecast().
                project: { id: project.id, title: project.title, department: project.department, company: project.company },
                remainingTaskCount: remaining.length,
                holdups,
                reason: `${remaining.length} remaining task(s), none ready to run -- ${holdups.map(h => h.detail).join("; ")}`
            });

        }

        return deadlocked;

    }


    detect(){

        return {
            blockedTasks: this.findBlockedTasks(),
            deadlockedProjects: this.findDeadlockedProjects()
        };

    }

}


module.exports = BlockerDetector;
