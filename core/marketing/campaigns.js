// ==================================
// VERONICA MARKETING CAMPAIGN ENGINE
// ==================================
//
// Phase 41 (Marketing Division production-readiness). A campaign is an
// ordinary memory entry (type "businesses", tagged company:<id> +
// "marketing-campaign") -- the exact same pattern
// core/executive/companyManager.js already uses for company-scoped state
// (see that file's own header comment: "modeled the same way projects
// are... not a new registry file or a second store"), not a new parallel
// store. This module owns the campaign lifecycle fields the Marketing
// Division spec asks for: Objective, Audience, Platforms, Timeline,
// Content Schedule, Assets, Approval Status, Publishing Status,
// Performance Metrics, Lessons Learned.
//
// Deliberately does NOT require core/executive/companyManager.js at
// module load time -- companyManager.js's companyBrain() lazy-requires
// THIS file (to list a company's campaigns), so a top-level require here
// would create a real load-time cycle. requireCompanyExists() below
// lazy-requires it instead, purely to validate a companyId at call time,
// after both modules are already fully loaded.

const memory = require("../memory");
const knowledge = require("../knowledge");

const CAMPAIGN_TAG = "marketing-campaign";

const APPROVAL_STATUSES = ["draft", "pending_approval", "approved", "rejected"];
const PUBLISHING_STATUSES = ["not_published", "scheduled", "published"];


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


function toCampaign(entry){

    const meta = entry.metadata || {};

    return {
        id: entry.id,
        companyId: meta.companyId,
        name: entry.content,
        objective: meta.objective,
        audience: meta.audience || null,
        platforms: meta.platforms || [],
        timeline: meta.timeline || { start: null, end: null },
        contentSchedule: meta.contentSchedule || [],
        assets: meta.assets || [],
        approvalStatus: meta.approvalStatus || "draft",
        publishingStatus: meta.publishingStatus || "not_published",
        performanceMetrics: meta.performanceMetrics || {},
        lessonsLearned: meta.lessonsLearned || [],
        created: entry.created,
        updated: entry.updated
    };

}


function requireEntry(id){

    const entry = memory.view().find(m => m.id === id && (m.tags || []).includes(CAMPAIGN_TAG));

    if(!entry){
        throw new Error(`Unknown campaign: "${id}"`);
    }

    return entry;

}


// input: { companyId, name?, objective, audience?, platforms?, timeline?, assets? }
function createCampaign(input = {}){

    if(!input.companyId){
        throw new Error("A companyId is required");
    }

    if(!input.objective){
        throw new Error("A campaign objective is required");
    }

    const company = requireCompanyExists(input.companyId);

    const entry = memory.remember({
        content: input.name || input.objective,
        type: "businesses",
        importance: 3,
        tags: [CAMPAIGN_TAG, `company:${input.companyId}`],
        source: "campaign-engine",
        metadata: {
            companyId: input.companyId,
            objective: input.objective,
            audience: input.audience || null,
            platforms: input.platforms || [],
            timeline: input.timeline || { start: null, end: null },
            contentSchedule: [],
            assets: input.assets || [],
            approvalStatus: "draft",
            publishingStatus: "not_published",
            performanceMetrics: {},
            lessonsLearned: []
        }
    });

    knowledge.addEntity({ name: entry.content, type: "campaign" });
    // Phase 49 (Organizational Knowledge Graph): connects the already-
    // created entity to its owning company -- previously unreachable
    // from the graph.
    knowledge.addRelationship({ from: entry.content, to: company.content, type: "belongsTo" });

    return toCampaign(entry);

}


function listCampaigns(companyId){

    return memory.filter({ tag: CAMPAIGN_TAG })
        .filter(entry => (entry.tags || []).includes(`company:${companyId}`))
        .map(toCampaign);

}


function getCampaign(campaignId){

    return toCampaign(requireEntry(campaignId));

}


// item: { date (ISO string), platform, description, draftContent? } --
// this IS the Campaign Planner/Calendar: content items are appended here,
// and calendar() below just flattens every campaign's schedule into one
// sorted view.
function scheduleContent(campaignId, item = {}){

    if(!item.date || !item.platform || !item.description){
        throw new Error("A content schedule item needs a date, platform, and description");
    }

    const entry = requireEntry(campaignId);

    const contentSchedule = [
        ...(entry.metadata.contentSchedule || []),
        {
            id: `${campaignId}-${(entry.metadata.contentSchedule || []).length}`,
            date: item.date,
            platform: item.platform,
            description: item.description,
            draftContent: item.draftContent || null,
            status: "planned"
        }
    ];

    const updated = memory.update(campaignId, { metadata: { contentSchedule } });

    return updated.metadata.contentSchedule;

}


// Updates one content-schedule item's draftContent and/or status in
// place (by its id from scheduleContent() above) -- used by
// core/marketing/contentGenerator.js to attach a real generated draft,
// and by the publish_content approval flow to mark an item published.
function updateContentItem(campaignId, itemId, patch = {}){

    const entry = requireEntry(campaignId);
    const contentSchedule = (entry.metadata.contentSchedule || []).map(item =>
        item.id === itemId ? { ...item, ...patch } : item
    );

    if(!contentSchedule.some(item => item.id === itemId)){
        throw new Error(`Unknown content schedule item: "${itemId}"`);
    }

    const updated = memory.update(campaignId, { metadata: { contentSchedule } });

    return updated.metadata.contentSchedule.find(item => item.id === itemId);

}


// Every content item across every one of a company's campaigns,
// annotated with its campaign and sorted by date -- the Campaign
// Calendar view.
function calendar(companyId){

    return listCampaigns(companyId)
        .flatMap(campaign =>
            campaign.contentSchedule.map(item => ({
                ...item,
                campaignId: campaign.id,
                campaignName: campaign.name
            }))
        )
        .sort((a, b) => new Date(a.date) - new Date(b.date));

}


function setApprovalStatus(campaignId, status){

    if(!APPROVAL_STATUSES.includes(status)){
        throw new Error(`Invalid approval status: "${status}" (must be one of ${APPROVAL_STATUSES.join(", ")})`);
    }

    requireEntry(campaignId);

    const updated = memory.update(campaignId, { metadata: { approvalStatus: status } });

    return updated.metadata.approvalStatus;

}


function setPublishingStatus(campaignId, status){

    if(!PUBLISHING_STATUSES.includes(status)){
        throw new Error(`Invalid publishing status: "${status}" (must be one of ${PUBLISHING_STATUSES.join(", ")})`);
    }

    requireEntry(campaignId);

    const updated = memory.update(campaignId, { metadata: { publishingStatus: status } });

    return updated.metadata.publishingStatus;

}


// metrics: any {label: number} shape (impressions/clicks/conversions/...)
// -- merged into the existing performanceMetrics, not replaced, so
// separate recordings of different metrics don't clobber each other.
function recordMetrics(campaignId, metrics = {}){

    const entry = requireEntry(campaignId);

    const performanceMetrics = { ...(entry.metadata.performanceMetrics || {}), ...metrics };

    const updated = memory.update(campaignId, { metadata: { performanceMetrics } });

    return updated.metadata.performanceMetrics;

}


function recordLessonLearned(campaignId, lesson){

    if(!lesson){
        throw new Error("A lesson is required");
    }

    const entry = requireEntry(campaignId);

    const lessonsLearned = [
        ...(entry.metadata.lessonsLearned || []),
        { lesson, timestamp: new Date().toISOString() }
    ];

    const updated = memory.update(campaignId, { metadata: { lessonsLearned } });

    return updated.metadata.lessonsLearned;

}


module.exports = {
    CAMPAIGN_TAG,
    APPROVAL_STATUSES,
    PUBLISHING_STATUSES,
    createCampaign,
    listCampaigns,
    getCampaign,
    scheduleContent,
    updateContentItem,
    calendar,
    setApprovalStatus,
    setPublishingStatus,
    recordMetrics,
    recordLessonLearned
};
