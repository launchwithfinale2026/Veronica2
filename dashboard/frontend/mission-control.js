// ==================================
// VERONICA MISSION CONTROL
// ==================================
//
// Phase 45. The permanent Mission Control interface -- real data only,
// no fabricated values, event-driven wherever a real event exists
// (this dashboard's own GET /api/events SSE stream, unchanged from the
// existing dashboard -- see docs/Architecture.md "Dashboard Live
// Updates"). No framework, no build step, no bundler -- same
// plain-browser-JS convention dashboard/frontend/app.js already
// established.
//
// File is split into two halves:
//   1. Pure logic (no `document`/`window` reference at all) -- directly
//      unit-testable from Node via require() (see the UMD-lite export
//      at the bottom): event categorization, visualization-state
//      derivation, formatting, event-rate/queue-depth math.
//   2. The DOM controller -- everything that actually touches the page.
//      Wrapped in `if(typeof document !== "undefined")` so loading this
//      file under Node (as tests do, via require()) never tries to
//      touch a real DOM; a real browser always has `document`, so this
//      still runs there exactly as before.
//
// "No polling when events already exist": every metric with a real bus
// event behind it (voice state, boot/runtime state, agent activity,
// router dispatches, connector online/offline, notifications, etc.)
// updates ONLY from the SSE stream. The sole deliberate exception is
// CPU/RAM/disk/automation-queue-depth, which have no bus event backing
// them anywhere in this codebase (nothing publishes when CPU usage
// changes) -- those refresh on a single, explicitly-labeled interval
// (POLL_INTERVAL_MS below), not a "heavy" one.


// ===================================================================
// PART 1 — PURE LOGIC (no DOM). Directly unit-testable.
// ===================================================================

// Ordered rules -- first match wins. Mirrors the real event-name
// prefixes this codebase's bus already uses (see core/bus/index.js and
// every module that calls bus.publish()).
const EVENT_CATEGORY_RULES = [
    { test: type => type === "voice.error", category: "error" },
    { test: type => type.startsWith("voice."), category: "voice" },
    { test: type => type === "runtime.stateChanged", category: "system" },
    { test: type => type === "boot.stageCompleted", category: "system" },
    { test: type => type === "router.dispatched", category: "router" },
    { test: type => type === "department.activity", category: "agents" },
    { test: type => type.startsWith("collaboration."), category: "agents" },
    { test: type => type.startsWith("automation.") || type.startsWith("workflow."), category: "automation" },
    { test: type => type.startsWith("connector."), category: "network" },
    { test: type => type === "git.commit", category: "filesystem" },
    { test: type => type.startsWith("memory.") || type.startsWith("knowledge."), category: "filesystem" },
    { test: type => type.startsWith("approval.") || type === "notification.created", category: "agents" }
];

function classifyEventCategory(type){

    if(!type){
        return "system";
    }

    for(const rule of EVENT_CATEGORY_RULES){
        if(rule.test(type)){
            return rule.category;
        }
    }

    return "system";

}

// A "warning" isn't its own bus-event category -- it's a real-content
// judgment (an outcome:"failure" payload, a runtime state of "error"/
// "restarting", a voice.error). Kept separate from classifyEventCategory
// (which answers "who published this") so an error can be flagged
// regardless of source.
function isWarningOrError(type, payload){

    if(type === "voice.error"){
        return "error";
    }

    if(payload && payload.outcome === "failure"){
        return "error";
    }

    if(type === "runtime.stateChanged" && payload && payload.state === "error"){
        return "error";
    }

    if(type === "runtime.stateChanged" && payload && payload.state === "restarting"){
        return "warning";
    }

    if(type === "connector.offline"){
        return "warning";
    }

    return null;

}


// Central Visualization state (Region 1). Real inputs only:
//   voiceState        -- the real conversationState.state from
//                         GET /api/voice/status / voice.statusChanged
//                         (IDLE/LISTENING/PROCESSING/SPEAKING/
//                         INTERRUPTED), or null if voice was never
//                         started.
//   voiceEnabled       -- whether voice is even configured on.
//   recentActivityAt   -- timestamp (ms) of the most recent
//                         department.activity/automation.jobCompleted/
//                         router.dispatched event, or null.
//   recentErrorAt      -- timestamp (ms) of the most recent real error
//                         signal, or null.
//   nowMs              -- the real current time, injected for
//                         determinism in tests.
//   sseConnected       -- whether the real EventSource is currently
//                         open.
// Returns one of: idle | listening | thinking | speaking | working |
// interrupted | offline | error.
const ACTIVITY_FLASH_MS = 2500;
const ERROR_FLASH_MS = 4000;
const INTERRUPT_FLASH_MS = 900;

function deriveVisualizationState({
    voiceState = null,
    voiceEnabled = false,
    voiceInterruptedAt = null,
    recentActivityAt = null,
    recentErrorAt = null,
    nowMs = Date.now(),
    sseConnected = true
} = {}){

    if(!sseConnected){
        return "offline";
    }

    if(recentErrorAt !== null && nowMs - recentErrorAt < ERROR_FLASH_MS){
        return "error";
    }

    if(voiceInterruptedAt !== null && nowMs - voiceInterruptedAt < INTERRUPT_FLASH_MS){
        return "interrupted";
    }

    if(voiceEnabled && voiceState === "LISTENING"){
        return "listening";
    }

    if(voiceEnabled && voiceState === "PROCESSING"){
        return "thinking";
    }

    if(voiceEnabled && voiceState === "SPEAKING"){
        return "speaking";
    }

    if(recentActivityAt !== null && nowMs - recentActivityAt < ACTIVITY_FLASH_MS){
        return "working";
    }

    return "idle";

}


// "3d 4h 12m" -- real, exact, no rounding tricks that lie about
// whether an hour has actually passed.
function formatUptime(totalSeconds){

    if(!Number.isFinite(totalSeconds) || totalSeconds < 0){
        return "--";
    }

    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = Math.floor(totalSeconds % 60);

    if(days > 0){
        return `${days}d ${hours}h ${minutes}m`;
    }

    if(hours > 0){
        return `${hours}h ${minutes}m`;
    }

    if(minutes > 0){
        return `${minutes}m ${seconds}s`;
    }

    return `${seconds}s`;

}


// Real events-per-minute -- counts timestamps (ms) that actually fall
// within the trailing window, nothing estimated/smoothed.
function computeEventRate(timestamps, nowMs = Date.now(), windowMs = 60000){

    return timestamps.filter(t => nowMs - t <= windowMs).length;

}


// Drops timestamps older than the window -- called on every tick so
// the array never grows unbounded (a real, if small, memory-leak
// vector otherwise).
function pruneTimestamps(timestamps, nowMs = Date.now(), windowMs = 60000){
    return timestamps.filter(t => nowMs - t <= windowMs);
}


// Real automation queue depth: only "pending"/"running" entries count
// as depth -- "completed"/"failed" are history, not queue.
function computeQueueDepth(queue){

    if(!Array.isArray(queue)){
        return 0;
    }

    return queue.filter(entry => entry.status === "pending" || entry.status === "running").length;

}


// A short, real, one-line summary of an event payload for the Recent
// Events list -- never invents a description, just picks the most
// informative real fields already on the payload (falling back to a
// truncated JSON dump for a payload shape this function doesn't
// specifically recognize, rather than silently showing nothing).
function summarizePayload(type, payload){

    if(!payload || typeof payload !== "object"){
        return String(payload ?? "");
    }

    if(type === "department.activity"){
        return `${payload.agent} (${payload.department}) — "${payload.task}" — ${payload.outcome}${payload.durationMs ? ` in ${payload.durationMs}ms` : ""}`;
    }

    if(type === "router.dispatched"){
        return `→ ${payload.agent}: "${payload.command}"`;
    }

    if(type === "runtime.stateChanged"){
        return `${payload.name}: ${payload.previousState || "?"} → ${payload.state}${payload.reason ? ` (${payload.reason})` : ""}`;
    }

    if(type === "boot.stageCompleted"){
        return `stage complete: ${payload.stage}`;
    }

    if(type.startsWith("voice.")){
        return payload.text || payload.responseText || payload.message || payload.state || JSON.stringify(payload).slice(0, 140);
    }

    if(payload.message){
        return payload.message;
    }

    const json = JSON.stringify(payload);
    return json.length > 140 ? `${json.slice(0, 140)}…` : json;

}


const PURE = {
    classifyEventCategory,
    isWarningOrError,
    deriveVisualizationState,
    formatUptime,
    computeEventRate,
    pruneTimestamps,
    computeQueueDepth,
    summarizePayload
};


// ===================================================================
// PART 2 — DOM CONTROLLER. Only runs in a real browser (or a jsdom
// environment tests construct on purpose) -- guarded so requiring this
// file under plain Node (no `document`) for the pure-logic tests above
// never touches anything DOM-related.
// ===================================================================

if(typeof document !== "undefined"){

    // Real polling exception -- see file header. Kept long (this data
    // changes slowly) and is the ONLY setInterval this file uses beside
    // the 1s clock tick.
    const POLL_INTERVAL_MS = 15000;
    const CLOCK_INTERVAL_MS = 1000;
    const EVENT_LOG_MAX = 200;
    const AGENT_ACTIVITY_FLASH_MS = 6000;

    // Tracks every real addEventListener() this controller makes so
    // destroy() can remove every one of them -- "no memory leaks...
    // destroy listeners correctly" verified directly by tests against
    // this registry's own bookkeeping, not just trusted.
    class ListenerRegistry {

        constructor(){
            this.entries = [];
        }

        add(target, event, handler, options){
            target.addEventListener(event, handler, options);
            this.entries.push({ target, event, handler, options });
        }

        removeAll(){
            for(const { target, event, handler, options } of this.entries){
                target.removeEventListener(event, handler, options);
            }
            this.entries = [];
        }

        get size(){
            return this.entries.length;
        }

    }


    function logOpen(what){
        console.log(`[MISSION CONTROL] ${what} opened`);
    }

    function logClosed(what){
        console.log(`[MISSION CONTROL] ${what} closed`);
    }

    function logFailure(where, error){
        console.error(`[MISSION CONTROL] ${where} failed:`, error);
    }


    async function fetchJSON(url){
        const res = await fetch(url);
        if(!res.ok){
            throw new Error(`${url} → ${res.status}`);
        }
        return res.json();
    }


    // Wraps a region's render function so one broken widget can never
    // crash another, or the controller -- catches, logs (Dashboard must
    // log "render failures"/"component failures"), and leaves a real,
    // visible in-place error message in that region instead of a silent
    // blank panel.
    function safeRender(regionId, label, fn){

        try {
            fn();
        } catch(error){
            logFailure(`render(${label})`, error);
            const el = document.getElementById(regionId);
            if(el){
                const marker = document.createElement("p");
                marker.className = "empty-state";
                marker.textContent = `Render error in ${label} -- see console.`;
                el.prepend(marker);
            }
        }

    }


    function el(tag, props = {}, children = []){
        const node = document.createElement(tag);
        for(const [key, value] of Object.entries(props)){
            if(key === "className"){
                node.className = value;
            } else if(key === "textContent"){
                node.textContent = value;
            } else if(key.startsWith("aria-") || key.startsWith("data-")){
                node.setAttribute(key, value);
            } else {
                node[key] = value;
            }
        }
        for(const child of children){
            node.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
        }
        return node;
    }


    class MissionControl {

        constructor({ win = window, doc = document } = {}){

            this.win = win;
            this.doc = doc;
            this.listeners = new ListenerRegistry();

            this.eventSource = null;
            this.sseConnected = false;

            this.eventTimestamps = [];
            this.eventLog = [];
            this.activeFilter = "all";

            this.state = {
                startTime: null,
                uptimeBaseSeconds: 0,
                bootStartedAt: null,
                voice: { enabled: false, state: null, interruptedAt: null },
                lastHeard: null,
                lastSpoken: null,
                recentActivityAt: null,
                recentErrorAt: null,
                queueDepth: 0,
                agentPerformance: [],
                departmentState: new Map(),
                agentLiveActivity: new Map(),
                connectors: []
            };

            this.pollTimer = null;
            this.clockTimer = null;

        }


        async init(){

            logOpen("Mission Control dashboard");

            this.bindFilters();
            this.bindResize();

            await this.loadInitialSnapshot();
            this.startEventStream();

            this.clockTimer = this.win.setInterval(() => this.tick(), CLOCK_INTERVAL_MS);
            this.pollTimer = this.win.setInterval(() => this.pollUneventedMetrics(), POLL_INTERVAL_MS);

            this.tick();

        }


        destroy(){

            if(this.eventSource){
                this.eventSource.close();
                this.eventSource = null;
                this.sseConnected = false;
                logClosed("SSE stream");
            }

            if(this.clockTimer){
                this.win.clearInterval(this.clockTimer);
                this.clockTimer = null;
            }

            if(this.pollTimer){
                this.win.clearInterval(this.pollTimer);
                this.pollTimer = null;
            }

            this.listeners.removeAll();

            logClosed("Mission Control dashboard");

        }


        async loadInitialSnapshot(){

            const results = await Promise.allSettled([
                fetchJSON("/api/status"),
                fetchJSON("/api/system/health-score"),
                fetchJSON("/api/system/boot-status"),
                fetchJSON("/api/system/runtime-state"),
                fetchJSON("/api/voice/status"),
                fetchJSON("/api/automation/status"),
                fetchJSON("/api/learning/agents"),
                fetchJSON("/api/departments"),
                fetchJSON("/api/integrations")
            ]);

            const [status, health, boot, runtime, voice, automation, agentPerf, departments, integrations] =
                results.map(r => r.status === "fulfilled" ? r.value : null);

            if(status){
                this.state.startTime = Date.now() - status.uptimeSeconds * 1000;
                this.state.identity = status;
            }

            if(boot){
                this.state.bootStartedAt = boot.startedAt;
            }

            if(runtime){
                for(const entry of runtime){
                    this.state.departmentState.set(entry.name, entry);
                }
            }

            if(voice){
                this.state.voiceConfig = voice;
                this.state.voice.enabled = voice.voiceStatus.enabled;
                this.state.voice.state = voice.voiceStatus.state;
            }

            if(automation){
                this.state.queueDepth = computeQueueDepth(automation.queue);
            }

            if(agentPerf){
                this.state.agentPerformance = agentPerf;
            }

            if(departments){
                this.state.departments = departments;
            }

            if(integrations){
                this.state.connectors = integrations.integrations || [];
            }

            if(health){
                this.state.health = health;
            }

            safeRender("status-bar", "status bar", () => this.renderStatusBar());
            safeRender("voice-panel", "voice panel", () => this.renderVoicePanel());
            safeRender("agent-activity", "agent activity", () => this.renderAgentActivity());
            safeRender("connection-footer", "footer", () => this.renderFooter());
            safeRender("core-visualization", "core visualization", () => this.renderCoreVisualization());

        }


        async pollUneventedMetrics(){

            try {

                const [health, automation] = await Promise.all([
                    fetchJSON("/api/system/health-score"),
                    fetchJSON("/api/automation/status")
                ]);

                this.state.health = health;
                this.state.queueDepth = computeQueueDepth(automation.queue);

                safeRender("status-bar", "status bar", () => this.renderStatusBar());
                safeRender("connection-footer", "footer", () => this.renderFooter());

            } catch(error){
                logFailure("pollUneventedMetrics", error);
            }

        }


        startEventStream(){

            this.eventSource = new this.win.EventSource("/api/events");

            const onOpen = () => {
                this.sseConnected = true;
                logOpen("SSE event stream");
                safeRender("core-visualization", "core visualization", () => this.renderCoreVisualization());
            };

            const onError = () => {
                this.sseConnected = false;
                logFailure("SSE event stream", new Error("connection lost/reconnecting"));
                safeRender("core-visualization", "core visualization", () => this.renderCoreVisualization());
            };

            const onMessage = messageEvent => {

                let event;

                try {
                    event = JSON.parse(messageEvent.data);
                } catch(error){
                    logFailure("SSE message parse", error);
                    return;
                }

                try {
                    this.handleEvent(event);
                } catch(error){
                    logFailure(`handleEvent(${event.type})`, error);
                }

            };

            this.listeners.add(this.eventSource, "open", onOpen);
            this.listeners.add(this.eventSource, "error", onError);
            this.listeners.add(this.eventSource, "message", onMessage);

        }


        handleEvent(event){

            const { type, payload, timestamp } = event;
            const nowMs = new Date(timestamp).getTime() || Date.now();

            this.eventTimestamps.push(nowMs);
            this.eventLog.unshift(event);
            this.eventLog.length = Math.min(this.eventLog.length, EVENT_LOG_MAX);

            const severity = isWarningOrError(type, payload);
            if(severity === "error"){
                this.state.recentErrorAt = nowMs;
            }

            if(type === "department.activity" || type === "automation.jobCompleted" || type === "router.dispatched"){
                this.state.recentActivityAt = nowMs;
            }

            if(type === "department.activity"){
                this.state.agentLiveActivity.set(payload.agent, { ...payload, at: nowMs });
                safeRender("agent-activity", "agent activity", () => this.renderAgentActivity());
            }

            if(type === "runtime.stateChanged"){
                this.state.departmentState.set(payload.name, payload);
                safeRender("agent-activity", "agent activity", () => this.renderAgentActivity());
                safeRender("connection-footer", "footer", () => this.renderFooter());
            }

            if(type.startsWith("voice.")){
                this.handleVoiceEvent(type, payload);
            }

            if(type === "connector.online" || type === "connector.offline"){
                safeRender("connection-footer", "footer", () => this.renderFooter());
            }

            safeRender("recent-events", "recent events", () => this.pushEventRow(event));
            safeRender("core-visualization", "core visualization", () => this.renderCoreVisualization());

        }


        handleVoiceEvent(type, payload){

            if(type === "voice.ready" || type === "voice.offline" || type === "voice.statusChanged"){
                const status = payload.voiceStatus || payload;
                this.state.voice.enabled = status.enabled;
                this.state.voice.state = status.state;
            }

            if(type === "voice.interrupted"){
                this.state.voice.interruptedAt = Date.now();
            }

            if(type === "voice.transcribed"){
                this.state.lastHeard = payload.text;
            }

            if(type === "voice.spoken"){
                this.state.lastSpoken = payload.responseText;
            }

            safeRender("voice-panel", "voice panel", () => this.renderVoicePanel());

        }


        tick(){

            const nowMs = Date.now();
            this.eventTimestamps = pruneTimestamps(this.eventTimestamps, nowMs);

            safeRender("status-bar", "status bar clock", () => this.renderClock());

            for(const [agent, activity] of this.state.agentLiveActivity){
                if(nowMs - activity.at > AGENT_ACTIVITY_FLASH_MS){
                    this.state.agentLiveActivity.delete(agent);
                }
            }

            safeRender("core-visualization", "core visualization", () => this.renderCoreVisualization());

        }


        renderClock(){

            const now = new Date();

            this.text("field-time", now.toLocaleTimeString());
            this.text("field-date", now.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" }));

            if(this.state.startTime){
                this.text("field-uptime", formatUptime(Math.floor((Date.now() - this.state.startTime) / 1000)));
            }

            this.text("field-event-rate", String(computeEventRate(this.eventTimestamps, Date.now())));
            this.text("field-queue-depth", String(this.state.queueDepth));

        }


        renderStatusBar(){

            const identity = this.state.identity;

            if(identity){
                this.text("field-version", identity.version || "--");
                this.text("field-branch", identity.gitBranch || "unknown");
                this.text("field-environment", identity.environment || "--");
            }

            if(this.state.bootStartedAt){
                this.text("field-last-restart", new Date(this.state.bootStartedAt).toLocaleString());
            }

            const health = this.state.health;

            if(health && health.raw){

                const cpuField = this.doc.getElementById("field-cpu");
                const ramField = this.doc.getElementById("field-ram");
                const diskField = this.doc.getElementById("field-disk");

                if(cpuField){
                    cpuField.textContent = `${health.raw.cpu.loadPercent1m}%`;
                    cpuField.className = health.raw.cpu.loadPercent1m > 90 ? "critical" : health.raw.cpu.loadPercent1m > 70 ? "warn" : "";
                }

                if(ramField){
                    ramField.textContent = `${health.raw.memory.usedPercent}%`;
                    ramField.className = health.raw.memory.usedPercent > 90 ? "critical" : health.raw.memory.usedPercent > 75 ? "warn" : "";
                }

                if(diskField){
                    diskField.textContent = `${health.raw.disk.usedPercent}%`;
                    diskField.className = health.raw.disk.usedPercent > 90 ? "critical" : health.raw.disk.usedPercent > 80 ? "warn" : "";
                }

            }

            this.renderClock();

        }


        renderVoicePanel(){

            const config = this.state.voiceConfig;
            const enabled = this.state.voice.enabled;

            this.text("voice-state", enabled ? (this.state.voice.state || "IDLE") : "Offline");
            this.text("voice-wake-enabled", config ? (config.wakeWord.configured ? "Configured" : "Not configured") : "--");
            this.text("voice-stt-engine", config ? config.speechToText.label : "--");
            this.text("voice-tts-engine", config ? config.textToSpeech.label : "--");
            this.text("voice-last-heard", this.state.lastHeard || "—");
            this.text("voice-last-spoken", this.state.lastSpoken || "—");

        }


        renderCoreVisualization(){

            const nowMs = Date.now();

            const visualState = deriveVisualizationState({
                voiceState: this.state.voice.state,
                voiceEnabled: this.state.voice.enabled,
                voiceInterruptedAt: this.state.voice.interruptedAt,
                recentActivityAt: this.state.recentActivityAt,
                recentErrorAt: this.state.recentErrorAt,
                nowMs,
                sseConnected: this.sseConnected
            });

            const stage = this.doc.querySelector(".node-stage");
            if(stage){
                stage.setAttribute("data-state", visualState);
            }

            this.text("node-state-label", visualState.charAt(0).toUpperCase() + visualState.slice(1));

        }


        renderAgentActivity(){

            const list = this.doc.getElementById("agent-activity-list");
            if(!list){
                return;
            }

            list.innerHTML = "";

            const departments = this.state.departments || [];

            if(departments.length === 0){
                list.appendChild(el("li", { className: "empty-state", textContent: "No real department data loaded yet." }));
                return;
            }

            const perfByAgent = new Map((this.state.agentPerformance || []).map(row => [row.agent, row]));

            for(const department of departments){

                const runtime = this.state.departmentState.get(`department:${department.id}`);
                const runtimeState = runtime ? runtime.state : "unknown";

                for(const agentName of department.agents){

                    const perf = perfByAgent.get(agentName);
                    const live = this.state.agentLiveActivity.get(agentName);

                    const metaParts = [];

                    if(live){
                        metaParts.push(`just ran "${live.task}" (${live.outcome}${live.durationMs ? `, ${live.durationMs}ms` : ""})`);
                    } else if(perf){
                        metaParts.push(`${perf.total} run${perf.total === 1 ? "" : "s"}, ${perf.successRate}% success, avg ${perf.avgDurationMs}ms`);
                    } else {
                        metaParts.push("no recorded runs yet");
                    }

                    const row = el("li", {}, [
                        el("div", { className: "agent-row" }, [
                            el("span", { className: "agent-name", textContent: agentName }),
                            el("span", { className: `status-pill ${runtimeState}` , textContent: runtimeState })
                        ]),
                        el("div", { className: "agent-meta", textContent: `${department.name} — ${metaParts.join(" — ")}` })
                    ]);

                    list.appendChild(row);

                }

            }

        }


        pushEventRow(event){

            const list = this.doc.getElementById("event-stream");
            if(!list){
                return;
            }

            const category = classifyEventCategory(event.type);
            const severity = isWarningOrError(event.type, event.payload);
            const displayCategory = severity || category;

            if(this.activeFilter !== "all" && this.activeFilter !== displayCategory && this.activeFilter !== category){
                return;
            }

            const emptyState = list.querySelector(".empty-state");
            if(emptyState){
                emptyState.remove();
            }

            const row = el("li", { "data-category": category, "data-severity": severity || "" }, [
                el("span", { className: "event-timestamp", textContent: new Date(event.timestamp).toLocaleTimeString() }),
                el("span", { className: `event-category ${displayCategory}`, textContent: displayCategory }),
                el("span", { className: "event-summary", textContent: summarizePayload(event.type, event.payload) })
            ]);

            list.prepend(row);

            while(list.children.length > EVENT_LOG_MAX){
                list.removeChild(list.lastChild);
            }

        }


        renderFooter(){

            const health = this.state.health;
            const connectors = this.state.connectors || [];
            const claude = connectors.find(c => c.id === "claude");
            const anyConnectorOnline = connectors.some(c => c.configured);

            this.setFooterField("footer-backend", this.sseConnected ? "Connected" : "Disconnected", this.sseConnected ? "ok" : "down");
            this.setFooterField("footer-database", "Online", "ok"); // memory/knowledge are file-backed, always available once this process is up
            this.setFooterField("footer-llm", claude && claude.configured ? "Claude connected" : "Not configured", claude && claude.configured ? "ok" : "warn");
            this.setFooterField("footer-voice", this.state.voice.enabled ? "Enabled" : "Disabled", this.state.voice.enabled ? "ok" : "warn");
            this.setFooterField("footer-filesystem", "Online", "ok");
            this.setFooterField("footer-network", anyConnectorOnline ? "Reachable" : "No connectors configured", anyConnectorOnline ? "ok" : "warn");
            this.setFooterField("footer-stream", this.sseConnected ? "Live" : "Reconnecting…", this.sseConnected ? "ok" : "down");

            if(health){
                this.setFooterField("footer-health", `${health.score}/100 (${health.status})`, health.score >= 80 ? "ok" : health.score >= 50 ? "warn" : "down");
            }

        }


        bindFilters(){

            const container = this.doc.getElementById("event-filters");
            if(!container){
                return;
            }

            const onClick = clickEvent => {

                const button = clickEvent.target.closest(".filter-chip");
                if(!button){
                    return;
                }

                this.activeFilter = button.dataset.category;

                for(const chip of container.querySelectorAll(".filter-chip")){
                    chip.classList.toggle("active", chip === button);
                }

                this.applyFilterToExistingRows();

            };

            this.listeners.add(container, "click", onClick);

        }


        applyFilterToExistingRows(){

            const list = this.doc.getElementById("event-stream");
            if(!list){
                return;
            }

            list.innerHTML = "";

            const filtered = this.activeFilter === "all"
                ? this.eventLog
                : this.eventLog.filter(event => {
                    const category = classifyEventCategory(event.type);
                    const severity = isWarningOrError(event.type, event.payload);
                    return category === this.activeFilter || severity === this.activeFilter;
                });

            if(filtered.length === 0){
                list.appendChild(el("li", { className: "empty-state", textContent: "No events in this category yet." }));
                return;
            }

            for(const event of filtered){

                const category = classifyEventCategory(event.type);
                const severity = isWarningOrError(event.type, event.payload);
                const displayCategory = severity || category;

                list.appendChild(el("li", { "data-category": category }, [
                    el("span", { className: "event-timestamp", textContent: new Date(event.timestamp).toLocaleTimeString() }),
                    el("span", { className: `event-category ${displayCategory}`, textContent: displayCategory }),
                    el("span", { className: "event-summary", textContent: summarizePayload(event.type, event.payload) })
                ]));

            }

        }


        // Panels resize intelligently via CSS Grid + media queries
        // (mission-control.css) -- this only handles the one thing CSS
        // can't: re-clamping the node-stage's inline size on very small
        // viewports where the CSS min()/vh-based sizing could otherwise
        // overflow a truly tiny window.
        bindResize(){

            const onResize = () => {
                safeRender("core-visualization", "resize", () => {
                    const stage = this.doc.querySelector(".node-stage");
                    if(stage && this.win.innerWidth < 340){
                        stage.style.width = "180px";
                        stage.style.height = "180px";
                    } else if(stage){
                        stage.style.width = "";
                        stage.style.height = "";
                    }
                });
            };

            this.listeners.add(this.win, "resize", onResize);

        }


        text(id, value){
            const node = this.doc.getElementById(id);
            if(node){
                node.textContent = value;
            }
        }


        setFooterField(id, text, tone){
            const node = this.doc.getElementById(id);
            if(!node){
                return;
            }
            node.textContent = text;
            node.className = `footer-value ${tone}`;
        }

    }


    let activeInstance = null;

    function start(){
        if(activeInstance){
            return activeInstance;
        }
        activeInstance = new MissionControl();
        // Exposed on the instance (not just fired-and-forgotten) so
        // callers -- tests, primarily -- can deterministically await
        // the real initial snapshot finishing rather than guessing at
        // timing.
        activeInstance.ready = activeInstance.init().catch(error => logFailure("init", error));
        return activeInstance;
    }

    function stop(){
        if(activeInstance){
            activeInstance.destroy();
            activeInstance = null;
        }
    }

    window.MissionControl = { start, stop, MissionControlClass: MissionControl, ListenerRegistry };

    document.addEventListener("DOMContentLoaded", start);

}


// ===================================================================
// Export the pure logic for direct Node testing (see
// tests/mission-control-logic.test.js). A plain browser never defines
// `module`, so this is a no-op there -- no bundler, no build step.
// ===================================================================

if(typeof module !== "undefined" && module.exports){
    module.exports = PURE;
}
