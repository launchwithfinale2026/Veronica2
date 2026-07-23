// ==================================
// VERONICA SALES OPPORTUNITY / PIPELINE ENGINE
// ==================================
//
// Phase 42 (Sales Division production-readiness). An opportunity is an
// ordinary memory entry (type "businesses", tagged company:<id> +
// "sales-opportunity"), the same pattern core/sales/leads.js and
// core/marketing/campaigns.js already established. This is the Pipeline
// Stages model, Follow-up Scheduling, Contact Management, and
// Forecasting the Sales Division spec asks for, all in one module since
// they all operate on the same real entity (an opportunity moving
// through a pipeline) rather than being separate stores.

const memory = require("../memory");
const knowledge = require("../knowledge");

const OPPORTUNITY_TAG = "sales-opportunity";

const STAGES = ["prospecting", "qualified", "proposal", "negotiation", "closed_won", "closed_lost"];

// Deterministic, explainable weighting for forecast() below -- the
// probability a deal at this stage actually closes. Not a model's
// guess: a fixed, documented table any operator can read and adjust.
const STAGE_PROBABILITY = {
    prospecting: 0.1,
    qualified: 0.25,
    proposal: 0.5,
    negotiation: 0.75,
    closed_won: 1,
    closed_lost: 0
};

const CLOSED_STAGES = ["closed_won", "closed_lost"];


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


function toOpportunity(entry){

    const meta = entry.metadata || {};

    return {
        id: entry.id,
        companyId: meta.companyId,
        leadId: meta.leadId || null,
        name: entry.content,
        value: typeof meta.value === "number" ? meta.value : 0,
        stage: meta.stage || "prospecting",
        stageHistory: meta.stageHistory || [],
        closeDate: meta.closeDate || null,
        contacts: meta.contacts || [],
        followUps: meta.followUps || [],
        proposalDraft: meta.proposalDraft || null,
        winReason: meta.winReason || null,
        lossReason: meta.lossReason || null,
        lessonsLearned: meta.lessonsLearned || [],
        created: entry.created,
        updated: entry.updated
    };

}


function requireEntry(id){

    const entry = memory.view().find(m => m.id === id && (m.tags || []).includes(OPPORTUNITY_TAG));

    if(!entry){
        throw new Error(`Unknown opportunity: "${id}"`);
    }

    return entry;

}


// input: { companyId, leadId?, name, value?, closeDate? }
function createOpportunity(input = {}){

    if(!input.companyId){
        throw new Error("A companyId is required");
    }

    if(!input.name){
        throw new Error("An opportunity name is required");
    }

    const company = requireCompanyExists(input.companyId);

    const entry = memory.remember({
        content: input.name,
        type: "businesses",
        importance: 4,
        tags: [OPPORTUNITY_TAG, `company:${input.companyId}`],
        source: "sales-opportunities",
        metadata: {
            companyId: input.companyId,
            leadId: input.leadId || null,
            value: typeof input.value === "number" ? input.value : 0,
            stage: "prospecting",
            stageHistory: [{ stage: "prospecting", at: new Date().toISOString() }],
            closeDate: input.closeDate || null,
            contacts: [],
            followUps: [],
            proposalDraft: null,
            winReason: null,
            lossReason: null,
            lessonsLearned: []
        }
    });

    knowledge.addEntity({ name: entry.content, type: "opportunity" });
    // Phase 49 (Organizational Knowledge Graph): connects the already-
    // created entity to its owning company -- previously unreachable
    // from the graph.
    knowledge.addRelationship({ from: entry.content, to: company.content, type: "belongsTo" });

    return toOpportunity(entry);

}


function listOpportunities(companyId){

    return memory.filter({ tag: OPPORTUNITY_TAG })
        .filter(entry => (entry.tags || []).includes(`company:${companyId}`))
        .map(toOpportunity);

}


function getOpportunity(opportunityId){
    return toOpportunity(requireEntry(opportunityId));
}


// Closing a deal (closed_won/closed_lost) requires a reason -- this is
// what makes win/loss analytics (core/sales/analytics.js) real rather
// than just a status flag.
function setStage(opportunityId, stage, { reason } = {}){

    if(!STAGES.includes(stage)){
        throw new Error(`Invalid stage: "${stage}" (must be one of ${STAGES.join(", ")})`);
    }

    if(CLOSED_STAGES.includes(stage) && !reason){
        throw new Error(`A reason is required when moving to "${stage}"`);
    }

    const entry = requireEntry(opportunityId);

    const stageHistory = [
        ...(entry.metadata.stageHistory || []),
        { stage, at: new Date().toISOString() }
    ];

    const patch = { stage, stageHistory };

    if(stage === "closed_won"){
        patch.winReason = reason;
    } else if(stage === "closed_lost"){
        patch.lossReason = reason;
    }

    const updated = memory.update(opportunityId, { metadata: patch });

    return toOpportunity({ ...entry, metadata: { ...entry.metadata, ...updated.metadata } });

}


// contact: { name, email?, phone?, role? } -- Contact Management: an
// opportunity's real stakeholders, not a separate global contact store
// (an opportunity is the natural scope; the same person can legitimately
// have different roles across different deals).
function addContact(opportunityId, contact = {}){

    if(!contact.name){
        throw new Error("A contact name is required");
    }

    const entry = requireEntry(opportunityId);

    const contacts = [...(entry.metadata.contacts || []), contact];

    const updated = memory.update(opportunityId, { metadata: { contacts } });

    return updated.metadata.contacts;

}


// item: { date, note } -- Follow-up Scheduling, same "append to an
// array on the real entity" pattern core/marketing/campaigns.js's
// scheduleContent() already established for its content schedule.
function scheduleFollowUp(opportunityId, item = {}){

    if(!item.date || !item.note){
        throw new Error("A follow-up needs a date and a note");
    }

    const entry = requireEntry(opportunityId);

    const followUps = [
        ...(entry.metadata.followUps || []),
        {
            id: `${opportunityId}-${(entry.metadata.followUps || []).length}`,
            date: item.date,
            note: item.note,
            done: false
        }
    ];

    const updated = memory.update(opportunityId, { metadata: { followUps } });

    return updated.metadata.followUps;

}


function completeFollowUp(opportunityId, followUpId){

    const entry = requireEntry(opportunityId);

    const followUps = (entry.metadata.followUps || []).map(item =>
        item.id === followUpId ? { ...item, done: true } : item
    );

    if(!followUps.some(item => item.id === followUpId)){
        throw new Error(`Unknown follow-up: "${followUpId}"`);
    }

    const updated = memory.update(opportunityId, { metadata: { followUps } });

    return updated.metadata.followUps.find(item => item.id === followUpId);

}


// Persists a real generated proposal draft (see
// core/sales/proposalGenerator.js) onto the opportunity it was drafted
// for -- same "the real artifact lives on the entity it belongs to"
// pattern core/marketing/campaigns.js's updateContentItem() already
// established for a content item's draft.
function setProposalDraft(opportunityId, proposalDraft){

    if(!proposalDraft){
        throw new Error("A proposal draft is required");
    }

    requireEntry(opportunityId);

    const updated = memory.update(opportunityId, { metadata: { proposalDraft } });

    return updated.metadata.proposalDraft;

}


function recordLessonLearned(opportunityId, lesson){

    if(!lesson){
        throw new Error("A lesson is required");
    }

    const entry = requireEntry(opportunityId);

    const lessonsLearned = [
        ...(entry.metadata.lessonsLearned || []),
        { lesson, timestamp: new Date().toISOString() }
    ];

    const updated = memory.update(opportunityId, { metadata: { lessonsLearned } });

    return updated.metadata.lessonsLearned;

}


// Deterministic, explainable weighted-pipeline forecast: sum of every
// OPEN opportunity's value * STAGE_PROBABILITY, plus a per-stage
// breakdown -- closed deals are excluded from the forward-looking
// forecast (closed_won is realized revenue, not a forecast; closed_lost
// is zero).
function forecast(companyId){

    const opportunities = listOpportunities(companyId).filter(o => !CLOSED_STAGES.includes(o.stage));

    const byStage = {};

    for(const stage of STAGES){
        if(CLOSED_STAGES.includes(stage)) continue;
        byStage[stage] = { count: 0, totalValue: 0, weightedValue: 0 };
    }

    let weightedTotal = 0;
    let totalOpenValue = 0;

    for(const opportunity of opportunities){

        const bucket = byStage[opportunity.stage];
        const weighted = opportunity.value * STAGE_PROBABILITY[opportunity.stage];

        bucket.count += 1;
        bucket.totalValue += opportunity.value;
        bucket.weightedValue += weighted;

        weightedTotal += weighted;
        totalOpenValue += opportunity.value;

    }

    return { totalOpenValue, weightedForecast: weightedTotal, byStage };

}


module.exports = {
    OPPORTUNITY_TAG,
    STAGES,
    STAGE_PROBABILITY,
    createOpportunity,
    listOpportunities,
    getOpportunity,
    setStage,
    addContact,
    scheduleFollowUp,
    completeFollowUp,
    setProposalDraft,
    recordLessonLearned,
    forecast
};
