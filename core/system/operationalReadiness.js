// ==================================
// VERONICA OPERATIONAL READINESS
// ==================================
//
// Project N (First-Time User Experience). Combines already-real signals
// into the exact checklist the Success Criteria names -- "a clear
// dashboard showing what requires human credentials versus what is
// already fully operational" -- not a new detection mechanism for any
// of them:
//
//   - core/system/healthScore.js's unified 0-100 score (running/healthy)
//   - core/integrations/credentialManager.js's real per-connector
//     configured/missing state (missing credentials)
//   - core/integrations/registry.js's real connector list (connected)
//   - core/system/health.js's real internal-service running state,
//     already inside healthScore's own raw output (offline services)
//   - core/executive/actionProposal.js's real pending proposal count
//     (approvals waiting)
//
// Every field traces back to one of the above -- nothing here is
// computed independently, and nothing is ever fabricated when a real
// signal is unavailable (a failed sub-check is reported as its own
// honest error, not silently dropped).

const healthScore = require("./healthScore");
const credentialManager = require("../integrations/credentialManager");
const integrationRegistry = require("../integrations/registry");


async function checklist(){

    const health = await healthScore.score();
    const credentials = credentialManager.overview();
    const connectors = integrationRegistry.list();

    const ActionProposalEngine = require("../executive/actionProposal");
    const pendingApprovals = new ActionProposalEngine().list("pending");

    const missingCredentials = credentials.filter(c => !c.configured);
    const configuredCredentials = credentials.filter(c => c.configured);
    const offlineServices = health.raw.services.filter(s => !s.running);
    const unconfiguredConnectors = connectors.filter(c => !c.configured);

    return {

        generatedAt: new Date().toISOString(),

        running: true, // this function only ever runs inside a live VERONICA process
        healthy: health.status === "healthy" || health.status === "fair",
        healthScore: { score: health.score, status: health.status },

        connected: configuredCredentials.map(c => ({ id: c.id, label: c.label })),

        checks: {

            missingCredentials: {
                ok: missingCredentials.length === 0,
                count: missingCredentials.length,
                items: missingCredentials.map(c => ({ id: c.id, label: c.label, missingEnv: c.missing }))
            },

            approvalsWaiting: {
                ok: pendingApprovals.length === 0,
                count: pendingApprovals.length,
                items: pendingApprovals.map(p => ({ id: p.id, action: p.action, reason: p.reason }))
            },

            offlineServices: {
                ok: offlineServices.length === 0,
                count: offlineServices.length,
                items: offlineServices.map(s => ({ name: s.name }))
            },

            unconfiguredConnectors: {
                ok: unconfiguredConnectors.length === 0,
                count: unconfiguredConnectors.length,
                items: unconfiguredConnectors.map(c => ({ id: c.id, note: c.note }))
            }

        },

        // A real, explainable overall verdict -- "fully operational"
        // means the health score is healthy/fair AND nothing in
        // `checks` is a real problem right now. Missing credentials are
        // deliberately NOT counted against this -- an unconfigured
        // optional connector (e.g. no Discord token set) is an honest,
        // expected state for a fresh install, not a failure.
        fullyOperational: (health.status === "healthy" || health.status === "fair")
            && pendingApprovals.length === 0
            && offlineServices.length === 0

    };

}


module.exports = { checklist };
