const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

// Same real-state backup/restore pattern as tests/executive-company-manager.test.js
// -- relies on --test-concurrency=1 (see package.json).

const DB_PATH = path.join(__dirname, "..", "core", "memory", "database.json");
const DB_BACKUP = path.join(os.tmpdir(), `veronica-database-backup-mktg-${process.pid}.json`);

const GRAPH_PATH = path.join(__dirname, "..", "core", "knowledge", "graph.json");
const GRAPH_BACKUP = path.join(os.tmpdir(), `veronica-graph-backup-mktg-${process.pid}.json`);

test.before(() => {
    fs.copyFileSync(DB_PATH, DB_BACKUP);
    fs.copyFileSync(GRAPH_PATH, GRAPH_BACKUP);
});

test.after(() => {
    fs.copyFileSync(DB_BACKUP, DB_PATH);
    fs.unlinkSync(DB_BACKUP);
    fs.copyFileSync(GRAPH_BACKUP, GRAPH_PATH);
    fs.unlinkSync(GRAPH_BACKUP);
});

const CompanyManager = require("../core/executive/companyManager");
const campaigns = require("../core/marketing/campaigns");


function makeCompany(name){
    return new CompanyManager().createCompany({ name });
}


test("createCampaign() requires a companyId and objective, and rejects an unknown company", () => {

    assert.throws(() => campaigns.createCampaign({ objective: "X" }));
    assert.throws(() => campaigns.createCampaign({ companyId: "not-a-real-id", objective: "X" }));

    const company = makeCompany("Campaign Validation Co XQZM1");
    assert.throws(() => campaigns.createCampaign({ companyId: company.id }));

});


test("createCampaign() persists the real field shape the Marketing Division spec asks for", () => {

    const company = makeCompany("Campaign Shape Co XQZM2");

    const campaign = campaigns.createCampaign({
        companyId: company.id,
        name: "Q3 Launch XQZM2",
        objective: "Drive signups for the Q3 launch",
        audience: "existing users",
        platforms: ["twitter", "email"],
        timeline: { start: "2026-08-01", end: "2026-08-31" },
        assets: ["logo.png"]
    });

    assert.strictEqual(campaign.name, "Q3 Launch XQZM2");
    assert.strictEqual(campaign.objective, "Drive signups for the Q3 launch");
    assert.strictEqual(campaign.audience, "existing users");
    assert.deepStrictEqual(campaign.platforms, ["twitter", "email"]);
    assert.deepStrictEqual(campaign.timeline, { start: "2026-08-01", end: "2026-08-31" });
    assert.deepStrictEqual(campaign.assets, ["logo.png"]);
    assert.deepStrictEqual(campaign.contentSchedule, []);
    assert.strictEqual(campaign.approvalStatus, "draft");
    assert.strictEqual(campaign.publishingStatus, "not_published");
    assert.deepStrictEqual(campaign.performanceMetrics, {});
    assert.deepStrictEqual(campaign.lessonsLearned, []);

});


test("listCampaigns() scopes to only the given company", () => {

    const companyA = makeCompany("Campaign List Co A XQZM3");
    const companyB = makeCompany("Campaign List Co B XQZM3");

    campaigns.createCampaign({ companyId: companyA.id, objective: "A campaign XQZM3" });
    campaigns.createCampaign({ companyId: companyB.id, objective: "B campaign XQZM3" });

    const listA = campaigns.listCampaigns(companyA.id);

    assert.strictEqual(listA.length, 1);
    assert.strictEqual(listA[0].objective, "A campaign XQZM3");

});


test("scheduleContent()/calendar() build a real, sorted content calendar across every campaign", () => {

    const company = makeCompany("Calendar Co XQZM4");

    const campaignA = campaigns.createCampaign({ companyId: company.id, objective: "Calendar campaign A XQZM4" });
    const campaignB = campaigns.createCampaign({ companyId: company.id, objective: "Calendar campaign B XQZM4" });

    campaigns.scheduleContent(campaignA.id, { date: "2026-08-15", platform: "twitter", description: "Second post" });
    campaigns.scheduleContent(campaignB.id, { date: "2026-08-01", platform: "email", description: "First post" });

    assert.throws(() => campaigns.scheduleContent(campaignA.id, { date: "2026-08-15" }));

    const calendarView = campaigns.calendar(company.id);

    assert.strictEqual(calendarView.length, 2);
    assert.strictEqual(calendarView[0].description, "First post");
    assert.strictEqual(calendarView[0].campaignId, campaignB.id);
    assert.strictEqual(calendarView[1].description, "Second post");
    assert.strictEqual(calendarView[1].campaignId, campaignA.id);

});


test("updateContentItem() attaches a draft/status to the right content item without disturbing others", () => {

    const company = makeCompany("Content Update Co XQZM5");
    const campaign = campaigns.createCampaign({ companyId: company.id, objective: "Content update campaign XQZM5" });

    campaigns.scheduleContent(campaign.id, { date: "2026-08-01", platform: "twitter", description: "Post one" });
    campaigns.scheduleContent(campaign.id, { date: "2026-08-02", platform: "twitter", description: "Post two" });

    const [itemOne] = campaigns.getCampaign(campaign.id).contentSchedule;

    const updated = campaigns.updateContentItem(campaign.id, itemOne.id, { draftContent: "Real draft text", status: "drafted" });

    assert.strictEqual(updated.draftContent, "Real draft text");
    assert.strictEqual(updated.status, "drafted");

    const untouched = campaigns.getCampaign(campaign.id).contentSchedule.find(item => item.description === "Post two");
    assert.strictEqual(untouched.status, "planned");

    assert.throws(() => campaigns.updateContentItem(campaign.id, "not-a-real-item", {}));

});


test("setApprovalStatus()/setPublishingStatus() validate against the real enum and reject anything else", () => {

    const company = makeCompany("Status Co XQZM6");
    const campaign = campaigns.createCampaign({ companyId: company.id, objective: "Status campaign XQZM6" });

    assert.strictEqual(campaigns.setApprovalStatus(campaign.id, "approved"), "approved");
    assert.strictEqual(campaigns.setPublishingStatus(campaign.id, "published"), "published");

    assert.throws(() => campaigns.setApprovalStatus(campaign.id, "not-a-real-status"));
    assert.throws(() => campaigns.setPublishingStatus(campaign.id, "not-a-real-status"));

});


test("recordMetrics() merges into performanceMetrics across multiple calls", () => {

    const company = makeCompany("Metrics Co XQZM7");
    const campaign = campaigns.createCampaign({ companyId: company.id, objective: "Metrics campaign XQZM7" });

    campaigns.recordMetrics(campaign.id, { impressions: 1000 });
    const metrics = campaigns.recordMetrics(campaign.id, { clicks: 50 });

    assert.deepStrictEqual(metrics, { impressions: 1000, clicks: 50 });

});


test("recordLessonLearned() appends a real, timestamped lesson", () => {

    const company = makeCompany("Lessons Co XQZM8");
    const campaign = campaigns.createCampaign({ companyId: company.id, objective: "Lessons campaign XQZM8" });

    campaigns.recordLessonLearned(campaign.id, "Post earlier in the day next time");

    const lessons = campaigns.getCampaign(campaign.id).lessonsLearned;

    assert.strictEqual(lessons.length, 1);
    assert.strictEqual(lessons[0].lesson, "Post earlier in the day next time");
    assert.ok(lessons[0].timestamp);

    assert.throws(() => campaigns.recordLessonLearned(campaign.id, ""));

});
