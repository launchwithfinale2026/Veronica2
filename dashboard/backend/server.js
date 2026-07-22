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

const loadAgents = require("../../core/agents/loader");
const loadDepartments = require("../../core/departments/loader");
const { seedFromAgents } = require("../../core/knowledge/seed");
const memory = require("../../core/memory");
const knowledge = require("../../core/knowledge");
const tools = require("../../core/tools");
const device = require("../../core/device");
const sync = require("../../core/device/sync");
const executive = require("../../core/executive");
const learning = require("../../core/learning");
const automation = require("../../core/automation");
const bus = require("../../core/bus");


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

    "GET /api/agents": () => agents.map(agent => ({
        name: agent.name,
        role: agent.role,
        department: agent.department,
        status: agent.status
    })),

    "GET /api/departments": () => departments.map(dept => dept.statusReport()),

    "GET /api/knowledge": () => knowledge.read(),

    "GET /api/tools": () => tools.list(),

    "GET /api/activity": () => readRecentActivity(),

    "GET /api/device": () => device.currentIdentity(),

    "GET /api/executive/roadmap": () => executive.roadmap(),

    "GET /api/executive/deadlines": () => executive.evaluateDeadlines(),

    "GET /api/executive/consolidations": () => executive.consolidationHistory(),

    "GET /api/companies": () => executive.listCompanies(),

    "GET /api/learning/overview": () => learning.overview(),

    "GET /api/learning/departments": () => learning.departmentPerformance(),

    "GET /api/learning/agents": () => learning.agentPerformance(),

    "GET /api/learning/tools": () => learning.toolPerformance(),

    "GET /api/learning/recommendations": () => learning.recommendationHistory(),

    "GET /api/automation/status": () => automation.status(),

    "GET /api/automation/history": () => automation.history()

};


// Every mutating endpoint (sync, remember, department/tool runs) exposes
// or triggers real side effects — network calls to Claude included — so
// they all require an explicit opt-in token rather than being open by
// default like the read-only endpoints above. Fails closed: no API_TOKEN
// configured means every write endpoint is off.
function checkApiAuth(req){

    const token = process.env.API_TOKEN;

    if(!token){
        return { ok: false, status: 501, error: "Write actions not configured: set API_TOKEN to enable" };
    }

    const header = req.headers["authorization"] || "";
    const provided = header.startsWith("Bearer ") ? header.slice(7) : null;

    if(provided !== token){
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
const STREAMED_EVENTS = ["memory.updated", "knowledge.updated", "department.activity", "automation.jobCompleted"];
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

    req.on("close", () => {
        clearInterval(heartbeat);
        listeners.forEach(({ eventName, handler }) => bus.off(eventName, handler));
    });

}


function createServer(){

    return http.createServer(async (req, res) => {

        const parsed = new URL(req.url, "http://localhost");
        const routeKey = `${req.method} ${parsed.pathname}`;

        if(parsed.pathname === "/api/events" && req.method === "GET"){
            return handleEventStream(req, res);
        }

        try {

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

            if(parsed.pathname === "/api/executive/consolidate" && req.method === "POST"){

                const auth = checkApiAuth(req);

                if(!auth.ok){
                    return sendJSON(res, auth.status, { error: auth.error });
                }

                return sendJSON(res, 200, await executive.consolidate());

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

            if(ROUTES[routeKey]){
                return sendJSON(res, 200, ROUTES[routeKey]());
            }

            if(parsed.pathname.startsWith("/api/")){
                return sendJSON(res, 404, { error: "Not found" });
            }

            return serveStatic(res, parsed.pathname);

        } catch(error){

            return sendJSON(res, 500, { error: error.message });

        }

    });

}


module.exports = { createServer };


if(require.main === module){

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

}
