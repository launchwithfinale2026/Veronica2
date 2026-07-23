// ==================================
// VERONICA DAILY BRIEFING ENGINE
// ==================================
//
// Phase 11 (Executive Intelligence Layer): the "read this each morning"
// artifact that turns VERONICA from a command-driven system (you ask,
// it answers) into one that proactively tells an operator what today
// looks like. Composes the other five Phase 11 pieces -- priority
// ranking, goal monitoring, blocker detection, and executive
// recommendations -- into one snapshot, plus a plain roadmap status
// count for context. No LLM call: every one of those is already
// rule-based and explainable, so the briefing just assembles their
// output rather than re-summarizing it through a model.
//
// Persisted the same way every other executive artifact is: an ordinary
// memory entry, tagged "executive-briefing", accumulating a real daily
// history to look back over -- not a live-only view.

const memory = require("../memory");
const eventIngestion = require("../integrations/eventIngestion");
const ExecutivePlanner = require("./planner");
const ProjectManager = require("./projectManager");
const PriorityRanking = require("./priorityRanking");
const GoalMonitor = require("./goalMonitor");
const BlockerDetector = require("./blockerDetection");
const executiveIntelligence = require("./executiveIntelligence");
const ExecutiveRecommendationEngine = require("./executiveRecommendations");
const ActionProposalEngine = require("./actionProposal");
const CompanyManager = require("./companyManager");
const MissionEngine = require("./missionEngine");
const capabilitiesMarketplace = require("../capabilities/marketplace");
const OrganizationOverview = require("./organizationOverview");
const loadAgents = require("../agents/loader");
const loadDepartments = require("../departments/loader");

const BRIEFING_TAG = "executive-briefing";

// How many top-ranked items the briefing surfaces -- an operator's
// morning read should be short, not the entire roadmap.
const TOP_PRIORITIES_LIMIT = 5;

// Phase 19: everything ingested from an external connector since
// yesterday's briefing -- a new email, GitHub PR, Discord command,
// calendar meeting, Drive document. Same 24h window as this briefing's
// own daily cadence (see DAILY_BRIEFING_INTERVAL_MS in
// core/automation/jobs.js).
const EXTERNAL_EVENTS_WINDOW_MS = 24 * 60 * 60 * 1000;
const EXTERNAL_EVENTS_LIMIT = 20;


class DailyBriefingEngine {

    static TAG = BRIEFING_TAG;

    constructor({ planner, projectManager, priorityRanking, goalMonitor, blockerDetector, recommendationEngine, actionProposalEngine, companyManager, missionEngine, learning, organizationOverview, marketingCampaigns, salesOpportunities, salesLeads, financeReports, financeBudgets, financeInvoices, researchMissions, tradingPortfolio, tradingAnalytics, operationsSops, operationsKpis, operationsMeetings } = {}){

        this.planner = planner || new ExecutivePlanner();
        this.projectManager = projectManager || new ProjectManager({ planner: this.planner });
        this.priorityRanking = priorityRanking || new PriorityRanking({ planner: this.planner, projectManager: this.projectManager });
        this.goalMonitor = goalMonitor || new GoalMonitor({ planner: this.planner, projectManager: this.projectManager });
        this.blockerDetector = blockerDetector || new BlockerDetector({ planner: this.planner, projectManager: this.projectManager });
        this.recommendationEngine = recommendationEngine || new ExecutiveRecommendationEngine({
            planner: this.planner,
            projectManager: this.projectManager,
            priorityRanking: this.priorityRanking,
            goalMonitor: this.goalMonitor,
            blockerDetector: this.blockerDetector
        });

        // Phase 37 (Executive Assistant): the additional sections this
        // phase's morning-briefing ask names beyond what Phase 11/19
        // already covered (roadmap/priorities/goals/blockers/
        // recommendations/external events) -- Approvals, Company health,
        // Mission status, Package updates, Learning summary. System
        // health is deliberately NOT duplicated here -- it requires real
        // async I/O (core/system/health.js's fs.statfs), and this class's
        // generate()/run() are synchronous and already exercised that way
        // throughout Phase 11-32's tests; the dashboard's Executive
        // Summary panel (Phase 34) already surfaces it on the same view
        // an operator reads this briefing from.
        this.actionProposalEngine = actionProposalEngine || new ActionProposalEngine({ planner: this.planner, projectManager: this.projectManager });
        this.companyManager = companyManager || new CompanyManager({ planner: this.planner });
        this.missionEngine = missionEngine || new MissionEngine({ planner: this.planner, projectManager: this.projectManager });

        // Lazy default (not required at module top level) -- same
        // defensive convention core/executive/weeklyReport.js's own
        // constructor already follows for this exact dependency.
        this.learning = learning || require("../learning");

        // Phase 41 (Marketing Division / Executive Daily Operations):
        // Department Health and Campaign Health, the two sections the
        // spec asked for that Phase 37's briefing didn't yet cover (see
        // the architecture audit in docs/CHANGELOG.md's Phase 41 entry).
        // Reuses core/executive/organizationOverview.js's own
        // departmentHealth() wholesale rather than duplicating its
        // agentCount/activeProjects/executions/successRate logic --
        // constructing real department instances here follows the same
        // accepted tradeoff core/system/selfKnowledge.js already made
        // (Phase 40): fresh instances per call, not a live cache.
        const agents = loadAgents();
        this.organizationOverview = organizationOverview || new OrganizationOverview({
            departments: loadDepartments(agents),
            agents,
            planner: this.planner,
            companyManager: this.companyManager,
            missionEngine: this.missionEngine,
            actionProposalEngine: this.actionProposalEngine,
            learning: this.learning
        });

        this.marketingCampaigns = marketingCampaigns || require("../marketing/campaigns");

        // Phase 42 (Sales Division).
        this.salesOpportunities = salesOpportunities || require("../sales/opportunities");
        this.salesLeads = salesLeads || require("../sales/leads");

        // Phase 43 (Finance Division).
        this.financeReports = financeReports || require("../finance/reports");
        this.financeBudgets = financeBudgets || require("../finance/budgets");
        this.financeInvoices = financeInvoices || require("../finance/invoices");

        // Phase 44 (Research Division).
        this.researchMissions = researchMissions || require("../research/missions");

        // Phase 45 (Trading Research Division).
        this.tradingPortfolio = tradingPortfolio || require("../trading/portfolio");
        this.tradingAnalytics = tradingAnalytics || require("../trading/analytics");

        // Phase 46 (Business Operations Division).
        this.operationsSops = operationsSops || require("../operations/sops");
        this.operationsKpis = operationsKpis || require("../operations/kpis");
        this.operationsMeetings = operationsMeetings || require("../operations/meetings");

    }


    roadmapSummary(){

        const roadmap = this.planner.roadmap();

        const byStatus = { planned: 0, in_progress: 0, blocked: 0, completed: 0 };

        for(const project of roadmap){
            byStatus[project.status] = (byStatus[project.status] || 0) + 1;
        }

        return { totalProjects: roadmap.length, byStatus, deadlines: this.planner.evaluateDeadlines() };

    }


    // "Executive awareness" of external connector activity (Phase 19) --
    // reuses core/integrations/eventIngestion.js's recentEvents() rather
    // than re-reading memory directly, same "one shared read path" this
    // pipeline exists for.
    externalEvents(){

        return eventIngestion.recentEvents({
            since: new Date(Date.now() - EXTERNAL_EVENTS_WINDOW_MS).toISOString(),
            limit: EXTERNAL_EVENTS_LIMIT
        }).map(entry => ({
            id: entry.id,
            source: entry.metadata.source,
            kind: entry.metadata.kind,
            summary: entry.content,
            occurredAt: entry.metadata.occurredAt
        }));

    }


    // Phase 37: every pending action proposal -- reuses the existing
    // Phase 15 approval pipeline's own list(), not a second queue.
    pendingApprovals(){
        return this.actionProposalEngine.list("pending");
    }


    // Phase 37: a real per-company snapshot (employee/document/finance
    // counts already tracked by CompanyManager) -- not a new health
    // metric, just surfaced here too.
    companyHealth(){

        return this.companyManager.listCompanies().map(company => ({
            id: company.id,
            name: company.name,
            employees: (company.employees || []).length,
            documents: (company.documents || []).length
        }));

    }


    // Phase 37: every real, persisted mission (Phase 31) -- a briefing
    // reader sees mission progress alongside plain project priorities.
    missionStatus(){
        return this.missionEngine.history(20);
    }


    // Phase 37: reuses Phase 26's marketplace categorization -- a
    // package with a newer manifest on disk than what's installed.
    packageUpdates(){
        return capabilitiesMarketplace.categorize().updatesAvailable;
    }


    // Phase 37: the existing learning engine's own system-wide stats --
    // not a new performance-tracking mechanism.
    learningSummary(){
        return this.learning.overview();
    }


    // Phase 41: per-department real health (agent count, active/total
    // projects, real execution success rate) -- reuses
    // OrganizationOverview.departmentHealth() wholesale, not a second
    // implementation of the same aggregation.
    departmentHealth(){
        return this.organizationOverview.departmentHealth();
    }


    // Phase 41 (Marketing Division / Executive Daily Operations):
    // per-company campaign health -- genuinely new (no prior campaign
    // concept existed), but a thin rollup over core/marketing/campaigns.js's
    // real, already-persisted campaign state, not a new store. Companies
    // with zero campaigns are omitted -- same "keep the morning read
    // short" principle this file's header comment already states, and
    // there's nothing to report for a company marketing hasn't touched
    // yet.
    campaignHealth(){

        const SOON_MS = 7 * 24 * 60 * 60 * 1000;
        const now = Date.now();

        return this.companyManager.listCompanies()
            .map(company => {

                const companyCampaigns = this.marketingCampaigns.listCampaigns(company.id);

                const nearingDeadline = companyCampaigns.filter(campaign => {

                    if(campaign.publishingStatus === "published" || !campaign.timeline.end){
                        return false;
                    }

                    const end = new Date(campaign.timeline.end).getTime();

                    return Number.isFinite(end) && end - now > 0 && end - now <= SOON_MS;

                }).length;

                return {
                    companyId: company.id,
                    companyName: company.name,
                    totalCampaigns: companyCampaigns.length,
                    pendingApproval: companyCampaigns.filter(c => c.approvalStatus === "pending_approval").length,
                    approvedNotPublished: companyCampaigns.filter(c => c.approvalStatus === "approved" && c.publishingStatus !== "published").length,
                    nearingDeadline
                };

            })
            .filter(entry => entry.totalCampaigns > 0);

    }


    // Phase 42 (Sales Division): same per-company rollup pattern as
    // campaignHealth() above, over core/sales/opportunities.js's/
    // core/sales/leads.js's real, already-persisted state. Companies
    // with zero leads AND zero opportunities are omitted, same "keep
    // the morning read short" principle.
    salesHealth(){

        const now = Date.now();

        return this.companyManager.listCompanies()
            .map(company => {

                const companyLeads = this.salesLeads.listLeads(company.id);
                const companyOpportunities = this.salesOpportunities.listOpportunities(company.id);

                if(!companyLeads.length && !companyOpportunities.length){
                    return null;
                }

                const openLeads = companyLeads.filter(lead => !["converted", "disqualified"].includes(lead.status)).length;

                const openOpportunities = companyOpportunities.filter(
                    opportunity => opportunity.stage !== "closed_won" && opportunity.stage !== "closed_lost"
                );

                const overdueFollowUps = companyOpportunities
                    .flatMap(opportunity => opportunity.followUps)
                    .filter(followUp => !followUp.done && new Date(followUp.date).getTime() < now)
                    .length;

                const forecast = this.salesOpportunities.forecast(company.id);

                return {
                    companyId: company.id,
                    companyName: company.name,
                    openLeads,
                    openOpportunities: openOpportunities.length,
                    weightedForecast: forecast.weightedForecast,
                    overdueFollowUps
                };

            })
            .filter(Boolean);

    }


    // Phase 43 (Finance Division): same per-company rollup pattern as
    // salesHealth()/campaignHealth() above, over core/finance/reports.js's/
    // core/finance/budgets.js's/core/finance/invoices.js's real state.
    // Companies with no real finance activity at all (no ledger entries,
    // no budgets, no invoices) are omitted, same "keep the morning read
    // short" principle.
    financeHealth(){

        return this.companyManager.listCompanies()
            .map(company => {

                const kpis = this.financeReports.kpis(company.id);
                const companyBudgets = this.financeBudgets.budgetStatus(company.id);
                const companyInvoices = this.financeInvoices.listInvoices(company.id);

                const hasActivity = kpis.financialSummary.entries > 0 ||
                    companyBudgets.length > 0 ||
                    companyInvoices.length > 0;

                if(!hasActivity){
                    return null;
                }

                return {
                    companyId: company.id,
                    companyName: company.name,
                    cashOnHand: kpis.financialSummary.net,
                    runwayStatus: kpis.runway.status,
                    runwayMonths: kpis.runway.runwayMonths,
                    overBudgetCount: companyBudgets.filter(budget => budget.overBudget).length,
                    overdueInvoiceCount: companyInvoices.filter(invoice => invoice.overdue).length
                };

            })
            .filter(Boolean);

    }


    // Phase 44 (Research Division): system-wide research status, not
    // per-company -- core/research/missions.js's own header comment
    // establishes that missions aren't inherently tied to one company
    // (the base engine, Phase 29, is deliberately global), so this is a
    // single global rollup rather than a per-company list like
    // campaignHealth()/salesHealth()/financeHealth() above.
    researchStatus(){

        const allMissions = this.researchMissions.listMissions();

        const allCitations = allMissions.flatMap(mission => this.researchMissions.missionCitations(mission.id));

        const avgSourceConfidence = allCitations.length
            ? allCitations.reduce((sum, citation) => sum + (citation.confidence || 0), 0) / allCitations.length
            : null;

        return {
            totalMissions: allMissions.length,
            inProgress: allMissions.filter(mission => mission.status === "in_progress").length,
            completed: allMissions.filter(mission => mission.status === "completed").length,
            avgSourceConfidence
        };

    }


    // Phase 45 (Trading Research Division): system-wide, like
    // researchStatus() above -- portfolios are optionally company-
    // scoped (core/trading/portfolio.js's own header comment), so this
    // is a global rollup of real, already-recorded state: total
    // portfolios, total realized P&L (FIFO, from core/trading/analytics.js's
    // journalPerformance()) and total open positions across every
    // portfolio. Deliberately does NOT include unrealized P&L here --
    // that needs real current prices this briefing has no source for
    // (no market data feed exists).
    tradingStatus(){

        const portfolios = this.tradingPortfolio.listPortfolios();

        const totalRealizedPnl = portfolios.reduce(
            (sum, portfolio) => sum + this.tradingAnalytics.journalPerformance(portfolio.id).realizedPnl,
            0
        );

        const openPositions = portfolios.reduce((sum, portfolio) => sum + portfolio.positions.length, 0);

        return {
            totalPortfolios: portfolios.length,
            totalRealizedPnl,
            openPositions
        };

    }


    // Phase 46 (Business Operations Division): system-wide, like
    // researchStatus()/tradingStatus() above -- SOPs and KPIs aren't
    // company-scoped. Real off-track KPI count (kpiStatus()'s
    // onTrack: false) and real open action-item count across every
    // recorded meeting -- both genuine signals an operator would want
    // surfaced each morning, not fabricated ones. Weekly Operating
    // Reviews already exist as their own real, separately-scheduled
    // artifact (core/executive/weeklyReport.js, Phase 11) -- not
    // duplicated into this daily rollup.
    operationsStatus(){

        const allSOPs = this.operationsSops.listSOPs();
        const allKPIs = this.operationsKpis.listKPIs();

        const offTrackKPIs = allKPIs
            .map(kpi => this.operationsKpis.kpiStatus(kpi.id))
            .filter(status => status.onTrack === false)
            .length;

        const openActionItems = this.operationsMeetings.listMeetings()
            .reduce((sum, meeting) => sum + meeting.actionItems.filter(item => !item.done).length, 0);

        return {
            totalSOPs: allSOPs.length,
            totalKPIs: allKPIs.length,
            offTrackKPIs,
            openActionItems
        };

    }


    // Phase 48 (Executive Intelligence): per-company composite health
    // score and top risk, reusing core/executive/executiveIntelligence.js's
    // real companyHealthScore()/riskForecast() wholesale -- not a new
    // scoring system. Distinct from companyHealth() above (Phase 37,
    // plain employee/document counts): this is the cross-department
    // synthesized score. A company with no scoreable data yet is still
    // included with a null score, rather than silently omitted like the
    // other per-company sections above -- "no data yet" is itself
    // meaningful for an executive reading their own morning briefing.
    strategicHealth(){

        return this.companyManager.listCompanies().map(company => {

            const health = executiveIntelligence.companyHealthScore(company.id);
            const risk = executiveIntelligence.riskForecast(company.id);

            return {
                companyId: company.id,
                companyName: company.name,
                overallScore: health.overallScore,
                unscoredCategories: health.unscoredCategories,
                riskCount: risk.risks.length,
                topRisk: risk.risks[0] || null
            };

        });

    }


    // Assembles the briefing's contents WITHOUT persisting -- exposed
    // separately so a caller (or a test) can inspect what would be
    // generated without adding to the daily history.
    generate(){

        const ranked = this.priorityRanking.rank();

        return {
            date: new Date().toISOString(),
            roadmap: this.roadmapSummary(),
            topPriorities: ranked.slice(0, TOP_PRIORITIES_LIMIT).map(entry => ({
                project: entry.project.id,
                title: entry.project.title,
                score: entry.score,
                reasons: entry.reasons
            })),
            goalIssues: this.goalMonitor.check(),
            blockers: this.blockerDetector.detect(),
            // Reuses the same generate() the recommendation engine's own
            // run() calls, so the briefing's recommendations and a
            // standalone executive.recommendations() call are always
            // computed identically -- persisted separately below via
            // recommendationEngine.run(), not duplicated here.
            recommendations: this.recommendationEngine.generate(),
            externalEvents: this.externalEvents(),
            // Phase 37 additions -- see each method's own comment.
            pendingApprovals: this.pendingApprovals(),
            companyHealth: this.companyHealth(),
            missionStatus: this.missionStatus(),
            packageUpdates: this.packageUpdates(),
            learningSummary: this.learningSummary(),
            // Phase 41 additions -- see each method's own comment.
            departmentHealth: this.departmentHealth(),
            campaignHealth: this.campaignHealth(),
            // Phase 42 addition.
            salesHealth: this.salesHealth(),
            // Phase 43 addition.
            financeHealth: this.financeHealth(),
            // Phase 44 addition.
            researchStatus: this.researchStatus(),
            // Phase 45 addition.
            tradingStatus: this.tradingStatus(),
            // Phase 46 addition.
            operationsStatus: this.operationsStatus(),
            // Phase 48 addition.
            strategicHealth: this.strategicHealth()
        };

    }


    persist(briefing){

        const headline = briefing.recommendations.length
            ? `${briefing.recommendations.length} item(s) need attention`
            : "Nothing needs attention";

        const entry = memory.remember({
            content: `Daily briefing (${new Date(briefing.date).toDateString()}): ${headline}`,
            type: "decisions",
            importance: briefing.recommendations.length ? 4 : 2,
            tags: [BRIEFING_TAG],
            source: "daily-briefing",
            metadata: briefing
        });

        return this.toRecord(entry);

    }


    toRecord(entry){

        return {
            id: entry.id,
            summary: entry.content,
            ...entry.metadata,
            created: entry.created
        };

    }


    // Generates and persists a briefing -- also runs and persists a
    // fresh set of executive recommendations at the same time, so
    // executive.recommendationHistory() reflects every daily briefing
    // too, not just standalone executive.recommendations() calls. Also
    // runs the Phase 12 memory lifecycle sweep here -- this IS "the
    // daily cycle" Phase 12 asked memory evolution to connect to; a
    // fresh set of promotions lands in the same briefing an operator
    // already reads every morning, rather than needing a second thing
    // to check.
    run(){

        const briefing = this.generate();

        this.recommendationEngine.persist(briefing.recommendations);

        const memoryEvolution = memory.runLifecyclePromotion();

        return this.persist({ ...briefing, memoryEvolution });

    }


    history(limit = 10){

        return memory.filter({ tag: BRIEFING_TAG }, { limit })
            .map(entry => this.toRecord(entry));

    }

}


module.exports = DailyBriefingEngine;
