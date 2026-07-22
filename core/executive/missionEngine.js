// ==================================
// VERONICA MISSION ENGINE
// ==================================
//
// Phase 31. The shift this phase asks for -- from "the user issues
// commands" to "the user defines objectives" -- is deliberately NOT a
// new planning system. A mission is a real ExecutivePlanner project
// (Phase 2) plus a real GoalDecomposer breakdown (Phase 2's own
// LLM-shaped milestone/task generation) plus a real capability-gap
// analysis (Phase 20/28's planner.js) plus real progress tracking
// (Phase 2's ProjectManager) plus real recommendations (Phase 11's
// ExecutiveRecommendationEngine, scoped to this mission's project) --
// this file's only job is composing those five already-existing,
// already-tested systems around one persisted "mission" record, per
// this phase's own instruction to integrate with the existing
// executive planner rather than build a parallel one.
//
// "Generate departments" from this phase's ask is NOT built here as a
// literal auto-department-creation step -- core/capabilities/builder.js
// (Phase 27) already generates a real department skeleton on request,
// and core/capabilities/planner.js (Phase 28) already reports which
// capabilities a mission's domain would need; defineMission() surfaces
// that analysis so a human (or a future orchestration step) can decide
// whether to actually build one, rather than this engine silently
// scaffolding a department no one asked for.

const ExecutivePlanner = require("./planner");
const ProjectManager = require("./projectManager");
const GoalDecomposer = require("./decomposer");
const ExecutiveRecommendationEngine = require("./executiveRecommendations");
const memory = require("../memory");

const MISSION_TAG = "mission";


class MissionEngine {

    static TAG = MISSION_TAG;

    constructor({ planner, projectManager, decomposer, recommendationEngine, capabilityPlanner } = {}){

        this.planner = planner || new ExecutivePlanner();
        this.projectManager = projectManager || new ProjectManager({ planner: this.planner });
        this.decomposer = decomposer || new GoalDecomposer({ planner: this.planner });
        this.recommendationEngine = recommendationEngine || new ExecutiveRecommendationEngine({ planner: this.planner, projectManager: this.projectManager });

        // Lazy default only to stay consistent with this codebase's own
        // circular-require caution elsewhere -- core/capabilities/planner.js
        // has no path back to core/executive today, so this isn't
        // actually circular, just defensive.
        this.capabilityPlanner = capabilityPlanner || require("../capabilities/planner");

    }


    // A rough, STATED-as-rough estimate: real decomposed task hours (if
    // decomposition produced any) plus the capability-gap analysis's own
    // estimatedBuildDays (Phase 28) for whatever capabilities the
    // mission's domain is still missing. Two different units (hours vs.
    // days) combined into one days figure -- an 8-hour workday
    // assumption, stated as such, not hidden.
    estimateTimeline(decomposition, capabilityAnalysis){

        // Persisted tasks (see decomposer.js's persistTask()) carry their
        // estimate as task.effort.hours, not a raw estimatedHours field --
        // that raw shape only exists in the LLM's own response, before
        // GoalDecomposer.persist() turns it into a real memory entry.
        const taskHours = (decomposition?.milestones || [])
            .flatMap(m => m.tasks || [])
            .reduce((sum, task) => sum + (task.effort?.hours || 0), 0);

        const taskDays = Math.ceil(taskHours / 8);
        const capabilityDays = capabilityAnalysis.estimatedBuildDays || 0;

        return {
            taskDays,
            capabilityBuildDays: capabilityDays,
            totalEstimatedDays: taskDays + capabilityDays,
            basis: "8-hour workday assumption; capability build days from core/capabilities/planner.js's static catalog -- both rough estimates, not commitments"
        };

    }


    // The full pipeline: Intent (the objective itself) -> capability
    // analysis -> a real project -> a real decomposition -> a real
    // timeline estimate -> persisted as one mission record.
    //
    // Decomposition is NOT best-effort-swallowed on failure -- a real
    // GoalDecomposer failure (e.g. the brain provider is unavailable) is
    // a real failure an operator needs to know about, same as calling
    // decomposer.decompose() directly anywhere else in this codebase; a
    // silently-empty mission with no milestones would misrepresent what
    // actually happened.
    async defineMission(objective, { department = "ares", priority = 3, deadline } = {}){

        if(!objective){
            throw new Error("An objective is required");
        }

        const capabilityAnalysis = this.capabilityPlanner.analyzeRequest(objective);

        const project = this.planner.plan({ title: objective, department, priority, deadline });

        const decomposition = await this.decomposer.decompose(project.id);

        const timeline = this.estimateTimeline(decomposition, capabilityAnalysis);

        const mission = {
            objective,
            projectId: project.id,
            capabilityAnalysis,
            timeline,
            createdAt: new Date().toISOString()
        };

        const entry = memory.remember({
            content: `Mission: ${objective}`,
            type: "goals",
            importance: priority >= 4 ? 4 : 3,
            tags: [MISSION_TAG],
            source: "mission-engine",
            metadata: mission
        });

        return this.toRecord(entry);

    }


    requireMission(missionId){

        const entry = memory.view().find(m => m.id === missionId && (m.tags || []).includes(MISSION_TAG));

        if(!entry){
            throw new Error(`Unknown mission: "${missionId}"`);
        }

        return entry;

    }


    // Track completion / monitor progress -- reuses
    // ProjectManager.getProject() (Phase 2) directly rather than
    // re-deriving progress a second way.
    status(missionId){

        const mission = this.toRecord(this.requireMission(missionId));

        return {
            ...mission,
            project: this.projectManager.getProject(mission.projectId)
        };

    }


    // Recommend next actions -- reuses
    // ExecutiveRecommendationEngine.generate() (Phase 11), scoped to
    // this mission's own project via its `subject` field, rather than a
    // mission-specific recommendation system.
    recommendNextActions(missionId){

        const mission = this.toRecord(this.requireMission(missionId));

        return this.recommendationEngine.generate()
            .filter(rec => rec.subject === mission.projectId);

    }


    toRecord(entry){
        return { id: entry.id, summary: entry.content, ...entry.metadata, created: entry.created };
    }


    history(limit = 10){
        return memory.filter({ tag: MISSION_TAG }, { limit }).map(entry => this.toRecord(entry));
    }

}


module.exports = MissionEngine;
