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

    // Project F (Self Diagnostics): the real, unified 0-100 health
    // score, not just an uptime string -- the Executive Summary panel
    // is exactly where a degraded/critical score belongs, alongside
    // Critical Alerts. Fixed alongside this: index.html previously had
    // a real duplicate id="system-health" on two different <div>s (this
    // one and the "System" panel's own Health widget below) -- only the
    // first ever received anything, via getElementById()'s
    // first-match-wins behavior; this one is now uniquely
    // "executive-system-health".
    try {

        const health = await fetchJSON("/api/system/health-score");
        const el = document.getElementById("executive-system-health");

        el.textContent = `${health.status.toUpperCase()} (${health.score}/100)` +
            (health.breakdown.length ? `\n${health.breakdown.map(b => `- ${b.detail}`).join("\n")}` : "");

    } catch(error){
        document.getElementById("executive-system-health").textContent = `Error: ${error.message}`;
    }

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


async function loadGoalView(){

    const goals = await fetchJSON("/api/goals/overview");

    renderList(
        "goal-view",
        goals,
        "No active goals.",
        goal => `[${goal.department}] ${goal.title} -- ${goal.status}, ${goal.progress}% complete (priority ${goal.priority})`
    );

}


async function loadAgentNetwork(){

    const network = await fetchJSON("/api/agents/network");

    renderList(
        "agent-network",
        network,
        "No agents loaded.",
        agent => `${agent.name} (${agent.department}) -- ${agent.connections.length} connection(s)${agent.connections.length ? ": " + agent.connections.map(c => `${c.type}->${c.from === agent.name ? c.to : c.from}`).join(", ") : ""}`
    );

}


async function loadDeviceNetwork(){

    const network = await fetchJSON("/api/devices/network");

    renderList(
        "device-network",
        network,
        "No devices registered yet.",
        entry => `[${entry.status}] ${entry.name} (${entry.type}, role: ${entry.role}) -- last seen ${entry.minutesSinceLastSeen}m ago`
    );

}


async function loadPendingApprovals(){

    const pending = await fetchJSON("/api/executive/proposals?status=pending");

    renderList(
        "pending-approvals",
        pending,
        "No proposals awaiting approval.",
        proposal => `[${proposal.risk} risk] ${proposal.action} -- ${proposal.reason} (id ${proposal.id})`
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


async function loadActionProposals(){

    const proposals = await fetchJSON("/api/executive/proposals");

    renderList(
        "action-proposals",
        proposals,
        "No action proposals yet.",
        proposal => `[${proposal.status}] (${proposal.risk} risk${proposal.approvalRequired ? "" : ", no approval required"}) ${proposal.action} -- ${proposal.reason} (id ${proposal.id})`
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


async function loadAdaptiveInsights(){

    const insights = await fetchJSON("/api/learning/adaptive-insights");
    document.getElementById("adaptive-insights").textContent = JSON.stringify(insights, null, 2);

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
        integration => {

            const state = integration.implemented ? (integration.configured ? "configured" : "not configured") : "placeholder";
            const extras = [];

            if(typeof integration.authorized === "boolean"){
                extras.push(integration.authorized ? "authorized" : "not authorized");
            }

            if(typeof integration.connected === "boolean"){
                extras.push(integration.connected ? "connected" : "disconnected");
            }

            if(typeof integration.latencyMs === "number"){
                extras.push(`${integration.latencyMs}ms`);
            }

            if(typeof integration.guildCount === "number"){
                extras.push(`${integration.guildCount} guild(s)`);
            }

            if(integration.lastSync){
                extras.push(`last sync ${new Date(integration.lastSync).toLocaleString()}`);
            }

            const extrasText = extras.length ? ` [${extras.join(", ")}]` : "";

            return `${integration.id} — ${state}${extrasText} — ${integration.note}`;

        }
    );

}


async function loadCapabilities(){

    const capabilities = await fetchJSON("/api/capabilities");

    renderList(
        "capabilities-status",
        capabilities,
        "No capabilities registered.",
        capability => `${capability.name} v${capability.version} — ${capability.status}${capability.core ? " (built-in)" : ""} — ${capability.description}`
    );

}


async function loadSystemReport(){

    const report = await fetchJSON("/api/system/report");

    document.getElementById("system-report").textContent = JSON.stringify(report, null, 2);

}


function formatMarketplaceEntry(entry){

    const flags = [];
    if(entry.experimental) flags.push("experimental");
    if(entry.deprecated) flags.push("deprecated");
    if(entry.updateAvailable) flags.push(`update available (v${entry.onDiskVersion})`);

    const sizeKb = typeof entry.installSizeBytes === "number" ? `${Math.round(entry.installSizeBytes / 1024)}KB` : "?";
    const flagsText = flags.length ? ` [${flags.join(", ")}]` : "";

    return `${entry.name} v${entry.version} — ${entry.description}${flagsText} (${sizeKb})`;

}


async function loadCapabilityMarketplace(){

    const categories = await fetchJSON("/api/capabilities/marketplace");
    const container = document.getElementById("capability-marketplace");

    container.innerHTML = "";

    for(const [label, key] of [
        ["Installed", "installed"], ["Available", "available"], ["Disabled", "disabled"],
        ["Experimental", "experimental"], ["Updates available", "updatesAvailable"],
        ["Deprecated", "deprecated"], ["Broken", "broken"]
    ]){

        const heading = el("p", { textContent: `${label} (${categories[key].length})`, className: "hint" });
        container.appendChild(heading);

        if(!categories[key].length){
            continue;
        }

        const list = el("ul");
        for(const entry of categories[key]){
            list.appendChild(el("li", { textContent: formatMarketplaceEntry(entry) }));
        }
        container.appendChild(list);

    }

}


function formatCapabilityHealthEntry(entry){

    const parts = [
        `${entry.name} v${entry.version}`,
        `— ${entry.operationalStatusLabel}`,
        `— agents ${entry.agentsLoaded}/${entry.agentsDeclared}`,
        `— tools ${entry.toolsLoaded}/${entry.toolsDeclared}`
    ];

    if(entry.skeletonTools.length){
        parts.push(`— skeleton tools: ${entry.skeletonTools.join(", ")}`);
    }

    if(entry.missingDependencies.length){
        parts.push(`— missing dependencies: ${entry.missingDependencies.join(", ")}`);
    }

    return parts.join(" ");

}


async function loadCapabilityHealth(){

    const health = await fetchJSON("/api/capabilities/health");

    renderList(
        "capability-health",
        health,
        "No installed packages to report on.",
        formatCapabilityHealthEntry
    );

}


function setupCapabilitySearchForm(){

    const form = document.getElementById("capability-search-form");

    form.addEventListener("submit", async event => {

        event.preventDefault();

        const query = document.getElementById("capability-search-query").value;
        const results = await fetchJSON(`/api/capabilities/search?q=${encodeURIComponent(query)}`);

        renderList(
            "capability-search-result",
            results,
            "No matching capabilities.",
            formatMarketplaceEntry
        );

    });

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
            loadGoalView(),
            loadAgentNetwork(),
            loadDeviceNetwork(),
            loadPendingApprovals(),
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
            loadActionProposals(),
            loadLearningOverview(),
            loadLearningDepartments(),
            loadLearningTools(),
            loadLearningRecommendations(),
            loadAdaptiveInsights(),
            loadAutomationStatus(),
            loadAutomationSchedules(),
            loadAutomationHistory(),
            loadCollaborationHistory(),
            loadIntegrationsStatus(),
            loadCapabilities(),
            loadSystemReport(),
            loadCapabilityMarketplace(),
            loadCapabilityHealth(),
            loadSemanticSearchStatus(),
            loadCompanies(),
            loadResearchHistory(),
            loadMissionHistory(),
            loadOrganizationOverview(),
            loadExecutiveSummary(),
            loadSystemHealth(),
            loadMaintenanceReport(),
            loadOperationalReadiness()
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


function setupGenerateProposalsForm(){

    const form = document.getElementById("generate-proposals-form");
    const result = document.getElementById("generate-proposals-result");

    form.addEventListener("submit", async event => {

        event.preventDefault();

        result.textContent = "Generating...";

        try {

            const proposals = await authedFetch("/api/executive/proposals/generate", { method: "POST" });

            result.textContent = proposals.length ? `${proposals.length} proposal(s) generated.` : "Nothing to propose.";

            loadDashboard();

        } catch(error){

            result.textContent = `Error: ${error.message}`;

        }

    });

}


function setupProposalActionForm(){

    const form = document.getElementById("proposal-action-form");
    const result = document.getElementById("proposal-action-result");

    form.addEventListener("submit", async event => {

        event.preventDefault();

        const id = document.getElementById("proposal-action-id").value;
        const action = document.getElementById("proposal-action-type").value;
        const note = document.getElementById("proposal-action-note").value;

        result.textContent = "Submitting...";

        try {

            const body = action === "execute" ? {} : { note };

            const updated = await authedFetch(`/api/executive/proposals/${encodeURIComponent(id)}/${action}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body)
            });

            result.textContent = `Proposal ${updated.id} is now "${updated.status}".`;

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


async function loadWorkflowList(){

    try {
        const workflows = await fetchJSON("/api/automation/workflows");
        renderList(
            "workflow-list",
            workflows,
            "No workflows defined yet.",
            workflow => `${workflow.name} (${workflow.stepCount} step${workflow.stepCount === 1 ? "" : "s"})`
        );
    } catch(error){
        renderList("workflow-list", [], `Error: ${error.message}`, () => "");
    }

}


function setupWorkflowRunForm(){

    const form = document.getElementById("workflow-run-form");
    const result = document.getElementById("workflow-run-result");

    loadWorkflowList();

    form.addEventListener("submit", async event => {

        event.preventDefault();

        const name = document.getElementById("workflow-run-name").value;

        result.textContent = "Running...";

        try {

            const run = await authedFetch(`/api/automation/workflows/${encodeURIComponent(name)}/run`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: "{}"
            });

            result.textContent = JSON.stringify(run, null, 2);
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


async function loadConstitution(){

    try {
        const constitution = await fetchJSON("/api/constitution");
        document.getElementById("constitution-view").textContent = JSON.stringify(constitution, null, 2);
    } catch(error){
        document.getElementById("constitution-view").textContent = `Error: ${error.message}`;
    }

}


function setupConstitutionForms(){

    const setForm = document.getElementById("constitution-set-form");
    const setResult = document.getElementById("constitution-set-result");

    setForm.addEventListener("submit", async event => {

        event.preventDefault();

        const path = document.getElementById("constitution-set-path").value;
        const value = document.getElementById("constitution-set-value").value;

        try {

            await authedFetch("/api/constitution/set", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ path, value })
            });

            setResult.textContent = "Saved.";
            setForm.reset();
            loadConstitution();

        } catch(error){

            setResult.textContent = `Error: ${error.message}`;

        }

    });

    const addForm = document.getElementById("constitution-add-form");
    const addResult = document.getElementById("constitution-add-result");

    addForm.addEventListener("submit", async event => {

        event.preventDefault();

        const field = document.getElementById("constitution-add-field").value;
        const value = document.getElementById("constitution-add-value").value;

        try {

            await authedFetch("/api/constitution/add", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ field, value })
            });

            addResult.textContent = "Added.";
            addForm.reset();
            loadConstitution();

        } catch(error){

            addResult.textContent = `Error: ${error.message}`;

        }

    });

    loadConstitution();

}


async function loadBrainPanel(){

    try {
        const status = await fetchJSON("/api/brain/status");
        renderList(
            "brain-status",
            status,
            "No providers reported.",
            entry => `${entry.name}: ${entry.configured ? "configured" : "not configured"}${entry.active ? " (active)" : ""}`
        );
    } catch(error){
        renderList("brain-status", [], `Error: ${error.message}`, () => "");
    }

    try {
        const preferences = await fetchJSON("/api/brain/routing-preferences");
        const entries = Object.entries(preferences);
        renderList(
            "brain-routing-list",
            entries,
            "No routing preferences set -- every task type uses the default fallback order.",
            ([taskType, provider]) => `${taskType} -> ${provider}`
        );
    } catch(error){
        renderList("brain-routing-list", [], `Error: ${error.message}`, () => "");
    }

}


function setupBrainRoutingForms(){

    loadBrainPanel();

    const setForm = document.getElementById("brain-routing-form");
    const result = document.getElementById("brain-routing-result");

    setForm.addEventListener("submit", async event => {

        event.preventDefault();

        const taskType = document.getElementById("brain-routing-task-type").value;
        const provider = document.getElementById("brain-routing-provider").value;

        try {

            await authedFetch("/api/brain/routing-preferences/set", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ taskType, provider })
            });

            result.textContent = "Saved.";
            setForm.reset();
            loadBrainPanel();

        } catch(error){

            result.textContent = `Error: ${error.message}`;

        }

    });

    const clearForm = document.getElementById("brain-routing-clear-form");

    clearForm.addEventListener("submit", async event => {

        event.preventDefault();

        const taskType = document.getElementById("brain-routing-clear-task-type").value;

        try {

            await authedFetch("/api/brain/routing-preferences/clear", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ taskType })
            });

            result.textContent = "Cleared.";
            clearForm.reset();
            loadBrainPanel();

        } catch(error){

            result.textContent = `Error: ${error.message}`;

        }

    });

}


function formatInference(entry){
    return `${entry.subject} (confidence ${Math.round(entry.confidence * 100)}%): ${entry.inference}`;
}


async function loadPersonalIntelligencePanel(){

    try {
        const relationships = await fetchJSON("/api/personal-intelligence/relationships");
        renderList("personal-intelligence-relationships", relationships, "No real relationship evidence yet.", formatInference);
    } catch(error){
        renderList("personal-intelligence-relationships", [], `Error: ${error.message}`, () => "");
    }

    try {
        const patterns = await fetchJSON("/api/personal-intelligence/decision-patterns");
        renderList("personal-intelligence-patterns", patterns, "No real decision-pattern evidence yet.", formatInference);
    } catch(error){
        renderList("personal-intelligence-patterns", [], `Error: ${error.message}`, () => "");
    }

    try {
        const dismissed = await fetchJSON("/api/personal-intelligence/dismissed");
        renderList(
            "personal-intelligence-dismissed",
            dismissed,
            "No dismissed inferences.",
            entry => `${entry.subject}${entry.reason ? ` -- ${entry.reason}` : ""}`
        );
    } catch(error){
        renderList("personal-intelligence-dismissed", [], `Error: ${error.message}`, () => "");
    }

}


function setupPersonalIntelligenceForms(){

    loadPersonalIntelligencePanel();

    document.getElementById("personal-intelligence-clients-form").addEventListener("submit", async event => {

        event.preventDefault();

        const companyId = document.getElementById("personal-intelligence-clients-company-id").value;

        try {

            const clients = await fetchJSON(`/api/personal-intelligence/key-clients?companyId=${encodeURIComponent(companyId)}`);
            renderList("personal-intelligence-clients", clients, "No real billing activity for this company yet.", formatInference);

        } catch(error){

            renderList("personal-intelligence-clients", [], `Error: ${error.message}`, () => "");

        }

    });

    const dismissForm = document.getElementById("personal-intelligence-dismiss-form");
    const dismissResult = document.getElementById("personal-intelligence-dismiss-result");

    dismissForm.addEventListener("submit", async event => {

        event.preventDefault();

        const subject = document.getElementById("personal-intelligence-dismiss-subject").value;
        const reason = document.getElementById("personal-intelligence-dismiss-reason").value;

        try {

            await authedFetch("/api/personal-intelligence/dismiss", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ subject, reason })
            });

            dismissResult.textContent = "Dismissed.";
            dismissForm.reset();
            loadPersonalIntelligencePanel();

        } catch(error){

            dismissResult.textContent = `Error: ${error.message}`;

        }

    });

}


async function loadAcquisitionHistory(){

    try {
        const history = await fetchJSON("/api/knowledge/acquisition-history");
        renderList(
            "acquisition-history",
            history,
            "No knowledge acquired yet.",
            entry => `${entry.metadata.sourceLabel}: ${entry.metadata.summary || "(no summary)"}`
        );
    } catch(error){
        renderList("acquisition-history", [], `Error: ${error.message}`, () => "");
    }

}


function setupAcquisitionForms(){

    loadAcquisitionHistory();

    const fileForm = document.getElementById("acquire-file-form");
    const fileResult = document.getElementById("acquire-file-result");

    fileForm.addEventListener("submit", async event => {

        event.preventDefault();

        const path = document.getElementById("acquire-file-path").value;

        fileResult.textContent = "Acquiring (calls Claude)...";

        try {

            const result = await authedFetch("/api/knowledge/acquire-file", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ path })
            });

            fileResult.textContent = JSON.stringify(result, null, 2);
            loadAcquisitionHistory();

        } catch(error){

            fileResult.textContent = `Error: ${error.message}`;

        }

    });

    const noteForm = document.getElementById("acquire-note-form");
    const noteResult = document.getElementById("acquire-note-result");

    noteForm.addEventListener("submit", async event => {

        event.preventDefault();

        const path = document.getElementById("acquire-note-path").value;

        noteResult.textContent = "Acquiring (calls Claude)...";

        try {

            const result = await authedFetch("/api/knowledge/acquire-note", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ path })
            });

            noteResult.textContent = JSON.stringify(result, null, 2);
            loadAcquisitionHistory();

        } catch(error){

            noteResult.textContent = `Error: ${error.message}`;

        }

    });

}


function setupCollabOpportunitiesForm(){

    const form = document.getElementById("collab-opportunities-form");
    const generateButton = document.getElementById("collab-opportunities-generate");
    const generateResult = document.getElementById("collab-opportunities-generate-result");

    form.addEventListener("submit", async event => {

        event.preventDefault();

        const companyId = document.getElementById("collab-opportunities-company-id").value;
        const url = companyId
            ? `/api/collaboration/opportunities?companyId=${encodeURIComponent(companyId)}`
            : "/api/collaboration/opportunities";

        try {

            const opportunities = await fetchJSON(url);

            renderList(
                "collab-opportunities-list",
                opportunities,
                "No collaboration opportunities detected right now.",
                opportunity => `[${opportunity.from} -> ${opportunity.to}] ${opportunity.task}`
            );

        } catch(error){

            renderList("collab-opportunities-list", [], `Error: ${error.message}`, () => "");

        }

    });

    generateButton.addEventListener("click", async () => {

        const companyId = document.getElementById("collab-opportunities-company-id").value;

        generateResult.textContent = "Generating proposals...";

        try {

            const proposals = await authedFetch("/api/collaboration/opportunities/generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ companyId: companyId || null })
            });

            generateResult.textContent = `${proposals.length} proposal(s) created -- review them in the Approval Center.`;
            loadDashboard();

        } catch(error){

            generateResult.textContent = `Error: ${error.message}`;

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


function setupBrandProfileForm(){

    const form = document.getElementById("brand-profile-form");
    const result = document.getElementById("brand-profile-result");

    form.addEventListener("submit", async event => {

        event.preventDefault();

        const companyId = document.getElementById("brand-profile-company-id").value;
        const mission = document.getElementById("brand-profile-mission").value;
        const audience = document.getElementById("brand-profile-audience").value;
        const tone = document.getElementById("brand-profile-tone").value;

        const patch = {};
        if(mission) patch.mission = mission;
        if(audience) patch.audience = audience;
        if(tone) patch.voice = { tone };

        result.textContent = "Saving...";

        try {

            const profile = await authedFetch(`/api/companies/${encodeURIComponent(companyId)}/brand-profile`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(patch)
            });

            result.textContent = JSON.stringify(profile, null, 2);

        } catch(error){

            result.textContent = `Error: ${error.message}`;

        }

    });

}


function setupCampaignPlanForm(){

    const form = document.getElementById("campaign-plan-form");
    const result = document.getElementById("campaign-plan-result");

    form.addEventListener("submit", async event => {

        event.preventDefault();

        const companyId = document.getElementById("campaign-company-id").value;
        const objective = document.getElementById("campaign-objective").value;
        const platformsRaw = document.getElementById("campaign-platforms").value;
        const platforms = platformsRaw ? platformsRaw.split(",").map(p => p.trim()).filter(Boolean) : [];

        result.textContent = "Planning...";

        try {

            const campaign = await authedFetch("/api/marketing/campaigns", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ companyId, objective, platforms })
            });

            result.textContent = `Created campaign "${campaign.objective}" (id: ${campaign.id})`;

        } catch(error){

            result.textContent = `Error: ${error.message}`;

        }

    });

}


function setupCampaignLookupForm(){

    const form = document.getElementById("campaign-lookup-form");

    form.addEventListener("submit", async event => {

        event.preventDefault();

        const companyId = document.getElementById("campaign-lookup-company-id").value;

        try {

            const campaigns = await fetchJSON(`/api/marketing/campaigns?companyId=${encodeURIComponent(companyId)}`);

            renderList(
                "campaign-list",
                campaigns,
                "No campaigns for this company yet.",
                campaign => `${campaign.name} — ${campaign.approvalStatus} / ${campaign.publishingStatus} — ${campaign.objective}`
            );

            const calendarEntries = await fetchJSON(`/api/marketing/calendar?companyId=${encodeURIComponent(companyId)}`);

            renderList(
                "campaign-calendar",
                calendarEntries,
                "No scheduled content yet.",
                item => `${item.date} — ${item.platform} — ${item.description} (${item.status})`
            );

        } catch(error){

            document.getElementById("campaign-list").textContent = `Error: ${error.message}`;

        }

    });

}


function setupCompanyBrainForm(){

    const form = document.getElementById("company-brain-form");
    const result = document.getElementById("company-brain-result");

    form.addEventListener("submit", async event => {

        event.preventDefault();

        const companyId = document.getElementById("company-brain-id").value;

        result.textContent = "Loading...";

        try {

            const brain = await fetchJSON(`/api/companies/${encodeURIComponent(companyId)}/brain`);

            result.textContent = JSON.stringify(brain, null, 2);

        } catch(error){

            result.textContent = `Error: ${error.message}`;

        }

    });

}


function setupLeadCreateForm(){

    const form = document.getElementById("lead-create-form");
    const result = document.getElementById("lead-create-result");

    form.addEventListener("submit", async event => {

        event.preventDefault();

        const companyId = document.getElementById("lead-company-id").value;
        const name = document.getElementById("lead-name").value;
        const email = document.getElementById("lead-email").value;
        const organization = document.getElementById("lead-organization").value;

        result.textContent = "Creating...";

        try {

            const lead = await authedFetch("/api/sales/leads", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ companyId, name, email: email || undefined, organization: organization || undefined })
            });

            result.textContent = `Created lead "${lead.name}" (id: ${lead.id})`;

        } catch(error){

            result.textContent = `Error: ${error.message}`;

        }

    });

}


function setupLeadLookupForm(){

    const form = document.getElementById("lead-lookup-form");

    form.addEventListener("submit", async event => {

        event.preventDefault();

        const companyId = document.getElementById("lead-lookup-company-id").value;

        try {

            const leadsFound = await fetchJSON(`/api/sales/leads?companyId=${encodeURIComponent(companyId)}`);

            renderList(
                "lead-list",
                leadsFound,
                "No leads for this company yet.",
                lead => `${lead.name} — ${lead.status}${lead.score !== null ? ` (score: ${lead.score})` : ""} — ${lead.organization || "no organization"}`
            );

        } catch(error){

            document.getElementById("lead-list").textContent = `Error: ${error.message}`;

        }

    });

}


function setupOpportunityCreateForm(){

    const form = document.getElementById("opportunity-create-form");
    const result = document.getElementById("opportunity-create-result");

    form.addEventListener("submit", async event => {

        event.preventDefault();

        const companyId = document.getElementById("opportunity-company-id").value;
        const name = document.getElementById("opportunity-name").value;
        const value = Number(document.getElementById("opportunity-value").value);

        result.textContent = "Creating...";

        try {

            const opportunity = await authedFetch("/api/sales/opportunities", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ companyId, name, value })
            });

            result.textContent = `Created opportunity "${opportunity.name}" at stage "${opportunity.stage}" (id: ${opportunity.id})`;

        } catch(error){

            result.textContent = `Error: ${error.message}`;

        }

    });

}


function setupSalesAnalyticsForm(){

    const form = document.getElementById("sales-analytics-form");
    const result = document.getElementById("sales-analytics-result");

    form.addEventListener("submit", async event => {

        event.preventDefault();

        const companyId = document.getElementById("sales-analytics-company-id").value;

        result.textContent = "Loading...";

        try {

            const opportunitiesFound = await fetchJSON(`/api/sales/opportunities?companyId=${encodeURIComponent(companyId)}`);

            renderList(
                "opportunity-list",
                opportunitiesFound,
                "No opportunities for this company yet.",
                opportunity => `${opportunity.name} — ${opportunity.stage} — $${opportunity.value}`
            );

            const analytics = await fetchJSON(`/api/sales/analytics?companyId=${encodeURIComponent(companyId)}`);

            result.textContent = JSON.stringify(analytics, null, 2);

        } catch(error){

            result.textContent = `Error: ${error.message}`;

        }

    });

}


function setupBudgetCreateForm(){

    const form = document.getElementById("budget-create-form");
    const result = document.getElementById("budget-create-result");

    form.addEventListener("submit", async event => {

        event.preventDefault();

        const companyId = document.getElementById("budget-company-id").value;
        const category = document.getElementById("budget-category").value;
        const period = document.getElementById("budget-period").value;
        const limit = Number(document.getElementById("budget-limit").value);

        result.textContent = "Saving...";

        try {

            const budget = await authedFetch("/api/finance/budgets", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ companyId, category, period, limit })
            });

            result.textContent = `Set "${budget.category}" budget for ${budget.period} at ${budget.limit}`;

        } catch(error){

            result.textContent = `Error: ${error.message}`;

        }

    });

}


function setupInvoiceCreateForm(){

    const form = document.getElementById("invoice-create-form");
    const result = document.getElementById("invoice-create-result");

    form.addEventListener("submit", async event => {

        event.preventDefault();

        const companyId = document.getElementById("invoice-company-id").value;
        const clientName = document.getElementById("invoice-client-name").value;
        const amount = Number(document.getElementById("invoice-amount").value);

        result.textContent = "Creating...";

        try {

            const invoice = await authedFetch("/api/finance/invoices", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ companyId, clientName, amount })
            });

            result.textContent = `Created invoice for ${invoice.clientName} (${invoice.amount}), status: ${invoice.status}`;

        } catch(error){

            result.textContent = `Error: ${error.message}`;

        }

    });

}


function setupSubscriptionCreateForm(){

    const form = document.getElementById("subscription-create-form");
    const result = document.getElementById("subscription-create-result");

    form.addEventListener("submit", async event => {

        event.preventDefault();

        const companyId = document.getElementById("subscription-company-id").value;
        const clientName = document.getElementById("subscription-client-name").value;
        const amount = Number(document.getElementById("subscription-amount").value);
        const interval = document.getElementById("subscription-interval").value;

        result.textContent = "Adding...";

        try {

            const subscription = await authedFetch("/api/finance/subscriptions", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ companyId, clientName, amount, interval })
            });

            result.textContent = `Added ${subscription.interval} subscription for ${subscription.clientName} (${subscription.amount})`;

        } catch(error){

            result.textContent = `Error: ${error.message}`;

        }

    });

}


function setupFinanceKpisForm(){

    const form = document.getElementById("finance-kpis-form");
    const result = document.getElementById("finance-kpis-result");

    form.addEventListener("submit", async event => {

        event.preventDefault();

        const companyId = document.getElementById("finance-kpis-company-id").value;

        result.textContent = "Loading...";

        try {

            const budgetStatus = await fetchJSON(`/api/finance/budgets?companyId=${encodeURIComponent(companyId)}`);

            renderList(
                "budget-status-list",
                budgetStatus,
                "No budgets set for this company yet.",
                budget => `${budget.category} (${budget.period}): ${budget.actualSpend} / ${budget.limit}${budget.overBudget ? " — OVER BUDGET" : ""}`
            );

            const kpis = await fetchJSON(`/api/finance/kpis?companyId=${encodeURIComponent(companyId)}`);

            result.textContent = JSON.stringify(kpis, null, 2);

        } catch(error){

            result.textContent = `Error: ${error.message}`;

        }

    });

}


function setupMissionCreateForm(){

    const form = document.getElementById("mission-create-form");
    const result = document.getElementById("mission-create-result");

    form.addEventListener("submit", async event => {

        event.preventDefault();

        const objective = document.getElementById("research-mission-objective").value;
        const type = document.getElementById("mission-type").value;
        const companyId = document.getElementById("mission-company-id").value;

        result.textContent = "Creating...";

        try {

            const mission = await authedFetch("/api/research/missions", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ objective, type, companyId: companyId || undefined })
            });

            result.textContent = `Created mission "${mission.objective}" (id: ${mission.id})`;

        } catch(error){

            result.textContent = `Error: ${error.message}`;

        }

    });

}


function setupMissionCitationForm(){

    const form = document.getElementById("mission-citation-form");
    const result = document.getElementById("mission-citation-result");

    form.addEventListener("submit", async event => {

        event.preventDefault();

        const missionId = document.getElementById("citation-mission-id").value;
        const topic = document.getElementById("citation-topic").value;
        const url = document.getElementById("citation-url").value;

        result.textContent = "Researching (real fetch + LLM extraction, may take a moment)...";

        try {

            const mission = await authedFetch(`/api/research/missions/${encodeURIComponent(missionId)}/citations`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ topic, url })
            });

            result.textContent = `Mission now has ${mission.citationIds.length} citation(s)`;

        } catch(error){

            result.textContent = `Error: ${error.message}`;

        }

    });

}


function setupMissionLookupForm(){

    const form = document.getElementById("mission-lookup-form");

    form.addEventListener("submit", async event => {

        event.preventDefault();

        const missionId = document.getElementById("mission-lookup-id").value;

        try {

            const sources = await fetchJSON(`/api/research/missions/${encodeURIComponent(missionId)}/ranked-sources`);

            renderList(
                "mission-sources-list",
                sources,
                "No sources collected yet.",
                source => `[confidence ${source.confidence}] ${source.topic} — ${source.summary} (${source.citation})`
            );

        } catch(error){

            document.getElementById("mission-sources-list").textContent = `Error: ${error.message}`;

        }

    });

}


function setupMissionSummaryButton(){

    const button = document.getElementById("mission-summary-button");
    const result = document.getElementById("mission-summary-result");

    button.addEventListener("click", async () => {

        const missionId = document.getElementById("mission-lookup-id").value;

        if(!missionId){
            result.textContent = "Enter a mission id above first.";
            return;
        }

        result.textContent = "Generating (real LLM call, may take a moment)...";

        try {

            const { executiveSummary } = await authedFetch(`/api/research/missions/${encodeURIComponent(missionId)}/summary`, {
                method: "POST"
            });

            result.textContent = executiveSummary;

        } catch(error){

            result.textContent = `Error: ${error.message}`;

        }

    });

}


function setupPortfolioCreateForm(){

    const form = document.getElementById("portfolio-create-form");
    const result = document.getElementById("portfolio-create-result");

    form.addEventListener("submit", async event => {

        event.preventDefault();

        const name = document.getElementById("portfolio-name").value;
        const startingCash = Number(document.getElementById("portfolio-starting-cash").value);

        result.textContent = "Creating...";

        try {

            const portfolio = await authedFetch("/api/trading/portfolios", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name, startingCash })
            });

            result.textContent = `Created portfolio "${portfolio.name}" with $${portfolio.cash} cash (id: ${portfolio.id})`;

        } catch(error){

            result.textContent = `Error: ${error.message}`;

        }

    });

}


function setupPaperTradeForm(){

    const form = document.getElementById("paper-trade-form");
    const result = document.getElementById("paper-trade-result");

    form.addEventListener("submit", async event => {

        event.preventDefault();

        const portfolioId = document.getElementById("trade-portfolio-id").value;
        const symbol = document.getElementById("trade-symbol").value;
        const side = document.getElementById("trade-side").value;
        const quantity = Number(document.getElementById("trade-quantity").value);
        const price = Number(document.getElementById("trade-price").value);

        result.textContent = "Executing paper trade...";

        try {

            const { trade, portfolio } = await authedFetch(`/api/trading/portfolios/${encodeURIComponent(portfolioId)}/trades`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ symbol, side, quantity, price })
            });

            result.textContent = `Executed ${trade.side} ${trade.quantity} ${trade.symbol} @ ${trade.price} (paper). Cash now $${portfolio.cash}`;

        } catch(error){

            result.textContent = `Error: ${error.message}`;

        }

    });

}


function setupPortfolioReviewForm(){

    const form = document.getElementById("portfolio-review-form");
    const result = document.getElementById("portfolio-review-result");

    form.addEventListener("submit", async event => {

        event.preventDefault();

        const portfolioId = document.getElementById("review-portfolio-id").value;
        const pricesText = document.getElementById("review-prices").value;
        const prices = pricesText ? pricesText : "{}";

        result.textContent = "Loading...";

        try {

            const journalEntries = await fetchJSON(`/api/trading/portfolios/${encodeURIComponent(portfolioId)}/journal`);

            renderList(
                "portfolio-journal-list",
                journalEntries,
                "No paper trades yet.",
                entry => `${entry.side.toUpperCase()} ${entry.quantity} ${entry.symbol} @ ${entry.price} (${entry.timestamp})`
            );

            const review = await fetchJSON(`/api/trading/portfolios/${encodeURIComponent(portfolioId)}/review?prices=${encodeURIComponent(prices)}`);

            result.textContent = JSON.stringify(review, null, 2);

        } catch(error){

            result.textContent = `Error: ${error.message}`;

        }

    });

}


function setupPositionSizeForm(){

    const form = document.getElementById("position-size-form");
    const result = document.getElementById("position-size-result");

    form.addEventListener("submit", async event => {

        event.preventDefault();

        const accountValue = document.getElementById("size-account-value").value;
        const riskPercent = document.getElementById("size-risk-percent").value;
        const entryPrice = document.getElementById("size-entry-price").value;
        const stopPrice = document.getElementById("size-stop-price").value;

        result.textContent = "Calculating...";

        try {

            const sizing = await fetchJSON(`/api/trading/position-size?accountValue=${accountValue}&riskPercent=${riskPercent}&entryPrice=${entryPrice}&stopPrice=${stopPrice}`);

            result.textContent = `${sizing.shares} shares (risking $${sizing.riskAmount}, $${sizing.perShareRisk}/share)`;

        } catch(error){

            result.textContent = `Error: ${error.message}`;

        }

    });

}


function setupWatchlistCreateForm(){

    const form = document.getElementById("watchlist-create-form");
    const result = document.getElementById("watchlist-create-result");

    form.addEventListener("submit", async event => {

        event.preventDefault();

        const name = document.getElementById("watchlist-name").value;
        const symbolsRaw = document.getElementById("watchlist-symbols").value;
        const symbols = symbolsRaw ? symbolsRaw.split(",").map(s => s.trim()).filter(Boolean) : [];

        result.textContent = "Creating...";

        try {

            await authedFetch("/api/trading/watchlists", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name, symbols })
            });

            result.textContent = "Watchlist created.";

            const watchlists = await fetchJSON("/api/trading/watchlists");

            renderList(
                "watchlist-list",
                watchlists,
                "No watchlists yet.",
                watchlist => `${watchlist.name}: ${watchlist.symbols.join(", ") || "no symbols"}`
            );

        } catch(error){

            result.textContent = `Error: ${error.message}`;

        }

    });

}


function setupStrategyCreateForm(){

    const form = document.getElementById("strategy-create-form");
    const result = document.getElementById("strategy-create-result");

    form.addEventListener("submit", async event => {

        event.preventDefault();

        const name = document.getElementById("strategy-name").value;
        const description = document.getElementById("strategy-description").value;

        result.textContent = "Saving...";

        try {

            await authedFetch("/api/trading/strategies", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name, description: description || undefined })
            });

            result.textContent = "Strategy saved.";

            const strategyList = await fetchJSON("/api/trading/strategies");

            renderList(
                "strategy-list",
                strategyList,
                "No strategies yet.",
                strategy => `${strategy.name}${strategy.description ? ` — ${strategy.description}` : ""}`
            );

        } catch(error){

            result.textContent = `Error: ${error.message}`;

        }

    });

}


function setupBacktestForm(){

    const form = document.getElementById("backtest-form");
    const result = document.getElementById("backtest-result");

    form.addEventListener("submit", async event => {

        event.preventDefault();

        const pricesText = document.getElementById("backtest-prices").value;
        const shortWindow = Number(document.getElementById("backtest-short-window").value);
        const longWindow = Number(document.getElementById("backtest-long-window").value);
        const startingCash = Number(document.getElementById("backtest-starting-cash").value);

        result.textContent = "Running...";

        try {

            const prices = JSON.parse(pricesText);
            const priceSeries = prices.map((price, i) => ({ date: `t${i}`, price }));

            const backtestResult = await authedFetch("/api/trading/backtest", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ priceSeries, shortWindow, longWindow, startingCash })
            });

            result.textContent = JSON.stringify(backtestResult, null, 2);

        } catch(error){

            result.textContent = `Error: ${error.message}`;

        }

    });

}


function setupSopCreateForm(){

    const form = document.getElementById("sop-create-form");
    const result = document.getElementById("sop-create-result");

    form.addEventListener("submit", async event => {

        event.preventDefault();

        const name = document.getElementById("sop-name").value;
        const department = document.getElementById("sop-department").value;
        const stepsRaw = document.getElementById("sop-steps").value;
        const steps = stepsRaw.split(",").map(s => s.trim()).filter(Boolean);

        result.textContent = "Creating...";

        try {

            const sop = await authedFetch("/api/operations/sops", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name, department: department || undefined, steps })
            });

            result.textContent = `Created "${sop.name}" (v${sop.version}, id: ${sop.id})`;

        } catch(error){

            result.textContent = `Error: ${error.message}`;

        }

    });

}


function setupSopLookupForm(){

    const form = document.getElementById("sop-lookup-form");
    const result = document.getElementById("sop-analysis-result");

    form.addEventListener("submit", async event => {

        event.preventDefault();

        const sopId = document.getElementById("sop-lookup-id").value;

        result.textContent = "Loading...";

        try {

            const analysis = await fetchJSON(`/api/operations/sops/${encodeURIComponent(sopId)}/analysis`);

            result.textContent = JSON.stringify(analysis, null, 2);

        } catch(error){

            result.textContent = `Error: ${error.message}`;

        }

    });

}


function setupKpiCreateForm(){

    const form = document.getElementById("kpi-create-form");
    const result = document.getElementById("kpi-create-result");

    form.addEventListener("submit", async event => {

        event.preventDefault();

        const name = document.getElementById("kpi-name").value;
        const department = document.getElementById("kpi-department").value;
        const target = Number(document.getElementById("kpi-target").value);
        const direction = document.getElementById("kpi-direction").value;

        result.textContent = "Creating...";

        try {

            const kpi = await authedFetch("/api/operations/kpis", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name, department: department || undefined, target, direction })
            });

            result.textContent = `Created "${kpi.name}" (target: ${kpi.target}, id: ${kpi.id})`;

        } catch(error){

            result.textContent = `Error: ${error.message}`;

        }

    });

}


function setupKpiActualForm(){

    const form = document.getElementById("kpi-actual-form");
    const result = document.getElementById("kpi-actual-result");

    form.addEventListener("submit", async event => {

        event.preventDefault();

        const kpiId = document.getElementById("kpi-actual-id").value;
        const actual = Number(document.getElementById("kpi-actual-value").value);

        result.textContent = "Recording...";

        try {

            const kpi = await authedFetch(`/api/operations/kpis/${encodeURIComponent(kpiId)}/actual`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ actual })
            });

            result.textContent = `Recorded ${kpi.actual} against target ${kpi.target}`;

        } catch(error){

            result.textContent = `Error: ${error.message}`;

        }

    });

}


function setupMeetingCreateForm(){

    const form = document.getElementById("meeting-create-form");
    const result = document.getElementById("meeting-create-result");

    form.addEventListener("submit", async event => {

        event.preventDefault();

        const title = document.getElementById("meeting-title").value;
        const attendeesRaw = document.getElementById("meeting-attendees").value;
        const decisionsRaw = document.getElementById("meeting-decisions").value;
        const actionItemsRaw = document.getElementById("meeting-action-items").value;

        const attendees = attendeesRaw ? attendeesRaw.split(",").map(s => s.trim()).filter(Boolean) : [];
        const decisions = decisionsRaw ? decisionsRaw.split(",").map(s => s.trim()).filter(Boolean) : [];
        const actionItems = actionItemsRaw
            ? actionItemsRaw.split(",").map(s => s.trim()).filter(Boolean).map(text => ({ text }))
            : [];

        result.textContent = "Logging...";

        try {

            await authedFetch("/api/operations/meetings", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ title, attendees, decisions, actionItems })
            });

            result.textContent = "Meeting logged.";

            const meetings = await fetchJSON("/api/operations/meetings");

            renderList(
                "meeting-list",
                meetings,
                "No meetings logged yet.",
                meeting => `${meeting.title} — ${meeting.actionItems.filter(i => !i.done).length} open action item(s)`
            );

        } catch(error){

            result.textContent = `Error: ${error.message}`;

        }

    });

}


function setupScorecardForm(){

    const form = document.getElementById("scorecard-form");
    const result = document.getElementById("scorecard-result");

    form.addEventListener("submit", async event => {

        event.preventDefault();

        const departmentId = document.getElementById("scorecard-department-id").value;

        result.textContent = "Loading...";

        try {

            const scorecard = await fetchJSON(`/api/operations/scorecard/${encodeURIComponent(departmentId)}`);

            result.textContent = JSON.stringify(scorecard, null, 2);

        } catch(error){

            result.textContent = `Error: ${error.message}`;

        }

    });

}


function setupStrategicHealthForm(){

    const form = document.getElementById("strategic-health-form");
    const result = document.getElementById("strategic-health-result");

    form.addEventListener("submit", async event => {

        event.preventDefault();

        const companyId = document.getElementById("strategic-health-company-id").value;

        result.textContent = "Loading...";

        try {

            const health = await fetchJSON(`/api/executive/company-health?companyId=${encodeURIComponent(companyId)}`);
            const risk = await fetchJSON(`/api/executive/risk-forecast?companyId=${encodeURIComponent(companyId)}`);

            result.textContent = JSON.stringify({ health, risk }, null, 2);

        } catch(error){

            result.textContent = `Error: ${error.message}`;

        }

    });

}


function setupCrossDepartmentForm(){

    const form = document.getElementById("cross-department-form");

    form.addEventListener("submit", async event => {

        event.preventDefault();

        const companyId = document.getElementById("cross-department-company-id").value;

        try {

            const result = await fetchJSON(`/api/executive/cross-department-recommendations?companyId=${encodeURIComponent(companyId)}`);

            renderList(
                "cross-department-list",
                result.recommendations,
                "No cross-department observations right now.",
                recommendation => `[${recommendation.departments.join(" + ")}] ${recommendation.detail} -- ${recommendation.action}`
            );

        } catch(error){

            renderList("cross-department-list", [], `Error: ${error.message}`, () => "");

        }

    });

}


function setupPeriodPlanForm(){

    const form = document.getElementById("period-plan-form");
    const result = document.getElementById("period-plan-result");

    form.addEventListener("submit", async event => {

        event.preventDefault();

        const companyId = document.getElementById("period-plan-company-id").value;
        const year = document.getElementById("period-plan-year").value;
        const quarter = document.getElementById("period-plan-quarter").value;

        result.textContent = "Loading...";

        try {

            const url = quarter
                ? `/api/executive/quarterly-plan?companyId=${encodeURIComponent(companyId)}&year=${encodeURIComponent(year)}&quarter=${encodeURIComponent(quarter)}`
                : `/api/executive/annual-plan?companyId=${encodeURIComponent(companyId)}&year=${encodeURIComponent(year)}`;

            const plan = await fetchJSON(url);

            result.textContent = JSON.stringify(plan, null, 2);

        } catch(error){

            result.textContent = `Error: ${error.message}`;

        }

    });

}


function setupExecutiveBriefForm(){

    const form = document.getElementById("executive-brief-form");
    const result = document.getElementById("executive-brief-result");

    form.addEventListener("submit", async event => {

        event.preventDefault();

        const companyId = document.getElementById("executive-brief-company-id").value;

        result.textContent = "Generating...";

        try {

            const brief = await authedFetch("/api/executive/brief", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ companyId })
            });

            result.textContent = brief.brief;

            const history = await fetchJSON(`/api/executive/briefs?companyId=${encodeURIComponent(companyId)}`);

            renderList(
                "executive-brief-history",
                history,
                "No prior briefs for this company.",
                entry => `${entry.created}: ${entry.brief.slice(0, 120)}${entry.brief.length > 120 ? "..." : ""}`
            );

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


function setupCapabilityAnalysisForm(){

    const form = document.getElementById("capability-analysis-form");
    const result = document.getElementById("capability-analysis-result");

    form.addEventListener("submit", async event => {

        event.preventDefault();

        const objective = document.getElementById("capability-objective").value;

        result.textContent = "Analyzing...";

        try {

            const analysis = await authedFetch("/api/capabilities/analyze", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ objective })
            });

            result.textContent = JSON.stringify(analysis, null, 2);

        } catch(error){
            result.textContent = `Error: ${error.message}`;
        }

    });

}


function setupCapabilityInstallForm(){

    const form = document.getElementById("capability-install-form");
    const result = document.getElementById("capability-install-result");

    form.addEventListener("submit", async event => {

        event.preventDefault();

        const packageDir = document.getElementById("capability-package-dir").value;

        result.textContent = "Installing...";

        try {

            const installResult = await authedFetch("/api/capabilities/install", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ packageDir })
            });

            result.textContent = installResult.pending
                ? `Approval required -- proposal ${installResult.proposal.id} created (approve it, then run "execute-external" on it above).`
                : `Installed "${installResult.capability.name}" v${installResult.capability.version} (${installResult.capability.status}).`;

            await loadCapabilities();

        } catch(error){
            result.textContent = `Error: ${error.message}`;
        }

    });

}


function setupCapabilityBuildForm(){

    const form = document.getElementById("capability-build-form");
    const result = document.getElementById("capability-build-result");

    form.addEventListener("submit", async event => {

        event.preventDefault();

        const name = document.getElementById("build-name").value;
        const description = document.getElementById("build-description").value;
        const agentNames = document.getElementById("build-agents").value.split(",").map(s => s.trim()).filter(Boolean);
        const toolIds = document.getElementById("build-tools").value.split(",").map(s => s.trim()).filter(Boolean);

        result.textContent = "Generating...";

        try {

            const built = await authedFetch("/api/capabilities/build", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name,
                    description,
                    agents: agentNames.map(n => ({ name: n })),
                    tools: toolIds.map(id => ({ id }))
                })
            });

            result.textContent = `Generated ${built.filesCreated.length} file(s) at ${built.packageDir}. This is a SKELETON -- install it (above) once its agents/tools are actually implemented.`;

        } catch(error){
            result.textContent = `Error: ${error.message}`;
        }

    });

}


async function loadResearchHistory(){

    const history = await fetchJSON("/api/research/history");

    renderList(
        "research-history",
        history,
        "No research yet.",
        entry => `[${new Date(entry.created).toLocaleString()}] ${entry.metadata.topic} (confidence ${entry.metadata.confidence}) -- ${entry.metadata.citation}`
    );

}


function setupResearchForm(){

    const form = document.getElementById("research-form");
    const result = document.getElementById("research-result");

    form.addEventListener("submit", async event => {

        event.preventDefault();

        const topic = document.getElementById("research-topic").value;
        const url = document.getElementById("research-url").value;

        result.textContent = "Researching (real fetch + real LLM call)...";

        try {

            const entry = await authedFetch("/api/research", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ topic, url })
            });

            result.textContent = `${entry.content}\n\nRecommendation: ${entry.metadata.implementationRecommendation}`;

            await loadResearchHistory();

        } catch(error){
            result.textContent = `Error: ${error.message}`;
        }

    });

}


function setupSelfImprovementButton(){

    const button = document.getElementById("self-improvement-run");
    const result = document.getElementById("self-improvement-result");

    button.addEventListener("click", async () => {

        result.textContent = "Analyzing...";

        try {
            const report = await fetchJSON("/api/system/self-improvement");
            result.textContent = JSON.stringify(report, null, 2);
        } catch(error){
            result.textContent = `Error: ${error.message}`;
        }

    });

}


async function loadMissionHistory(){

    const missions = await fetchJSON("/api/executive/missions");

    renderList(
        "mission-history",
        missions,
        "No missions defined yet.",
        mission => `[${new Date(mission.created).toLocaleString()}] ${mission.objective} (id ${mission.id}, project ${mission.projectId})`
    );

}


function setupMissionDefineForm(){

    const form = document.getElementById("mission-define-form");
    const result = document.getElementById("mission-define-result");

    form.addEventListener("submit", async event => {

        event.preventDefault();

        const objective = document.getElementById("mission-objective").value;
        const department = document.getElementById("mission-department").value || undefined;

        result.textContent = "Defining mission (real project + real decomposition + capability analysis)...";

        try {

            const mission = await authedFetch("/api/executive/missions", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ objective, department })
            });

            result.textContent = `Mission ${mission.id} created. Project ${mission.projectId}. Domain: ${mission.capabilityAnalysis.domain || "none matched"}. Estimated: ${mission.timeline.totalEstimatedDays} day(s).`;

            await loadMissionHistory();

        } catch(error){
            result.textContent = `Error: ${error.message}`;
        }

    });

}


function setupMissionStatusForm(){

    const form = document.getElementById("mission-status-form");
    const result = document.getElementById("mission-status-result");

    form.addEventListener("submit", async event => {

        event.preventDefault();

        const id = document.getElementById("mission-status-id").value;

        try {
            const status = await fetchJSON(`/api/executive/missions/${encodeURIComponent(id)}/status`);
            result.textContent = JSON.stringify(status, null, 2);
        } catch(error){
            result.textContent = `Error: ${error.message}`;
        }

    });

}


async function loadOrganizationOverview(){

    const overview = await fetchJSON("/api/organization/overview");
    const container = document.getElementById("organization-overview");

    const lines = [
        `Companies: ${overview.organizationTree.companies.length} | Departments: ${overview.organizationTree.departments.length}`,
        `Projects: ${overview.executiveKPIs.totalProjects} total, ${overview.executiveKPIs.completedProjects} completed (${overview.executiveKPIs.completionRate}%)`,
        `Pending approvals: ${overview.executiveKPIs.pendingApprovals}`,
        `Missions: ${overview.missionStatus.length}`,
        `Capabilities: ${overview.capabilityMap.installed.length} installed, ${overview.capabilityMap.available.length} available, ${overview.capabilityMap.broken.length} broken`,
        `Knowledge: ${overview.knowledgeGrowth.entityCount} entities, ${overview.knowledgeGrowth.relationshipCount} relationships`,
        `Memories: ${overview.memoriesOverview.total}`,
        `Cross-department dependencies: ${overview.crossDepartmentDependencies.length}`,
        `Automation: ${overview.automationStatus.running ? "running" : "stopped"}`,
        `Devices: ${overview.deviceNetwork.length}`,
        `Connectors: ${overview.connectors.configured}/${overview.connectors.total} configured`,
        `Fresh executive recommendations: ${overview.executiveRecommendations.length}`,
        `Unconfigured connectors: ${overview.liveSystemHealth.credentials.filter(c => !c.configured).map(c => c.id).join(", ") || "none"}`
    ];

    container.textContent = lines.join("\n");

}


// --- Phase 34: Executive Summary / System Health / Universal Search / Command Palette

async function loadExecutiveSummary(){

    const summary = await fetchJSON("/api/executive/summary");

    const alertContainer = document.getElementById("critical-alerts");
    alertContainer.innerHTML = "";

    if(!summary.criticalAlerts.length){
        alertContainer.appendChild(el("p", { className: "empty", textContent: "Nothing needs attention." }));
    } else {
        const list = el("ul", { className: "list" });
        for(const alert of summary.criticalAlerts){
            list.appendChild(el("li", { className: `alert-${alert.severity}`, textContent: `[${alert.severity}] ${alert.detail}` }));
        }
        alertContainer.appendChild(list);
    }

    renderList(
        "todays-priorities",
        summary.todaysPriorities,
        "No prioritized projects.",
        entry => `${entry.title} (score ${entry.score}) -- ${(entry.reasons || []).join("; ")}`
    );

}


async function loadSystemHealth(){

    const health = await fetchJSON("/api/system/health");
    const container = document.getElementById("system-health");

    const lines = [
        `CPU: ${health.cpu.cores} core(s), load ${health.cpu.loadPercent1m}%`,
        `Memory: ${health.memory.usedPercent}% used`,
        health.disk.error ? `Disk: unavailable (${health.disk.error})` : `Disk (${health.disk.path}): ${health.disk.usedPercent}% used`,
        ...health.services.map(s => `${s.name}: ${s.running ? "running" : "stopped"}`)
    ];

    // Project F (Self Diagnostics): the same unified score the
    // Executive Summary panel shows, plus its full real breakdown --
    // this panel is the detailed view, that one is the at-a-glance one.
    try {

        const score = await fetchJSON("/api/system/health-score");
        lines.push("", `Unified score: ${score.status.toUpperCase()} (${score.score}/100)`);
        lines.push(...score.breakdown.map(b => `  - [${b.category}] ${b.detail} (-${b.penalty})`));

    } catch(error){
        lines.push("", `Unified score: Error: ${error.message}`);
    }

    container.textContent = lines.join("\n");

}


function setupKnowledgeGraphExplorer(){

    document.getElementById("graph-by-type-form").addEventListener("submit", async event => {

        event.preventDefault();

        const type = document.getElementById("graph-by-type-value").value;

        try {

            const entities = await fetchJSON(`/api/knowledge/by-type?type=${encodeURIComponent(type)}`);
            renderList(
                "graph-by-type-result",
                entities,
                "No entities of this type.",
                entity => `${entity.name} (${entity.type})`
            );

        } catch(error){

            renderList("graph-by-type-result", [], `Error: ${error.message}`, () => "");

        }

    });

    const expandForm = document.getElementById("graph-expand-form");
    const expandResult = document.getElementById("graph-expand-result");

    expandForm.addEventListener("submit", async event => {

        event.preventDefault();

        const name = document.getElementById("graph-expand-name").value;
        const hops = document.getElementById("graph-expand-hops").value || "1";

        try {

            const result = await fetchJSON(`/api/knowledge/expand?name=${encodeURIComponent(name)}&hops=${encodeURIComponent(hops)}`);
            expandResult.textContent = JSON.stringify(result, null, 2);

        } catch(error){

            expandResult.textContent = `Error: ${error.message}`;

        }

    });

    const pathForm = document.getElementById("graph-path-form");
    const pathResult = document.getElementById("graph-path-result");

    pathForm.addEventListener("submit", async event => {

        event.preventDefault();

        const from = document.getElementById("graph-path-from").value;
        const to = document.getElementById("graph-path-to").value;

        try {

            const result = await fetchJSON(`/api/knowledge/path?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);

            pathResult.textContent = result.found
                ? `Path found (${result.path.length - 1} hop(s)): ${result.path.join(" -> ")}`
                : "No path found within the search depth.";

        } catch(error){

            pathResult.textContent = `Error: ${error.message}`;

        }

    });

}


async function loadOperationalReadiness(){

    try {

        const readiness = await fetchJSON("/api/system/operational-readiness");
        const container = document.getElementById("operational-readiness");

        const mark = ok => ok ? "OK" : "NEEDS ATTENTION";

        const lines = [
            `Running: OK`,
            `Healthy: ${mark(readiness.healthy)} (${readiness.healthScore.status}, ${readiness.healthScore.score}/100)`,
            `Connected: ${readiness.connected.map(c => c.label).join(", ") || "none"}`,
            `Missing credentials: ${mark(readiness.checks.missingCredentials.ok)}${readiness.checks.missingCredentials.count ? ` (${readiness.checks.missingCredentials.items.map(c => c.label).join(", ")})` : ""}`,
            `Approvals waiting: ${mark(readiness.checks.approvalsWaiting.ok)}${readiness.checks.approvalsWaiting.count ? ` (${readiness.checks.approvalsWaiting.count})` : ""}`,
            `Offline services: ${mark(readiness.checks.offlineServices.ok)}${readiness.checks.offlineServices.count ? ` (${readiness.checks.offlineServices.items.map(s => s.name).join(", ")})` : ""}`,
            "",
            readiness.fullyOperational ? "VERONICA is fully operational." : "VERONICA is running, but review the items above."
        ];

        container.textContent = lines.join("\n");

    } catch(error){
        document.getElementById("operational-readiness").textContent = `Error: ${error.message}`;
    }

}


async function loadMaintenanceReport(){

    try {

        const report = await fetchJSON("/api/system/consistency-report");
        const container = document.getElementById("maintenance-report");

        const lines = [
            ...report.duplicatedCapabilityTools.map(d => `Duplicated tool "${d.toolId}": declared by ${d.declaredBy.join(", ")}`),
            ...report.brokenCapabilities.map(name => `Broken capability: "${name}"`)
        ];

        container.textContent = lines.length ? lines.join("\n") : "No maintenance findings -- nothing duplicated or broken right now.";

    } catch(error){
        document.getElementById("maintenance-report").textContent = `Error: ${error.message}`;
    }

}


function setupUniversalSearchForm(){

    const form = document.getElementById("universal-search-form");
    const result = document.getElementById("universal-search-result");

    form.addEventListener("submit", async event => {

        event.preventDefault();

        const query = document.getElementById("universal-search-query").value;

        if(!query){
            return;
        }

        const results = await fetchJSON(`/api/search?q=${encodeURIComponent(query)}`);

        result.textContent = [
            `${results.memories.length} memor(y/ies), ${results.entities.length} knowledge entit(y/ies), ${results.capabilities.length} capabilit(y/ies)`,
            "",
            JSON.stringify(results, null, 2)
        ].join("\n");

        document.getElementById("executive-summary-panel").scrollIntoView({ block: "start" });

    });

}


// A flat, static list of quick-navigation actions -- every panel is
// reachable in the two interactions this phase's UX section asks for:
// Ctrl+K (or Cmd+K), then type + Enter.
const COMMAND_PALETTE_ACTIONS = [
    { label: "Go to Executive Summary", target: "executive-summary-panel" },
    { label: "Go to Organization Overview", target: "organization-overview" },
    { label: "Go to Capability Marketplace", target: "capability-marketplace" },
    { label: "Go to Mission Engine", target: "mission-history" },
    { label: "Go to Self-Improvement", target: "self-improvement-result" },
    { label: "Go to Research & Knowledge Engine", target: "research-history" },
    { label: "Go to Integrations", target: "integrations-status" },
    { label: "Go to Automation", target: "automation-status" },
    { label: "Go to Learning", target: "learning-overview" },
    { label: "Go to Action Proposals", target: "action-proposals" }
];

let commandPaletteActiveIndex = 0;

function renderCommandPaletteResults(query){

    const list = document.getElementById("command-palette-results");
    list.innerHTML = "";

    const lower = query.toLowerCase();
    const matches = COMMAND_PALETTE_ACTIONS.filter(action => action.label.toLowerCase().includes(lower));

    matches.forEach((action, index) => {
        const item = el("li", { textContent: action.label, className: index === commandPaletteActiveIndex ? "active" : "" });
        item.addEventListener("click", () => runCommandPaletteAction(action));
        list.appendChild(item);
    });

    return matches;

}

function runCommandPaletteAction(action){

    const target = document.getElementById(action.target);

    if(target){
        target.scrollIntoView({ block: "start" });
    }

    closeCommandPalette();

}

function openCommandPalette(){

    document.getElementById("command-palette-overlay").classList.remove("hidden");

    const input = document.getElementById("command-palette-input");
    input.value = "";
    input.focus();

    commandPaletteActiveIndex = 0;
    renderCommandPaletteResults("");

}

function closeCommandPalette(){
    document.getElementById("command-palette-overlay").classList.add("hidden");
}

function setupCommandPalette(){

    const overlay = document.getElementById("command-palette-overlay");
    const input = document.getElementById("command-palette-input");

    document.addEventListener("keydown", event => {

        if((event.metaKey || event.ctrlKey) && event.key === "k"){
            event.preventDefault();
            openCommandPalette();
            return;
        }

        if(event.key === "Escape" && !overlay.classList.contains("hidden")){
            closeCommandPalette();
        }

    });

    overlay.addEventListener("click", event => {
        if(event.target === overlay){
            closeCommandPalette();
        }
    });

    input.addEventListener("input", () => {
        commandPaletteActiveIndex = 0;
        renderCommandPaletteResults(input.value);
    });

    input.addEventListener("keydown", event => {

        const matches = renderCommandPaletteResults(input.value);

        if(event.key === "ArrowDown"){
            event.preventDefault();
            commandPaletteActiveIndex = Math.min(commandPaletteActiveIndex + 1, matches.length - 1);
            renderCommandPaletteResults(input.value);
        } else if(event.key === "ArrowUp"){
            event.preventDefault();
            commandPaletteActiveIndex = Math.max(commandPaletteActiveIndex - 1, 0);
            renderCommandPaletteResults(input.value);
        } else if(event.key === "Enter" && matches[commandPaletteActiveIndex]){
            runCommandPaletteAction(matches[commandPaletteActiveIndex]);
        }

    });

}


function setupAutonomousBuildForm(){

    const form = document.getElementById("autonomous-build-form");
    const result = document.getElementById("autonomous-build-result");

    form.addEventListener("submit", async event => {

        event.preventDefault();

        const objective = document.getElementById("autonomous-build-objective").value;

        result.textContent = "Analyzing and generating (real files, no LLM call)...";

        try {

            const outcome = await authedFetch("/api/capabilities/autonomous-build", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ objective })
            });

            result.textContent = outcome.report;

            await loadCapabilityMarketplace();

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
    setupGenerateProposalsForm();
    setupProposalActionForm();
    setupRecommendForm();
    setupAutomationRunForm();
    setupCollabMessageForm();
    setupCollabDelegateForm();
    setupCollabReviewForm();
    setupCollabConsensusForm();
    setupCollabOpportunitiesForm();
    setupConstitutionForms();
    setupWorkflowRunForm();
    setupBrainRoutingForms();
    setupPersonalIntelligenceForms();
    setupAcquisitionForms();
    setupKnowledgeGraphExplorer();
    setupSemanticSearchForm();
    setupReindexEmbeddingsForm();
    setupCompanyLookupForm();
    setupCompanyCreateForm();
    setupBrandProfileForm();
    setupCampaignPlanForm();
    setupCampaignLookupForm();
    setupCompanyBrainForm();
    setupLeadCreateForm();
    setupLeadLookupForm();
    setupOpportunityCreateForm();
    setupSalesAnalyticsForm();
    setupBudgetCreateForm();
    setupInvoiceCreateForm();
    setupSubscriptionCreateForm();
    setupFinanceKpisForm();
    setupMissionCreateForm();
    setupMissionCitationForm();
    setupMissionLookupForm();
    setupMissionSummaryButton();
    setupPortfolioCreateForm();
    setupPaperTradeForm();
    setupPortfolioReviewForm();
    setupPositionSizeForm();
    setupWatchlistCreateForm();
    setupStrategyCreateForm();
    setupBacktestForm();
    setupSopCreateForm();
    setupSopLookupForm();
    setupKpiCreateForm();
    setupKpiActualForm();
    setupMeetingCreateForm();
    setupScorecardForm();
    setupStrategicHealthForm();
    setupCrossDepartmentForm();
    setupPeriodPlanForm();
    setupExecutiveBriefForm();
    setupCapabilityAnalysisForm();
    setupCapabilityInstallForm();
    setupCapabilitySearchForm();
    setupCapabilityBuildForm();
    setupAutonomousBuildForm();
    setupResearchForm();
    setupSelfImprovementButton();
    setupMissionDefineForm();
    setupMissionStatusForm();
    setupUniversalSearchForm();
    setupCommandPalette();

    populateDepartmentSelect("department-select");
    populateDepartmentSelect("plan-department", { includeAuto: true });

});
