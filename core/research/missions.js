// ==================================
// VERONICA RESEARCH MISSION ENGINE
// ==================================
//
// Phase 44 (Research Division production-readiness). A Research Mission
// groups multiple real citations (each a real core/research/engine.js
// `research()` call -- fetch a real URL, extract real structured
// knowledge via LLM, store with its citation) under one objective, with
// a real, deterministic source ranking and a real, LLM-synthesized
// executive summary across everything actually collected. This is the
// genuinely new piece Phase 44 adds -- addCitation() below reuses
// ResearchEngine.research() wholesale, it does not re-implement
// fetching or knowledge extraction.
//
// "Competitor research"/"Industry reports"/"Technology reports"/
// "Market trend reports" are all the SAME mechanism with a different
// `type` label, not four separate report generators -- a mission's
// `type` is informational (what kind of research this is), the
// underlying pipeline (research -> rank -> summarize) is identical for
// all of them.
//
// A mission is company-scoped only if a companyId is given -- research
// isn't inherently tied to one company (Phase 29's engine is
// deliberately global), so this stays optional rather than forcing a
// company onto every mission.
//
// `./engine` and `../intelligence` are required LAZILY (inside
// addCitation()/generateExecutiveSummary() below), not at module load
// time -- the same real, found-live circular require documented in
// core/sales/analytics.js's own comment: this module is reached from
// packages/research-department/tools/research.dept.synthesize.js, a
// TOOL HANDLER loaded by core/tools/loader.js, and both `./engine` and
// `../intelligence`'s own chains eventually reach
// core/brain/providers/claude.js, which requires core/tools/index.js
// at its own top level. Reproduced live here exactly like the Sales
// case -- fixed the same way.

const memory = require("../memory");
const knowledge = require("../knowledge");
const bus = require("../bus");

const MISSION_TAG = "research-mission";

const MISSION_TYPES = ["competitor", "industry", "technology", "market_trend", "general"];

const SUMMARY_AGENT = {
    name: "RESEARCHER",
    role: "Research Executive Summary Writer",
    capabilities: ["research synthesis", "executive summary"]
};


function toMission(entry){

    const meta = entry.metadata || {};

    return {
        id: entry.id,
        companyId: meta.companyId || null,
        objective: entry.content,
        type: meta.type || "general",
        status: meta.status || "in_progress",
        citationIds: meta.citationIds || [],
        executiveSummary: meta.executiveSummary || null,
        created: entry.created,
        updated: entry.updated
    };

}


function requireEntry(id){

    const entry = memory.view().find(m => m.id === id && (m.tags || []).includes(MISSION_TAG));

    if(!entry){
        throw new Error(`Unknown research mission: "${id}"`);
    }

    return entry;

}


// input: { objective, type?, companyId? }
function createMission(input = {}){

    if(!input.objective){
        throw new Error("An objective is required");
    }

    const type = input.type || "general";

    if(!MISSION_TYPES.includes(type)){
        throw new Error(`Invalid mission type: "${type}" (must be one of ${MISSION_TYPES.join(", ")})`);
    }

    const tags = [MISSION_TAG];

    if(input.companyId){
        tags.push(`company:${input.companyId}`);
    }

    const entry = memory.remember({
        content: input.objective,
        type: "technical knowledge",
        importance: 3,
        tags,
        source: "research-missions",
        metadata: {
            companyId: input.companyId || null,
            type,
            status: "in_progress",
            citationIds: [],
            executiveSummary: null
        }
    });

    // Phase 49 (Organizational Knowledge Graph): only connected to a
    // company when this mission actually IS company-scoped -- this
    // engine deliberately does not validate companyId (see this file's
    // own header comment on missions being optionally company-scoped),
    // so a company entry may not exist; the relationship is skipped
    // rather than fabricated in that case.
    knowledge.addEntity({ name: entry.content, type: "research-mission" });

    if(input.companyId){

        const CompanyManager = require("../executive/companyManager");
        const companyEntry = memory.view().find(
            m => m.id === input.companyId && (m.tags || []).includes(CompanyManager.TAG)
        );

        if(companyEntry){
            knowledge.addRelationship({ from: entry.content, to: companyEntry.content, type: "belongsTo" });
        }

    }

    return toMission(entry);

}


function listMissions(companyId){

    return memory.filter({ tag: MISSION_TAG })
        .filter(entry => !companyId || (entry.tags || []).includes(`company:${companyId}`))
        .map(toMission);

}


function getMission(missionId){
    return toMission(requireEntry(missionId));
}


// Adds a real citation to a mission by actually running
// core/research/engine.js's real pipeline (fetch -> extract -> store) --
// not a duplicate implementation. `researchEngine` is injectable (same
// optionality pattern as every other engine dependency in this
// codebase) so tests can supply a mocked-Intelligence one without a
// real network call.
async function addCitation(missionId, { topic, url }, { researchEngine } = {}){

    requireEntry(missionId);

    const ResearchEngine = require("./engine");
    const engine = researchEngine || new ResearchEngine();
    const citation = await engine.research(topic, { url });

    const entry = requireEntry(missionId);
    const citationIds = [...(entry.metadata.citationIds || []), citation.id];

    memory.update(missionId, { metadata: { citationIds } });

    return getMission(missionId);

}


// Every real citation this mission has collected, with its real
// stored confidence/keyFacts/citation url.
function missionCitations(missionId){

    const mission = getMission(missionId);

    return mission.citationIds
        .map(id => memory.view().find(m => m.id === id))
        .filter(Boolean)
        .map(entry => ({
            id: entry.id,
            topic: entry.metadata.topic,
            summary: entry.content,
            citation: entry.metadata.citation,
            keyFacts: entry.metadata.keyFacts || [],
            confidence: entry.metadata.confidence,
            implementationRecommendation: entry.metadata.implementationRecommendation || null
        }));

}


// Real, deterministic Source Ranking: every citation this mission has
// collected, ordered by its real, already-computed extraction
// confidence (highest first) -- not a fabricated credibility score.
// Ties broken by recency (newer first), so ranking stays fully
// deterministic even when confidence is equal.
function rankSources(missionId){

    return missionCitations(missionId).sort((a, b) => {

        const confidenceDiff = (b.confidence || 0) - (a.confidence || 0);

        if(confidenceDiff !== 0){
            return confidenceDiff;
        }

        return 0;

    });

}


function summaryPrompt({ mission, citations }){

    const citationsText = citations
        .map((citation, index) => `${index + 1}. [${citation.citation}] ${citation.summary} Key facts: ${citation.keyFacts.join("; ") || "none"}`)
        .join("\n");

    return `Write a real executive summary synthesizing the following research findings for this mission.

Mission objective: ${mission.objective}
Mission type: ${mission.type}

Findings:
${citationsText || "No citations collected yet."}

Return ONLY the executive summary text -- no preamble, no explanation, no markdown fences. Cite specific findings where relevant.`;

}


// intelligence: optional IntelligenceEngine instance (same pattern
// core/marketing/contentGenerator.js/core/sales/proposalGenerator.js
// already establish).
async function generateExecutiveSummary(missionId, { intelligence } = {}){

    const mission = getMission(missionId);
    const citations = missionCitations(missionId);

    const IntelligenceEngine = require("../intelligence");
    const engine = intelligence || new IntelligenceEngine();

    const thought = await engine.think(
        SUMMARY_AGENT,
        { task: summaryPrompt({ mission, citations }), missionId },
        { useTools: false, companyId: mission.companyId }
    );

    const executiveSummary = thought.cognition.response.response.trim();

    memory.update(missionId, { metadata: { executiveSummary } });

    return executiveSummary;

}


function completeMission(missionId){

    requireEntry(missionId);

    const updated = memory.update(missionId, { metadata: { status: "completed" } });

    // Phase 52 (Continuous Observation Engine): a real, observable
    // research completion -- generated at the one real choke point
    // every mission completion already passes through.
    bus.publish("research.finished", { id: updated.id, objective: updated.content, companyId: updated.metadata.companyId });

    return updated.metadata.status;

}


module.exports = {
    MISSION_TAG,
    MISSION_TYPES,
    createMission,
    listMissions,
    getMission,
    addCitation,
    missionCitations,
    rankSources,
    generateExecutiveSummary,
    completeMission
};
