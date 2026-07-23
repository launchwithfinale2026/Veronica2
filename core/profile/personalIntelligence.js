// ==================================
// VERONICA PERSONAL INTELLIGENCE ENGINE
// ==================================
//
// Phase 56. Real, evidence-cited inference about the operator's
// companies/clients/decision patterns/relationships -- NEVER invented.
// Every inference is `{ subject, inference, confidence, evidence }`:
// `evidence` is the exact real data point(s) that produced it, and
// `confidence` is a deterministic function of real sample size (more
// real evidence -> higher confidence, capped), not a black-box score an
// LLM guessed at its own certainty. An operator can dismiss any
// inference; dismissed subjects are honestly excluded from every
// future call, and the dismissal itself is a real, persisted,
// auditable record -- "allow correction," not silent suppression.
//
// Deliberately does NOT duplicate signals that already exist elsewhere
// -- inferDecisionPatterns() re-surfaces core/learning/adaptiveInsights.js's
// already-real, already-evidenced acceptance-rate data (Phase 38/47) in
// this module's inference vocabulary, rather than computing a second,
// parallel version of the same thing.

const memory = require("../memory");
const knowledge = require("../knowledge");

const DISMISSED_TAG = "personal-intelligence-dismissed";


// Deterministic, explainable confidence from real sample size -- zero
// evidence means zero confidence (no inference should ever claim
// certainty about nothing), and confidence only rises as more real
// data points accumulate, capped well short of 1.0 since this is never
// meant to claim certainty.
function confidenceFromSampleSize(n){

    if(n <= 0) return 0;
    if(n === 1) return 0.3;
    if(n < 5) return 0.5;
    if(n < 10) return 0.7;

    return 0.9;

}


function dismissedSubjects(){

    return new Set(
        memory.filter({ tag: DISMISSED_TAG }).map(entry => entry.metadata.subject)
    );

}


// Real, persisted correction -- the operator saying "no, that's not
// right" about a specific inferred subject. Future calls to every
// infer*() function below honestly exclude it, rather than VERONICA
// re-asserting an inference the operator already rejected.
function dismissInference(subject, reason){

    if(!subject){
        throw new Error("A subject is required");
    }

    return memory.remember({
        content: `Dismissed inference: ${subject}`,
        type: "decisions",
        importance: 2,
        tags: [DISMISSED_TAG],
        source: "personal-intelligence",
        metadata: { subject, reason: reason || null }
    });

}


function listDismissed(){

    return memory.filter({ tag: DISMISSED_TAG }).map(entry => ({
        subject: entry.metadata.subject,
        reason: entry.metadata.reason,
        created: entry.created
    }));

}


// Real relationships: knowledge-graph "person"/"client" entities ranked
// by their real connection count (core/knowledge/index.js's own
// connections()) -- an entity mentioned/linked more often has more real
// evidence behind it being an actually important relationship, not a
// guess about who matters.
function inferImportantRelationships({ limit = 10 } = {}){

    const dismissed = dismissedSubjects();
    const graph = knowledge.read();

    return graph.entities
        .filter(entity => ["person", "client"].includes(entity.type))
        .filter(entity => !dismissed.has(entity.name))
        .map(entity => {

            const connectionCount = knowledge.connections(entity.name).length;

            return {
                subject: entity.name,
                inference: `"${entity.name}" has real, recorded connections in the knowledge graph`,
                confidence: confidenceFromSampleSize(connectionCount),
                evidence: { type: "knowledge_graph_connections", count: connectionCount }
            };

        })
        .filter(entry => entry.confidence > 0)
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, limit);

}


// Real decision patterns: reuses core/learning/adaptiveInsights.js's
// already-real, already-evidenced proposal acceptance data wholesale --
// not a new signal computed here.
function inferDecisionPatterns(){

    const adaptiveInsights = require("../learning/adaptiveInsights");
    const dismissed = dismissedSubjects();

    return adaptiveInsights.recommendationAcceptance()
        .filter(entry => entry.total > 0 && !dismissed.has(entry.action))
        .map(entry => ({
            subject: entry.action,
            inference: `Proposals to "${entry.action}" are accepted ${entry.acceptanceRate}% of the time`,
            confidence: confidenceFromSampleSize(entry.total),
            evidence: { type: "recommendation_acceptance", total: entry.total, approved: entry.approved, executed: entry.executed, rejected: entry.rejected }
        }));

}


// Real key clients: reuses core/finance/invoices.js's/
// core/finance/subscriptions.js's real, already-recorded clientName/
// amount fields (Phase 43) -- ranked by real billing activity, not
// invented client importance.
function inferKeyClients(companyId){

    if(!companyId){
        throw new Error("A companyId is required");
    }

    const invoices = require("../finance/invoices");
    const subscriptions = require("../finance/subscriptions");
    const dismissed = dismissedSubjects();

    const byClient = {};

    // `activityCount` is real evidence volume (one invoice OR one
    // subscription each count as one real data point) -- separate from
    // `totalBilled`, which is real magnitude, not evidence volume. A
    // client with a single long-running subscription and zero invoices
    // still has real activity; counting only invoices would wrongly
    // zero out its confidence.
    for(const invoice of invoices.listInvoices(companyId)){
        byClient[invoice.clientName] = byClient[invoice.clientName] || { invoiceCount: 0, activityCount: 0, totalBilled: 0 };
        byClient[invoice.clientName].invoiceCount += 1;
        byClient[invoice.clientName].activityCount += 1;
        byClient[invoice.clientName].totalBilled += invoice.amount;
    }

    for(const subscription of subscriptions.listSubscriptions(companyId)){
        byClient[subscription.clientName] = byClient[subscription.clientName] || { invoiceCount: 0, activityCount: 0, totalBilled: 0 };
        byClient[subscription.clientName].activityCount += 1;
        byClient[subscription.clientName].totalBilled += subscription.amount;
    }

    return Object.entries(byClient)
        .filter(([client]) => !dismissed.has(client))
        .map(([client, data]) => ({
            subject: client,
            inference: `"${client}" has real, recorded billing activity (${data.invoiceCount} invoice(s), ${data.totalBilled} total billed)`,
            confidence: confidenceFromSampleSize(data.activityCount),
            evidence: { type: "billing_activity", invoiceCount: data.invoiceCount, totalBilled: data.totalBilled }
        }))
        .sort((a, b) => b.confidence - a.confidence);

}


module.exports = {
    DISMISSED_TAG,
    confidenceFromSampleSize,
    inferImportantRelationships,
    inferDecisionPatterns,
    inferKeyClients,
    dismissInference,
    listDismissed
};
