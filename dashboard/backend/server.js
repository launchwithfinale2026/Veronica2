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
const bus = require("../../core/bus");
const CollaborationEngine = require("../../core/collaboration/engine");
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
const ResearchEngine = require("../../core/research/engine");
const SelfImprovementEngine = require("../../core/system/selfImprovement");
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

const deviceManager = new DeviceManager();

const researchEngine = new ResearchEngine();

const selfImprovement = new SelfImprovementEngine();


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

    "GET /api/companies": () => executive.listCompanies(),

    "GET /api/learning/overview": () => learning.overview(),

    "GET /api/learning/departments": () => learning.departmentPerformance(),

    "GET /api/learning/agents": () => learning.agentPerformance(),

    "GET /api/learning/tools": () => learning.toolPerformance(),

    "GET /api/learning/recommendations": () => learning.recommendationHistory(),

    "GET /api/automation/status": () => automation.status(),

    "GET /api/automation/history": () => automation.history(),

    "GET /api/collaboration/history": () => collaboration.history(),

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

    "GET /api/research/history": (searchParams) => researchEngine.history(searchParams.get("topic") || undefined),

    "GET /api/profile": () => personalContext.summary(),

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
    "collaboration.message", "collaboration.delegated", "collaboration.reviewed", "collaboration.consensus"
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
