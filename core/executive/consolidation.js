// ==================================
// VERONICA EXECUTIVE MEMORY CONSOLIDATION
// ==================================
//
// Gathers what's happened since the last consolidation run (completed
// tasks, important memories, knowledge graph updates, "lessons" from
// completed-with-a-note project/milestone/task transitions, and decision
// history), asks the brain to synthesize it into a summary/patterns/
// recommendations/insights, and persists the result -- the same memory-
// entry-plus-metadata pattern every other executive entity uses, tagged
// "executive-consolidation".
//
// This is the "gather + synthesize + persist" logic only. It does NOT
// itself run nightly or on any schedule -- see docs/Architecture.md
// "Executive Memory Consolidation" for why building a scheduler here would
// duplicate the milestone's own later Phase 8 (Automation Engine). Trigger
// it manually (terminal/dashboard/tool) until that phase exists, e.g. from
// cron/launchd hitting POST /api/executive/consolidate.

const IntelligenceEngine = require("../intelligence");
const memory = require("../memory");
const knowledge = require("../knowledge");
const ExecutivePlanner = require("./planner");
const GoalDecomposer = require("./decomposer");

const CONSOLIDATION_TAG = "executive-consolidation";

// No prior run yet: look back this far for the first-ever consolidation,
// so it isn't scoped to "everything since the beginning of time."
const DEFAULT_WINDOW_DAYS = 1;

const CONSOLIDATION_AGENT = {
    name: "EXECUTIVE",
    role: "Executive Memory Consolidation",
    capabilities: ["synthesis", "pattern recognition", "strategic recommendation"]
};


function parseConsolidation(text){

    const stripped = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");

    let parsed;

    try {
        parsed = JSON.parse(stripped);
    } catch(error){
        throw new Error(`Consolidation response was not valid JSON: ${error.message}`);
    }

    if(!parsed || typeof parsed.summary !== "string"){
        throw new Error("Consolidation response must have a \"summary\" string");
    }

    return {
        summary: parsed.summary,
        patterns: Array.isArray(parsed.patterns) ? parsed.patterns : [],
        recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : [],
        insights: Array.isArray(parsed.insights) ? parsed.insights : []
    };

}


class MemoryConsolidation {

    static TAG = CONSOLIDATION_TAG;

    constructor(){

        this.intelligence = new IntelligenceEngine();

    }


    lastRun(){

        const runs = memory.filter({ tag: CONSOLIDATION_TAG });

        if(!runs.length){
            return null;
        }

        return runs.reduce((latest, run) =>
            new Date(run.created) > new Date(latest.created) ? run : latest
        );

    }


    windowStart(){

        const last = this.lastRun();

        if(last){
            return new Date(last.created);
        }

        const fallback = new Date();
        fallback.setDate(fallback.getDate() - DEFAULT_WINDOW_DAYS);

        return fallback;

    }


    // "Lessons" = notes attached to a completed-status transition on any
    // project, milestone, or task (see ProjectManager.updateStatus) --
    // real data already being captured, not a new concept invented here.
    gatherProjectLessons(sinceTime){

        const items = [
            ...memory.filter({ tag: ExecutivePlanner.TAG }),
            ...memory.filter({ tag: GoalDecomposer.TAG })
        ];

        const lessons = [];

        for(const item of items){

            for(const entry of (item.metadata.history || [])){

                if(entry.to === "completed" && entry.note && new Date(entry.timestamp).getTime() >= sinceTime){

                    lessons.push({
                        itemId: item.id,
                        title: item.content,
                        note: entry.note,
                        timestamp: entry.timestamp
                    });

                }

            }

        }

        return lessons;

    }


    gather(since){

        const sinceTime = since.getTime();

        const completedTasks = memory.filter({ tag: GoalDecomposer.TAG })
            .filter(entry => entry.tags.includes("task") && entry.metadata.status === "completed")
            .filter(entry => new Date(entry.updated).getTime() >= sinceTime)
            .map(entry => ({ id: entry.id, title: entry.content, department: entry.metadata.department }));

        const importantMemories = memory.filter({ minImportance: 4 })
            .filter(entry => new Date(entry.updated).getTime() >= sinceTime)
            .filter(entry => !["decisions", "goals"].includes(entry.type) && !entry.tags.includes(CONSOLIDATION_TAG))
            .map(entry => ({ id: entry.id, content: entry.content, type: entry.type, importance: entry.importance }));

        const graph = knowledge.read();

        // Excludes "consolidation"-type entities -- otherwise a run's own
        // knowledge-graph footprint (persist() adds one) would show up as
        // "new activity" in the very next run, permanently defeating the
        // no-activity/skip-the-brain-call check below.
        const knowledgeUpdates = [
            ...graph.entities
                .filter(entity => entity.type !== "consolidation")
                .filter(entity => new Date(entity.created).getTime() >= sinceTime)
                .map(entity => ({ kind: "entity", name: entity.name, type: entity.type })),
            ...graph.relationships
                .filter(rel => new Date(rel.created).getTime() >= sinceTime)
                .map(rel => ({ kind: "relationship", from: rel.from, to: rel.to, type: rel.type }))
        ];

        const projectLessons = this.gatherProjectLessons(sinceTime);

        const decisionHistory = memory.filter({ type: "decisions" })
            .filter(entry => new Date(entry.updated).getTime() >= sinceTime)
            .filter(entry => !entry.tags.includes(CONSOLIDATION_TAG))
            .map(entry => ({ id: entry.id, content: entry.content, importance: entry.importance }));

        return {
            since: since.toISOString(),
            completedTasks,
            importantMemories,
            knowledgeUpdates,
            projectLessons,
            decisionHistory
        };

    }


    async synthesize(gathered){

        const mission = {

            task: "Consolidate recent executive activity into a nightly summary.",

            activity: gathered,

            responseFormat: {
                instructions: "Return ONLY valid JSON (no prose, no markdown fences) matching this exact shape.",
                shape: {
                    summary: "string -- a short prose summary of what happened in this window",
                    patterns: ["string -- a recurring theme noticed across the gathered activity"],
                    recommendations: ["string -- a concrete next action"],
                    insights: ["string -- a higher-level executive observation"]
                }
            }

        };

        // No tool use -- same reasoning as GoalDecomposer.requestStructure():
        // this needs one clean JSON document back.
        const thought = await this.intelligence.think(
            CONSOLIDATION_AGENT,
            mission,
            { useTools: false }
        );

        return parseConsolidation(thought.cognition.response.response);

    }


    persist(gathered, output){

        const entry = memory.remember({
            content: output.summary,
            type: "decisions",
            importance: 4,
            tags: [CONSOLIDATION_TAG],
            source: "memory-consolidation",
            metadata: {
                since: gathered.since,
                counts: {
                    completedTasks: gathered.completedTasks.length,
                    importantMemories: gathered.importantMemories.length,
                    knowledgeUpdates: gathered.knowledgeUpdates.length,
                    projectLessons: gathered.projectLessons.length,
                    decisionHistory: gathered.decisionHistory.length
                },
                patterns: output.patterns,
                recommendations: output.recommendations,
                insights: output.insights
            }
        });

        knowledge.addEntity({ name: entry.content, type: "consolidation" });

        return this.toRecord(entry);

    }


    toRecord(entry){

        const meta = entry.metadata || {};

        return {
            id: entry.id,
            summary: entry.content,
            since: meta.since || null,
            counts: meta.counts || {},
            patterns: meta.patterns || [],
            recommendations: meta.recommendations || [],
            insights: meta.insights || [],
            created: entry.created
        };

    }


    // Runs one consolidation pass: gather everything since the last run
    // (or the last DEFAULT_WINDOW_DAYS if this is the first), synthesize
    // it (skipping the brain call entirely if there's nothing to report),
    // and persist the result.
    async run(){

        const since = this.windowStart();
        const gathered = this.gather(since);

        const hasActivity =
            gathered.completedTasks.length ||
            gathered.importantMemories.length ||
            gathered.knowledgeUpdates.length ||
            gathered.projectLessons.length ||
            gathered.decisionHistory.length;

        const output = hasActivity
            ? await this.synthesize(gathered)
            : { summary: "No new activity since the last consolidation.", patterns: [], recommendations: [], insights: [] };

        return this.persist(gathered, output);

    }


    history(limit = 10){

        return memory.filter({ tag: CONSOLIDATION_TAG }, { limit })
            .map(entry => this.toRecord(entry));

    }

}


module.exports = MemoryConsolidation;
