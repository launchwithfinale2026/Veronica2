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


async function loadExecutiveReport(){

    const report = await fetchJSON("/api/executive/report");

    const container = document.getElementById("executive-report");

    container.innerHTML = "";

    container.appendChild(el("p", {
        textContent: `${report.totalProjects} projects — ${report.byStatus.planned} planned, ${report.byStatus.in_progress} in progress, ${report.byStatus.blocked} blocked, ${report.byStatus.completed} completed — ${report.averageProgress}% average progress`
    }));

}


async function loadMemoryOverview(){

    const overview = await fetchJSON("/api/memory/overview");

    const container = document.getElementById("memory-overview");

    container.innerHTML = "";

    container.appendChild(el("p", {
        textContent: `${overview.total} entries — ${overview.byClass.episodic} episodic, ${overview.byClass.semantic} semantic, ${overview.byClass.procedural} procedural, ${overview.byClass.organizational} organizational`
    }));

}


async function loadMemoryLifecycle(){

    const overview = await fetchJSON("/api/memory/lifecycle");

    const container = document.getElementById("memory-lifecycle");

    container.innerHTML = "";

    container.appendChild(el("p", {
        textContent: `${overview.total} entries — ${overview.byStage.temporary} temporary, ${overview.byStage.active} active, ${overview.byStage.persistent} persistent, ${overview.byStage.archived} archived`
    }));

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


async function loadSelfMonitorHistory(){

    const runs = await fetchJSON("/api/executive/self-monitor");

    renderList(
        "self-monitor-history",
        runs,
        "No issues found by any self-check yet.",
        run => `[${new Date(run.created).toLocaleString()}] ${run.content}`
    );

}


async function loadPriorityRank(){

    const ranked = await fetchJSON("/api/executive/priority-rank");

    renderList(
        "priority-rank",
        ranked.slice(0, 10),
        "No active projects to rank.",
        entry => `[${entry.score}] ${entry.project.title} -- ${entry.reasons.join("; ")}`
    );

}


async function loadGoalIssues(){

    const issues = await fetchJSON("/api/executive/goal-issues");
    const items = [...issues.stalledProjects, ...issues.stalledMilestones];

    renderList(
        "goal-issues",
        items,
        "No stalled projects or milestones.",
        entry => entry.reason
    );

}


async function loadExecutiveBlockers(){

    const blockers = await fetchJSON("/api/executive/blockers");
    const items = [
        ...blockers.blockedTasks.map(t => `[blocked] ${t.title} -- ${t.reason}`),
        ...blockers.deadlockedProjects.map(p => `[deadlocked] ${p.project.title} -- ${p.reason}`)
    ];

    renderList(
        "executive-blockers",
        items,
        "No blocked tasks or deadlocked projects.",
        item => item
    );

}


async function loadExecutiveRecommendations(){

    const history = await fetchJSON("/api/executive/recommendations");
    const latest = history[0];

    renderList(
        "executive-recommendations",
        latest ? latest.recommendations : [],
        latest ? "Last run found nothing to recommend." : "No recommendations generated yet.",
        rec => `[${rec.kind}] ${rec.detail} -- ${rec.action}`
    );

}


async function loadDailyBriefing(){

    const history = await fetchJSON("/api/executive/daily-briefings");
    const latest = history[0];

    const container = document.getElementById("daily-briefing");
    container.innerHTML = "";

    if(!latest){
        container.appendChild(el("p", { className: "empty", textContent: "No briefing generated yet." }));
        return;
    }

    container.appendChild(el("p", {
        textContent: `[${new Date(latest.created).toLocaleString()}] ${latest.summary} -- ${latest.roadmap.totalProjects} project(s), ${latest.recommendations.length} recommendation(s)`
    }));

}


async function loadWeeklyReport(){

    const history = await fetchJSON("/api/executive/weekly-reports");
    const latest = history[0];

    const container = document.getElementById("weekly-report");
    container.innerHTML = "";

    if(!latest){
        container.appendChild(el("p", { className: "empty", textContent: "No weekly report generated yet." }));
        return;
    }

    container.appendChild(el("p", {
        textContent: `[${new Date(latest.weekStart).toLocaleDateString()} - ${new Date(latest.weekEnd).toLocaleDateString()}] ${latest.completed.projects.length} project(s) and ${latest.completed.taskCount} task(s) completed, ${latest.blockersEncountered} blocker(s) encountered`
    }));

}


async function loadDailyReview(){

    const history = await fetchJSON("/api/executive/daily-reviews");
    const latest = history[0];

    const container = document.getElementById("daily-review");
    container.innerHTML = "";

    if(!latest){
        container.appendChild(el("p", { className: "empty", textContent: "No daily review generated yet." }));
        return;
    }

    const topPriority = latest.tomorrowPriorities[0];

    container.appendChild(el("p", {
        textContent: `[${new Date(latest.date).toLocaleDateString()}] ${latest.completed.length} completed, ${latest.failed.length} failed, ${latest.learned.length} learned, ${latest.newMemoriesCount} new memories -- tomorrow's top priority: ${topPriority ? topPriority.title : "(none)"}`
    }));

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


function formatCollaborationEntry(entry){

    if(entry.kind === "message"){
        return `[message] ${entry.from} -> ${entry.to}: ${entry.content}`;
    }

    if(entry.kind === "delegation"){
        return `[delegation] ${entry.from} -> ${entry.to}: ${entry.task}`;
    }

    if(entry.kind === "review"){
        return `[review] ${entry.reviewer} — ${entry.verdict}`;
    }

    if(entry.kind === "consensus"){
        return `[consensus] "${entry.proposal}" — ${entry.decision} (${entry.tally.yes}y/${entry.tally.no}n/${entry.tally.abstain}a)`;
    }

    return `[${entry.kind}] ${entry.content}`;

}


async function loadIntegrationsStatus(){

    const overview = await fetchJSON("/api/integrations");

    renderList(
        "integrations-status",
        overview.integrations,
        "No integrations registered.",
        integration => `${integration.id} — ${integration.implemented ? (integration.configured ? "configured" : "not configured") : "placeholder"} — ${integration.note}`
    );

}


async function loadCollaborationHistory(){

    const history = await fetchJSON("/api/collaboration/history");

    renderList(
        "collaboration-history",
        history,
        "No collaboration activity yet.",
        entry => `[${new Date(entry.created).toLocaleString()}] ${formatCollaborationEntry(entry)}`
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


async function loadSemanticSearchStatus(){

    const status = await fetchJSON("/api/memory/semantic-search-status");

    const statusElement = document.getElementById("semantic-search-status");

    statusElement.textContent = status.available
        ? "Available (OPENAI_API_KEY configured)."
        : "Not available -- set OPENAI_API_KEY to enable. Falls back to keyword search everywhere else.";

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
            loadExecutiveReport(),
            loadMemoryOverview(),
            loadMemoryLifecycle(),
            loadConsolidationHistory(),
            loadSelfMonitorHistory(),
            loadPriorityRank(),
            loadGoalIssues(),
            loadExecutiveBlockers(),
            loadExecutiveRecommendations(),
            loadDailyBriefing(),
            loadWeeklyReport(),
            loadDailyReview(),
            loadLearningOverview(),
            loadLearningDepartments(),
            loadLearningTools(),
            loadLearningRecommendations(),
            loadAutomationStatus(),
            loadAutomationSchedules(),
            loadAutomationHistory(),
            loadCollaborationHistory(),
            loadIntegrationsStatus(),
            loadSemanticSearchStatus(),
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


function setupPursueForm(){

    const form = document.getElementById("pursue-form");
    const result = document.getElementById("pursue-result");

    form.addEventListener("submit", async event => {

        event.preventDefault();

        const raw = document.getElementById("pursue-goal-json").value;

        let goal;

        try {
            goal = JSON.parse(raw);
        } catch(error){
            result.textContent = `Invalid JSON: ${error.message}`;
            return;
        }

        result.textContent = "Pursuing (plans and decomposes, calls Claude, may take a few seconds)...";

        try {

            const outcome = await authedFetch("/api/executive/pursue", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(goal)
            });

            result.textContent = `Planned "${outcome.project.title}" (${outcome.project.id}) with ${outcome.decomposition.milestones.length} milestone(s).`;

            loadDashboard();

        } catch(error){

            result.textContent = `Error: ${error.message}`;

        }

    });

}


function setupRunNextForm(){

    const form = document.getElementById("run-next-form");
    const result = document.getElementById("run-next-result");

    form.addEventListener("submit", async event => {

        event.preventDefault();

        result.textContent = "Running next ready task (calls Claude, may take a few seconds)...";

        try {

            const outcome = await authedFetch("/api/executive/run-next", { method: "POST" });

            result.textContent = outcome.ranTask
                ? `Ran task ${outcome.task} via ${outcome.department} -- outcome: ${outcome.outcome}.`
                : "No ready task found.";

            loadDashboard();

        } catch(error){

            result.textContent = `Error: ${error.message}`;

        }

    });

}


function setupRecommendationsForm(){

    const form = document.getElementById("recommendations-form");
    const result = document.getElementById("recommendations-result");

    form.addEventListener("submit", async event => {

        event.preventDefault();

        result.textContent = "Generating...";

        try {

            const record = await authedFetch("/api/executive/recommendations", { method: "POST" });

            result.textContent = record.recommendations.length
                ? `${record.recommendations.length} recommendation(s) generated.`
                : "Nothing to recommend.";

            loadDashboard();

        } catch(error){

            result.textContent = `Error: ${error.message}`;

        }

    });

}


function setupDailyBriefingForm(){

    const form = document.getElementById("daily-briefing-form");
    const result = document.getElementById("daily-briefing-result");

    form.addEventListener("submit", async event => {

        event.preventDefault();

        result.textContent = "Generating...";

        try {

            const briefing = await authedFetch("/api/executive/daily-briefing", { method: "POST" });

            result.textContent = briefing.summary;

            loadDashboard();

        } catch(error){

            result.textContent = `Error: ${error.message}`;

        }

    });

}


function setupWeeklyReportForm(){

    const form = document.getElementById("weekly-report-form");
    const result = document.getElementById("weekly-report-result");

    form.addEventListener("submit", async event => {

        event.preventDefault();

        result.textContent = "Generating...";

        try {

            const report = await authedFetch("/api/executive/weekly-report", { method: "POST" });

            result.textContent = report.summary;

            loadDashboard();

        } catch(error){

            result.textContent = `Error: ${error.message}`;

        }

    });

}


function setupDailyReviewForm(){

    const form = document.getElementById("daily-review-form");
    const result = document.getElementById("daily-review-result");

    form.addEventListener("submit", async event => {

        event.preventDefault();

        result.textContent = "Generating...";

        try {

            const review = await authedFetch("/api/executive/daily-review", { method: "POST" });

            result.textContent = review.summary;

            loadDashboard();

        } catch(error){

            result.textContent = `Error: ${error.message}`;

        }

    });

}


function setupSelfCheckForm(){

    const form = document.getElementById("self-check-form");
    const result = document.getElementById("self-check-result");

    form.addEventListener("submit", async event => {

        event.preventDefault();

        result.textContent = "Checking...";

        try {

            const outcome = await authedFetch("/api/executive/self-check", { method: "POST" });

            result.textContent = outcome.issuesFound
                ? `Found ${outcome.issuesFound} issue(s) -- recommendations generated.`
                : "No issues found.";

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


function setupCollabMessageForm(){

    const form = document.getElementById("collab-message-form");
    const result = document.getElementById("collab-message-result");

    form.addEventListener("submit", async event => {

        event.preventDefault();

        const from = document.getElementById("collab-message-from").value;
        const to = document.getElementById("collab-message-to").value;
        const message = document.getElementById("collab-message-text").value;

        result.textContent = "Sending...";

        try {

            await authedFetch("/api/collaboration/message", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ from, to, message })
            });

            result.textContent = "Sent.";
            form.reset();
            loadDashboard();

        } catch(error){

            result.textContent = `Error: ${error.message}`;

        }

    });

}


function setupCollabDelegateForm(){

    const form = document.getElementById("collab-delegate-form");
    const result = document.getElementById("collab-delegate-result");

    form.addEventListener("submit", async event => {

        event.preventDefault();

        const from = document.getElementById("collab-delegate-from").value;
        const to = document.getElementById("collab-delegate-to").value;
        const task = document.getElementById("collab-delegate-task").value;

        result.textContent = "Delegating (calls Claude)...";

        try {

            const outcome = await authedFetch("/api/collaboration/delegate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ from, to, task })
            });

            result.textContent = `${outcome.agent}: ${outcome.response}`;
            form.reset();
            loadDashboard();

        } catch(error){

            result.textContent = `Error: ${error.message}`;

        }

    });

}


function setupCollabReviewForm(){

    const form = document.getElementById("collab-review-form");
    const result = document.getElementById("collab-review-result");

    form.addEventListener("submit", async event => {

        event.preventDefault();

        const reviewer = document.getElementById("collab-review-dept").value;
        const content = document.getElementById("collab-review-content").value;

        result.textContent = "Reviewing (calls Claude)...";

        try {

            const outcome = await authedFetch("/api/collaboration/review", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ reviewer, content })
            });

            result.textContent = `${outcome.verdict}: ${outcome.feedback.join("; ")}`;
            form.reset();
            loadDashboard();

        } catch(error){

            result.textContent = `Error: ${error.message}`;

        }

    });

}


function setupCollabConsensusForm(){

    const form = document.getElementById("collab-consensus-form");
    const result = document.getElementById("collab-consensus-result");

    form.addEventListener("submit", async event => {

        event.preventDefault();

        const departmentIds = document.getElementById("collab-consensus-depts").value.split(",").map(s => s.trim());
        const proposal = document.getElementById("collab-consensus-proposal").value;

        result.textContent = "Voting (calls Claude, once per department)...";

        try {

            const outcome = await authedFetch("/api/collaboration/consensus", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ departmentIds, proposal })
            });

            result.textContent = `${outcome.decision} (${outcome.tally.yes}y/${outcome.tally.no}n/${outcome.tally.abstain}a)`;
            form.reset();
            loadDashboard();

        } catch(error){

            result.textContent = `Error: ${error.message}`;

        }

    });

}


function setupSemanticSearchForm(){

    const form = document.getElementById("semantic-search-form");
    const result = document.getElementById("semantic-search-result");

    form.addEventListener("submit", async event => {

        event.preventDefault();

        const query = document.getElementById("semantic-search-query").value;

        result.textContent = "Searching (calls OpenAI)...";

        try {

            const results = await authedFetch("/api/memory/semantic-search", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ query })
            });

            result.textContent = JSON.stringify(results, null, 2);

        } catch(error){

            result.textContent = `Error: ${error.message}`;

        }

    });

}


function setupReindexEmbeddingsForm(){

    const form = document.getElementById("reindex-embeddings-form");
    const result = document.getElementById("semantic-search-result");

    form.addEventListener("submit", async event => {

        event.preventDefault();

        result.textContent = "Reindexing (calls OpenAI for each new/changed memory)...";

        try {

            const outcome = await authedFetch("/api/memory/reindex-embeddings", { method: "POST" });

            result.textContent = JSON.stringify(outcome, null, 2);
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
    setupPursueForm();
    setupRunNextForm();
    setupSelfCheckForm();
    setupRecommendationsForm();
    setupDailyBriefingForm();
    setupWeeklyReportForm();
    setupDailyReviewForm();
    setupRecommendForm();
    setupAutomationRunForm();
    setupCollabMessageForm();
    setupCollabDelegateForm();
    setupCollabReviewForm();
    setupCollabConsensusForm();
    setupSemanticSearchForm();
    setupReindexEmbeddingsForm();
    setupCompanyLookupForm();
    setupCompanyCreateForm();

    populateDepartmentSelect("department-select");
    populateDepartmentSelect("plan-department", { includeAuto: true });

});
