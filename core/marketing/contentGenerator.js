// ==================================
// VERONICA MARKETING CONTENT GENERATOR
// ==================================
//
// Phase 41 (Marketing Division production-readiness). Real content
// drafting for a campaign's scheduled content item -- routed through
// the same core/intelligence.think() reasoning path every other agent
// reasoning call already uses, following the exact pattern
// core/learning/engine.js's synthesizeRecommendations() established
// (a fixed synthetic agent identity, a task-shaped mission, `useTools:
// false` since drafting copy needs no tool access). Not a raw
// core/brain call, and not a fabricated placeholder -- Claude is
// already the configured provider in this environment (see
// docs/EXTERNAL_DEPENDENCIES.md), so this is genuinely functional
// content generation, gated on nothing beyond the LLM connection every
// other reasoning call already depends on.

const IntelligenceEngine = require("../intelligence");
const campaigns = require("./campaigns");
const CompanyManager = require("../executive/companyManager");

const CONTENT_AGENT = {
    name: "CONTENT STRATEGIST",
    role: "Marketing Content Strategist",
    capabilities: ["content creation", "brand voice", "copywriting"]
};


function draftPrompt({ campaign, item, brandProfile }){

    return `Write real, publish-ready marketing copy for the following content item.

Platform: ${item.platform}
What this content should cover: ${item.description}
Campaign objective: ${campaign.objective}
Target audience: ${campaign.audience || brandProfile.audience || "general audience"}

Brand voice:
- Tone: ${brandProfile.voice.tone || "not specified -- use a clear, professional tone"}
- Style: ${brandProfile.voice.style || "not specified"}
- Avoid: ${(brandProfile.voice.doNots || []).join(", ") || "nothing specific"}

Return ONLY the content copy itself -- no preamble, no explanation, no markdown fences.`;

}


// intelligence: optional IntelligenceEngine instance, for callers (tests,
// or a future caller that wants to reuse one already-constructed engine
// instead of paying its constructor cost -- Intelligence's own
// constructor builds a fresh Brain + ContextEngine) -- defaults to a new
// one, same optionality pattern core/learning/engine.js's constructor
// already establishes for the same reason.
async function generateDraft(campaignId, itemId, { intelligence } = {}){

    const campaign = campaigns.getCampaign(campaignId);
    const item = campaign.contentSchedule.find(scheduled => scheduled.id === itemId);

    if(!item){
        throw new Error(`Unknown content schedule item: "${itemId}"`);
    }

    const companyManager = new CompanyManager();
    const brandProfile = companyManager.getBrandProfile(campaign.companyId);

    const engine = intelligence || new IntelligenceEngine();

    const mission = {
        task: draftPrompt({ campaign, item, brandProfile }),
        campaignId,
        itemId
    };

    const thought = await engine.think(
        CONTENT_AGENT,
        mission,
        { useTools: false, companyId: campaign.companyId }
    );

    const draftContent = thought.cognition.response.response.trim();

    campaigns.updateContentItem(campaignId, itemId, { draftContent, status: "drafted" });

    return draftContent;

}


module.exports = { generateDraft, CONTENT_AGENT };
