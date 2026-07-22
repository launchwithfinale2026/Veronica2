// ==================================
// VERONICA LEARNING ENGINE
// ==================================
//
// Aggregates core/learning/log.js's raw execution events into
// success/failure counts, per-department/agent/tool performance, and (via
// one LLM call, same pattern as core/executive/consolidation.js)
// optimization recommendations. Every aggregate here is derived from the
// log on read, not separately maintained running counters -- consistent
// with how roadmap()/progress()/etc. are all derived views elsewhere in
// this milestone.

const IntelligenceEngine = require("../intelligence");
const memory = require("../memory");
const knowledge = require("../knowledge");
const log = require("./log");

const RECOMMENDATION_TAG = "learning-recommendation";

const LEARNING_AGENT = {
    name: "EXECUTIVE",
    role: "Learning & Optimization",
    capabilities: ["performance analysis", "pattern recognition", "optimization"]
};


function parseRecommendations(text){

    const stripped = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");

    let parsed;

    try {
        parsed = JSON.parse(stripped);
    } catch(error){
        throw new Error(`Recommendation response was not valid JSON: ${error.message}`);
    }

    if(!parsed || !Array.isArray(parsed.recommendations)){
        throw new Error("Recommendation response must have a \"recommendations\" array");
    }

    return {
        recommendations: parsed.recommendations,
        summary: typeof parsed.summary === "string" ? parsed.summary : ""
    };

}


// Rolls a list of same-kind events up into {total, successes, failures,
// successRate, avgDurationMs} -- the one shape every performance
// breakdown (department/agent/tool) shares.
function summarize(events){

    const total = events.length;
    const successes = events.filter(e => e.outcome === "success").length;
    const failures = total - successes;
    const totalDuration = events.reduce((sum, e) => sum + (e.durationMs || 0), 0);

    return {
        total,
        successes,
        failures,
        successRate: total ? Math.round((successes / total) * 100) : 0,
        avgDurationMs: total ? Math.round(totalDuration / total) : 0
    };

}


// Groups events by `key` and summarizes each group, sorted by volume
// (most-executed first) so the highest-signal rows come first.
function breakdownBy(events, key){

    const groups = new Map();

    for(const event of events){

        const value = event[key];

        if(!value){
            continue;
        }

        if(!groups.has(value)){
            groups.set(value, []);
        }

        groups.get(value).push(event);

    }

    return [...groups.entries()]
        .map(([value, group]) => ({ [key]: value, ...summarize(group) }))
        .sort((a, b) => b.total - a.total);

}


class LearningEngine {

    static TAG = RECOMMENDATION_TAG;

    constructor(){

        this.intelligence = new IntelligenceEngine();

    }


    // System-wide successful/failed "decisions" (every logged execution,
    // department run or tool call) plus average execution time -- the
    // milestone's own "track successful decisions, failed decisions,
    // execution time" bullets.
    overview(){

        return summarize(log.readAll());

    }


    departmentPerformance(){

        return breakdownBy(
            log.readAll().filter(e => e.kind === "department_run"),
            "department"
        );

    }


    agentPerformance(){

        return breakdownBy(
            log.readAll().filter(e => e.kind === "department_run"),
            "agent"
        );

    }


    toolPerformance(){

        return breakdownBy(
            log.readAll().filter(e => e.kind === "tool_call"),
            "tool"
        );

    }


    async synthesizeRecommendations(stats){

        const mission = {

            task: "Analyze recent execution performance and recommend concrete optimizations.",

            stats,

            responseFormat: {
                instructions: "Return ONLY valid JSON (no prose, no markdown fences) matching this exact shape.",
                shape: {
                    summary: "string -- a short prose read of overall performance",
                    recommendations: ["string -- a concrete, actionable optimization"]
                }
            }

        };

        const thought = await this.intelligence.think(
            LEARNING_AGENT,
            mission,
            { useTools: false }
        );

        return parseRecommendations(thought.cognition.response.response);

    }


    // Gathers the same stats overview()/departmentPerformance()/etc.
    // expose, asks the brain to synthesize optimization recommendations
    // (skipped entirely if there's no logged execution data at all -- same
    // cost-conscious skip as MemoryConsolidation.run()), and persists the
    // result.
    async recommend(){

        const stats = {
            overview: this.overview(),
            departments: this.departmentPerformance(),
            agents: this.agentPerformance(),
            tools: this.toolPerformance()
        };

        const output = stats.overview.total
            ? await this.synthesizeRecommendations(stats)
            : { summary: "No execution data logged yet.", recommendations: [] };

        return this.persist(stats, output);

    }


    persist(stats, output){

        const entry = memory.remember({
            content: output.summary || "Optimization recommendations",
            type: "decisions",
            importance: 4,
            tags: [RECOMMENDATION_TAG],
            source: "learning-engine",
            metadata: {
                stats,
                recommendations: output.recommendations
            }
        });

        knowledge.addEntity({ name: entry.content, type: "recommendation" });

        return this.toRecord(entry);

    }


    toRecord(entry){

        const meta = entry.metadata || {};

        return {
            id: entry.id,
            summary: entry.content,
            stats: meta.stats || {},
            recommendations: meta.recommendations || [],
            created: entry.created
        };

    }


    recommendationHistory(limit = 10){

        return memory.filter({ tag: RECOMMENDATION_TAG }, { limit })
            .map(entry => this.toRecord(entry));

    }

}


module.exports = LearningEngine;
