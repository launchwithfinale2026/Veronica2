// ==================================
// VERONICA RESEARCH & KNOWLEDGE ENGINE
// ==================================
//
// Phase 29. When VERONICA (or an operator, via the dashboard/terminal)
// encounters an unknown capability -- one of planner.js's `requiredAPIs`,
// say -- this is what turns a real URL into stored, cited knowledge:
// Research (fetch) -> Analyze (parse) -> Extract knowledge (LLM,
// structured) -> Store structured memory (cited, confidence-tracked) ->
// Recommend implementation.
//
// Deliberately requires a real URL, never a bare topic name -- this
// engine researches real documentation it can actually fetch (through
// the existing allowlisted core/integrations/http.js, same fail-closed
// posture as every other connector), it does not fabricate knowledge
// from a topic string alone. There is no web-search connector in this
// codebase; giving this engine a topic with no URL and having it
// "research" anyway would be exactly the fabrication this project has
// been careful to avoid.
//
// Knowledge extraction is the one genuinely LLM-shaped step here (same
// reasoning as core/executive/decomposer.js): summarizing/extracting
// structured facts from arbitrary prose is not a small, closed,
// rule-based decision the way planner.js's domain matching is. Same
// dependency-injection pattern as GoalDecomposer -- a real
// IntelligenceEngine by default, injectable for tests.
//
// Storage reuses the EXISTING memory system (Phase 3/12) -- never a
// second store. "Never overwrite previous knowledge" falls out of
// memory.remember() itself: it only ever creates new entries, there is
// no update-in-place path used here, so confidence/knowledge accumulate
// as a real history rather than clobbering what was known before.

const IntelligenceEngine = require("../intelligence");
const memory = require("../memory");
const http = require("../integrations/http");
const { parseJsonResponse } = require("../brain/parseJsonResponse");

const RESEARCH_TAG = "research-knowledge";

// Bounds how much fetched text reaches the LLM call -- same "don't send
// an unbounded document into a prompt" guard other LLM call sites in
// this codebase already apply.
const MAX_DOCUMENT_CHARS = 8000;

// A synthetic "agent" identity for Intelligence.think() -- research
// isn't owned by any one department, same reasoning as
// core/executive/decomposer.js's DECOMPOSITION_AGENT.
const RESEARCH_AGENT = {
    name: "RESEARCHER",
    role: "Research & Knowledge Extraction",
    capabilities: ["research", "documentation analysis", "knowledge extraction"]
};


// Documentation Parser: real HTML -> plain text, no new dependency (no
// DOM parser package) -- a regex-based strip is honest about its own
// limits (it won't handle every malformed-HTML edge case a real parser
// would) but is real, deterministic, and sufficient for extracting
// readable prose from a documentation page.
function extractText(html){

    return html
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/\s+/g, " ")
        .trim();

}


function extractTitle(html){

    const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);

    return match ? match[1].trim() : null;

}


class ResearchEngine {

    static TAG = RESEARCH_TAG;

    constructor({ intelligence } = {}){
        this.intelligence = intelligence || new IntelligenceEngine();
    }


    // Real fetch through the existing allowlisted http client -- fails
    // closed exactly like every other connector (SERVICE_ALLOWLIST, 4xx/
    // 5xx surfaced as a real error) if the host isn't reachable/allowed.
    async fetchDocumentation(url){

        if(!url){
            throw new Error("A url is required");
        }

        const response = await http.request(url);

        if(response.status >= 400){
            throw new Error(`Research fetch failed ${response.status}: ${url}`);
        }

        return { url, title: extractTitle(response.body), text: extractText(response.body) };

    }


    // Knowledge Extractor + Implementation Recommendations, in one LLM
    // call -- returns structured JSON, not prose, same
    // parseJsonResponse() primitive every other structured LLM call site
    // in this codebase already uses.
    async extractKnowledge(topic, documentText){

        const mission = {

            task: `Analyze this documentation and extract structured knowledge about "${topic}".`,

            documentText: documentText.slice(0, MAX_DOCUMENT_CHARS),

            responseFormat: {
                instructions: "Return ONLY valid JSON (no prose, no markdown fences) matching this exact shape.",
                shape: {
                    summary: "string",
                    keyFacts: ["string"],
                    confidence: "number between 0 and 1 -- how confident this extraction is, given the source material",
                    implementationRecommendation: "string -- concrete next step to implement this capability in VERONICA"
                }
            }

        };

        const thought = await this.intelligence.think(RESEARCH_AGENT, mission, { useTools: false });

        return parseJsonResponse(thought.cognition.response.response, "Research extraction response");

    }


    // Citation Storage + Research Memory + Architecture Memory: one
    // ordinary memory entry, tagged research-knowledge + a per-topic tag
    // (so history() below can scope to one topic), with the source URL
    // preserved as its citation. Confidence maps onto memory's existing
    // 1-5 importance scale rather than adding a second scoring
    // dimension.
    store(topic, extracted, citation){

        const importance = Math.max(1, Math.min(5, Math.round((extracted.confidence || 0) * 5) || 1));

        return memory.remember({
            content: `Research on "${topic}": ${extracted.summary}`,
            type: "technical knowledge",
            importance,
            tags: [RESEARCH_TAG, `topic:${topic}`],
            source: "research-engine",
            metadata: {
                topic,
                citation,
                keyFacts: extracted.keyFacts || [],
                confidence: extracted.confidence,
                implementationRecommendation: extracted.implementationRecommendation || null
            }
        });

    }


    // The full pipeline: Research -> Analyze -> Extract -> Store ->
    // Recommend.
    async research(topic, { url } = {}){

        if(!topic){
            throw new Error("A topic is required");
        }

        if(!url){
            throw new Error("A url is required -- this engine researches real, fetchable documentation, it does not fabricate knowledge from a topic name alone");
        }

        const doc = await this.fetchDocumentation(url);
        const extracted = await this.extractKnowledge(topic, doc.text);

        return this.store(topic, extracted, url);

    }


    // Every research entry, most-recent-first, optionally scoped to one
    // topic -- memory.filter() only supports one tag per call, so a
    // topic scope is applied as a second, in-process filter rather than
    // a second criteria field.
    history(topic, limit = 10){

        const all = memory.filter({ tag: RESEARCH_TAG }, { limit: topic ? undefined : limit });

        const scoped = topic ? all.filter(entry => (entry.tags || []).includes(`topic:${topic}`)) : all;

        return scoped.slice(0, limit);

    }

}


module.exports = ResearchEngine;
module.exports.extractText = extractText;
module.exports.extractTitle = extractTitle;
