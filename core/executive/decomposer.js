// ==================================
// VERONICA GOAL DECOMPOSITION ENGINE
// ==================================
//
// Breaks a planned project (see core/executive/planner.js) into milestones
// and tasks. This is the genuinely LLM-shaped half of "produce execution
// plans" that ExecutivePlanner deliberately deferred (see
// docs/Architecture.md "Executive Planner") -- turning a goal title into a
// real work breakdown needs actual reasoning, unlike scheduling metadata.
//
// Milestones and tasks are persisted the same way projects are: ordinary
// memory entries (type "goals", tagged "executive-decomposition") plus
// knowledge graph entities/relationships -- no parallel store. Subtasks
// and deliverables are NOT separately-scheduled entities (see
// docs/Architecture.md "Goal Decomposition Engine" for why) -- they're
// structured data attached to the task's metadata, since a subtask/
// deliverable doesn't get independently assigned to a department or
// prioritized against the rest of the roadmap, it's a checklist item /
// exit criterion of its task.

const IntelligenceEngine = require("../intelligence");
const memory = require("../memory");
const knowledge = require("../knowledge");
const ExecutivePlanner = require("./planner");
const { parseJsonResponse } = require("../brain/parseJsonResponse");

const DECOMPOSITION_TAG = "executive-decomposition";

// A synthetic "agent" identity for Intelligence.think() -- decomposition
// isn't performed by any one department's agent, it's an executive-level
// capability, so it gets its own identity rather than borrowing e.g. NIKE
// (Execution Commander) and implying this is ARES-owned work.
const DECOMPOSITION_AGENT = {
    name: "EXECUTIVE",
    role: "Executive Goal Decomposition",
    capabilities: ["goal decomposition", "project planning", "task breakdown"]
};


function parseStructure(text){

    const parsed = parseJsonResponse(text, "Decomposition response");

    if(!parsed || !Array.isArray(parsed.milestones)){
        throw new Error("Decomposition response must have a \"milestones\" array");
    }

    return parsed;

}


// Resolves the titles a milestone/task declared it depends on against
// every id assigned so far in this decomposition. Unresolvable titles
// (the model paraphrasing rather than repeating a title verbatim) are
// dropped rather than failing the whole decomposition -- a missed
// dependency link is recoverable, an aborted decomposition isn't.
function resolveDependencies(titles, titleToId){

    return (titles || [])
        .map(title => titleToId.get(title))
        .filter(Boolean);

}


class GoalDecomposer {

    // Exposed so core/executive/projectManager.js can find a project's
    // milestones/tasks by the same tag, instead of duplicating the string.
    static TAG = DECOMPOSITION_TAG;

    constructor({ planner } = {}){

        this.planner = planner || new ExecutivePlanner();
        this.intelligence = new IntelligenceEngine();

    }


    // Decomposes a project already on the roadmap (see
    // ExecutivePlanner.plan()) into milestones/tasks and persists them.
    async decompose(projectId){

        const project = this.planner.roadmap().find(p => p.id === projectId);

        if(!project){
            throw new Error(`Unknown project: "${projectId}"`);
        }

        const structure = await this.requestStructure(project);

        return this.persist(project, structure);

    }


    async requestStructure(project){

        const mission = {

            task: `Decompose this project into milestones and tasks.`,

            project: {
                title: project.title,
                description: project.description
            },

            responseFormat: {
                instructions: "Return ONLY valid JSON (no prose, no markdown fences) matching this exact shape.",
                shape: {
                    milestones: [
                        {
                            title: "string",
                            description: "string (optional)",
                            tasks: [
                                {
                                    title: "string",
                                    description: "string (optional)",
                                    estimatedHours: "number (optional)",
                                    dependsOnTitles: ["title of another milestone/task in this same decomposition (optional)"],
                                    subtasks: ["string"],
                                    deliverables: ["string"]
                                }
                            ]
                        }
                    ]
                }
            }

        };

        // No tool use here -- this call needs one clean JSON document back,
        // not a multi-turn tool loop.
        const thought = await this.intelligence.think(
            DECOMPOSITION_AGENT,
            mission,
            { useTools: false }
        );

        return parseStructure(thought.cognition.response.response);

    }


    persist(project, structure){

        const titleToId = new Map();

        titleToId.set(project.title, project.id);

        const milestones = (structure.milestones || []).map(milestoneSpec =>
            this.persistMilestone(project, milestoneSpec, titleToId)
        );

        return { project: project.id, milestones };

    }


    persistMilestone(project, spec, titleToId){

        if(!spec.title){
            throw new Error("A milestone title is required");
        }

        const dependencies = resolveDependencies(spec.dependsOnTitles, titleToId);

        const entry = memory.remember({
            content: spec.title,
            type: "goals",
            importance: 3,
            // Tagged to the parent project's company (if any), same as
            // the project entry itself -- without this, a company's
            // milestones/tasks would be invisible to
            // CompanyContext.search()/filter() (see
            // core/executive/companyContext.js) even though the project
            // that owns them is correctly scoped. Found during the
            // Phase 10 security audit.
            tags: [DECOMPOSITION_TAG, "milestone", project.department, ...(project.company ? [`company:${project.company}`] : [])],
            source: "goal-decomposer",
            relationships: [project.id, ...dependencies],
            metadata: {
                kind: "milestone",
                description: spec.description || null,
                parentProject: project.id,
                department: project.department,
                priority: project.priority,
                company: project.company || null,
                status: "planned",
                history: []
            }
        });

        titleToId.set(spec.title, entry.id);

        knowledge.addEntity({ name: spec.title, type: "milestone" });
        knowledge.addRelationship({ from: spec.title, to: project.title, type: "partOf" });

        const tasks = (spec.tasks || []).map(taskSpec =>
            this.persistTask(project, entry, taskSpec, titleToId)
        );

        const effortHours = tasks.reduce((sum, task) => sum + task.effort.hours, 0);

        return {
            id: entry.id,
            title: entry.content,
            description: spec.description || null,
            department: project.department,
            priority: project.priority,
            status: "planned",
            dependencies: entry.relationships,
            effort: { hours: effortHours, size: ExecutivePlanner.sizeFromHours(effortHours) },
            tasks
        };

    }


    persistTask(project, milestoneEntry, spec, titleToId){

        if(!spec.title){
            throw new Error("A task title is required");
        }

        const effort = Number.isFinite(spec.estimatedHours)
            ? { hours: spec.estimatedHours, size: ExecutivePlanner.sizeFromHours(spec.estimatedHours) }
            : this.planner.estimateEffort({ title: spec.title, description: spec.description });

        const dependencies = resolveDependencies(spec.dependsOnTitles, titleToId);

        const subtasks = (spec.subtasks || []).map(title => ({ title, status: "planned" }));
        const deliverables = spec.deliverables || [];

        const entry = memory.remember({
            content: spec.title,
            type: "goals",
            importance: 3,
            // See the matching comment in persistMilestone() above.
            tags: [DECOMPOSITION_TAG, "task", project.department, ...(project.company ? [`company:${project.company}`] : [])],
            source: "goal-decomposer",
            relationships: [milestoneEntry.id, ...dependencies],
            metadata: {
                kind: "task",
                description: spec.description || null,
                parentMilestone: milestoneEntry.id,
                department: project.department,
                priority: project.priority,
                company: project.company || null,
                effort,
                status: "planned",
                history: [],
                subtasks,
                deliverables
            }
        });

        titleToId.set(spec.title, entry.id);

        knowledge.addEntity({ name: spec.title, type: "task" });
        knowledge.addRelationship({ from: spec.title, to: milestoneEntry.content, type: "partOf" });

        return {
            id: entry.id,
            title: entry.content,
            description: spec.description || null,
            department: project.department,
            priority: project.priority,
            effort,
            status: "planned",
            dependencies: entry.relationships,
            subtasks,
            deliverables
        };

    }

}


module.exports = GoalDecomposer;
