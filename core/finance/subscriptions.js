// ==================================
// VERONICA FINANCE SUBSCRIPTION ENGINE
// ==================================
//
// Phase 43 (Finance Division production-readiness). A subscription is
// an ordinary memory entry (type "businesses", tagged company:<id> +
// "finance-subscription"), same pattern as every other company-scoped
// entity here. This is what makes real MRR/ARR possible -- recurring
// revenue is a genuinely different concept from a one-time
// recordFinance() entry (which is a single point-in-time transaction,
// not an ongoing commitment).

const memory = require("../memory");
const knowledge = require("../knowledge");

const SUBSCRIPTION_TAG = "finance-subscription";

const INTERVALS = ["monthly", "annual"];

const STATUSES = ["active", "canceled"];


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


function toSubscription(entry){

    const meta = entry.metadata || {};

    return {
        id: entry.id,
        companyId: meta.companyId,
        clientName: meta.clientName,
        amount: meta.amount,
        interval: meta.interval,
        status: meta.status || "active",
        created: entry.created,
        updated: entry.updated
    };

}


function requireEntry(id){

    const entry = memory.view().find(m => m.id === id && (m.tags || []).includes(SUBSCRIPTION_TAG));

    if(!entry){
        throw new Error(`Unknown subscription: "${id}"`);
    }

    return entry;

}


// input: { companyId, clientName, amount, interval ("monthly"/"annual") }
function createSubscription(input = {}){

    if(!input.companyId){
        throw new Error("A companyId is required");
    }

    if(!input.clientName){
        throw new Error("A clientName is required");
    }

    if(!Number.isFinite(input.amount)){
        throw new Error("A numeric amount is required");
    }

    if(!INTERVALS.includes(input.interval)){
        throw new Error(`Invalid interval: "${input.interval}" (must be one of ${INTERVALS.join(", ")})`);
    }

    const company = requireCompanyExists(input.companyId);

    const entry = memory.remember({
        content: `Subscription for ${input.clientName}`,
        type: "businesses",
        importance: 4,
        tags: [SUBSCRIPTION_TAG, `company:${input.companyId}`],
        source: "finance-subscriptions",
        metadata: {
            companyId: input.companyId,
            clientName: input.clientName,
            amount: input.amount,
            interval: input.interval,
            status: "active"
        }
    });

    // Phase 49 (Organizational Knowledge Graph): same reasoning as
    // core/finance/invoices.js -- the client is the real, uniquely-named
    // entity; the subscription record's own name is not unique per
    // client.
    knowledge.addEntity({ name: input.clientName, type: "client" });
    knowledge.addRelationship({ from: input.clientName, to: company.content, type: "billedBy" });

    return toSubscription(entry);

}


function listSubscriptions(companyId){

    return memory.filter({ tag: SUBSCRIPTION_TAG })
        .filter(entry => (entry.tags || []).includes(`company:${companyId}`))
        .map(toSubscription);

}


function cancelSubscription(subscriptionId){

    requireEntry(subscriptionId);

    const updated = memory.update(subscriptionId, { metadata: { status: "canceled" } });

    return updated.metadata.status;

}


// Real, deterministic Monthly Recurring Revenue: every active
// subscription's amount, normalized to a monthly figure (annual / 12).
// Canceled subscriptions are correctly excluded.
function mrr(companyId){

    return listSubscriptions(companyId)
        .filter(subscription => subscription.status === "active")
        .reduce((sum, subscription) =>
            sum + (subscription.interval === "annual" ? subscription.amount / 12 : subscription.amount),
        0);

}


function arr(companyId){
    return mrr(companyId) * 12;
}


module.exports = {
    SUBSCRIPTION_TAG,
    INTERVALS,
    STATUSES,
    createSubscription,
    listSubscriptions,
    cancelSubscription,
    mrr,
    arr
};
