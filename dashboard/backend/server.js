// ==================================
// VERONICA DASHBOARD — BACKEND
// ==================================
//
// A read-only HTTP façade over the systems already built in core/ — no
// duplicated logic, just JSON endpoints over the same agents/departments/
// memory/knowledge/tools modules the terminal uses, plus static file
// serving for the frontend. No new dependencies: built-in http only.

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const loadAgents = require("../../core/agents/loader");
const loadDepartments = require("../../core/departments/loader");
const { seedFromAgents } = require("../../core/knowledge/seed");
const memory = require("../../core/memory");
const knowledge = require("../../core/knowledge");
const tools = require("../../core/tools");
const device = require("../../core/device");
const sync = require("../../core/device/sync");
const DeviceManager = require("../../core/device/deviceManager");
const executive = require("../../core/executive");
const learning = require("../../core/learning");
const automation = require("../../core/automation");
const automationWorkflow = require("../../core/automation/workflow");
const bus = require("../../core/bus");
const CollaborationEngine = require("../../core/collaboration/engine");
const collaborationRules = require("../../core/collaboration/collaborationRules");
const ExecutiveOrchestrator = require("../../core/executive/orchestrator");
const integrationRegistry = require("../../core/integrations/registry");
const credentialManager = require("../../core/integrations/credentialManager");
const googleOAuth = require("../../core/integrations/google/oauth");
const discordBot = require("../../core/integrations/discordBot");
const capabilitiesRegistry = require("../../core/capabilities/registry");
const installer = require("../../core/capabilities/installer");
const capabilitiesPlanner = require("../../core/capabilities/planner");
const systemReport = require("../../core/system/report");
const capabilitiesMarketplace = require("../../core/capabilities/marketplace");
const capabilitiesBuilder = require("../../core/capabilities/builder");
const capabilitiesHealth = require("../../core/capabilities/health");
const autonomousBuilder = require("../../core/capabilities/autonomousBuilder");
const marketingCampaigns = require("../../core/marketing/campaigns");
const marketingContentGenerator = require("../../core/marketing/contentGenerator");
const marketingAnalytics = require("../../core/marketing/analytics");
const salesLeads = require("../../core/sales/leads");
const salesOpportunities = require("../../core/sales/opportunities");
const salesProposalGenerator = require("../../core/sales/proposalGenerator");
const salesAnalytics = require("../../core/sales/analytics");
const financeBudgets = require("../../core/finance/budgets");
const financeInvoices = require("../../core/finance/invoices");
const financeSubscriptions = require("../../core/finance/subscriptions");
const financeReports = require("../../core/finance/reports");
const researchMissions = require("../../core/research/missions");
const tradingPortfolio = require("../../core/trading/portfolio");
const tradingStrategies = require("../../core/trading/strategies");
const tradingPaperTrading = require("../../core/trading/paperTrading");
const tradingBacktest = require("../../core/trading/backtest");
const tradingAnalytics = require("../../core/trading/analytics");
const operationsSops = require("../../core/operations/sops");
const operationsKpis = require("../../core/operations/kpis");
const operationsMeetings = require("../../core/operations/meetings");
const operationsScorecard = require("../../core/operations/scorecard");
const executiveIntelligence = require("../../core/executive/executiveIntelligence");
const ResearchEngine = require("../../core/research/engine");
const SelfImprovementEngine = require("../../core/system/selfImprovement");
const OrganizationOverview = require("../../core/executive/organizationOverview");
const systemHealth = require("../../core/system/health");
const healthScore = require("../../core/system/healthScore");
const maintenance = require("../../core/system/maintenance");
const operationalReadiness = require("../../core/system/operationalReadiness");
const universalSearch = require("../../core/system/search");
const executiveSummary = require("../../core/executive/executiveSummary");
const PersonalContextEngine = require("../../core/profile/personalContextEngine");
const log = require("../../core/logging");
const { installCrashGuards } = require("../../core/logging/crashGuard");


const FRONTEND_ROOT = path.join(__dirname, "../frontend");

const identity = JSON.parse(
    fs.readFileSync(
        path.join(__dirname, "../../core/veronica/identity.json"),
        "utf8"
    )
);

const START_TIME = Date.now();

const agents = loadAgents();

seedFromAgents(agents);

const departments = loadDepartments(agents);

const collaboration = new CollaborationEngine(departments);

// Wires the autonomous task-execution job to this process's real,
// already-loaded departments (see core/automation/jobs.js for why this
// is opt-in rather than automatic on require("../automation")), and
// reuses the same ExecutiveOrchestrator instance for the manual
// pursue()/report()/run-next routes below instead of constructing a
// second one against the same departments.
const orchestrator = automation.registerExecutionJob(departments);

const personalContext = new PersonalContextEngine();
const ExecutiveConstitution = require("../../core/executive/constitution");
const constitution = new ExecutiveConstitution();
const Brain = require("../../core/brain");
const brain = new Brain();
const brainRouting = require("../../core/brain/routing");
const personalIntelligence = require("../../core/profile/personalIntelligence");

const deviceManager = new DeviceManager();

const researchEngine = new ResearchEngine();

const KnowledgeAcquisitionEngine = require("../../core/knowledge/acquisition");
const knowledgeAcquisition = new KnowledgeAcquisitionEngine();
const fileIntelligence = require("../../core/integrations/fileIntelligence");
const obsidian = require("../../core/integrations/obsidian");

const selfImprovement = new SelfImprovementEngine();

// Phase 32 -- reuses the SAME real, already-loaded departments/agents
// this process constructed at boot (see loadAgents()/loadDepartments()
// above), not a second roster.
const organizationOverview = new OrganizationOverview({ departments, agents });


// Reads every department's activity.log (JSON lines), merges, and
// returns the most recent entries across all departments.
function readRecentActivity(limit = 20){

    const entries = [];

    for(const dept of departments){

        if(!fs.existsSync(dept.logFile)){
            continue;
        }

        const lines = fs.readFileSync(dept.logFile, "utf8")
            .split("\n")
            .filter(Boolean);

        for(const line of lines){

            try {
                entries.push({ department: dept.id, ...JSON.parse(line) });
            } catch(error){
                // skip a malformed log line rather than fail the whole feed
            }

        }

    }

    entries.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    return entries.slice(0, limit);

}


function handleMemory(searchParams){

    const type = searchParams.get("type");
    const q = searchParams.get("q");

    if(type){
        return memory.filter({ type });
    }

    if(q){
        return memory.search(q);
    }

    return memory.view();

}


// Recent-errors window for /api/health's degraded/ok verdict -- a
// personal system running for weeks shouldn't be marked "degraded"
// forever because of one error from days ago.
const HEALTH_ERROR_WINDOW_MS = 15 * 60 * 1000;
const HEALTH_DEGRADED_THRESHOLD = 5;


const ROUTES = {

    "GET /api/status": () => ({
        identity: identity.name,
        mission: identity.mission,
        status: "ONLINE",
        agents: agents.length,
        departments: departments.length,
        uptimeSeconds: Math.floor((Date.now() - START_TIME) / 1000),
        timestamp: new Date().toISOString()
    }),

    // Distinct from /api/status (identity/roster info): this is a real
    // liveness/readiness check -- process resource usage, whether the
    // automation tick loop is actually running, and a recent-error count
    // derived from core/logging (Phase 11's error log), not a canned
    // "online" string.
    "GET /api/health": () => {

        const memoryUsage = process.memoryUsage();
        const recentErrors = log.readErrors(50)
            .filter(entry => Date.now() - new Date(entry.timestamp).getTime() <= HEALTH_ERROR_WINDOW_MS);

        return {
            status: recentErrors.length >= HEALTH_DEGRADED_THRESHOLD ? "degraded" : "ok",
            uptimeSeconds: Math.floor(process.uptime()),
            memory: {
                rssBytes: memoryUsage.rss,
                heapUsedBytes: memoryUsage.heapUsed,
                heapTotalBytes: memoryUsage.heapTotal
            },
            automation: { running: automation.status().running },
            recentErrorCount: recentErrors.length,
            timestamp: new Date().toISOString()
        };

    },

    "GET /api/agents": () => agents.map(agent => ({
        name: agent.name,
        role: agent.role,
        department: agent.department,
        status: agent.status
    })),

    // Phase 17 -- Command Center Dashboard: "Agent network" view. Each
    // agent plus its real knowledge-graph connections (delegatesTo,
    // reviewed, messaged, etc. -- see core/collaboration/engine.js) --
    // the actual relationships between agents, not just a flat roster.
    "GET /api/agents/network": () => agents.map(agent => ({
        name: agent.name,
        department: agent.department,
        connections: knowledge.connections(agent.name)
    })),

    "GET /api/departments": () => departments.map(dept => dept.statusReport()),

    "GET /api/knowledge": () => knowledge.read(),

    // Phase 49 (Organizational Knowledge Graph): exposes the graph's own
    // already-real retrieve() (matching entities + every relationship
    // touching them) -- not a new query engine, just surfacing what
    // core/knowledge/index.js already implements.
    "GET /api/knowledge/query": (searchParams) => knowledge.retrieve(searchParams.get("q") || ""),

    // Project H (Knowledge Graph Explorer): real type filtering and
    // real N-hop expansion -- see core/knowledge/index.js's own
    // findByType()/expand().
    "GET /api/knowledge/by-type": (searchParams) => knowledge.findByType(searchParams.get("type") || ""),

    "GET /api/knowledge/expand": (searchParams) => knowledge.expand(
        searchParams.get("name") || "",
        Number(searchParams.get("hops")) || 1
    ),

    // Real shortest-path search between two named entities -- see
    // core/knowledge/index.js's own findPath().
    "GET /api/knowledge/path": (searchParams) => knowledge.findPath(
        searchParams.get("from") || "",
        searchParams.get("to") || ""
    ),

    "GET /api/tools": () => tools.list(),

    "GET /api/activity": () => readRecentActivity(),

    "GET /api/device": () => device.currentIdentity(),

    "GET /api/device/capabilities": () => device.capabilities(),

    "GET /api/device/known": () => sync.knownDevices(),

    "GET /api/devices/network": () => deviceManager.networkStatus(),

    "GET /api/memory/semantic-search-status": () => ({ available: memory.semanticSearchAvailable() }),

    "GET /api/memory/overview": () => memory.overview(),

    "GET /api/memory/lifecycle": () => memory.lifecycleOverview(),

    "GET /api/executive/roadmap": () => executive.roadmap(),

    // Phase 17 -- Command Center Dashboard: "Goal view". The roadmap
    // already has priority/status; this adds per-project progress
    // (ProjectManager.progress(), via getProject()) so a goal's actual
    // completion is visible without looking each one up individually.
    "GET /api/goals/overview": () => executive.roadmap().map(project => ({
        ...project,
        progress: executive.getProject(project.id).progress
    })),

    "GET /api/executive/deadlines": () => executive.evaluateDeadlines(),

    "GET /api/executive/consolidations": () => executive.consolidationHistory(),

    "GET /api/executive/self-monitor": () => executive.selfMonitorHistory(),

    "GET /api/executive/priority-rank": () => executive.priorityRank(),

    "GET /api/executive/goal-issues": () => executive.goalIssues(),

    "GET /api/executive/blockers": () => executive.blockers(),

    "GET /api/executive/recommendations": () => executive.recommendationHistory(),

    "GET /api/executive/daily-briefings": () => executive.dailyBriefingHistory(),

    "GET /api/executive/weekly-reports": () => executive.weeklyOperatingReportHistory(),

    "GET /api/executive/daily-reviews": () => executive.dailyReviewHistory(),

    "GET /api/executive/proposals": (searchParams) => executive.listProposals(searchParams.get("status") || undefined),

    "GET /api/executive/missions": (searchParams) => executive.missionHistory(Number(searchParams.get("limit")) || 10),

    "GET /api/executive/report": () => orchestrator.report(),

    // Phase 48 (Executive Intelligence): cross-department synthesis over
    // each division's already-real analytics -- see
    // core/executive/executiveIntelligence.js.
    "GET /api/executive/company-health": (searchParams) => executiveIntelligence.companyHealthScore(searchParams.get("companyId")),

    "GET /api/executive/risk-forecast": (searchParams) => executiveIntelligence.riskForecast(searchParams.get("companyId")),

    "GET /api/executive/cross-department-recommendations": (searchParams) => executiveIntelligence.crossDepartmentRecommendations(searchParams.get("companyId")),

    "GET /api/executive/quarterly-plan": (searchParams) => executiveIntelligence.quarterlyPlan(searchParams.get("companyId"), {
        year: Number(searchParams.get("year")),
        quarter: Number(searchParams.get("quarter"))
    }),

    "GET /api/executive/annual-plan": (searchParams) => executiveIntelligence.annualPlan(searchParams.get("companyId"), {
        year: Number(searchParams.get("year"))
    }),

    "GET /api/executive/briefs": (searchParams) => executiveIntelligence.briefHistory(searchParams.get("companyId")),

    "GET /api/companies": () => executive.listCompanies(),

    "GET /api/learning/overview": () => learning.overview(),

    "GET /api/learning/departments": () => learning.departmentPerformance(),

    "GET /api/learning/agents": () => learning.agentPerformance(),

    "GET /api/learning/tools": () => learning.toolPerformance(),

    "GET /api/learning/recommendations": () => learning.recommendationHistory(),

    "GET /api/learning/adaptive-insights": () => learning.adaptiveInsights(),

    "GET /api/automation/status": () => automation.status(),

    "GET /api/automation/history": () => automation.history(),

    // Phase 54 (Automation Engine 2.0): real, defined-in-code workflows
    // (see core/automation/workflow.js) -- listable and runnable, not
    // dashboard-created (a workflow's steps are real handler functions,
    // the same way core/automation/jobs.js's built-in jobs are code, not
    // data).
    "GET /api/automation/workflows": () => automationWorkflow.listWorkflows(),

    "GET /api/automation/workflows/history": (searchParams) => automationWorkflow.workflowHistory(searchParams.get("name") || undefined),

    "GET /api/collaboration/history": () => collaboration.history(),

    // Phase 50 (Department Collaboration): real, rule-detected cross-
    // department requests -- pure observation, no proposal created yet
    // (see the gated POST below for that).
    "GET /api/collaboration/opportunities": (searchParams) => collaborationRules.detectCollaborationOpportunities(searchParams.get("companyId") || null),

    "GET /api/integrations": () => integrationRegistry.overview(),

    // Step 1 of the Google OAuth flow -- the URL a human visits in a
    // real browser to reach Google's own consent screen. Throws (-> 500,
    // same as every other unconfigured-dependency error here) if Google
    // isn't configured yet; the error message names exactly which env
    // vars are missing (see oauth.js's requireConfigured()).
    "GET /api/integrations/google/auth-url": () => ({ url: googleOAuth.getAuthUrl() }),

    "GET /api/integrations/discord-bot/status": () => discordBot.status(),

    // Phase 20 (Capability Expansion Architecture): every capability
    // VERONICA knows about, built-in and installed-package alike, with
    // its real status (active/installed/disabled/error) -- real state
    // only, see core/capabilities/registry.js.
    "GET /api/capabilities": () => capabilitiesRegistry.list(),

    // Phase 24 (VERONICA Self-Management): what exists / what's missing
    // / what needs improvement, read live from the real capability and
    // integration registries -- see core/system/report.js.
    "GET /api/system/report": () => systemReport.generate(),

    // Phase 30 (Self Improvement Engine): what's duplicated/outdated/
    // performing poorly, a performance/security report, and an
    // optimization/refactor/recommendation queue -- proposals only,
    // nothing here executes anything.
    "GET /api/system/self-improvement": () => selfImprovement.generate(),

    "GET /api/system/self-improvement/history": (searchParams) => selfImprovement.history(Number(searchParams.get("limit")) || 10),

    // Phase 26 (Capability Marketplace): every capability categorized
    // into Installed/Available/Disabled/Experimental/Updates Available/
    // Deprecated/Broken, with real per-package metadata (dependencies,
    // permissions, install size/date, update history) -- see
    // core/capabilities/marketplace.js.
    "GET /api/capabilities/marketplace": () => capabilitiesMarketplace.categorize(),

    "GET /api/capabilities/search": (searchParams) => {
        const q = searchParams.get("q");
        return q ? capabilitiesMarketplace.search(q) : [];
    },

    // Phase 41 (Capability Operations): real per-package operational
    // health -- agents/tools actually loaded vs declared, missing
    // dependencies, and whether any tool is still a
    // core/capabilities/builder.js-generated skeleton rather than a
    // real implementation ("Installed – Awaiting Integration" rather
    // than pretending an unimplemented tool functions). Distinct from
    // /api/capabilities/marketplace's install/version/update metadata --
    // this is "is it actually working," not "is it installed."
    "GET /api/capabilities/health": () => capabilitiesHealth.report(),

    // Phase 41 (Marketing Division). Real, per-company campaign
    // list/calendar/analytics -- see core/marketing/campaigns.js and
    // core/marketing/analytics.js. Mutating campaign routes (create/
    // schedule-content/generate-draft/approval-status/metrics/lessons)
    // live below as dynamic routes (need a POST body and/or a campaign
    // id in the path).
    "GET /api/marketing/campaigns": (searchParams) => marketingCampaigns.listCampaigns(searchParams.get("companyId")),

    "GET /api/marketing/calendar": (searchParams) => marketingCampaigns.calendar(searchParams.get("companyId")),

    "GET /api/marketing/analytics": (searchParams) => marketingAnalytics.campaignPerformance(searchParams.get("companyId")),

    // Phase 42 (Sales Division). Real, per-company lead/pipeline/
    // analytics reads -- see core/sales/leads.js, core/sales/
    // opportunities.js, core/sales/analytics.js. Mutating routes live
    // below as dynamic routes (need a POST body and/or a lead/
    // opportunity id in the path).
    "GET /api/sales/leads": (searchParams) => salesLeads.listLeads(searchParams.get("companyId")),

    "GET /api/sales/opportunities": (searchParams) => salesOpportunities.listOpportunities(searchParams.get("companyId")),

    "GET /api/sales/forecast": (searchParams) => salesOpportunities.forecast(searchParams.get("companyId")),

    "GET /api/sales/analytics": (searchParams) => salesAnalytics.salesOverview(searchParams.get("companyId")),

    // Phase 43 (Finance Division). Real, per-company reads -- see
    // core/finance/budgets.js, core/finance/invoices.js,
    // core/finance/subscriptions.js, core/finance/reports.js. Mutating
    // routes live below as dynamic routes.
    "GET /api/finance/budgets": (searchParams) => financeBudgets.budgetStatus(searchParams.get("companyId")),

    "GET /api/finance/invoices": (searchParams) => financeInvoices.listInvoices(searchParams.get("companyId")),

    "GET /api/finance/subscriptions": (searchParams) => financeSubscriptions.listSubscriptions(searchParams.get("companyId")),

    "GET /api/finance/cash-flow": (searchParams) => financeReports.cashFlow(searchParams.get("companyId")),

    "GET /api/finance/runway": (searchParams) => financeReports.runway(searchParams.get("companyId")),

    "GET /api/finance/forecast": (searchParams) => financeReports.forecast(searchParams.get("companyId")),

    "GET /api/finance/kpis": (searchParams) => financeReports.kpis(searchParams.get("companyId")),

    // Phase 44 (Research Division). companyId is optional -- research
    // missions aren't inherently tied to one company (see
    // core/research/missions.js's own header comment).
    "GET /api/research/missions": (searchParams) => researchMissions.listMissions(searchParams.get("companyId")),

    // Phase 45 (Trading Research Division). Research/analysis only --
    // no real trade execution anywhere in this codebase. companyId is
    // optional, same reasoning as research missions.
    "GET /api/trading/portfolios": (searchParams) => tradingPortfolio.listPortfolios(searchParams.get("companyId")),

    "GET /api/trading/watchlists": () => tradingPortfolio.listWatchlists(),

    "GET /api/trading/strategies": () => tradingStrategies.listStrategies(),

    // A pure, stateless calculation (the real "percent risk" formula) --
    // no auth needed, same reasoning as any other read-only endpoint.
    "GET /api/trading/position-size": (searchParams) => tradingPortfolio.calculatePositionSize({
        accountValue: Number(searchParams.get("accountValue")),
        riskPercent: Number(searchParams.get("riskPercent")),
        entryPrice: Number(searchParams.get("entryPrice")),
        stopPrice: Number(searchParams.get("stopPrice"))
    }),

    // Phase 46 (Business Operations Division). department is optional --
    // SOPs/KPIs aren't required to be department-scoped.
    "GET /api/operations/sops": (searchParams) => operationsSops.listSOPs(searchParams.get("department")),

    "GET /api/operations/kpis": (searchParams) => operationsKpis.listKPIs(searchParams.get("department"))
        .map(kpi => operationsKpis.kpiStatus(kpi.id)),

    "GET /api/operations/meetings": () => operationsMeetings.listMeetings(),

    "GET /api/research/history": (searchParams) => researchEngine.history(searchParams.get("topic") || undefined),

    // Phase 32 (Organization Operating System): the one aggregation
    // point across companies/departments/projects/missions/capabilities/
    // knowledge/automation/devices/approvals -- see
    // core/executive/organizationOverview.js.
    "GET /api/organization/overview": () => organizationOverview.generate(),

    "GET /api/profile": () => personalContext.summary(),

    // Phase 51 (Executive Constitution).
    "GET /api/constitution": () => constitution.load(),

    // Phase 55 (Multi-Model Intelligence).
    "GET /api/brain/status": () => brain.provider.status(),

    "GET /api/brain/routing-preferences": () => brainRouting.getPreferences(),

    // Phase 56 (Personal Intelligence Engine).
    "GET /api/personal-intelligence/relationships": () => personalIntelligence.inferImportantRelationships(),

    "GET /api/personal-intelligence/decision-patterns": () => personalIntelligence.inferDecisionPatterns(),

    "GET /api/personal-intelligence/key-clients": (searchParams) => personalIntelligence.inferKeyClients(searchParams.get("companyId")),

    "GET /api/personal-intelligence/dismissed": () => personalIntelligence.listDismissed(),

    // Phase 57 (Knowledge Acquisition Engine).
    "GET /api/knowledge/acquisition-history": () => knowledgeAcquisition.history(),

    "GET /api/logs/errors": () => log.readErrors()

};


// Every mutating endpoint (sync, remember, department/tool runs) exposes
// or triggers real side effects — network calls to Claude included — so
// they all require an explicit opt-in token rather than being open by
// default like the read-only endpoints above. Fails closed: no API_TOKEN
// configured means every write endpoint is off.
// Constant-time comparison (Production Hardening, Phase 11) -- a plain
// `===` short-circuits on the first mismatched character, which in
// principle leaks how many leading characters of a guess are correct via
// response timing. Low real risk for a localhost-bound personal
// dashboard, but the fix is free (crypto.timingSafeEqual, no new
// dependency) so there's no reason not to.
function tokensMatch(provided, expected){

    const providedBuffer = Buffer.from(provided || "");
    const expectedBuffer = Buffer.from(expected);

    // timingSafeEqual throws on mismatched lengths rather than just
    // returning false -- pad to the same length first so a wrong-length
    // guess doesn't throw (and isn't distinguishable by "did it throw").
    if(providedBuffer.length !== expectedBuffer.length){
        crypto.timingSafeEqual(expectedBuffer, expectedBuffer);
        return false;
    }

    return crypto.timingSafeEqual(providedBuffer, expectedBuffer);

}


function checkApiAuth(req){

    const token = process.env.API_TOKEN;

    if(!token){
        return { ok: false, status: 501, error: "Write actions not configured: set API_TOKEN to enable" };
    }

    const header = req.headers["authorization"] || "";
    const provided = header.startsWith("Bearer ") ? header.slice(7) : null;

    if(!tokensMatch(provided, token)){
        return { ok: false, status: 403, error: "Invalid or missing API token" };
    }

    return { ok: true };

}


function readBody(req){

    return new Promise((resolve, reject) => {

        let data = "";

        req.on("data", chunk => { data += chunk; });
        req.on("end", () => resolve(data));
        req.on("error", reject);

    });

}


const MIME_TYPES = {
    ".html": "text/html",
    ".css": "text/css",
    ".js": "application/javascript",
    ".json": "application/json"
};


function sendJSON(res, status, data){

    const body = JSON.stringify(data);

    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(body);

}


// Static file serving, sandboxed to dashboard/frontend/ the same way the
// filesystem tool is sandboxed to data/workspace/ — reject anything that
// would resolve outside the frontend root.
function serveStatic(res, pathname){

    const relative = pathname === "/" ? "index.html" : pathname.slice(1);

    const resolved = path.resolve(FRONTEND_ROOT, relative);

    const withinRoot =
        resolved === FRONTEND_ROOT ||
        resolved.startsWith(FRONTEND_ROOT + path.sep);

    if(!withinRoot || !fs.existsSync(resolved) || fs.statSync(resolved).isDirectory()){
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Not found");
        return;
    }

    const ext = path.extname(resolved);

    res.writeHead(200, {
        "Content-Type": MIME_TYPES[ext] || "application/octet-stream"
    });

    fs.createReadStream(resolved).pipe(res);

}


// Every live-update event the milestone asked for (memory updates,
// knowledge updates, department/agent activity, automation job
// completions -- "progress updates" and "live notifications" fall out of
// the same set) is forwarded here. Server-Sent Events, not a hand-rolled
// WebSocket implementation -- see docs/Architecture.md "Dashboard Live
// Updates" for why: every one of these is one-directional server->client
// push, which is exactly what SSE is for, built entirely on the http
// module already in use (no new dependency), with automatic browser
// reconnection built into EventSource. A raw WebSocket implementation
// from scratch (Node's http has no built-in WS support) would mean
// hand-writing the handshake/framing/masking protocol for a capability
// SSE already covers.
const STREAMED_EVENTS = [
    "memory.updated", "knowledge.updated", "department.activity", "automation.jobCompleted",
    "collaboration.message", "collaboration.delegated", "collaboration.reviewed", "collaboration.consensus",
    // Phase 52 (Continuous Observation Engine): widened event vocabulary
    // at existing real state-transition choke points, plus two new local
    // observers (git, connector health) -- see core/system/gitObserver.js/
    // connectorHealth.js and docs/CHANGELOG.md's Phase 52 entry.
    "goal.statusChanged", "goal.completed", "approval.granted", "approval.rejected",
    "capability.installed", "campaign.published", "research.finished",
    "git.commit", "connector.online", "connector.offline",
    // Phase 54 (Automation Engine 2.0).
    "workflow.completed"
];
const SSE_HEARTBEAT_MS = 25000;

function handleEventStream(req, res){

    res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive"
    });

    res.write(": connected\n\n");

    const listeners = STREAMED_EVENTS.map(eventName => {

        const handler = payload => {
            res.write(`data: ${JSON.stringify({ type: eventName, payload, timestamp: new Date().toISOString() })}\n\n`);
        };

        bus.on(eventName, handler);

        return { eventName, handler };

    });

    // Proxies/load balancers (and some browsers) close idle connections --
    // a periodic comment line keeps this one alive without being a real
    // event the frontend has to filter out.
    const heartbeat = setInterval(() => {
        res.write(": heartbeat\n\n");
    }, SSE_HEARTBEAT_MS);

    const cleanup = () => {
        clearInterval(heartbeat);
        listeners.forEach(({ eventName, handler }) => bus.off(eventName, handler));
    };

    req.on("close", cleanup);

    // A write to a socket that dropped between events (not caught by
    // req.on("close") alone in every case) emits "error" on the response
    // rather than throwing synchronously -- without this, that would be
    // an unhandled "error" event, which Node treats as fatal.
    res.on("error", error => {
        log.warn("dashboard", `SSE stream write failed: ${error.message}`);
        cleanup();
    });

}


function createServer(){

    return http.createServer(async (req, res) => {

        const parsed = new URL(req.url, "http://localhost");
        const routeKey = `${req.method} ${parsed.pathname}`;

        try {

            // A synchronous throw here (e.g. res.writeHead() on an already-
            // closed socket) used to happen outside this try block -- since
            // nothing awaits this request handler's returned promise,
            // that became an unhandled rejection at the process level
            // instead of a normal error response. See docs/Architecture.md
            // "Production Hardening".
            if(parsed.pathname === "/api/events" && req.method === "GET"){
                return handleEventStream(req, res);
            }

            // Phase 34 (Production Dashboard): real CPU/RAM/disk/service
            // status -- see core/system/health.js. Async (fs.statfs has
            // no sync counterpart), so this can't live in the sync
            // ROUTES table below.
            if(parsed.pathname === "/api/system/health" && req.method === "GET"){
                return sendJSON(res, 200, await systemHealth.generate());
            }

            // Project F (Self Diagnostics): the unified, explainable
            // 0-100 health score combining CPU/RAM/disk/services
            // (health.js), poor-performing departments/tools
            // (selfImprovement.js), and broken capabilities
            // (marketplace.js) -- see core/system/healthScore.js.
            if(parsed.pathname === "/api/system/health-score" && req.method === "GET"){
                return sendJSON(res, 200, await healthScore.score());
            }

            // Project G (Autonomous Maintenance): report-only, reuses
            // real selfImprovement/marketplace checks -- never fixes
            // anything itself. See core/system/maintenance.js.
            if(parsed.pathname === "/api/system/consistency-report" && req.method === "GET"){
                return sendJSON(res, 200, maintenance.consistencyReport());
            }

            // Project N (First-Time User Experience): the real
            // combined checklist -- running/healthy/connected, plus
            // what still needs the operator (missing credentials,
            // approvals waiting, offline services). See
            // core/system/operationalReadiness.js.
            if(parsed.pathname === "/api/system/operational-readiness" && req.method === "GET"){
                return sendJSON(res, 200, await operationalReadiness.checklist());
            }

            if(parsed.pathname === "/api/system/maintenance/run-log-archival" && req.method === "POST"){

                const auth = checkApiAuth(req);

                if(!auth.ok){
                    return sendJSON(res, auth.status, { error: auth.error });
                }

                return sendJSON(res, 200, maintenance.runLogArchival());

            }

            // Universal search across memory/knowledge/capabilities in
            // one call -- see core/system/search.js.
            if(parsed.pathname === "/api/search" && req.method === "GET"){
                const q = parsed.searchParams.get("q");
                return sendJSON(res, 200, q ? universalSearch.search(q) : { query: "", memories: [], entities: [], capabilities: [] });
            }

            // Today's Priorities + Critical Alerts -- the dashboard's
            // top-of-page executive summary. Includes a real health
            // snapshot so resource-usage alerts are based on the SAME
            // figures /api/system/health reports, not a second read.
            if(parsed.pathname === "/api/executive/summary" && req.method === "GET"){
                const health = await systemHealth.generate();
                return sendJSON(res, 200, executiveSummary.generate({ health }));
            }

            if(parsed.pathname === "/api/memory" && req.method === "GET"){
                return sendJSON(res, 200, handleMemory(parsed.searchParams));
            }

            if(parsed.pathname === "/api/memory" && req.method === "POST"){

                const auth = checkApiAuth(req);

                if(!auth.ok){
                    return sendJSON(res, auth.status, { error: auth.error });
                }

                const input = JSON.parse((await readBody(req)) || "{}");

                if(!input.content){
                    return sendJSON(res, 400, { error: "content is required" });
                }

                return sendJSON(res, 200, memory.remember(input));

            }

            if(parsed.pathname === "/api/memory/semantic-search" && req.method === "POST"){

                const auth = checkApiAuth(req);

                if(!auth.ok){
                    return sendJSON(res, auth.status, { error: auth.error });
                }

                const { query } = JSON.parse((await readBody(req)) || "{}");

                if(!query){
                    return sendJSON(res, 400, { error: "query is required" });
                }

                return sendJSON(res, 200, await memory.semanticSearch(query));

            }

            if(parsed.pathname === "/api/memory/reindex-embeddings" && req.method === "POST"){

                const auth = checkApiAuth(req);

                if(!auth.ok){
                    return sendJSON(res, auth.status, { error: auth.error });
                }

                return sendJSON(res, 200, await memory.reindexEmbeddings());

            }

            if(parsed.pathname === "/api/sync/export" && req.method === "GET"){

                const auth = checkApiAuth(req);

                if(!auth.ok){
                    return sendJSON(res, auth.status, { error: auth.error });
                }

                return sendJSON(res, 200, sync.exportState());

            }

            if(parsed.pathname === "/api/sync/import" && req.method === "POST"){

                const auth = checkApiAuth(req);

                if(!auth.ok){
                    return sendJSON(res, auth.status, { error: auth.error });
                }

                const syncPackage = JSON.parse(await readBody(req));

                return sendJSON(res, 200, sync.importState(syncPackage));

            }

            // Phase 16 -- Device Network.
            if(parsed.pathname === "/api/devices/register" && req.method === "POST"){

                const auth = checkApiAuth(req);

                if(!auth.ok){
                    return sendJSON(res, auth.status, { error: auth.error });
                }

                const { name, type, role, capabilities } = JSON.parse((await readBody(req)) || "{}");

                if(!name || !type){
                    return sendJSON(res, 400, { error: "name and type are required" });
                }

                return sendJSON(res, 200, deviceManager.registerDevice({ name, type, role, capabilities }));

            }

            const deviceHeartbeatMatch = parsed.pathname.match(/^\/api\/devices\/([^/]+)\/heartbeat$/);

            if(deviceHeartbeatMatch && req.method === "POST"){

                const auth = checkApiAuth(req);

                if(!auth.ok){
                    return sendJSON(res, auth.status, { error: auth.error });
                }

                return sendJSON(res, 200, deviceManager.heartbeat(decodeURIComponent(deviceHeartbeatMatch[1])));

            }

            const deviceRoleMatch = parsed.pathname.match(/^\/api\/devices\/([^/]+)\/role$/);

            if(deviceRoleMatch && req.method === "POST"){

                const auth = checkApiAuth(req);

                if(!auth.ok){
                    return sendJSON(res, auth.status, { error: auth.error });
                }

                const { role } = JSON.parse((await readBody(req)) || "{}");

                if(!role){
                    return sendJSON(res, 400, { error: "role is required" });
                }

                return sendJSON(res, 200, deviceManager.assignRole(decodeURIComponent(deviceRoleMatch[1]), role));

            }

            if(parsed.pathname === "/api/executive/plan" && req.method === "POST"){

                const auth = checkApiAuth(req);

                if(!auth.ok){
                    return sendJSON(res, auth.status, { error: auth.error });
                }

                const goal = JSON.parse((await readBody(req)) || "{}");

                if(!goal.title){
                    return sendJSON(res, 400, { error: "title is required" });
                }

                return sendJSON(res, 200, executive.plan(goal));

            }

            // Plans AND decomposes a goal in one call -- the "objective ->
            // plan -> department assignment" half of the executive flow,
            // in one round trip instead of a plan then a separate decompose
            // call. Execution itself still only happens via the autonomous
            // "execute-tasks" job or the manual /run-next trigger below --
            // pursuing a goal never immediately dispatches real work.
            if(parsed.pathname === "/api/executive/pursue" && req.method === "POST"){

                const auth = checkApiAuth(req);

                if(!auth.ok){
                    return sendJSON(res, auth.status, { error: auth.error });
                }

                const goal = JSON.parse((await readBody(req)) || "{}");

                if(!goal.title){
                    return sendJSON(res, 400, { error: "title is required" });
                }

                return sendJSON(res, 200, await orchestrator.pursue(goal));

            }

            // Manually runs exactly one ready task right now, instead of
            // waiting for the "execute-tasks" schedule -- the same bounded,
            // one-task-per-call unit of work the automation job calls on
            // its own interval (see core/automation/jobs.js).
            if(parsed.pathname === "/api/executive/run-next" && req.method === "POST"){

                const auth = checkApiAuth(req);

                if(!auth.ok){
                    return sendJSON(res, auth.status, { error: auth.error });
                }

                return sendJSON(res, 200, await orchestrator.runNextReadyTask());

            }

            if(parsed.pathname === "/api/executive/consolidate" && req.method === "POST"){

                const auth = checkApiAuth(req);

                if(!auth.ok){
                    return sendJSON(res, auth.status, { error: auth.error });
                }

                return sendJSON(res, 200, await executive.consolidate());

            }

            if(parsed.pathname === "/api/executive/self-check" && req.method === "POST"){

                const auth = checkApiAuth(req);

                if(!auth.ok){
                    return sendJSON(res, auth.status, { error: auth.error });
                }

                return sendJSON(res, 200, await executive.runSelfCheck());

            }

            // Phase 11 -- Executive Intelligence Layer. All three are
            // rule-based (no LLM call, see each module's own header
            // comment) -- POST rather than GET only because they persist
            // a new record each time, same reasoning as consolidate/
            // self-check above.
            if(parsed.pathname === "/api/executive/recommendations" && req.method === "POST"){

                const auth = checkApiAuth(req);

                if(!auth.ok){
                    return sendJSON(res, auth.status, { error: auth.error });
                }

                return sendJSON(res, 200, executive.recommendations());

            }

            if(parsed.pathname === "/api/executive/daily-briefing" && req.method === "POST"){

                const auth = checkApiAuth(req);

                if(!auth.ok){
                    return sendJSON(res, auth.status, { error: auth.error });
                }

                return sendJSON(res, 200, executive.dailyBriefing());

            }

            if(parsed.pathname === "/api/executive/weekly-report" && req.method === "POST"){

                const auth = checkApiAuth(req);

                if(!auth.ok){
                    return sendJSON(res, auth.status, { error: auth.error });
                }

                return sendJSON(res, 200, executive.weeklyOperatingReport());

            }

            // Phase 14 -- Daily Operating System (evening half).
            if(parsed.pathname === "/api/executive/daily-review" && req.method === "POST"){

                const auth = checkApiAuth(req);

                if(!auth.ok){
                    return sendJSON(res, auth.status, { error: auth.error });
                }

                return sendJSON(res, 200, executive.dailyReview());

            }

            // Phase 48 (Executive Intelligence): a real LLM-synthesized
            // executive brief over company health/risk/cross-department
            // data -- a real, billed call, gated like every other one.
            if(parsed.pathname === "/api/executive/brief" && req.method === "POST"){

                const auth = checkApiAuth(req);

                if(!auth.ok){
                    return sendJSON(res, auth.status, { error: auth.error });
                }

                const { companyId } = JSON.parse((await readBody(req)) || "{}");

                if(!companyId){
                    return sendJSON(res, 400, { error: "companyId is required" });
                }

                return sendJSON(res, 200, await executiveIntelligence.generateExecutiveBrief(companyId));

            }

            // Phase 51 (Executive Constitution).
            if(parsed.pathname === "/api/constitution/set" && req.method === "POST"){

                const auth = checkApiAuth(req);

                if(!auth.ok){
                    return sendJSON(res, auth.status, { error: auth.error });
                }

                const { path: fieldPath, value } = JSON.parse((await readBody(req)) || "{}");

                if(!fieldPath){
                    return sendJSON(res, 400, { error: "path is required" });
                }

                return sendJSON(res, 200, constitution.set(fieldPath, value));

            }

            if(parsed.pathname === "/api/constitution/add" && req.method === "POST"){

                const auth = checkApiAuth(req);

                if(!auth.ok){
                    return sendJSON(res, auth.status, { error: auth.error });
                }

                const { field, value } = JSON.parse((await readBody(req)) || "{}");

                if(!field){
                    return sendJSON(res, 400, { error: "field is required" });
                }

                return sendJSON(res, 200, constitution.add(field, value));

            }

            // Phase 55 (Multi-Model Intelligence).
            if(parsed.pathname === "/api/brain/routing-preferences/set" && req.method === "POST"){

                const auth = checkApiAuth(req);

                if(!auth.ok){
                    return sendJSON(res, auth.status, { error: auth.error });
                }

                const { taskType, provider } = JSON.parse((await readBody(req)) || "{}");

                if(!taskType || !provider){
                    return sendJSON(res, 400, { error: "taskType and provider are required" });
                }

                return sendJSON(res, 200, brainRouting.setPreference(taskType, provider));

            }

            if(parsed.pathname === "/api/brain/routing-preferences/clear" && req.method === "POST"){

                const auth = checkApiAuth(req);

                if(!auth.ok){
                    return sendJSON(res, auth.status, { error: auth.error });
                }

                const { taskType } = JSON.parse((await readBody(req)) || "{}");

                if(!taskType){
                    return sendJSON(res, 400, { error: "taskType is required" });
                }

                return sendJSON(res, 200, brainRouting.clearPreference(taskType));

            }

            // Phase 56 (Personal Intelligence Engine).
            if(parsed.pathname === "/api/personal-intelligence/dismiss" && req.method === "POST"){

                const auth = checkApiAuth(req);

                if(!auth.ok){
                    return sendJSON(res, auth.status, { error: auth.error });
                }

                const { subject, reason } = JSON.parse((await readBody(req)) || "{}");

                if(!subject){
                    return sendJSON(res, 400, { error: "subject is required" });
                }

                return sendJSON(res, 200, personalIntelligence.dismissInference(subject, reason));

            }

            // Phase 57 (Knowledge Acquisition Engine): a real, billed LLM
            // call per file/note -- gated like every other one.
            if(parsed.pathname === "/api/knowledge/acquire-file" && req.method === "POST"){

                const auth = checkApiAuth(req);

                if(!auth.ok){
                    return sendJSON(res, auth.status, { error: auth.error });
                }

                const { path: filePath } = JSON.parse((await readBody(req)) || "{}");

                if(!filePath){
                    return sendJSON(res, 400, { error: "path is required" });
                }

                return sendJSON(res, 200, await fileIntelligence.acquireFromFile(filePath));

            }

            if(parsed.pathname === "/api/knowledge/acquire-note" && req.method === "POST"){

                const auth = checkApiAuth(req);

                if(!auth.ok){
                    return sendJSON(res, auth.status, { error: auth.error });
                }

                const { path: notePath } = JSON.parse((await readBody(req)) || "{}");

                if(!notePath){
                    return sendJSON(res, 400, { error: "path is required" });
                }

                return sendJSON(res, 200, await obsidian.acquireFromNote(notePath));

            }

            // Phase 31 (Mission Engine): "I want a $5,000/month online
            // business" -> a real project + real decomposition + real
            // capability-gap analysis + a rough timeline, one persisted
            // mission. A real, billed LLM call (decomposition) -- gated
            // like every other action with a real cost.
            if(parsed.pathname === "/api/executive/missions" && req.method === "POST"){

                const auth = checkApiAuth(req);

                if(!auth.ok){
                    return sendJSON(res, auth.status, { error: auth.error });
                }

                const { objective, department, priority, deadline } = JSON.parse((await readBody(req)) || "{}");

                if(!objective){
                    return sendJSON(res, 400, { error: "objective is required" });
                }

                return sendJSON(res, 200, await executive.defineMission(objective, { department, priority, deadline }));

            }

            const missionStatusMatch = parsed.pathname.match(/^\/api\/executive\/missions\/([^/]+)\/status$/);

            if(missionStatusMatch && req.method === "GET"){
                return sendJSON(res, 200, executive.missionStatus(decodeURIComponent(missionStatusMatch[1])));
            }

            const missionRecommendMatch = parsed.pathname.match(/^\/api\/executive\/missions\/([^/]+)\/recommendations$/);

            if(missionRecommendMatch && req.method === "GET"){
                return sendJSON(res, 200, executive.missionRecommendations(decodeURIComponent(missionRecommendMatch[1])));
            }

            // Phase 15 -- Controlled Autonomy: Observation ->
            // Recommendation -> Proposal -> Approval -> Execution.
            if(parsed.pathname === "/api/executive/proposals/generate" && req.method === "POST"){

                const auth = checkApiAuth(req);

                if(!auth.ok){
                    return sendJSON(res, auth.status, { error: auth.error });
                }

                return sendJSON(res, 200, executive.generateProposals());

            }

            // Phase 41: proposes ANY external action generically (not
            // marketing-specific) -- this is how the Marketing Division's
            // Publishing Queue ("publish_content") reaches a pending
            // proposal from the dashboard; approve/reject/execute-external
            // below already work on it identically to every other
            // external action.
            if(parsed.pathname === "/api/executive/proposals/external" && req.method === "POST"){

                const auth = checkApiAuth(req);

                if(!auth.ok){
                    return sendJSON(res, auth.status, { error: auth.error });
                }

                const { action, reason, payload, risk } = JSON.parse((await readBody(req)) || "{}");

                return sendJSON(res, 200, executive.proposeExternalAction({ action, reason, payload, risk }));

            }

            const proposalApproveMatch = parsed.pathname.match(/^\/api\/executive\/proposals\/([^/]+)\/approve$/);

            if(proposalApproveMatch && req.method === "POST"){

                const auth = checkApiAuth(req);

                if(!auth.ok){
                    return sendJSON(res, auth.status, { error: auth.error });
                }

                const { note } = JSON.parse((await readBody(req)) || "{}");

                return sendJSON(res, 200, executive.approveProposal(decodeURIComponent(proposalApproveMatch[1]), note));

            }

            const proposalRejectMatch = parsed.pathname.match(/^\/api\/executive\/proposals\/([^/]+)\/reject$/);

            if(proposalRejectMatch && req.method === "POST"){

                const auth = checkApiAuth(req);

                if(!auth.ok){
                    return sendJSON(res, auth.status, { error: auth.error });
                }

                const { note } = JSON.parse((await readBody(req)) || "{}");

                return sendJSON(res, 200, executive.rejectProposal(decodeURIComponent(proposalRejectMatch[1]), note));

            }

            // The async counterpart to the route below, for external
            // proposals (create_github_issue/post_discord_message/
            // install_capability) -- see executeExternalProposal()'s own
            // comment for why this is a separate method/route rather
            // than reusing the internal-action execute() route.
            const proposalExecuteExternalMatch = parsed.pathname.match(/^\/api\/executive\/proposals\/([^/]+)\/execute-external$/);

            if(proposalExecuteExternalMatch && req.method === "POST"){

                const auth = checkApiAuth(req);

                if(!auth.ok){
                    return sendJSON(res, auth.status, { error: auth.error });
                }

                return sendJSON(res, 200, await executive.executeExternalProposal(decodeURIComponent(proposalExecuteExternalMatch[1])));

            }

            // Phase 20: install a capability package from a directory
            // path on this machine -- approvalRequired packages return a
            // pending proposal instead (approve it, then POST the
            // execute-external route above to actually install).
            if(parsed.pathname === "/api/capabilities/install" && req.method === "POST"){

                const auth = checkApiAuth(req);

                if(!auth.ok){
                    return sendJSON(res, auth.status, { error: auth.error });
                }

                const { packageDir } = JSON.parse((await readBody(req)) || "{}");

                if(!packageDir){
                    return sendJSON(res, 400, { error: "packageDir is required" });
                }

                return sendJSON(res, 200, installer.install(packageDir));

            }

            // Phase 27 (Internal Package Builder): generates a new
            // capability package's real SKELETON files (manifest, agent/
            // tool placeholders, a self-validating test, a README) --
            // does NOT install/activate it (call POST
            // /api/capabilities/install with the returned packageDir for
            // that, same as any other package).
            if(parsed.pathname === "/api/capabilities/build" && req.method === "POST"){

                const auth = checkApiAuth(req);

                if(!auth.ok){
                    return sendJSON(res, auth.status, { error: auth.error });
                }

                const input = JSON.parse((await readBody(req)) || "{}");

                if(!input.name){
                    return sendJSON(res, 400, { error: "name is required" });
                }

                return sendJSON(res, 200, capabilitiesBuilder.buildPackage(input));

            }

            // Phase 39 (Autonomous Capability Builder): the full
            // analyze -> plan -> generate -> validate -> request-approval
            // pipeline from a single free-text objective (e.g. "Build a
            // recruiting department"). Always produces a pending
            // approval proposal -- never installs/activates on its own.
            if(parsed.pathname === "/api/capabilities/autonomous-build" && req.method === "POST"){

                const auth = checkApiAuth(req);

                if(!auth.ok){
                    return sendJSON(res, auth.status, { error: auth.error });
                }

                const { objective } = JSON.parse((await readBody(req)) || "{}");

                if(!objective){
                    return sendJSON(res, 400, { error: "objective is required" });
                }

                return sendJSON(res, 200, autonomousBuilder.buildCapability(objective));

            }

            // Phase 29 (Research & Knowledge Engine): a real outbound
            // fetch plus a real, billed LLM call -- gated behind
            // API_TOKEN like every other action with a real cost, unlike
            // the read-only analyze/search routes above.
            if(parsed.pathname === "/api/research" && req.method === "POST"){

                const auth = checkApiAuth(req);

                if(!auth.ok){
                    return sendJSON(res, auth.status, { error: auth.error });
                }

                const { topic, url } = JSON.parse((await readBody(req)) || "{}");

                if(!topic || !url){
                    return sendJSON(res, 400, { error: "topic and url are required" });
                }

                return sendJSON(res, 200, await researchEngine.research(topic, { url }));

            }

            // Phase 30: persists a self-improvement report (a real memory
            // write, gated the same as every other executive "run" route
            // -- e.g. /api/executive/self-check above -- even though this
            // one makes no external/billed calls).
            if(parsed.pathname === "/api/system/self-improvement/run" && req.method === "POST"){

                const auth = checkApiAuth(req);

                if(!auth.ok){
                    return sendJSON(res, auth.status, { error: auth.error });
                }

                return sendJSON(res, 200, selfImprovement.run());

            }

            // Phase 20: "VERONICA, create a trading division" -- the
            // capability-gap analysis step. Read-only, no auth required
            // (same posture as every other GET-shaped analysis endpoint),
            // implemented as POST only because it takes a body (the
            // free-text objective).
            if(parsed.pathname === "/api/capabilities/analyze" && req.method === "POST"){

                const { objective } = JSON.parse((await readBody(req)) || "{}");

                if(!objective){
                    return sendJSON(res, 400, { error: "objective is required" });
                }

                return sendJSON(res, 200, capabilitiesPlanner.analyzeRequest(objective));

            }

            const proposalExecuteMatch = parsed.pathname.match(/^\/api\/executive\/proposals\/([^/]+)\/execute$/);

            if(proposalExecuteMatch && req.method === "POST"){

                const auth = checkApiAuth(req);

                if(!auth.ok){
                    return sendJSON(res, auth.status, { error: auth.error });
                }

                return sendJSON(res, 200, executive.executeProposal(decodeURIComponent(proposalExecuteMatch[1])));

            }

            if(parsed.pathname === "/api/learning/recommend" && req.method === "POST"){

                const auth = checkApiAuth(req);

                if(!auth.ok){
                    return sendJSON(res, auth.status, { error: auth.error });
                }

                return sendJSON(res, 200, await learning.recommend());

            }

            const automationRunMatch = parsed.pathname.match(/^\/api\/automation\/jobs\/([^/]+)\/run$/);

            if(automationRunMatch && req.method === "POST"){

                const auth = checkApiAuth(req);

                if(!auth.ok){
                    return sendJSON(res, auth.status, { error: auth.error });
                }

                return sendJSON(res, 200, automation.enqueue(decodeURIComponent(automationRunMatch[1])));

            }

            // Phase 54 (Automation Engine 2.0): runs a real, defined-in-
            // code workflow synchronously, same "authenticated dashboard
            // action directly executes real work" convention
            // POST /api/departments/:id/run already established.
            const workflowRunMatch = parsed.pathname.match(/^\/api\/automation\/workflows\/([^/]+)\/run$/);

            if(workflowRunMatch && req.method === "POST"){

                const auth = checkApiAuth(req);

                if(!auth.ok){
                    return sendJSON(res, auth.status, { error: auth.error });
                }

                const context = JSON.parse((await readBody(req)) || "{}");

                return sendJSON(res, 200, await automationWorkflow.runWorkflow(decodeURIComponent(workflowRunMatch[1]), context));

            }

            if(parsed.pathname === "/api/collaboration/message" && req.method === "POST"){

                const auth = checkApiAuth(req);

                if(!auth.ok){
                    return sendJSON(res, auth.status, { error: auth.error });
                }

                const { from, to, message } = JSON.parse((await readBody(req)) || "{}");

                return sendJSON(res, 200, collaboration.sendMessage(from, to, message));

            }

            if(parsed.pathname === "/api/collaboration/delegate" && req.method === "POST"){

                const auth = checkApiAuth(req);

                if(!auth.ok){
                    return sendJSON(res, auth.status, { error: auth.error });
                }

                const { from, to, task } = JSON.parse((await readBody(req)) || "{}");

                return sendJSON(res, 200, await collaboration.delegate(from, to, task));

            }

            if(parsed.pathname === "/api/collaboration/review" && req.method === "POST"){

                const auth = checkApiAuth(req);

                if(!auth.ok){
                    return sendJSON(res, auth.status, { error: auth.error });
                }

                const { reviewer, content, criteria } = JSON.parse((await readBody(req)) || "{}");

                return sendJSON(res, 200, await collaboration.review(reviewer, content, { criteria }));

            }

            if(parsed.pathname === "/api/collaboration/consensus" && req.method === "POST"){

                const auth = checkApiAuth(req);

                if(!auth.ok){
                    return sendJSON(res, auth.status, { error: auth.error });
                }

                const { departmentIds, proposal } = JSON.parse((await readBody(req)) || "{}");

                return sendJSON(res, 200, await collaboration.consensus(departmentIds, proposal));

            }

            // Phase 50 (Department Collaboration): turns every currently-
            // detected opportunity into a real, pending ActionProposal --
            // no department actually delegates anything until a human
            // approves and executes it (see actionProposal.js's
            // "request_department_collaboration" case).
            if(parsed.pathname === "/api/collaboration/opportunities/generate" && req.method === "POST"){

                const auth = checkApiAuth(req);

                if(!auth.ok){
                    return sendJSON(res, auth.status, { error: auth.error });
                }

                const { companyId } = JSON.parse((await readBody(req)) || "{}");

                return sendJSON(res, 200, collaborationRules.generateCollaborationProposals(companyId || null));

            }

            const decomposeMatch = parsed.pathname.match(/^\/api\/executive\/projects\/([^/]+)\/decompose$/);

            if(decomposeMatch && req.method === "POST"){

                const auth = checkApiAuth(req);

                if(!auth.ok){
                    return sendJSON(res, auth.status, { error: auth.error });
                }

                return sendJSON(res, 200, await executive.decompose(decodeURIComponent(decomposeMatch[1])));

            }

            const statusMatch = parsed.pathname.match(/^\/api\/executive\/projects\/([^/]+)\/status$/);

            if(statusMatch && req.method === "POST"){

                const auth = checkApiAuth(req);

                if(!auth.ok){
                    return sendJSON(res, auth.status, { error: auth.error });
                }

                const { status, note } = JSON.parse((await readBody(req)) || "{}");

                if(!status){
                    return sendJSON(res, 400, { error: "status is required" });
                }

                return sendJSON(res, 200, executive.updateStatus(decodeURIComponent(statusMatch[1]), status, note));

            }

            const artifactMatch = parsed.pathname.match(/^\/api\/executive\/projects\/([^/]+)\/artifacts$/);

            if(artifactMatch && req.method === "POST"){

                const auth = checkApiAuth(req);

                if(!auth.ok){
                    return sendJSON(res, auth.status, { error: auth.error });
                }

                const { artifact } = JSON.parse((await readBody(req)) || "{}");

                if(!artifact){
                    return sendJSON(res, 400, { error: "artifact is required" });
                }

                return sendJSON(res, 200, { artifacts: executive.addArtifact(decodeURIComponent(artifactMatch[1]), artifact) });

            }

            const handoffMatch = parsed.pathname.match(/^\/api\/executive\/projects\/([^/]+)\/handoff$/);

            if(handoffMatch && req.method === "POST"){

                const auth = checkApiAuth(req);

                if(!auth.ok){
                    return sendJSON(res, auth.status, { error: auth.error });
                }

                const { toDepartmentId, note } = JSON.parse((await readBody(req)) || "{}");

                if(!toDepartmentId){
                    return sendJSON(res, 400, { error: "toDepartmentId is required" });
                }

                return sendJSON(res, 200, executive.reassignDepartment(decodeURIComponent(handoffMatch[1]), toDepartmentId, note));

            }

            // Read-only: no auth required, same treatment as the other GET
            // routes -- must come after the write routes above since they
            // share the /api/executive/projects/:id/... prefix.
            const projectDetailMatch = parsed.pathname.match(/^\/api\/executive\/projects\/([^/]+)$/);

            if(projectDetailMatch && req.method === "GET"){

                return sendJSON(res, 200, executive.getProject(decodeURIComponent(projectDetailMatch[1])));

            }

            if(parsed.pathname === "/api/companies" && req.method === "POST"){

                const auth = checkApiAuth(req);

                if(!auth.ok){
                    return sendJSON(res, auth.status, { error: auth.error });
                }

                const input = JSON.parse((await readBody(req)) || "{}");

                if(!input.name){
                    return sendJSON(res, 400, { error: "name is required" });
                }

                return sendJSON(res, 200, executive.createCompany(input));

            }

            const employeeMatch = parsed.pathname.match(/^\/api\/companies\/([^/]+)\/employees$/);

            if(employeeMatch && req.method === "POST"){

                const auth = checkApiAuth(req);

                if(!auth.ok){
                    return sendJSON(res, auth.status, { error: auth.error });
                }

                const { employee } = JSON.parse((await readBody(req)) || "{}");

                if(!employee){
                    return sendJSON(res, 400, { error: "employee is required" });
                }

                return sendJSON(res, 200, { employees: executive.addEmployee(decodeURIComponent(employeeMatch[1]), employee) });

            }

            const documentMatch = parsed.pathname.match(/^\/api\/companies\/([^/]+)\/documents$/);

            if(documentMatch && req.method === "POST"){

                const auth = checkApiAuth(req);

                if(!auth.ok){
                    return sendJSON(res, auth.status, { error: auth.error });
                }

                const { document } = JSON.parse((await readBody(req)) || "{}");

                if(!document){
                    return sendJSON(res, 400, { error: "document is required" });
                }

                return sendJSON(res, 200, { documents: executive.addDocument(decodeURIComponent(documentMatch[1]), document) });

            }

            const financeMatch = parsed.pathname.match(/^\/api\/companies\/([^/]+)\/finances$/);

            if(financeMatch && req.method === "POST"){

                const auth = checkApiAuth(req);

                if(!auth.ok){
                    return sendJSON(res, auth.status, { error: auth.error });
                }

                const { label, amount, type } = JSON.parse((await readBody(req)) || "{}");

                return sendJSON(res, 200, executive.recordFinance(decodeURIComponent(financeMatch[1]), { label, amount, type }));

            }

            const relationshipMatch = parsed.pathname.match(/^\/api\/companies\/([^/]+)\/relationships$/);

            if(relationshipMatch && req.method === "POST"){

                const auth = checkApiAuth(req);

                if(!auth.ok){
                    return sendJSON(res, auth.status, { error: auth.error });
                }

                const { to, type } = JSON.parse((await readBody(req)) || "{}");

                return sendJSON(res, 200, executive.addCompanyRelationship(decodeURIComponent(relationshipMatch[1]), { to, type }));

            }

            const communicationMatch = parsed.pathname.match(/^\/api\/companies\/([^/]+)\/communications$/);

            if(communicationMatch && req.method === "POST"){

                const auth = checkApiAuth(req);

                if(!auth.ok){
                    return sendJSON(res, auth.status, { error: auth.error });
                }

                const { summary, channel } = JSON.parse((await readBody(req)) || "{}");

                if(!summary){
                    return sendJSON(res, 400, { error: "summary is required" });
                }

                return sendJSON(res, 200, executive.logCommunication(decodeURIComponent(communicationMatch[1]), { summary, channel }));

            }

            // Phase 41 (Marketing Division / Company Brain).
            const brandProfileMatch = parsed.pathname.match(/^\/api\/companies\/([^/]+)\/brand-profile$/);

            if(brandProfileMatch && req.method === "POST"){

                const auth = checkApiAuth(req);

                if(!auth.ok){
                    return sendJSON(res, auth.status, { error: auth.error });
                }

                const patch = JSON.parse((await readBody(req)) || "{}");

                return sendJSON(res, 200, executive.setBrandProfile(decodeURIComponent(brandProfileMatch[1]), patch));

            }

            if(brandProfileMatch && req.method === "GET"){

                return sendJSON(res, 200, executive.getBrandProfile(decodeURIComponent(brandProfileMatch[1])));

            }

            const decisionMatch = parsed.pathname.match(/^\/api\/companies\/([^/]+)\/decisions$/);

            if(decisionMatch && req.method === "POST"){

                const auth = checkApiAuth(req);

                if(!auth.ok){
                    return sendJSON(res, auth.status, { error: auth.error });
                }

                const { decision, reason } = JSON.parse((await readBody(req)) || "{}");

                if(!decision){
                    return sendJSON(res, 400, { error: "decision is required" });
                }

                return sendJSON(res, 200, { history: executive.recordDecision(decodeURIComponent(decisionMatch[1]), { decision, reason }) });

            }

            // Read-only: no auth required. The single aggregated "Company
            // Brain" view -- mission/vision/values/brand/products/
            // services/goals/audience/competitors/assets/departments/
            // projects/campaigns/clients/team/operatingRules/
            // historicalDecisions in one call (core/executive/
            // companyManager.js's companyBrain()).
            const companyBrainMatch = parsed.pathname.match(/^\/api\/companies\/([^/]+)\/brain$/);

            if(companyBrainMatch && req.method === "GET"){

                return sendJSON(res, 200, executive.companyBrain(decodeURIComponent(companyBrainMatch[1])));

            }

            // Phase 41 (Marketing Division): campaign lifecycle routes.
            if(parsed.pathname === "/api/marketing/campaigns" && req.method === "POST"){

                const auth = checkApiAuth(req);

                if(!auth.ok){
                    return sendJSON(res, auth.status, { error: auth.error });
                }

                const input = JSON.parse((await readBody(req)) || "{}");

                return sendJSON(res, 200, marketingCampaigns.createCampaign(input));

            }

            const campaignScheduleMatch = parsed.pathname.match(/^\/api\/marketing\/campaigns\/([^/]+)\/schedule-content$/);

            if(campaignScheduleMatch && req.method === "POST"){

                const auth = checkApiAuth(req);

                if(!auth.ok){
                    return sendJSON(res, auth.status, { error: auth.error });
                }

                const item = JSON.parse((await readBody(req)) || "{}");

                return sendJSON(res, 200, { contentSchedule: marketingCampaigns.scheduleContent(decodeURIComponent(campaignScheduleMatch[1]), item) });

            }

            // Real LLM call (core/marketing/contentGenerator.js) -- auth
            // required, same as any other real-cost action.
            const campaignDraftMatch = parsed.pathname.match(/^\/api\/marketing\/campaigns\/([^/]+)\/generate-draft$/);

            if(campaignDraftMatch && req.method === "POST"){

                const auth = checkApiAuth(req);

                if(!auth.ok){
                    return sendJSON(res, auth.status, { error: auth.error });
                }

                const { itemId } = JSON.parse((await readBody(req)) || "{}");

                if(!itemId){
                    return sendJSON(res, 400, { error: "itemId is required" });
                }

                const draftContent = await marketingContentGenerator.generateDraft(decodeURIComponent(campaignDraftMatch[1]), itemId);

                return sendJSON(res, 200, { draftContent });

            }

            const campaignApprovalMatch = parsed.pathname.match(/^\/api\/marketing\/campaigns\/([^/]+)\/approval-status$/);

            if(campaignApprovalMatch && req.method === "POST"){

                const auth = checkApiAuth(req);

                if(!auth.ok){
                    return sendJSON(res, auth.status, { error: auth.error });
                }

                const { status } = JSON.parse((await readBody(req)) || "{}");

                return sendJSON(res, 200, { approvalStatus: marketingCampaigns.setApprovalStatus(decodeURIComponent(campaignApprovalMatch[1]), status) });

            }

            const campaignMetricsMatch = parsed.pathname.match(/^\/api\/marketing\/campaigns\/([^/]+)\/metrics$/);

            if(campaignMetricsMatch && req.method === "POST"){

                const auth = checkApiAuth(req);

                if(!auth.ok){
                    return sendJSON(res, auth.status, { error: auth.error });
                }

                const metrics = JSON.parse((await readBody(req)) || "{}");

                return sendJSON(res, 200, { performanceMetrics: marketingCampaigns.recordMetrics(decodeURIComponent(campaignMetricsMatch[1]), metrics) });

            }

            const campaignLessonMatch = parsed.pathname.match(/^\/api\/marketing\/campaigns\/([^/]+)\/lessons$/);

            if(campaignLessonMatch && req.method === "POST"){

                const auth = checkApiAuth(req);

                if(!auth.ok){
                    return sendJSON(res, auth.status, { error: auth.error });
                }

                const { lesson } = JSON.parse((await readBody(req)) || "{}");

                if(!lesson){
                    return sendJSON(res, 400, { error: "lesson is required" });
                }

                return sendJSON(res, 200, { lessonsLearned: marketingCampaigns.recordLessonLearned(decodeURIComponent(campaignLessonMatch[1]), lesson) });

            }

            // Read-only: no auth required -- must come after the write
            // routes above since they share the /api/marketing/campaigns/:id...
            // prefix.
            const campaignDetailMatch = parsed.pathname.match(/^\/api\/marketing\/campaigns\/([^/]+)$/);

            if(campaignDetailMatch && req.method === "GET"){

                return sendJSON(res, 200, marketingCampaigns.getCampaign(decodeURIComponent(campaignDetailMatch[1])));

            }

            // Phase 42 (Sales Division): lead lifecycle routes.
            if(parsed.pathname === "/api/sales/leads" && req.method === "POST"){

                const auth = checkApiAuth(req);

                if(!auth.ok){
                    return sendJSON(res, auth.status, { error: auth.error });
                }

                const input = JSON.parse((await readBody(req)) || "{}");

                return sendJSON(res, 200, salesLeads.createLead(input));

            }

            const leadInteractionMatch = parsed.pathname.match(/^\/api\/sales\/leads\/([^/]+)\/interactions$/);

            if(leadInteractionMatch && req.method === "POST"){

                const auth = checkApiAuth(req);

                if(!auth.ok){
                    return sendJSON(res, auth.status, { error: auth.error });
                }

                const interaction = JSON.parse((await readBody(req)) || "{}");

                return sendJSON(res, 200, { interactions: salesLeads.logInteraction(decodeURIComponent(leadInteractionMatch[1]), interaction) });

            }

            const leadSignalsMatch = parsed.pathname.match(/^\/api\/sales\/leads\/([^/]+)\/signals$/);

            if(leadSignalsMatch && req.method === "POST"){

                const auth = checkApiAuth(req);

                if(!auth.ok){
                    return sendJSON(res, auth.status, { error: auth.error });
                }

                const signals = JSON.parse((await readBody(req)) || "{}");

                return sendJSON(res, 200, { signals: salesLeads.setSignals(decodeURIComponent(leadSignalsMatch[1]), signals) });

            }

            const leadStatusMatch = parsed.pathname.match(/^\/api\/sales\/leads\/([^/]+)\/status$/);

            if(leadStatusMatch && req.method === "POST"){

                const auth = checkApiAuth(req);

                if(!auth.ok){
                    return sendJSON(res, auth.status, { error: auth.error });
                }

                const { status } = JSON.parse((await readBody(req)) || "{}");

                return sendJSON(res, 200, { status: salesLeads.setStatus(decodeURIComponent(leadStatusMatch[1]), status) });

            }

            const leadScoreMatch = parsed.pathname.match(/^\/api\/sales\/leads\/([^/]+)\/score$/);

            if(leadScoreMatch && req.method === "POST"){

                const auth = checkApiAuth(req);

                if(!auth.ok){
                    return sendJSON(res, auth.status, { error: auth.error });
                }

                return sendJSON(res, 200, salesLeads.scoreLead(decodeURIComponent(leadScoreMatch[1])));

            }

            // Read-only: no auth required -- must come after the write
            // routes above since they share the /api/sales/leads/:id...
            // prefix.
            const leadDetailMatch = parsed.pathname.match(/^\/api\/sales\/leads\/([^/]+)$/);

            if(leadDetailMatch && req.method === "GET"){

                return sendJSON(res, 200, salesLeads.getLead(decodeURIComponent(leadDetailMatch[1])));

            }

            // Phase 42 (Sales Division): opportunity lifecycle routes.
            if(parsed.pathname === "/api/sales/opportunities" && req.method === "POST"){

                const auth = checkApiAuth(req);

                if(!auth.ok){
                    return sendJSON(res, auth.status, { error: auth.error });
                }

                const input = JSON.parse((await readBody(req)) || "{}");

                return sendJSON(res, 200, salesOpportunities.createOpportunity(input));

            }

            const opportunityStageMatch = parsed.pathname.match(/^\/api\/sales\/opportunities\/([^/]+)\/stage$/);

            if(opportunityStageMatch && req.method === "POST"){

                const auth = checkApiAuth(req);

                if(!auth.ok){
                    return sendJSON(res, auth.status, { error: auth.error });
                }

                const { stage, reason } = JSON.parse((await readBody(req)) || "{}");

                return sendJSON(res, 200, salesOpportunities.setStage(decodeURIComponent(opportunityStageMatch[1]), stage, { reason }));

            }

            const opportunityContactMatch = parsed.pathname.match(/^\/api\/sales\/opportunities\/([^/]+)\/contacts$/);

            if(opportunityContactMatch && req.method === "POST"){

                const auth = checkApiAuth(req);

                if(!auth.ok){
                    return sendJSON(res, auth.status, { error: auth.error });
                }

                const contact = JSON.parse((await readBody(req)) || "{}");

                return sendJSON(res, 200, { contacts: salesOpportunities.addContact(decodeURIComponent(opportunityContactMatch[1]), contact) });

            }

            const opportunityFollowUpMatch = parsed.pathname.match(/^\/api\/sales\/opportunities\/([^/]+)\/follow-ups$/);

            if(opportunityFollowUpMatch && req.method === "POST"){

                const auth = checkApiAuth(req);

                if(!auth.ok){
                    return sendJSON(res, auth.status, { error: auth.error });
                }

                const item = JSON.parse((await readBody(req)) || "{}");

                return sendJSON(res, 200, { followUps: salesOpportunities.scheduleFollowUp(decodeURIComponent(opportunityFollowUpMatch[1]), item) });

            }

            const opportunityFollowUpCompleteMatch = parsed.pathname.match(/^\/api\/sales\/opportunities\/([^/]+)\/follow-ups\/([^/]+)\/complete$/);

            if(opportunityFollowUpCompleteMatch && req.method === "POST"){

                const auth = checkApiAuth(req);

                if(!auth.ok){
                    return sendJSON(res, auth.status, { error: auth.error });
                }

                return sendJSON(res, 200, salesOpportunities.completeFollowUp(
                    decodeURIComponent(opportunityFollowUpCompleteMatch[1]),
                    decodeURIComponent(opportunityFollowUpCompleteMatch[2])
                ));

            }

            // Real LLM call (core/sales/proposalGenerator.js) -- auth
            // required, same as any other real-cost action.
            const opportunityProposalMatch = parsed.pathname.match(/^\/api\/sales\/opportunities\/([^/]+)\/generate-proposal$/);

            if(opportunityProposalMatch && req.method === "POST"){

                const auth = checkApiAuth(req);

                if(!auth.ok){
                    return sendJSON(res, auth.status, { error: auth.error });
                }

                const proposalDraft = await salesProposalGenerator.generateProposal(decodeURIComponent(opportunityProposalMatch[1]));

                return sendJSON(res, 200, { proposalDraft });

            }

            const opportunityLessonMatch = parsed.pathname.match(/^\/api\/sales\/opportunities\/([^/]+)\/lessons$/);

            if(opportunityLessonMatch && req.method === "POST"){

                const auth = checkApiAuth(req);

                if(!auth.ok){
                    return sendJSON(res, auth.status, { error: auth.error });
                }

                const { lesson } = JSON.parse((await readBody(req)) || "{}");

                if(!lesson){
                    return sendJSON(res, 400, { error: "lesson is required" });
                }

                return sendJSON(res, 200, { lessonsLearned: salesOpportunities.recordLessonLearned(decodeURIComponent(opportunityLessonMatch[1]), lesson) });

            }

            // Read-only: no auth required -- must come after the write
            // routes above since they share the
            // /api/sales/opportunities/:id... prefix.
            const opportunityDetailMatch = parsed.pathname.match(/^\/api\/sales\/opportunities\/([^/]+)$/);

            if(opportunityDetailMatch && req.method === "GET"){

                return sendJSON(res, 200, salesOpportunities.getOpportunity(decodeURIComponent(opportunityDetailMatch[1])));

            }

            // Phase 43 (Finance Division): budget/invoice/subscription
            // lifecycle routes.
            if(parsed.pathname === "/api/finance/budgets" && req.method === "POST"){

                const auth = checkApiAuth(req);

                if(!auth.ok){
                    return sendJSON(res, auth.status, { error: auth.error });
                }

                const input = JSON.parse((await readBody(req)) || "{}");

                return sendJSON(res, 200, financeBudgets.createBudget(input));

            }

            if(parsed.pathname === "/api/finance/invoices" && req.method === "POST"){

                const auth = checkApiAuth(req);

                if(!auth.ok){
                    return sendJSON(res, auth.status, { error: auth.error });
                }

                const input = JSON.parse((await readBody(req)) || "{}");

                return sendJSON(res, 200, financeInvoices.createInvoice(input));

            }

            const invoiceStatusMatch = parsed.pathname.match(/^\/api\/finance\/invoices\/([^/]+)\/status$/);

            if(invoiceStatusMatch && req.method === "POST"){

                const auth = checkApiAuth(req);

                if(!auth.ok){
                    return sendJSON(res, auth.status, { error: auth.error });
                }

                const { status } = JSON.parse((await readBody(req)) || "{}");

                return sendJSON(res, 200, { status: financeInvoices.setInvoiceStatus(decodeURIComponent(invoiceStatusMatch[1]), status) });

            }

            const invoiceDetailMatch = parsed.pathname.match(/^\/api\/finance\/invoices\/([^/]+)$/);

            if(invoiceDetailMatch && req.method === "GET"){

                return sendJSON(res, 200, financeInvoices.getInvoice(decodeURIComponent(invoiceDetailMatch[1])));

            }

            if(parsed.pathname === "/api/finance/subscriptions" && req.method === "POST"){

                const auth = checkApiAuth(req);

                if(!auth.ok){
                    return sendJSON(res, auth.status, { error: auth.error });
                }

                const input = JSON.parse((await readBody(req)) || "{}");

                return sendJSON(res, 200, financeSubscriptions.createSubscription(input));

            }

            const subscriptionCancelMatch = parsed.pathname.match(/^\/api\/finance\/subscriptions\/([^/]+)\/cancel$/);

            if(subscriptionCancelMatch && req.method === "POST"){

                const auth = checkApiAuth(req);

                if(!auth.ok){
                    return sendJSON(res, auth.status, { error: auth.error });
                }

                return sendJSON(res, 200, { status: financeSubscriptions.cancelSubscription(decodeURIComponent(subscriptionCancelMatch[1])) });

            }

            // Phase 44 (Research Division): mission lifecycle routes.
            if(parsed.pathname === "/api/research/missions" && req.method === "POST"){

                const auth = checkApiAuth(req);

                if(!auth.ok){
                    return sendJSON(res, auth.status, { error: auth.error });
                }

                const input = JSON.parse((await readBody(req)) || "{}");

                return sendJSON(res, 200, researchMissions.createMission(input));

            }

            // Real network fetch + real LLM call
            // (core/research/engine.js's research() pipeline) -- auth
            // required, same as any other real-cost action.
            const missionCitationMatch = parsed.pathname.match(/^\/api\/research\/missions\/([^/]+)\/citations$/);

            if(missionCitationMatch && req.method === "POST"){

                const auth = checkApiAuth(req);

                if(!auth.ok){
                    return sendJSON(res, auth.status, { error: auth.error });
                }

                const { topic, url } = JSON.parse((await readBody(req)) || "{}");

                return sendJSON(res, 200, await researchMissions.addCitation(decodeURIComponent(missionCitationMatch[1]), { topic, url }));

            }

            if(missionCitationMatch && req.method === "GET"){

                return sendJSON(res, 200, researchMissions.missionCitations(decodeURIComponent(missionCitationMatch[1])));

            }

            const missionRankedSourcesMatch = parsed.pathname.match(/^\/api\/research\/missions\/([^/]+)\/ranked-sources$/);

            if(missionRankedSourcesMatch && req.method === "GET"){

                return sendJSON(res, 200, researchMissions.rankSources(decodeURIComponent(missionRankedSourcesMatch[1])));

            }

            // Real LLM call (core/research/missions.js's
            // generateExecutiveSummary()) -- auth required.
            const missionSummaryMatch = parsed.pathname.match(/^\/api\/research\/missions\/([^/]+)\/summary$/);

            if(missionSummaryMatch && req.method === "POST"){

                const auth = checkApiAuth(req);

                if(!auth.ok){
                    return sendJSON(res, auth.status, { error: auth.error });
                }

                const executiveSummary = await researchMissions.generateExecutiveSummary(decodeURIComponent(missionSummaryMatch[1]));

                return sendJSON(res, 200, { executiveSummary });

            }

            const missionCompleteMatch = parsed.pathname.match(/^\/api\/research\/missions\/([^/]+)\/complete$/);

            if(missionCompleteMatch && req.method === "POST"){

                const auth = checkApiAuth(req);

                if(!auth.ok){
                    return sendJSON(res, auth.status, { error: auth.error });
                }

                return sendJSON(res, 200, { status: researchMissions.completeMission(decodeURIComponent(missionCompleteMatch[1])) });

            }

            // Read-only: no auth required -- must come after the write
            // routes above since they share the
            // /api/research/missions/:id... prefix.
            const missionDetailMatch = parsed.pathname.match(/^\/api\/research\/missions\/([^/]+)$/);

            if(missionDetailMatch && req.method === "GET"){

                return sendJSON(res, 200, researchMissions.getMission(decodeURIComponent(missionDetailMatch[1])));

            }

            // Phase 45 (Trading Research Division): portfolio/watchlist/
            // strategy lifecycle routes. Research/analysis only -- no
            // real trade execution anywhere in this codebase.
            if(parsed.pathname === "/api/trading/portfolios" && req.method === "POST"){

                const auth = checkApiAuth(req);

                if(!auth.ok){
                    return sendJSON(res, auth.status, { error: auth.error });
                }

                const input = JSON.parse((await readBody(req)) || "{}");

                return sendJSON(res, 200, tradingPortfolio.createPortfolio(input));

            }

            const portfolioTradeMatch = parsed.pathname.match(/^\/api\/trading\/portfolios\/([^/]+)\/trades$/);

            if(portfolioTradeMatch && req.method === "POST"){

                const auth = checkApiAuth(req);

                if(!auth.ok){
                    return sendJSON(res, auth.status, { error: auth.error });
                }

                const { symbol, side, quantity, price, strategyId, notes } = JSON.parse((await readBody(req)) || "{}");

                return sendJSON(res, 200, tradingPaperTrading.executePaperTrade({
                    portfolioId: decodeURIComponent(portfolioTradeMatch[1]),
                    symbol, side, quantity, price, strategyId, notes
                }));

            }

            const portfolioJournalMatch = parsed.pathname.match(/^\/api\/trading\/portfolios\/([^/]+)\/journal$/);

            if(portfolioJournalMatch && req.method === "GET"){

                return sendJSON(res, 200, tradingPaperTrading.journal(decodeURIComponent(portfolioJournalMatch[1])));

            }

            const portfolioValueMatch = parsed.pathname.match(/^\/api\/trading\/portfolios\/([^/]+)\/value$/);

            if(portfolioValueMatch && req.method === "GET"){

                const pricesParam = parsed.searchParams.get("prices");
                const currentPrices = pricesParam ? JSON.parse(pricesParam) : {};

                return sendJSON(res, 200, tradingPortfolio.portfolioValue(decodeURIComponent(portfolioValueMatch[1]), currentPrices));

            }

            const portfolioReviewMatch = parsed.pathname.match(/^\/api\/trading\/portfolios\/([^/]+)\/review$/);

            if(portfolioReviewMatch && req.method === "GET"){

                const pricesParam = parsed.searchParams.get("prices");
                const currentPrices = pricesParam ? JSON.parse(pricesParam) : {};

                return sendJSON(res, 200, tradingAnalytics.tradingOverview(decodeURIComponent(portfolioReviewMatch[1]), currentPrices));

            }

            // Read-only: no auth required -- must come after the write
            // routes above since they share the
            // /api/trading/portfolios/:id... prefix.
            const portfolioDetailMatch = parsed.pathname.match(/^\/api\/trading\/portfolios\/([^/]+)$/);

            if(portfolioDetailMatch && req.method === "GET"){

                return sendJSON(res, 200, tradingPortfolio.getPortfolio(decodeURIComponent(portfolioDetailMatch[1])));

            }

            if(parsed.pathname === "/api/trading/watchlists" && req.method === "POST"){

                const auth = checkApiAuth(req);

                if(!auth.ok){
                    return sendJSON(res, auth.status, { error: auth.error });
                }

                const input = JSON.parse((await readBody(req)) || "{}");

                return sendJSON(res, 200, tradingPortfolio.createWatchlist(input));

            }

            const watchlistAddSymbolMatch = parsed.pathname.match(/^\/api\/trading\/watchlists\/([^/]+)\/add-symbol$/);

            if(watchlistAddSymbolMatch && req.method === "POST"){

                const auth = checkApiAuth(req);

                if(!auth.ok){
                    return sendJSON(res, auth.status, { error: auth.error });
                }

                const { symbol } = JSON.parse((await readBody(req)) || "{}");

                return sendJSON(res, 200, { symbols: tradingPortfolio.addSymbol(decodeURIComponent(watchlistAddSymbolMatch[1]), symbol) });

            }

            const watchlistRemoveSymbolMatch = parsed.pathname.match(/^\/api\/trading\/watchlists\/([^/]+)\/remove-symbol$/);

            if(watchlistRemoveSymbolMatch && req.method === "POST"){

                const auth = checkApiAuth(req);

                if(!auth.ok){
                    return sendJSON(res, auth.status, { error: auth.error });
                }

                const { symbol } = JSON.parse((await readBody(req)) || "{}");

                return sendJSON(res, 200, { symbols: tradingPortfolio.removeSymbol(decodeURIComponent(watchlistRemoveSymbolMatch[1]), symbol) });

            }

            if(parsed.pathname === "/api/trading/strategies" && req.method === "POST"){

                const auth = checkApiAuth(req);

                if(!auth.ok){
                    return sendJSON(res, auth.status, { error: auth.error });
                }

                const input = JSON.parse((await readBody(req)) || "{}");

                return sendJSON(res, 200, tradingStrategies.createStrategy(input));

            }

            const strategyDetailMatch = parsed.pathname.match(/^\/api\/trading\/strategies\/([^/]+)$/);

            if(strategyDetailMatch && req.method === "GET"){

                return sendJSON(res, 200, tradingStrategies.getStrategy(decodeURIComponent(strategyDetailMatch[1])));

            }

            // A pure computation (no state change) but still auth-gated,
            // consistent with every other POST route in this codebase.
            if(parsed.pathname === "/api/trading/backtest" && req.method === "POST"){

                const auth = checkApiAuth(req);

                if(!auth.ok){
                    return sendJSON(res, auth.status, { error: auth.error });
                }

                const input = JSON.parse((await readBody(req)) || "{}");

                return sendJSON(res, 200, tradingBacktest.backtestMovingAverageCrossover(input));

            }

            // Phase 46 (Business Operations Division): SOP/KPI/meeting
            // lifecycle routes, plus scorecard/process-analysis reads.
            if(parsed.pathname === "/api/operations/sops" && req.method === "POST"){

                const auth = checkApiAuth(req);

                if(!auth.ok){
                    return sendJSON(res, auth.status, { error: auth.error });
                }

                const input = JSON.parse((await readBody(req)) || "{}");

                return sendJSON(res, 200, operationsSops.createSOP(input));

            }

            const sopStepsMatch = parsed.pathname.match(/^\/api\/operations\/sops\/([^/]+)\/steps$/);

            if(sopStepsMatch && req.method === "POST"){

                const auth = checkApiAuth(req);

                if(!auth.ok){
                    return sendJSON(res, auth.status, { error: auth.error });
                }

                const { steps } = JSON.parse((await readBody(req)) || "{}");

                return sendJSON(res, 200, operationsSops.updateSteps(decodeURIComponent(sopStepsMatch[1]), steps));

            }

            // Real Process Analysis -- must come before the plain SOP
            // detail route below since they share the
            // /api/operations/sops/:id... prefix.
            const sopAnalysisMatch = parsed.pathname.match(/^\/api\/operations\/sops\/([^/]+)\/analysis$/);

            if(sopAnalysisMatch && req.method === "GET"){

                return sendJSON(res, 200, operationsScorecard.analyzeProcess(decodeURIComponent(sopAnalysisMatch[1])));

            }

            const sopDetailMatch = parsed.pathname.match(/^\/api\/operations\/sops\/([^/]+)$/);

            if(sopDetailMatch && req.method === "GET"){

                return sendJSON(res, 200, operationsSops.getSOP(decodeURIComponent(sopDetailMatch[1])));

            }

            if(parsed.pathname === "/api/operations/kpis" && req.method === "POST"){

                const auth = checkApiAuth(req);

                if(!auth.ok){
                    return sendJSON(res, auth.status, { error: auth.error });
                }

                const input = JSON.parse((await readBody(req)) || "{}");

                return sendJSON(res, 200, operationsKpis.createKPI(input));

            }

            const kpiActualMatch = parsed.pathname.match(/^\/api\/operations\/kpis\/([^/]+)\/actual$/);

            if(kpiActualMatch && req.method === "POST"){

                const auth = checkApiAuth(req);

                if(!auth.ok){
                    return sendJSON(res, auth.status, { error: auth.error });
                }

                const { actual } = JSON.parse((await readBody(req)) || "{}");

                return sendJSON(res, 200, operationsKpis.recordActual(decodeURIComponent(kpiActualMatch[1]), actual));

            }

            const kpiDetailMatch = parsed.pathname.match(/^\/api\/operations\/kpis\/([^/]+)$/);

            if(kpiDetailMatch && req.method === "GET"){

                return sendJSON(res, 200, operationsKpis.kpiStatus(decodeURIComponent(kpiDetailMatch[1])));

            }

            if(parsed.pathname === "/api/operations/meetings" && req.method === "POST"){

                const auth = checkApiAuth(req);

                if(!auth.ok){
                    return sendJSON(res, auth.status, { error: auth.error });
                }

                const input = JSON.parse((await readBody(req)) || "{}");

                return sendJSON(res, 200, operationsMeetings.createMeeting(input));

            }

            const actionItemCompleteMatch = parsed.pathname.match(/^\/api\/operations\/meetings\/([^/]+)\/action-items\/([^/]+)\/complete$/);

            if(actionItemCompleteMatch && req.method === "POST"){

                const auth = checkApiAuth(req);

                if(!auth.ok){
                    return sendJSON(res, auth.status, { error: auth.error });
                }

                return sendJSON(res, 200, operationsMeetings.completeActionItem(
                    decodeURIComponent(actionItemCompleteMatch[1]),
                    decodeURIComponent(actionItemCompleteMatch[2])
                ));

            }

            const meetingDetailMatch = parsed.pathname.match(/^\/api\/operations\/meetings\/([^/]+)$/);

            if(meetingDetailMatch && req.method === "GET"){

                return sendJSON(res, 200, operationsMeetings.getMeeting(decodeURIComponent(meetingDetailMatch[1])));

            }

            // Real Department Scorecard -- reuses OrganizationOverview/
            // BlockerDetector wholesale (see core/operations/scorecard.js).
            const scorecardMatch = parsed.pathname.match(/^\/api\/operations\/scorecard\/([^/]+)$/);

            if(scorecardMatch && req.method === "GET"){

                return sendJSON(res, 200, operationsScorecard.departmentScorecard(decodeURIComponent(scorecardMatch[1])));

            }

            // Read-only: no auth required -- must come after the write
            // routes above since they share the /api/companies/:id/...
            // prefix.
            const companyDetailMatch = parsed.pathname.match(/^\/api\/companies\/([^/]+)$/);

            if(companyDetailMatch && req.method === "GET"){

                return sendJSON(res, 200, executive.getCompany(decodeURIComponent(companyDetailMatch[1])));

            }

            const departmentRunMatch = parsed.pathname.match(/^\/api\/departments\/([^/]+)\/run$/);

            if(departmentRunMatch && req.method === "POST"){

                const auth = checkApiAuth(req);

                if(!auth.ok){
                    return sendJSON(res, auth.status, { error: auth.error });
                }

                const dept = departments.find(d => d.id === departmentRunMatch[1]);

                if(!dept){
                    return sendJSON(res, 404, { error: `Unknown department: "${departmentRunMatch[1]}"` });
                }

                const { task, context } = JSON.parse((await readBody(req)) || "{}");

                if(!task){
                    return sendJSON(res, 400, { error: "task is required" });
                }

                return sendJSON(res, 200, await dept.run(task, context || {}));

            }

            const toolRunMatch = parsed.pathname.match(/^\/api\/tools\/([^/]+)\/run$/);

            if(toolRunMatch && req.method === "POST"){

                const auth = checkApiAuth(req);

                if(!auth.ok){
                    return sendJSON(res, auth.status, { error: auth.error });
                }

                const toolId = decodeURIComponent(toolRunMatch[1]);

                const args = JSON.parse((await readBody(req)) || "{}");

                return sendJSON(res, 200, await tools.run(toolId, args, { role: "executive" }));

            }

            // Step 2 of the Google OAuth flow (see
            // core/integrations/google/oauth.js's header comment): Google
            // redirects the OPERATOR's own browser here, as a plain GET,
            // with a one-time `code` -- there is no Authorization header
            // to check (the browser making this request has no bearer
            // token, and shouldn't need one: completing this exchange IS
            // the human-authorized action, performed by clicking "Allow"
            // on Google's own consent screen, not by knowing API_TOKEN).
            // Same localhost-by-default posture as every other endpoint
            // here -- see DASHBOARD_HOST's own comment at this file's
            // real-boot path below.
            if(parsed.pathname === "/api/integrations/google/callback" && req.method === "GET"){

                const code = parsed.searchParams.get("code");

                if(!code){
                    return sendJSON(res, 400, { error: "code is required" });
                }

                const tokens = await googleOAuth.exchangeCode(code);

                return sendJSON(res, 200, { authorized: true, obtainedAt: tokens.obtainedAt });

            }

            if(ROUTES[routeKey]){
                return sendJSON(res, 200, ROUTES[routeKey](parsed.searchParams));
            }

            if(parsed.pathname.startsWith("/api/")){
                return sendJSON(res, 404, { error: "Not found" });
            }

            return serveStatic(res, parsed.pathname);

        } catch(error){

            log.error("dashboard", `${routeKey} failed: ${error.message}`, { stack: error.stack });

            // A route that already wrote headers (e.g. the SSE handler,
            // mid-stream) throwing later can't also send a 500 -- Node
            // would throw a second, uglier error ("Cannot set headers
            // after they are sent") trying to. Just end the response.
            if(res.headersSent){
                return res.end();
            }

            return sendJSON(res, 500, { error: error.message });

        }

    });

}


module.exports = { createServer };


if(require.main === module){

    // Scoped to the real-boot path, not module top level -- this file is
    // also require()d by tests to get createServer(), and a real
    // uncaughtException during a test run must fail that test, not call
    // process.exit(1) and kill the whole `npm test` run. See
    // docs/Architecture.md "Production Hardening".
    installCrashGuards("dashboard");

    // Reports which connectors (Claude/OpenAI/GitHub/Discord/Google/etc.)
    // have their required env vars present, logging only variable NAMES
    // that are missing -- never a value. A missing credential disables
    // that one connector; it never stops the dashboard from booting.
    credentialManager.validateStartup();

    // Phase 33: surfaces any capability already in "error"/"disabled"
    // status at boot -- same log-only, never-throws posture as
    // credentialManager's own validateStartup() above.
    capabilitiesRegistry.validateStartup();

    const PORT = process.env.DASHBOARD_PORT || 4000;

    // Binds to localhost only by default -- multi-device reach (Phase 8)
    // is opt-in via DASHBOARD_HOST=0.0.0.0, not the default, since the
    // dashboard exposes memory/knowledge contents and (if API_TOKEN is
    // set) write endpoints, including ones that call Claude.
    const HOST = process.env.DASHBOARD_HOST || "127.0.0.1";

    const server = createServer();

    server.listen(PORT, HOST, () => {
        console.log(`[DASHBOARD] Online at http://${HOST}:${PORT}`);
    });

    // The dashboard server is VERONICA's one genuinely long-running host
    // process, so it's where the automation engine's tick loop actually
    // runs (see docs/Architecture.md "Automation Engine") -- scheduled
    // jobs (nightly consolidation, learning recommendations) only fire
    // while this process is up. Opt out with AUTOMATION_DISABLED=1, e.g.
    // for a dashboard instance you don't want double-running schedules
    // against the same shared state as another instance.
    if(process.env.AUTOMATION_DISABLED !== "1"){
        automation.start(Number(process.env.AUTOMATION_TICK_MS) || undefined);
        console.log("[AUTOMATION] Tick loop started");
    }

    // Real login attempt, but never allowed to crash the dashboard: a
    // real discord.js Client.login() failure (bad token, network outage)
    // rejects this promise, and .catch() here just logs it -- the
    // dashboard keeps serving every other endpoint either way. No-ops
    // cleanly (see discordBot.js's own start()) when DISCORD_BOT_TOKEN
    // isn't set at all.
    discordBot.start().catch(error => log.error("discord-bot", `Failed to start: ${error.message}`));

}
