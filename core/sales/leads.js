// ==================================
// VERONICA SALES LEAD ENGINE
// ==================================
//
// Phase 42 (Sales Division production-readiness). Leads are ordinary
// memory entries (type "businesses", tagged company:<id> + "sales-lead"),
// the exact same pattern core/marketing/campaigns.js already established
// for Marketing's company-scoped state -- not a new parallel store.
//
// Lead scoring is deterministic and explainable (a `reasons` breakdown
// alongside the score), matching this project's standing preference for
// rule-based logic wherever a real decision needs to be cheap,
// synchronous, and auditable (see core/executive/planner.js's own
// department-assignment scoring for the established precedent) -- not an
// LLM call pretending to read intent from a lead record.

const memory = require("../memory");
const knowledge = require("../knowledge");

const LEAD_TAG = "sales-lead";

const STATUSES = ["new", "contacted", "qualified", "disqualified", "converted"];

// How recent an interaction needs to be to count as "warm" for scoring.
const RECENT_INTERACTION_MS = 7 * 24 * 60 * 60 * 1000;


function requireCompanyExists(companyId){

    const CompanyManager = require("../executive/companyManager");

    const entry = memory.view().find(
        m => m.id === companyId && (m.tags || []).includes(CompanyManager.TAG)
    );

    if(!entry){
        throw new Error(`Unknown company: "${companyId}"`);
    }

    return entry;

}


function toLead(entry){

    const meta = entry.metadata || {};

    return {
        id: entry.id,
        companyId: meta.companyId,
        name: entry.content,
        organization: meta.organization || null,
        email: meta.email || null,
        phone: meta.phone || null,
        source: meta.source || null,
        status: meta.status || "new",
        interactions: meta.interactions || [],
        score: typeof meta.score === "number" ? meta.score : null,
        scoreReasons: meta.scoreReasons || [],
        signals: meta.signals || { budget: false, authority: false, need: false, timeline: false },
        created: entry.created,
        updated: entry.updated
    };

}


function requireEntry(id){

    const entry = memory.view().find(m => m.id === id && (m.tags || []).includes(LEAD_TAG));

    if(!entry){
        throw new Error(`Unknown lead: "${id}"`);
    }

    return entry;

}


// input: { companyId, name, organization?, email?, phone?, source? }
function createLead(input = {}){

    if(!input.companyId){
        throw new Error("A companyId is required");
    }

    if(!input.name){
        throw new Error("A lead name is required");
    }

    const company = requireCompanyExists(input.companyId);

    const entry = memory.remember({
        content: input.name,
        type: "businesses",
        importance: 3,
        tags: [LEAD_TAG, `company:${input.companyId}`],
        source: "sales-leads",
        metadata: {
            companyId: input.companyId,
            organization: input.organization || null,
            email: input.email || null,
            phone: input.phone || null,
            source: input.source || null,
            status: "new",
            interactions: [],
            score: null,
            scoreReasons: [],
            signals: { budget: false, authority: false, need: false, timeline: false }
        }
    });

    knowledge.addEntity({ name: entry.content, type: "lead" });
    // Phase 49 (Organizational Knowledge Graph): the entity already
    // existed -- this edge (missing until now) is what makes it
    // actually reachable from its owning company in the graph.
    knowledge.addRelationship({ from: entry.content, to: company.content, type: "belongsTo" });

    return toLead(entry);

}


function listLeads(companyId){

    return memory.filter({ tag: LEAD_TAG })
        .filter(entry => (entry.tags || []).includes(`company:${companyId}`))
        .map(toLead);

}


function getLead(leadId){
    return toLead(requireEntry(leadId));
}


function setStatus(leadId, status){

    if(!STATUSES.includes(status)){
        throw new Error(`Invalid lead status: "${status}" (must be one of ${STATUSES.join(", ")})`);
    }

    requireEntry(leadId);

    const updated = memory.update(leadId, { metadata: { status } });

    return updated.metadata.status;

}


// interaction: { type (e.g. "call"/"email"/"meeting"), summary }
function logInteraction(leadId, interaction = {}){

    if(!interaction.type || !interaction.summary){
        throw new Error("An interaction needs a type and a summary");
    }

    const entry = requireEntry(leadId);

    const interactions = [
        ...(entry.metadata.interactions || []),
        { type: interaction.type, summary: interaction.summary, timestamp: new Date().toISOString() }
    ];

    const updated = memory.update(leadId, { metadata: { interactions } });

    return updated.metadata.interactions;

}


// signals: partial {budget, authority, need, timeline} booleans -- BANT-
// style qualification, merged into whatever's already set (same
// merge-not-replace convention core/executive/companyManager.js's
// setBrandProfile() already established).
function setSignals(leadId, signals = {}){

    const entry = requireEntry(leadId);
    const current = entry.metadata.signals || { budget: false, authority: false, need: false, timeline: false };

    const merged = { ...current, ...signals };

    const updated = memory.update(leadId, { metadata: { signals: merged } });

    return updated.metadata.signals;

}


// Deterministic, explainable scoring (0-100, clamped): contact
// completeness, real engagement (interaction count and recency), and
// explicit BANT signals -- every point traces back to a real, visible
// reason, not a model's guess.
function scoreLead(leadId){

    const entry = requireEntry(leadId);
    const meta = entry.metadata;

    const reasons = [];
    let score = 0;

    if(meta.email){ score += 10; reasons.push("+10 has an email on file"); }
    if(meta.phone){ score += 5; reasons.push("+5 has a phone number on file"); }
    if(meta.organization){ score += 10; reasons.push("+10 organization identified"); }

    const interactions = meta.interactions || [];
    const interactionPoints = Math.min(interactions.length * 5, 20);

    if(interactionPoints > 0){
        score += interactionPoints;
        reasons.push(`+${interactionPoints} ${interactions.length} logged interaction(s)`);
    }

    const mostRecent = interactions
        .map(i => new Date(i.timestamp).getTime())
        .sort((a, b) => b - a)[0];

    if(Number.isFinite(mostRecent) && (Date.now() - mostRecent) <= RECENT_INTERACTION_MS){
        score += 15;
        reasons.push("+15 interacted with in the last 7 days");
    }

    const signals = meta.signals || {};
    const signalLabels = { budget: "Budget", authority: "Authority", need: "Need", timeline: "Timeline" };

    for(const [key, label] of Object.entries(signalLabels)){
        if(signals[key]){
            score += 10;
            reasons.push(`+10 ${label} confirmed`);
        }
    }

    score = Math.min(100, score);

    const updated = memory.update(leadId, { metadata: { score, scoreReasons: reasons } });

    return { score: updated.metadata.score, reasons: updated.metadata.scoreReasons };

}


module.exports = {
    LEAD_TAG,
    STATUSES,
    createLead,
    listLeads,
    getLead,
    setStatus,
    logInteraction,
    setSignals,
    scoreLead
};
