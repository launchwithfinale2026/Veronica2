// ==================================
// VERONICA CAPABILITY PLANNER
// ==================================
//
// Phase 20 (Capability Analysis) + Phase 28 (Capability Planner
// extension). The "Intent Understanding -> Capability Analysis ->
// Missing Capability Detection -> Installation Plan" steps of the
// install pipeline -- given a free-text objective ("create a trading
// division"), works out which capabilities that implies, checks them
// against what's actually installed (see registry.js), and returns a
// plain, explainable plan. Phase 28 adds what a real plan needs beyond
// "here's what's missing": a dependency graph between capabilities
// within a domain, required agents/APIs/permissions, a risk assessment,
// and a rough build-time estimate.
//
// Deliberately rule-based (a static domain -> capability catalog,
// matched by keyword), not an LLM call -- same reasoning as
// core/executive/executiveRecommendations.js and blockerDetection.js:
// this is a small, closed, explainable decision, not a task that
// benefits from a model's judgment. A real deployment can grow
// CAPABILITY_CATALOG with more domains; nothing else in this file needs
// to change.
//
// Backward compatible with Phase 20's original analyzeRequest() output
// shape (domain/requiredCapabilities/missingCapabilities/plan, all
// exactly as before -- requiredCapabilities/missingCapabilities are
// still plain string arrays of capability names) -- every Phase 28
// field is additive.

const registry = require("./registry");

// Each domain's capabilities now carry real planning metadata, not just
// a name -- requiredAgentRole (a suggested agent for the eventual
// package, matching Phase 27's builder.js agent-generation shape),
// requiredAPIs (external services a real implementation would need),
// dependsOn (other capability NAMES in this same domain that should
// exist first), risk (explainable, not scored), and estimatedDays (a
// rough, stated-as-rough build estimate). `permissions` is domain-wide
// (matches Phase 20's manifest.json `permissions` field shape).
const CAPABILITY_CATALOG = {

    trading: {
        permissions: ["external_api", "financial_execution"],
        capabilities: [
            { name: "market intelligence", requiredAgentRole: "Market Analyst", requiredAPIs: ["market data API"], dependsOn: [], risk: "low", estimatedDays: 3 },
            { name: "strategy analysis", requiredAgentRole: "Strategy Analyst", requiredAPIs: [], dependsOn: ["market intelligence"], risk: "medium", estimatedDays: 5 },
            { name: "risk management", requiredAgentRole: "Risk Analyst", requiredAPIs: [], dependsOn: ["strategy analysis"], risk: "high", estimatedDays: 4 },
            { name: "portfolio tracking", requiredAgentRole: "Portfolio Manager", requiredAPIs: ["broker API"], dependsOn: ["risk management"], risk: "medium", estimatedDays: 3 },
            { name: "reporting", requiredAgentRole: "Reporting Agent", requiredAPIs: [], dependsOn: ["portfolio tracking"], risk: "low", estimatedDays: 2 }
        ]
    },

    marketing: {
        permissions: ["external_api"],
        capabilities: [
            { name: "campaign management", requiredAgentRole: "Campaign Manager", requiredAPIs: ["ad platform API"], dependsOn: [], risk: "medium", estimatedDays: 4 },
            { name: "content creation", requiredAgentRole: "Content Strategist", requiredAPIs: [], dependsOn: [], risk: "low", estimatedDays: 3 },
            { name: "audience research", requiredAgentRole: "Research Analyst", requiredAPIs: ["analytics API"], dependsOn: [], risk: "low", estimatedDays: 3 },
            { name: "analytics", requiredAgentRole: "Analytics Agent", requiredAPIs: ["analytics API"], dependsOn: ["audience research"], risk: "medium", estimatedDays: 3 }
        ]
    },

    finance: {
        permissions: ["financial_data"],
        capabilities: [
            { name: "bookkeeping", requiredAgentRole: "Bookkeeper", requiredAPIs: [], dependsOn: [], risk: "medium", estimatedDays: 4 },
            { name: "forecasting", requiredAgentRole: "Financial Analyst", requiredAPIs: [], dependsOn: ["bookkeeping"], risk: "medium", estimatedDays: 4 },
            { name: "compliance", requiredAgentRole: "Compliance Officer", requiredAPIs: [], dependsOn: ["bookkeeping"], risk: "high", estimatedDays: 5 },
            { name: "reporting", requiredAgentRole: "Reporting Agent", requiredAPIs: [], dependsOn: ["forecasting", "compliance"], risk: "low", estimatedDays: 2 }
        ]
    },

    research: {
        permissions: ["external_api"],
        capabilities: [
            { name: "information synthesis", requiredAgentRole: "Research Agent", requiredAPIs: [], dependsOn: [], risk: "low", estimatedDays: 3 },
            { name: "data collection", requiredAgentRole: "Research Agent", requiredAPIs: ["web fetch"], dependsOn: [], risk: "low", estimatedDays: 2 },
            { name: "analysis", requiredAgentRole: "Analysis Agent", requiredAPIs: [], dependsOn: ["information synthesis", "data collection"], risk: "low", estimatedDays: 3 }
        ]
    },

    real_estate: {
        permissions: ["external_api"],
        capabilities: [
            { name: "listing analysis", requiredAgentRole: "Listings Analyst", requiredAPIs: ["MLS API"], dependsOn: [], risk: "medium", estimatedDays: 4 },
            { name: "market comparables", requiredAgentRole: "Market Analyst", requiredAPIs: ["MLS API"], dependsOn: ["listing analysis"], risk: "medium", estimatedDays: 4 },
            { name: "document management", requiredAgentRole: "Document Manager", requiredAPIs: [], dependsOn: [], risk: "low", estimatedDays: 3 }
        ]
    },

    // Phase 39's own worked example ("Build a recruiting department") --
    // added for real, same structure/reasoning as every other domain
    // above, not a special case.
    recruiting: {
        permissions: ["read"],
        capabilities: [
            { name: "candidate sourcing", requiredAgentRole: "Sourcing Specialist", requiredAPIs: ["job board API"], dependsOn: [], risk: "low", estimatedDays: 3 },
            { name: "candidate screening", requiredAgentRole: "Recruiting Screener", requiredAPIs: [], dependsOn: ["candidate sourcing"], risk: "medium", estimatedDays: 3 },
            { name: "interview coordination", requiredAgentRole: "Interview Coordinator", requiredAPIs: ["calendar API"], dependsOn: ["candidate screening"], risk: "low", estimatedDays: 2 },
            { name: "offer management", requiredAgentRole: "Offer Manager", requiredAPIs: [], dependsOn: ["interview coordination"], risk: "medium", estimatedDays: 2 }
        ]
    }

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


// A plain {nodes, edges} graph -- nodes are capability names, edges are
// {from, to} pairs meaning "from depends on to" (matches dependsOn's own
// direction). Deliberately not rendered/laid out here -- that's a
// dashboard/visualization concern; this just describes the real
// relationships.
function buildDependencyGraph(capabilities){

    const nodes = capabilities.map(c => c.name);
    const edges = capabilities.flatMap(c => c.dependsOn.map(dep => ({ from: c.name, to: dep })));

    return { nodes, edges };

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
            plan: "No known capability domain matched this objective -- extend CAPABILITY_CATALOG in core/capabilities/planner.js, or describe the required capabilities explicitly.",
            permissions: [],
            requiredAgents: [],
            requiredAPIs: [],
            dependencyGraph: { nodes: [], edges: [] },
            riskAssessment: { overall: null, byCapability: {} },
            estimatedBuildDays: 0
        };
    }

    const { capabilities, permissions } = CAPABILITY_CATALOG[domain];

    const required = capabilities.map(c => c.name);
    const missingCapabilities = capabilities.filter(c => !isCapabilityPresent(c.name));
    const missing = missingCapabilities.map(c => c.name);

    const plan = missing.length
        ? `Missing capability detected: ${missing.join(", ")}. Build a new package (see packages/example/ for the reference template, or core/capabilities/builder.js to generate a skeleton) declaring these in its manifest.json, then install it via core/capabilities/installer.js's install().`
        : `All capabilities associated with "${domain}" already appear to be installed.`;

    const riskOrder = { low: 0, medium: 1, high: 2 };
    const byCapabilityRisk = Object.fromEntries(missingCapabilities.map(c => [c.name, c.risk]));
    const overallRisk = missingCapabilities.length
        ? Object.keys(riskOrder).find(level => riskOrder[level] === Math.max(...missingCapabilities.map(c => riskOrder[c.risk])))
        : null;

    return {
        objective,
        domain,
        requiredCapabilities: required,
        missingCapabilities: missing,
        plan,

        // Phase 28 additions -- all derived from the SAME catalog entry
        // above, nothing computed twice.
        permissions,
        requiredAgents: [...new Set(missingCapabilities.map(c => c.requiredAgentRole))],
        requiredAPIs: [...new Set(missingCapabilities.flatMap(c => c.requiredAPIs))],
        dependencyGraph: buildDependencyGraph(capabilities),
        riskAssessment: { overall: overallRisk, byCapability: byCapabilityRisk },
        estimatedBuildDays: missingCapabilities.reduce((sum, c) => sum + c.estimatedDays, 0)

    };

}


module.exports = { analyzeRequest, detectDomain, CAPABILITY_CATALOG };
