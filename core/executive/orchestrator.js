// ==================================
// VERONICA EXECUTIVE ORCHESTRATOR
// ==================================
//
// Closes the loop the rest of core/executive/ stops short of: planner.js
// schedules a project and assigns it a department, decomposer.js breaks
// it into milestones/tasks, but nothing before this ever actually ran a
// task against a real department, looked at what came back, and updated
// its status accordingly. This is the "Execution -> Evaluation -> Memory
// update -> Progress reporting" half of the flow, on top of the
// "objective -> plan -> department assignment" half planner.js/
// decomposer.js already provide.
//
// Constructed with the caller's already-loaded `departments` array (real
// DepartmentManager instances with real agents/intelligence attached) --
// same reasoning as core/collaboration/engine.js: a self-contained
// singleton here would mean constructing a second set of 9
// IntelligenceEngine/Brain instances alongside the ones terminal.js/
// dashboard already built. See docs/Architecture.md "Multi-Agent
// Collaboration" for the precedent.
//
// Evaluation is deliberately rule-based (did the department run throw, or
// didn't it), not a second LLM call grading the first one's output --
// consistent with planner.js's own reasoning for why department
// assignment/prioritization is rule-based: cheap, synchronous,
// deterministic, no extra network call or brain mock needed in tests.

const memory = require("../memory");
const ExecutivePlanner = require("./planner");
const GoalDecomposer = require("./decomposer");
const ProjectManager = require("./projectManager");

class ExecutiveOrchestrator {

    constructor({ departments, planner, decomposer, projectManager } = {}){

        if(!departments || !departments.length){
            throw new Error("ExecutiveOrchestrator requires real departments");
        }

        this.departments = departments;
        this.planner = planner || new ExecutivePlanner();
        this.decomposer = decomposer || new GoalDecomposer({ planner: this.planner });
        this.projectManager = projectManager || new ProjectManager({ planner: this.planner });

    }


    findDepartment(id){

        const department = this.departments.find(dept => dept.id === id);

        if(!department){
            throw new Error(`Unknown department: "${id}"`);
        }

        return department;

    }


    // "User objective -> Executive Core -> Plan creation -> Department
    // assignment" in one call: plans the goal (which already assigns a
    // department and computes priority/effort/deadline status -- see
    // planner.js), then immediately decomposes it into milestones/tasks.
    async pursue(goal){

        const project = this.planner.plan(goal);
        const decomposition = await this.decomposer.decompose(project.id);

        return { project, decomposition };

    }


    // Every project not yet completed, most urgent first (roadmap() is
    // already sorted by priority).
    activeProjects(){

        return this.planner.roadmap().filter(project => project.status !== "completed");

    }


    // A task is ready when it's still "planned" and every dependency it
    // declared (milestone/task ids from the same decomposition -- see
    // decomposer.js's resolveDependencies()) is "completed". A dependency
    // id that isn't itself a task in this project (e.g. a cross-project
    // reference) is treated as satisfied -- gating only applies within
    // the project's own task graph.
    isReady(task, byId){

        if(task.metadata.status !== "planned"){
            return false;
        }

        return (task.relationships || []).every(depId => {
            const dep = byId.get(depId);
            return !dep || dep.metadata.status === "completed";
        });

    }


    // The single next unit of work across the whole active roadmap,
    // highest-priority project first. Returns null when nothing is ready
    // -- either everything's done, or every remaining task is blocked/
    // in progress/waiting on a dependency.
    nextReadyTask(){

        for(const project of this.activeProjects()){

            const tasks = this.projectManager.tasksForProject(project.id);
            const byId = new Map(tasks.map(task => [task.id, task]));

            const ready = tasks.find(task => this.isReady(task, byId));

            if(ready){
                return { project, task: ready };
            }

        }

        return null;

    }


    // Dispatches one task to its assigned department, evaluates the
    // result, updates status, and cascades completion up to the
    // milestone/project if this was their last remaining task.
    async executeTask(task){

        const departmentId = task.tags.find(tag => this.departments.some(dept => dept.id === tag));

        if(!departmentId){
            throw new Error(`Task "${task.id}" has no department tag`);
        }

        const department = this.findDepartment(departmentId);

        this.projectManager.updateStatus(task.id, "in_progress", `Dispatched to ${departmentId}`);

        // Company-scoped tasks (see decomposer.js's persistTask()) get a
        // company-scoped reasoning context -- see core/context/engine.js's
        // searchMemories() for why this matters: without it, this
        // dispatch would reason over the ENTIRE shared memory store
        // regardless of which company (if any) the task belongs to.
        const companyId = task.metadata.company || undefined;

        let result;

        try {
            result = await department.run(task.content, { taskId: task.id }, { companyId });
        } catch(error){

            this.projectManager.updateStatus(task.id, "blocked", `Execution failed: ${error.message}`);

            return {
                task: task.id,
                department: departmentId,
                outcome: "failure",
                error: error.message
            };

        }

        this.projectManager.addArtifact(task.id, result.response);
        this.projectManager.updateStatus(task.id, "completed", `Executed by ${result.agent}`);

        this.cascadeCompletion(task.metadata.parentMilestone);

        return {
            task: task.id,
            department: departmentId,
            agent: result.agent,
            outcome: "success",
            response: result.response
        };

    }


    // If every task under this milestone is now completed, marks the
    // milestone completed too, then checks whether that was the
    // project's last remaining milestone.
    cascadeCompletion(milestoneId){

        if(!milestoneId){
            return;
        }

        const milestone = this.projectManager.requireEntry(milestoneId);

        if(milestone.metadata.status === "completed"){
            return;
        }

        const tasks = memory.filter({ tag: GoalDecomposer.TAG })
            .filter(entry => entry.tags.includes("task") && entry.metadata.parentMilestone === milestoneId);

        if(tasks.length && tasks.every(t => t.metadata.status === "completed")){

            this.projectManager.updateStatus(milestoneId, "completed", "All tasks completed");

            if(milestone.metadata.parentProject){
                this.cascadeProjectCompletion(milestone.metadata.parentProject);
            }

        }

    }


    cascadeProjectCompletion(projectId){

        const project = this.projectManager.requireEntry(projectId);

        if(project.metadata.status === "completed"){
            return;
        }

        const milestones = this.projectManager.milestonesForProject(projectId);

        if(milestones.length && milestones.every(m => m.metadata.status === "completed")){
            this.projectManager.updateStatus(projectId, "completed", "All milestones completed");
        }

    }


    // Finds and executes exactly one ready task -- the bounded unit of
    // work the autonomous execution loop (core/automation/jobs.js's
    // "execute-tasks" job) calls on every tick. Deliberately one task per
    // call, not "drain everything ready": a runaway decomposition
    // producing hundreds of tasks shouldn't turn one tick into an
    // unbounded synchronous loop, and the automation engine's own
    // recurring schedule already provides the cadence for picking up the
    // next one.
    async runNextReadyTask(){

        const next = this.nextReadyTask();

        if(!next){
            return { ranTask: false };
        }

        const outcome = await this.executeTask(next.task);

        return { ranTask: true, project: next.project.id, ...outcome };

    }


    // Aggregate view across the whole roadmap -- counts by status,
    // average progress, and deadline risk. Derived on read, not
    // separately maintained, consistent with how roadmap()/progress()/
    // etc. are all derived views elsewhere in this milestone.
    report(){

        const projects = this.planner.roadmap();

        const byStatus = { planned: 0, in_progress: 0, blocked: 0, completed: 0 };

        for(const project of projects){
            byStatus[project.status] = (byStatus[project.status] || 0) + 1;
        }

        const progress = projects.map(project => this.projectManager.progress(project.id));

        const averageProgress = progress.length
            ? Math.round(progress.reduce((sum, p) => sum + p, 0) / progress.length)
            : 0;

        return {
            totalProjects: projects.length,
            byStatus,
            averageProgress,
            deadlines: this.planner.evaluateDeadlines()
        };

    }

}


module.exports = ExecutiveOrchestrator;
