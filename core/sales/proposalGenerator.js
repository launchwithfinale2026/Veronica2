// ==================================
// VERONICA SALES PROPOSAL GENERATOR
// ==================================
//
// Phase 42 (Sales Division production-readiness). Real proposal
// drafting for an opportunity, routed through the same
// core/intelligence.think() reasoning path core/marketing/
// contentGenerator.js already established this pattern for (a fixed
// synthetic agent identity, a task-shaped mission, `useTools: false`).
// Genuinely functional -- Claude is already the configured provider in
// this environment -- not a fabricated placeholder.

const IntelligenceEngine = require("../intelligence");
const opportunities = require("./opportunities");
const CompanyManager = require("../executive/companyManager");

const PROPOSAL_AGENT = {
    name: "ACCOUNT MANAGER",
    role: "Sales Proposal Writer",
    capabilities: ["proposal generation", "account management"]
};


function draftPrompt({ opportunity, brandProfile }){

    const contactsList = opportunity.contacts.length
        ? opportunity.contacts.map(c => `${c.name}${c.role ? ` (${c.role})` : ""}`).join(", ")
        : "none listed yet";

    return `Write a real, client-ready sales proposal for the following opportunity.

Opportunity: ${opportunity.name}
Deal value: ${opportunity.value}
Pipeline stage: ${opportunity.stage}
Contacts: ${contactsList}

Company positioning:
- Mission: ${brandProfile.mission || "not specified"}
- Voice tone: ${brandProfile.voice.tone || "clear, professional"}
- Avoid: ${(brandProfile.voice.doNots || []).join(", ") || "nothing specific"}

Return ONLY the proposal text -- no preamble, no explanation, no markdown fences.`;

}


// intelligence: optional IntelligenceEngine instance (same optionality
// pattern contentGenerator.js/core/learning/engine.js already use).
async function generateProposal(opportunityId, { intelligence } = {}){

    const opportunity = opportunities.getOpportunity(opportunityId);
    const companyManager = new CompanyManager();
    const brandProfile = companyManager.getBrandProfile(opportunity.companyId);

    const engine = intelligence || new IntelligenceEngine();

    const mission = {
        task: draftPrompt({ opportunity, brandProfile }),
        opportunityId
    };

    const thought = await engine.think(
        PROPOSAL_AGENT,
        mission,
        { useTools: false, companyId: opportunity.companyId }
    );

    const proposalDraft = thought.cognition.response.response.trim();

    opportunities.setProposalDraft(opportunityId, proposalDraft);

    return proposalDraft;

}


module.exports = { generateProposal, PROPOSAL_AGENT };
