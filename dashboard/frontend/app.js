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
            loadKnowledge()
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


async function populateDepartmentSelect(){

    const select = document.getElementById("department-select");
    const departments = await fetchJSON("/api/departments");

    select.innerHTML = "";

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


document.addEventListener("DOMContentLoaded", () => {

    loadDashboard();

    setupTokenForm();
    setupRememberForm();
    setupDepartmentRunForm();

    populateDepartmentSelect();

});

setInterval(loadDashboard, 15000);
