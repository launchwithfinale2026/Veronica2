// ==================================
// VERONICA PROJECT MANAGER
// ==================================
//
// Adds the parts of a project's lifecycle ExecutivePlanner deliberately
// left out (see its "Not built" note in docs/Architecture.md): mutable
// status, progress, timeline/history, owners surfaced, and artifacts.
// Still no parallel store -- every operation here reads/writes the same
// memory entries planner.js and decomposer.js already created, via
// memory.update() (Phase 3's one addition to core/memory/store.js).
//
// updateStatus() is deliberately generic over projects, milestones, and
// tasks (all three share the same metadata.status/history shape) rather
// than three near-identical methods -- a milestone or task can be marked
// in_progress/blocked/completed exactly the same way a project can.

const memory = require("../memory");
const knowledge = require("../knowledge");
const ExecutivePlanner = require("./planner");
const GoalDecomposer = require("./decomposer");

const STATUSES = ["planned", "in_progress", "blocked", "completed"];


class ProjectManager {

    constructor({ planner } = {}){

        this.planner = planner || new ExecutivePlanner();

    }


    requireEntry(id){

        const entry = memory.view().find(m => m.id === id);

        if(!entry){
            throw new Error(`Unknown item: "${id}"`);
        }

        return entry;

    }


    requireProject(projectId){

        const project = this.planner.roadmap().find(p => p.id === projectId);

        if(!project){
            throw new Error(`Unknown project: "${projectId}"`);
        }

        return project;

    }


    // Works on a project, milestone, or task id -- whichever this is,
    // appends a {from, to, note, timestamp} history entry and persists the
    // new status. "completed" is terminal: once set, nothing (including
    // "completed" again) can transition it further.
    updateStatus(id, status, note){

        if(!STATUSES.includes(status)){
            throw new Error(`Unknown status: "${status}" (expected one of ${STATUSES.join(", ")})`);
        }

        const entry = this.requireEntry(id);
        const current = (entry.metadata || {}).status || null;

        if(current === "completed"){
            throw new Error(`"${entry.content}" is already completed and cannot change status`);
        }

        const historyEntry = {
            from: current,
            to: status,
            note: note || null,
            timestamp: new Date().toISOString()
        };

        const updated = memory.update(id, {
            metadata: {
                status,
                history: [...(entry.metadata.history || []), historyEntry]
            }
        });

        return {
            id: updated.id,
            status: updated.metadata.status,
            history: updated.metadata.history,
            updated: updated.updated
        };

    }


    // Appends an artifact (a URL, file path, or free-text reference to
    // something the project produced) to the project and links it into
    // the knowledge graph as a "produces" relationship -- the same
    // discoverability every other executive entity gets.
    addArtifact(projectId, artifact){

        if(!artifact){
            throw new Error("An artifact is required");
        }

        const entry = this.requireEntry(projectId);

        const artifacts = [...(entry.metadata.artifacts || []), artifact];

        const updated = memory.update(projectId, { metadata: { artifacts } });

        knowledge.addEntity({ name: String(artifact), type: "artifact" });
        knowledge.addRelationship({ from: entry.content, to: String(artifact), type: "produces" });

        return updated.metadata.artifacts;

    }


    milestonesForProject(projectId){

        return memory.filter({ tag: GoalDecomposer.TAG })
            .filter(entry =>
                entry.tags.includes("milestone") &&
                entry.metadata.parentProject === projectId
            );

    }


    tasksForProject(projectId){

        const milestoneIds = this.milestonesForProject(projectId).map(m => m.id);

        return memory.filter({ tag: GoalDecomposer.TAG })
            .filter(entry =>
                entry.tags.includes("task") &&
                milestoneIds.includes(entry.metadata.parentMilestone)
            );

    }


    // Percent of the project's decomposed tasks marked "completed". A
    // project that hasn't been decomposed yet (no tasks exist) has no
    // granular work to measure, so this falls back to a coarse reading of
    // the project's own status instead of always reporting 0.
    progress(projectId){

        const tasks = this.tasksForProject(projectId);

        if(!tasks.length){

            const project = this.requireProject(projectId);

            if(project.status === "completed") return 100;
            if(project.status === "in_progress") return 50;
            return 0;

        }

        const completed = tasks.filter(task => task.metadata.status === "completed").length;

        return Math.round((completed / tasks.length) * 100);

    }


    // The full picture of a project: everything ExecutivePlanner.plan()
    // already produces, plus progress, timeline/history, artifacts, its
    // decomposed milestones (if any), and its knowledge graph
    // neighborhood.
    getProject(projectId){

        const project = this.requireProject(projectId);
        const entry = this.requireEntry(projectId);

        const milestones = this.milestonesForProject(projectId).map(m => ({
            id: m.id,
            title: m.content,
            status: m.metadata.status
        }));

        return {

            ...project,

            progress: this.progress(projectId),

            artifacts: entry.metadata.artifacts || [],

            timeline: {
                created: entry.created,
                updated: entry.updated,
                deadline: entry.metadata.deadline || null,
                history: entry.metadata.history || []
            },

            milestones,

            knowledge: knowledge.retrieve(project.title)

        };

    }

}


module.exports = ProjectManager;
