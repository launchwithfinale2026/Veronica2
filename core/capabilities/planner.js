// ==================================
// VERONICA CAPABILITY PLANNER
// ==================================
//
// Phase 20. The "Intent Understanding -> Capability Analysis -> Missing
// Capability Detection -> Installation Plan" steps of the install
// pipeline described in this phase's own ask -- given a free-text
// objective ("create a trading division"), works out which capabilities
// that implies, checks them against what's actually installed (see
// registry.js), and returns a plain, explainable plan.
//
// Deliberately rule-based (a static domain -> capability catalog,
// matched by keyword), not an LLM call -- same reasoning as
// core/executive/executiveRecommendations.js and blockerDetection.js:
// this is a small, closed, explainable decision ("does the objective
// mention a known domain"), not a task that benefits from a model's
// judgment. A real deployment can grow CAPABILITY_CATALOG with more
// domains; nothing else in this file needs to change.

const registry = require("./registry");

// Each entry's capability list is intentionally the same kind of plain-
// English list this phase's own example interaction showed ("Market
// intelligence / Strategy analysis / Risk management / Portfolio
// tracking / Reporting") -- not yet real installed capability NAMES
// (those come from an actual package's manifest.json once one is built
// for the domain, e.g. packages/example/ as the reference template).
const CAPABILITY_CATALOG = {
    trading: ["market intelligence", "strategy analysis", "risk management", "portfolio tracking", "reporting"],
    marketing: ["campaign management", "content creation", "audience research", "analytics"],
    finance: ["bookkeeping", "forecasting", "compliance", "reporting"],
    research: ["information synthesis", "data collection", "analysis"],
    real_estate: ["listing analysis", "market comparables", "document management"]
};


function detectDomain(objective){

    const lower = objective.toLowerCase();

    return Object.keys(CAPABILITY_CATALOG).find(domain =>
        lower.includes(domain.replace(/_/g, " ")) || lower.includes(domain)
    ) || null;

}


// A capability is considered "present" if any installed capability's
// name or description mentions it -- a plain substring match, same
// explainability tradeoff as the domain match above: no fuzzy scoring
// to second-guess, just a real, inspectable reason.
function isCapabilityPresent(capability){

    const installed = registry.list();

    return installed.some(entry =>
        entry.name.toLowerCase().includes(capability) ||
        (entry.description || "").toLowerCase().includes(capability)
    );

}


function analyzeRequest(objective){

    if(!objective){
        throw new Error("An objective is required");
    }

    const domain = detectDomain(objective);

    if(!domain){
        return {
            objective,
            domain: null,
            requiredCapabilities: [],
            missingCapabilities: [],
            plan: "No known capability domain matched this objective -- extend CAPABILITY_CATALOG in core/capabilities/planner.js, or describe the required capabilities explicitly."
        };
    }

    const required = CAPABILITY_CATALOG[domain];
    const missing = required.filter(capability => !isCapabilityPresent(capability));

    const plan = missing.length
        ? `Missing capability detected: ${missing.join(", ")}. Build a new package (see packages/example/ for the reference template) declaring these in its manifest.json, then install it via core/capabilities/installer.js's install().`
        : `All capabilities associated with "${domain}" already appear to be installed.`;

    return {
        objective,
        domain,
        requiredCapabilities: required,
        missingCapabilities: missing,
        plan
    };

}


module.exports = { analyzeRequest, detectDomain, CAPABILITY_CATALOG };
