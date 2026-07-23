// ==================================
// VERONICA FINANCE REPORTING ENGINE
// ==================================
//
// Phase 43 (Finance Division production-readiness). Cash-flow
// reporting, Runway calculations, Forecasting, and Financial KPIs --
// all deterministic and explainable (matching this codebase's standing
// rule-based-where-explainable principle, see
// core/executive/planner.js), computed entirely from
// core/executive/companyManager.js's real ledger
// (recordFinance()/financialSummary()) plus core/finance/subscriptions.js
// and core/finance/invoices.js. No banking connection of any kind --
// deliberately out of scope (see docs/EXTERNAL_DEPENDENCIES.md) -- every
// number here comes from what's actually been recorded in VERONICA,
// never pulled from a real bank.

const CompanyManager = require("../executive/companyManager");
const subscriptions = require("./subscriptions");
const invoices = require("./invoices");


// Groups a company's real ledger entries into real monthly revenue/
// expense/net -- a historical rollup, not a projection (see forecast()
// below for that).
function cashFlow(companyId, { months = 6 } = {}){

    const companyManager = new CompanyManager();
    const finances = companyManager.getCompany(companyId).finances;

    const byMonth = {};

    for(const entry of finances){

        const month = entry.timestamp.slice(0, 7);

        if(!byMonth[month]){
            byMonth[month] = { month, revenue: 0, expense: 0 };
        }

        if(entry.type === "revenue"){
            byMonth[month].revenue += entry.amount;
        } else {
            byMonth[month].expense += entry.amount;
        }

    }

    return Object.keys(byMonth)
        .sort()
        .slice(-months)
        .map(month => ({ ...byMonth[month], net: byMonth[month].revenue - byMonth[month].expense }));

}


// Runway: cash on hand (the ledger's all-time net) divided by average
// monthly burn (the average NEGATIVE net across the last `months` of
// real cash flow). If the recent average net is zero or positive
// (profitable/breakeven), runway is genuinely infinite -- this returns
// a real "profitable" status and a null runwayMonths, never a
// fabricated number pretending to answer a question that doesn't apply.
function runway(companyId, { months = 3 } = {}){

    const companyManager = new CompanyManager();
    const cashOnHand = companyManager.getCompany(companyId).financialSummary.net;

    const flow = cashFlow(companyId, { months });

    if(!flow.length){
        return { cashOnHand, avgMonthlyBurn: 0, runwayMonths: null, status: "no_data" };
    }

    const avgNet = flow.reduce((sum, entry) => sum + entry.net, 0) / flow.length;

    if(avgNet >= 0){
        return { cashOnHand, avgMonthlyBurn: 0, runwayMonths: null, status: "profitable" };
    }

    const avgMonthlyBurn = -avgNet;

    return {
        cashOnHand,
        avgMonthlyBurn,
        runwayMonths: cashOnHand > 0 ? cashOnHand / avgMonthlyBurn : 0,
        status: "burning"
    };

}


// A simple, deterministic linear extrapolation of the recent average
// monthly net trend forward -- explainable arithmetic, not an ML model
// or an LLM guessing at future revenue.
function forecast(companyId, { months = 3, lookbackMonths = 3 } = {}){

    const flow = cashFlow(companyId, { months: lookbackMonths });
    const avgMonthlyNetTrend = flow.length
        ? flow.reduce((sum, entry) => sum + entry.net, 0) / flow.length
        : 0;

    const companyManager = new CompanyManager();
    let projectedCash = companyManager.getCompany(companyId).financialSummary.net;

    const projection = [];

    for(let i = 1; i <= months; i++){

        projectedCash += avgMonthlyNetTrend;

        projection.push({
            monthsFromNow: i,
            projectedNet: avgMonthlyNetTrend,
            projectedCashOnHand: projectedCash
        });

    }

    return { avgMonthlyNetTrend, projection };

}


// Financial KPIs -- combines the real ledger summary, real MRR/ARR,
// real accounts receivable, and real runway in one call.
function kpis(companyId){

    const companyManager = new CompanyManager();
    const financialSummary = companyManager.getCompany(companyId).financialSummary;

    return {
        financialSummary,
        mrr: subscriptions.mrr(companyId),
        arr: subscriptions.arr(companyId),
        accountsReceivable: invoices.accountsReceivable(companyId),
        runway: runway(companyId)
    };

}


module.exports = { cashFlow, runway, forecast, kpis };
