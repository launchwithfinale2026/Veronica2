// ==================================
// VERONICA GOAL MONITORING
// ==================================
//
// Phase 11 (Executive Intelligence Layer). Distinct from
// core/executive/selfMonitor.js's checkDeadlines(), which only flags a
// project once it's actually past its stated deadline. A goal with no
// deadline at all, or one that's still "on track" by the calendar, can
// still have gone completely quiet -- no status change, no task
// progress -- for reasons a deadline check can't see. This catches
// staleness: "nothing has happened here in a while," independent of
// whether a deadline was ever set.
//
// Rule-based and explainable, same reasoning as priorityRanking.js: a
// concrete "no update in N days" threshold, not a judgment call.

const ExecutivePlanner = require("./planner");
const ProjectManager = require("./projectManager");

const STALE_DAYS = 5;
const MS_PER_DAY = 24 * 60 * 60 * 1000;


function daysSince(timestamp){
    return (Date.now() - new Date(timestamp).getTime()) / MS_PER_DAY;
}


class GoalMonitor {

    static STALE_DAYS = STALE_DAYS;

    constructor({ planner, projectManager } = {}){

        this.planner = planner || new ExecutivePlanner();
        this.projectManager = projectManager || new ProjectManager({ planner: this.planner });

    }


    // The most recent timestamp touching this project at all -- its own
    // entry, or any of its milestones/tasks. A project entry that hasn't
    // itself changed can still have very recent task activity, and vice
    // versa; either should count as "not stale."
    lastActivity(project){

        const tasks = this.projectManager.tasksForProject(project.id);
        const milestones = this.projectManager.milestonesForProject(project.id);

        const timestamps = [project.updated, ...tasks.map(t => t.updated), ...milestones.map(m => m.updated)];

        return timestamps.reduce((latest, ts) =>
            new Date(ts) > new Date(latest) ? ts : latest, project.updated
        );

    }


    // Active projects with no activity at all in STALE_DAYS -- flagged
    // regardless of deadline status (a project with no deadline can
    // still stall).
    checkStalledProjects(){

        const stalled = [];

        for(const project of this.planner.roadmap().filter(p => p.status !== "completed")){

            const lastActivity = this.lastActivity(project);
            const idleDays = daysSince(lastActivity);

            if(idleDays >= STALE_DAYS){

                stalled.push({
                    project: { id: project.id, title: project.title, status: project.status, department: project.department },
                    lastActivity,
                    idleDays: Math.round(idleDays * 10) / 10,
                    reason: `No activity (status change or task update) in ${Math.round(idleDays)} day(s) while still "${project.status}"`
                });

            }

        }

        return stalled;

    }


    // A milestone still "planned"/"in_progress" whose OWN tasks have all
    // gone stale too -- a narrower signal than a stalled project (which
    // might have other, active milestones): this specific piece of work
    // has stopped moving.
    checkStalledMilestones(){

        const stalled = [];

        for(const project of this.planner.roadmap().filter(p => p.status !== "completed")){

            for(const milestone of this.projectManager.milestonesForProject(project.id)){

                if(milestone.metadata.status === "completed"){
                    continue;
                }

                const idleDays = daysSince(milestone.updated);

                if(idleDays >= STALE_DAYS){

                    stalled.push({
                        milestone: { id: milestone.id, title: milestone.content, status: milestone.metadata.status },
                        project: { id: project.id, title: project.title },
                        idleDays: Math.round(idleDays * 10) / 10,
                        reason: `Milestone "${milestone.content}" has had no update in ${Math.round(idleDays)} day(s) while still "${milestone.metadata.status}"`
                    });

                }

            }

        }

        return stalled;

    }


    check(){

        return {
            staleDaysThreshold: STALE_DAYS,
            stalledProjects: this.checkStalledProjects(),
            stalledMilestones: this.checkStalledMilestones()
        };

    }

}


module.exports = GoalMonitor;
