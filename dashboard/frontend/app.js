async function fetchJSON(url){

    const response = await fetch(url);

    if(!response.ok){
        throw new Error(`${url} -> HTTP ${response.status}`);
    }

    return response.json();

}


function el(tag, props = {}){

    return Object.assign(document.createElement(tag), props);

}


function renderList(elementId, items, emptyLabel, formatItem){

    const container = document.getElementById(elementId);

    container.innerHTML = "";

    if(!items.length){
        container.appendChild(el("p", { className: "empty", textContent: emptyLabel }));
        return;
    }

    const list = el("ul", { className: "list" });

    items.forEach(item => {
        list.appendChild(el("li", { textContent: formatItem(item) }));
    });

    container.appendChild(list);

}


async function loadStatus(){

    const status = await fetchJSON("/api/status");

    document.getElementById("status-banner").textContent =
        `${status.status} — ${status.agents} agents, ${status.departments} departments — uptime ${status.uptimeSeconds}s`;

    document.getElementById("system-health").textContent =
        `Executive core online since ${new Date(Date.now() - status.uptimeSeconds * 1000).toLocaleTimeString()}`;

}


async function loadAgents(){

    const agents = await fetchJSON("/api/agents");

    renderList(
        "system-agents",
        agents,
        "No agents loaded.",
        agent => `${agent.name} — ${agent.role} (${agent.department})`
    );

}


async function loadDepartments(){

    const departments = await fetchJSON("/api/departments");

    renderList(
        "system-departments",
        departments,
        "No departments loaded.",
        dept => `${dept.name} — ${dept.domain} (${dept.status})`
    );

}


async function loadActivity(){

    const activity = await fetchJSON("/api/activity");

    renderList(
        "system-activity",
        activity,
        "No activity yet — departments haven't run any tasks.",
        entry => `[${entry.department}] ${entry.agent}: ${entry.task}`
    );

}


async function loadMemoryByType(elementId, type, emptyLabel){

    const memories = await fetchJSON(`/api/memory?type=${encodeURIComponent(type)}`);

    renderList(
        elementId,
        memories,
        emptyLabel,
        memory => memory.content
    );

}


async function loadExecutiveRoadmap(){

    const roadmap = await fetchJSON("/api/executive/roadmap");

    renderList(
        "executive-roadmap",
        roadmap,
        "No projects planned yet.",
        project => `[${project.department}] ${project.title} — ${project.status}, priority ${project.priority} (id ${project.id})`
    );

}


async function loadExecutiveDeadlines(){

    const grouped = await fetchJSON("/api/executive/deadlines");

    const container = document.getElementById("executive-deadlines");

    container.innerHTML = "";

    container.appendChild(el("p", {
        textContent: `${grouped.overdue.length} overdue, ${grouped.due_soon.length} due soon, ${grouped.on_track.length} on track, ${grouped.no_deadline.length} no deadline`
    }));

}


async function loadConsolidationHistory(){

    const runs = await fetchJSON("/api/executive/consolidations");

    renderList(
        "consolidation-history",
        runs,
        "No consolidation runs yet.",
        run => `[${new Date(run.created).toLocaleString()}] ${run.summary}`
    );

}


async function loadLearningOverview(){

    const overview = await fetchJSON("/api/learning/overview");

    const container = document.getElementById("learning-overview");

    container.innerHTML = "";

    container.appendChild(el("p", {
        textContent: `${overview.total} executions — ${overview.successes} succeeded, ${overview.failures} failed (${overview.successRate}% success rate), avg ${overview.avgDurationMs}ms`
    }));

}


async function loadLearningDepartments(){

    const departments = await fetchJSON("/api/learning/departments");

    renderList(
        "learning-departments",
        departments,
        "No department runs logged yet.",
        d => `${d.department} — ${d.total} runs, ${d.successRate}% success, avg ${d.avgDurationMs}ms`
    );

}


async function loadLearningTools(){

    const toolStats = await fetchJSON("/api/learning/tools");

    renderList(
        "learning-tools",
        toolStats,
        "No tool calls logged yet.",
        t => `${t.tool} — ${t.total} calls, ${t.successRate}% success, avg ${t.avgDurationMs}ms`
    );

}


async function loadLearningRecommendations(){

    const runs = await fetchJSON("/api/learning/recommendations");

    renderList(
        "learning-recommendations",
        runs,
        "No recommendations generated yet.",
        run => `[${new Date(run.created).toLocaleString()}] ${run.summary}${run.recommendations.length ? " — " + run.recommendations.join("; ") : ""}`
    );

}


async function loadAutomationStatus(){

    const status = await fetchJSON("/api/automation/status");

    const container = document.getElementById("automation-status");

    container.innerHTML = "";

    container.appendChild(el("p", {
        textContent: status.running
            ? `Tick loop running -- ${status.queue.filter(e => e.status === "pending").length} pending job(s) queued`
            : "Tick loop not running on this process (jobs enqueued here will wait until it is)."
    }));

}


async function loadAutomationSchedules(){

    const status = await fetchJSON("/api/automation/status");

    renderList(
        "automation-schedules",
        status.schedules,
        "No schedules registered.",
        s => `${s.jobName} — every ${Math.round(s.intervalMs / 3600000)}h, next run ${new Date(s.nextRunAt).toLocaleString()}`
    );

}


async function loadAutomationHistory(){

    const history = await fetchJSON("/api/automation/history");

    renderList(
        "automation-history",
        history,
        "No job runs yet.",
        run => `[${new Date(run.updatedAt).toLocaleString()}] ${run.jobName} — ${run.status}${run.lastError ? ": " + run.lastError : ""}`
    );

}


async function loadCompanies(){

    const companies = await fetchJSON("/api/companies");

    renderList(
        "companies-list",
        companies,
        "No companies created yet.",
        company => `${company.name}${company.industry ? ` (${company.industry})` : ""} — ${company.departments.join(", ") || "no departments"} (id ${company.id})`
    );

}


async function loadKnowledge(){

    const graph = await fetchJSON("/api/knowledge");

    const container = document.getElementById("intelligence-knowledge");

    container.innerHTML = "";

    container.appendChild(el("p", {
        textContent: `${graph.entities.length} entities, ${graph.relationships.length} relationships`
    }));

}


async function loadDashboard(){

    try {

        await Promise.all([
            loadStatus(),
            loadAgents(),
            loadDepartments(),
            loadActivity(),
            loadMemoryByType("personal-goals", "goals", "No goals recorded yet."),
            loadMemoryByType("personal-projects", "projects", "No projects recorded yet."),
            loadMemoryByType("business-memories", "businesses", "No business memories recorded yet."),
            loadMemoryByType("intelligence-decisions", "decisions", "No decisions recorded yet."),
            loadKnowledge(),
            loadExecutiveRoadmap(),
            loadExecutiveDeadlines(),
            loadConsolidationHistory(),
            loadLearningOverview(),
            loadLearningDepartments(),
            loadLearningTools(),
            loadLearningRecommendations(),
            loadAutomationStatus(),
            loadAutomationSchedules(),
            loadAutomationHistory(),
            loadCompanies()
        ]);

    } catch(error){

        document.getElementById("status-banner").textContent = `Dashboard error: ${error.message}`;
        document.getElementById("status-banner").classList.add("error");

    }

}


// --- Write actions -------------------------------------------------------
//
// All mutating endpoints require an API token (server-side: API_TOKEN env
// var). Kept in this browser's localStorage only -- never sent anywhere
// except as the Authorization header on these requests.

const TOKEN_KEY = "veronica_api_token";


function getToken(){

    return localStorage.getItem(TOKEN_KEY) || "";

}


async function authedFetch(url, options = {}){

    const response = await fetch(url, {
        ...options,
        headers: {
            ...(options.headers || {}),
            Authorization: `Bearer ${getToken()}`
        }
    });

    const body = await response.json().catch(() => ({}));

    if(!response.ok){
        throw new Error(body.error || `HTTP ${response.status}`);
    }

    return body;

}


function setupTokenForm(){

    const input = document.getElementById("token-input");
    const status = document.getElementById("token-status");

    input.value = getToken();
    status.textContent = getToken() ? "Token set." : "No token set — write actions will fail.";

    document.getElementById("token-form").addEventListener("submit", event => {

        event.preventDefault();

        localStorage.setItem(TOKEN_KEY, input.value);

        status.textContent = input.value ? "Token saved." : "Token cleared.";

    });

}


function setupRememberForm(){

    const form = document.getElementById("remember-form");
    const result = document.getElementById("remember-result");

    form.addEventListener("submit", async event => {

        event.preventDefault();

        const content = document.getElementById("remember-content").value;
        const type = document.getElementById("remember-type").value;

        result.textContent = "Storing...";

        try {

            const stored = await authedFetch("/api/memory", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ content, type })
            });

            result.textContent = `Stored (id ${stored.id}).`;

            form.reset();

            loadDashboard();

        } catch(error){

            result.textContent = `Error: ${error.message}`;

        }

    });

}


async function populateDepartmentSelect(elementId, { includeAuto = false } = {}){

    const select = document.getElementById(elementId);
    const departments = await fetchJSON("/api/departments");

    select.innerHTML = "";

    if(includeAuto){
        select.appendChild(el("option", { value: "", textContent: "(auto-assign by keyword match)" }));
    }

    departments.forEach(dept => {
        select.appendChild(el("option", { value: dept.id, textContent: dept.name }));
    });

}


function setupDepartmentRunForm(){

    const form = document.getElementById("department-run-form");
    const result = document.getElementById("department-run-result");

    form.addEventListener("submit", async event => {

        event.preventDefault();

        const id = document.getElementById("department-select").value;
        const task = document.getElementById("department-task").value;

        result.textContent = "Running (this calls Claude, may take a few seconds)...";

        try {

            const outcome = await authedFetch(`/api/departments/${encodeURIComponent(id)}/run`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ task })
            });

            result.textContent = `${outcome.agent}: ${outcome.response}`;

            loadDashboard();

        } catch(error){

            result.textContent = `Error: ${error.message}`;

        }

    });

}


function setupPlanForm(){

    const form = document.getElementById("plan-form");
    const result = document.getElementById("plan-result");

    form.addEventListener("submit", async event => {

        event.preventDefault();

        const goal = {
            title: document.getElementById("plan-title").value,
            priority: Number(document.getElementById("plan-priority").value)
        };

        const description = document.getElementById("plan-description").value;
        const deadline = document.getElementById("plan-deadline").value;
        const department = document.getElementById("plan-department").value;

        if(description) goal.description = description;
        if(deadline) goal.deadline = deadline;
        if(department) goal.department = department;

        result.textContent = "Planning...";

        try {

            const project = await authedFetch("/api/executive/plan", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(goal)
            });

            result.textContent = `Planned as a ${project.department} project (id ${project.id}).`;

            form.reset();

            loadDashboard();

        } catch(error){

            result.textContent = `Error: ${error.message}`;

        }

    });

}


function setupDecomposeForm(){

    const form = document.getElementById("decompose-form");
    const result = document.getElementById("decompose-result");

    form.addEventListener("submit", async event => {

        event.preventDefault();

        const projectId = document.getElementById("decompose-project-id").value;

        result.textContent = "Decomposing (this calls Claude, may take a few seconds)...";

        try {

            const outcome = await authedFetch(`/api/executive/projects/${encodeURIComponent(projectId)}/decompose`, {
                method: "POST"
            });

            result.textContent = `Created ${outcome.milestones.length} milestone(s).`;

            loadDashboard();

        } catch(error){

            result.textContent = `Error: ${error.message}`;

        }

    });

}


function setupStatusForm(){

    const form = document.getElementById("status-form");
    const result = document.getElementById("status-result");

    form.addEventListener("submit", async event => {

        event.preventDefault();

        const id = document.getElementById("status-id").value;
        const status = document.getElementById("status-value").value;
        const note = document.getElementById("status-note").value;

        result.textContent = "Updating...";

        try {

            const outcome = await authedFetch(`/api/executive/projects/${encodeURIComponent(id)}/status`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(note ? { status, note } : { status })
            });

            result.textContent = `Status now "${outcome.status}".`;

            form.reset();

            loadDashboard();

        } catch(error){

            result.textContent = `Error: ${error.message}`;

        }

    });

}


function setupArtifactForm(){

    const form = document.getElementById("artifact-form");
    const result = document.getElementById("artifact-result");

    form.addEventListener("submit", async event => {

        event.preventDefault();

        const projectId = document.getElementById("artifact-project-id").value;
        const artifact = document.getElementById("artifact-value").value;

        result.textContent = "Recording...";

        try {

            const outcome = await authedFetch(`/api/executive/projects/${encodeURIComponent(projectId)}/artifacts`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ artifact })
            });

            result.textContent = `Recorded (${outcome.artifacts.length} artifact(s) total).`;

            form.reset();

            loadDashboard();

        } catch(error){

            result.textContent = `Error: ${error.message}`;

        }

    });

}


function setupProjectLookupForm(){

    const form = document.getElementById("project-lookup-form");
    const result = document.getElementById("project-lookup-result");

    form.addEventListener("submit", async event => {

        event.preventDefault();

        const projectId = document.getElementById("project-lookup-id").value;

        result.textContent = "Looking up...";

        try {

            const project = await fetchJSON(`/api/executive/projects/${encodeURIComponent(projectId)}`);

            result.textContent = JSON.stringify(project, null, 2);

        } catch(error){

            result.textContent = `Error: ${error.message}`;

        }

    });

}


function setupConsolidateForm(){

    const form = document.getElementById("consolidate-form");
    const result = document.getElementById("consolidate-result");

    form.addEventListener("submit", async event => {

        event.preventDefault();

        result.textContent = "Consolidating (this calls Claude, may take a few seconds)...";

        try {

            const run = await authedFetch("/api/executive/consolidate", { method: "POST" });

            result.textContent = run.summary;

            loadDashboard();

        } catch(error){

            result.textContent = `Error: ${error.message}`;

        }

    });

}


function setupRecommendForm(){

    const form = document.getElementById("recommend-form");
    const result = document.getElementById("recommend-result");

    form.addEventListener("submit", async event => {

        event.preventDefault();

        result.textContent = "Analyzing (this calls Claude, may take a few seconds)...";

        try {

            const run = await authedFetch("/api/learning/recommend", { method: "POST" });

            result.textContent = run.summary;

            loadDashboard();

        } catch(error){

            result.textContent = `Error: ${error.message}`;

        }

    });

}


function setupAutomationRunForm(){

    const form = document.getElementById("automation-run-form");
    const result = document.getElementById("automation-run-result");

    form.addEventListener("submit", async event => {

        event.preventDefault();

        const jobName = document.getElementById("automation-job-name").value;

        result.textContent = "Enqueuing...";

        try {

            const entry = await authedFetch(`/api/automation/jobs/${encodeURIComponent(jobName)}/run`, {
                method: "POST"
            });

            result.textContent = `Enqueued (id ${entry.id}, status ${entry.status}).`;

            form.reset();

            loadDashboard();

        } catch(error){

            result.textContent = `Error: ${error.message}`;

        }

    });

}


function setupCompanyLookupForm(){

    const form = document.getElementById("company-lookup-form");
    const result = document.getElementById("company-lookup-result");

    form.addEventListener("submit", async event => {

        event.preventDefault();

        const companyId = document.getElementById("company-lookup-id").value;

        result.textContent = "Looking up...";

        try {

            const company = await fetchJSON(`/api/companies/${encodeURIComponent(companyId)}`);

            result.textContent = JSON.stringify(company, null, 2);

        } catch(error){

            result.textContent = `Error: ${error.message}`;

        }

    });

}


function setupCompanyCreateForm(){

    const form = document.getElementById("company-create-form");
    const result = document.getElementById("company-create-result");

    form.addEventListener("submit", async event => {

        event.preventDefault();

        const name = document.getElementById("company-name").value;
        const industry = document.getElementById("company-industry").value;

        result.textContent = "Creating...";

        try {

            const input = { name };
            if(industry) input.industry = industry;

            const company = await authedFetch("/api/companies", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(input)
            });

            result.textContent = `Created (id ${company.id}).`;

            form.reset();

            loadDashboard();

        } catch(error){

            result.textContent = `Error: ${error.message}`;

        }

    });

}


// --- Live updates (Server-Sent Events) ------------------------------------
//
// Replaces interval polling: GET /api/events streams memory/knowledge
// updates, department/agent activity, and automation job completions as
// they happen (see docs/Architecture.md "Dashboard Live Updates"). Two
// things happen on every event: it's appended to the visible "Live
// Activity" feed immediately, and a debounced loadDashboard() re-fetches
// the affected panels shortly after -- debounced because a single action
// (e.g. planning a goal) can fire several events in quick succession
// (a memory.updated for the project, several knowledge.updated for its
// entities/relationships), and re-fetching everything once covers all of
// them.

const LIVE_FEED_LIMIT = 50;
const liveFeedEntries = [];

let refreshTimer = null;

function scheduleRefresh(){

    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(loadDashboard, 800);

}


function formatLiveEvent(event){

    const { type, payload } = event;

    if(type === "memory.updated"){
        return `Memory ${payload.action}: "${payload.entry.content}"`;
    }

    if(type === "knowledge.updated"){
        return payload.action === "entityCreated"
            ? `Knowledge entity created: ${payload.entity.name} (${payload.entity.type})`
            : `Knowledge relationship: ${payload.relationship.from} -${payload.relationship.type}-> ${payload.relationship.to}`;
    }

    if(type === "department.activity"){
        return `[${payload.department}] ${payload.agent} — ${payload.outcome} (${payload.task})`;
    }

    if(type === "automation.jobCompleted"){
        return `Automation job "${payload.jobName}" — ${payload.outcome}`;
    }

    return `${type}: ${JSON.stringify(payload)}`;

}


function renderLiveFeed(){

    renderList(
        "live-feed",
        liveFeedEntries,
        "No live activity yet.",
        entry => `[${new Date(entry.timestamp).toLocaleTimeString()}] ${entry.text}`
    );

}


function setupLiveEvents(){

    const indicator = document.getElementById("live-indicator");

    const source = new EventSource("/api/events");

    source.addEventListener("open", () => {
        indicator.textContent = "Live updates: connected";
        indicator.classList.remove("error");
    });

    source.addEventListener("error", () => {
        indicator.textContent = "Live updates: reconnecting...";
        indicator.classList.add("error");
    });

    source.addEventListener("message", messageEvent => {

        let event;

        try {
            event = JSON.parse(messageEvent.data);
        } catch(error){
            return;
        }

        liveFeedEntries.unshift({ timestamp: event.timestamp, text: formatLiveEvent(event) });
        liveFeedEntries.length = Math.min(liveFeedEntries.length, LIVE_FEED_LIMIT);

        renderLiveFeed();
        scheduleRefresh();

    });

}


document.addEventListener("DOMContentLoaded", () => {

    loadDashboard();
    renderLiveFeed();
    setupLiveEvents();

    setupTokenForm();
    setupRememberForm();
    setupDepartmentRunForm();
    setupPlanForm();
    setupDecomposeForm();
    setupStatusForm();
    setupArtifactForm();
    setupProjectLookupForm();
    setupConsolidateForm();
    setupRecommendForm();
    setupAutomationRunForm();
    setupCompanyLookupForm();
    setupCompanyCreateForm();

    populateDepartmentSelect("department-select");
    populateDepartmentSelect("plan-department", { includeAuto: true });

});
