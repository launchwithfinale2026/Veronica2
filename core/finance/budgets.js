// ==================================
// VERONICA FINANCE BUDGET ENGINE
// ==================================
//
// Phase 43 (Finance Division production-readiness). A budget is an
// ordinary memory entry (type "businesses", tagged company:<id> +
// "finance-budget"), the same pattern every other company-scoped entity
// in this codebase already uses. Deliberately does NOT duplicate a
// ledger -- core/executive/companyManager.js's recordFinance()/
// financialSummary() already IS the real ledger (Phase 2); this module
// just compares a budget's limit against the real expense entries
// already recorded there, filtered by the optional `category` field
// recordFinance() gained specifically to support this.

const memory = require("../memory");

const BUDGET_TAG = "finance-budget";


function requireCompanyExists(companyId){

    const CompanyManager = require("../executive/companyManager");

    const entry = memory.view().find(
        m => m.id === companyId && (m.tags || []).includes(CompanyManager.TAG)
    );

    if(!entry){
        throw new Error(`Unknown company: "${companyId}"`);
    }

}


function toBudget(entry){

    const meta = entry.metadata || {};

    return {
        id: entry.id,
        companyId: meta.companyId,
        category: meta.category,
        period: meta.period,
        limit: meta.limit,
        created: entry.created,
        updated: entry.updated
    };

}


function requireEntry(id){

    const entry = memory.view().find(m => m.id === id && (m.tags || []).includes(BUDGET_TAG));

    if(!entry){
        throw new Error(`Unknown budget: "${id}"`);
    }

    return entry;

}


// input: { companyId, category, period (a real calendar month, "YYYY-MM"), limit }
function createBudget(input = {}){

    if(!input.companyId){
        throw new Error("A companyId is required");
    }

    if(!input.category){
        throw new Error("A category is required");
    }

    if(!input.period){
        throw new Error("A period (\"YYYY-MM\") is required");
    }

    if(!Number.isFinite(input.limit)){
        throw new Error("A numeric limit is required");
    }

    requireCompanyExists(input.companyId);

    const entry = memory.remember({
        content: `${input.category} budget for ${input.period}`,
        type: "businesses",
        importance: 3,
        tags: [BUDGET_TAG, `company:${input.companyId}`],
        source: "finance-budgets",
        metadata: {
            companyId: input.companyId,
            category: input.category,
            period: input.period,
            limit: input.limit
        }
    });

    return toBudget(entry);

}


function listBudgets(companyId){

    return memory.filter({ tag: BUDGET_TAG })
        .filter(entry => (entry.tags || []).includes(`company:${companyId}`))
        .map(toBudget);

}


function getBudget(budgetId){
    return toBudget(requireEntry(budgetId));
}


// A period is always "YYYY-MM" -- a real calendar month, matched
// against a finance entry's ISO timestamp by string prefix. No fuzzy
// date-range logic.
function inPeriod(timestamp, period){
    return typeof timestamp === "string" && timestamp.startsWith(period);
}


// Real spend-vs-limit for every one of a company's budgets, reusing
// CompanyManager's existing finances ledger directly (not a parallel
// expense store) -- actual spend is the sum of "expense"-type entries
// whose category matches the budget's category and whose timestamp
// falls within the budget's period.
function budgetStatus(companyId){

    const CompanyManager = require("../executive/companyManager");
    const company = new CompanyManager().getCompany(companyId);

    return listBudgets(companyId).map(budget => {

        const actualSpend = company.finances
            .filter(entry =>
                entry.type === "expense" &&
                entry.category === budget.category &&
                inPeriod(entry.timestamp, budget.period)
            )
            .reduce((sum, entry) => sum + entry.amount, 0);

        return {
            ...budget,
            actualSpend,
            remaining: budget.limit - actualSpend,
            overBudget: actualSpend > budget.limit
        };

    });

}


module.exports = { BUDGET_TAG, createBudget, listBudgets, getBudget, budgetStatus };
