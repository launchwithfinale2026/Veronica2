// ==================================
// VERONICA EVENT INGESTION PIPELINE
// ==================================
//
// Phase 19 (External Integration & Operational Deployment). One shared
// entry point every connector event flows through -- a new GitHub
// commit/PR, an incoming Discord message, a new Gmail message, an
// upcoming Calendar event, a new Drive file -- normalized to a common
// shape and fed through core/memory's EXISTING remember() (Phase 12:
// automatic classification/importance scoring/lifecycle). This is
// deliberately NOT a second memory system -- every event this module
// ingests becomes a completely ordinary memory entry, indistinguishable
// in storage from anything else remember() already handles, just tagged
// so executive code can find "everything new from outside" without
// knowing about each connector individually:
//
//   - `external-event`      -- every event ingested through this module
//   - `source:<connector>`  -- e.g. `source:github`, per this phase's
//                              explicit "tagged source:github" ask
//   - `kind:<event kind>`   -- e.g. `kind:pull_request`, `kind:email`
//
// metadata.occurredAt carries the connector's own event timestamp
// (falling back to ingestion time if the connector doesn't have one),
// separate from the memory entry's own `created` timestamp (when
// VERONICA learned about it, which for a polled connector can lag the
// real event by up to one polling interval).

const memory = require("../memory");

const KNOWN_SOURCES = ["github", "discord", "gmail", "calendar", "drive"];


function ingest({ source, kind, summary, occurredAt, importance, metadata } = {}){

    if(!KNOWN_SOURCES.includes(source)){
        throw new Error(`Unknown event source: "${source}" -- expected one of: ${KNOWN_SOURCES.join(", ")}`);
    }

    if(!kind){
        throw new Error("An event kind is required");
    }

    if(!summary){
        throw new Error("A summary is required");
    }

    return memory.remember({
        content: summary,
        type: "general",
        importance: Number.isFinite(importance) ? importance : 3,
        tags: ["external-event", `source:${source}`, `kind:${kind}`],
        source: `integration:${source}`,
        metadata: {
            ...(metadata || {}),
            source,
            kind,
            occurredAt: occurredAt || new Date().toISOString()
        }
    });

}


// Executive-facing read: every ingested event (optionally scoped to one
// connector and/or a `since` cutoff), most recent first -- the shape
// core/executive's briefing/review/report code needs to answer "what
// came in from outside since I last looked."
function recentEvents({ source, since, limit } = {}){

    let events = memory.filter({ tag: "external-event" });

    if(source){
        events = events.filter(entry => (entry.tags || []).includes(`source:${source}`));
    }

    if(since){
        const sinceMs = new Date(since).getTime();
        events = events.filter(entry => new Date(entry.metadata.occurredAt).getTime() >= sinceMs);
    }

    events = [...events].sort((a, b) => new Date(b.metadata.occurredAt) - new Date(a.metadata.occurredAt));

    return typeof limit === "number" ? events.slice(0, limit) : events;

}


module.exports = { ingest, recentEvents, KNOWN_SOURCES };
