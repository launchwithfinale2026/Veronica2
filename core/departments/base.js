// ==================================
// VERONICA DEPARTMENT MANAGER (base)
// ==================================
//
// Shared logic for every department. Each departments/<id>/manager.js is
// a thin factory that constructs one of these with that department's own
// config + agents — the modularity the protocol asks for comes from each
// department owning its own manager.js as an extension point, without
// duplicating this logic 9 times.

const fs = require("fs");
const path = require("path");

const memory = require("../memory");
const tools = require("../tools");
const IntelligenceEngine = require("../intelligence");
const learningLog = require("../learning/log");
const bus = require("../bus");


class DepartmentManager {

    // `logDir` (Phase 33): a package-declared department (see
    // core/capabilities/activation.js's packageDepartmentConfigs()) lives
    // under packages/<name>/, not departments/<id>/ -- passing its real
    // directory here lets this class log to <packageDir>/logs/activity.log
    // instead of a departments/<id>/ path that doesn't exist for it.
    // Built-in departments don't pass this, so they keep their existing
    // path unchanged.
    constructor({ id, name, domain, status, agents, logDir }){

        this.id = id;
        this.name = name;
        this.domain = domain;
        this.status = status || "active";
        this.agents = agents || [];

        this.tools = tools.list();

        // Same real reasoning engine core/router uses for `ask` — a
        // department's run() used to call agent.process() (base.js),
        // which just returns a hardcoded canned string and never touches
        // the brain at all. Department-driven tasks now get genuine LLM
        // reasoning (with tool access) exactly like direct `ask` does.
        this.intelligence = new IntelligenceEngine();

        this.logFile = path.join(
            logDir || path.join(__dirname, "../../departments", this.id),
            "logs", "activity.log"
        );

        // Phase 33: on a fresh clone, departments/<id>/logs/ isn't
        // guaranteed to exist (it's runtime output, not checked into
        // git) -- and a package's logs/ directory never exists until
        // now. fs.appendFileSync() (see log() below) throws ENOENT if
        // its parent directory is missing, so this ensures it's there
        // once, at construction, rather than on the first real log()
        // call (which would otherwise surface as a confusing failure
        // deep inside a department's first run()).
        fs.mkdirSync(path.dirname(this.logFile), { recursive: true });

    }


    // Delegates a task to this department's agent(s) and logs the
    // exchange. Single-agent departments (every department, today) just
    // use their one agent; multi-agent departments would need real
    // in-department selection logic here later. Failures are now caught,
    // logged (both to this department's own activity.log and to
    // core/learning/log.js for cross-department stats), and re-thrown --
    // previously an error from intelligence.think() propagated with no
    // trace anywhere, so a failed run was indistinguishable from a run
    // that never happened.
    //
    // `options` is forwarded to intelligence.think() as-is -- today that
    // means `companyId`, so a company-scoped task (see
    // core/executive/orchestrator.js's executeTask()) actually gets a
    // company-scoped reasoning context instead of always reasoning over
    // the whole shared memory store regardless of which company the task
    // belongs to (a real cross-company data exposure found during the
    // Phase 10 security audit -- see core/context/engine.js).
    async run(task, context = {}, options = {}){

        if(!this.agents.length){
            throw new Error(
                `Department "${this.id}" has no agents assigned`
            );
        }

        const agent = this.agents[0];
        const startedAt = Date.now();

        try {

            const thought = await this.intelligence.think(agent, { task, context }, options);

            const response = thought.cognition.response.response;
            const durationMs = Date.now() - startedAt;

            this.log({
                task,
                agent: agent.name,
                response,
                outcome: "success",
                durationMs,
                timestamp: new Date().toISOString()
            });

            learningLog.record({
                kind: "department_run",
                department: this.id,
                agent: agent.name,
                outcome: "success",
                durationMs,
                // Phase 55 (Multi-Model Intelligence): which real brain
                // provider actually answered this call -- not used for
                // any routing decision yet (no real evidence exists to
                // justify one), but this is what WOULD make a future
                // evidence-based routing preference honest instead of a
                // guess.
                provider: thought.cognition.response.provider
            });

            bus.publish("department.activity", {
                department: this.id, agent: agent.name, task, outcome: "success", durationMs
            });

            return {
                agent: agent.name,
                response,
                thought
            };

        } catch(error){

            const durationMs = Date.now() - startedAt;

            this.log({
                task,
                agent: agent.name,
                error: error.message,
                outcome: "failure",
                durationMs,
                timestamp: new Date().toISOString()
            });

            bus.publish("department.activity", {
                department: this.id, agent: agent.name, task, outcome: "failure", durationMs, error: error.message
            });

            learningLog.record({
                kind: "department_run",
                department: this.id,
                agent: agent.name,
                outcome: "failure",
                durationMs,
                error: error.message
            });

            throw error;

        }

    }


    // Memory access: department memory lives in the shared memory store
    // (core/memory), scoped by tagging entries with the department id
    // rather than a separate per-department store — see
    // docs/Architecture.md for why there's a single memory system.
    remember(content, extra = {}){

        return memory.remember({
            content,
            type: extra.type || "projects",
            importance: extra.importance,
            tags: [this.id, ...(extra.tags || [])],
            source: `department:${this.id}`
        });

    }


    recall(){

        return memory.filter({ tag: this.id });

    }


    // Departments run with "department_manager" permissions (see
    // identity/roles.json) — broader than a lone worker agent, narrower
    // than the executive core.
    useTool(toolId, args){

        return tools.run(toolId, args, { role: "department_manager" });

    }


    log(entry){

        fs.appendFileSync(
            this.logFile,
            JSON.stringify(entry) + "\n"
        );

    }


    statusReport(){

        return {

            id: this.id,

            name: this.name,

            domain: this.domain,

            status: this.status,

            agents: this.agents.map(agent => agent.name),

            tools: this.tools

        };

    }

}


module.exports = DepartmentManager;
