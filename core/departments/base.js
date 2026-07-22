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


class DepartmentManager {

    constructor({ id, name, domain, status, agents }){

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
            __dirname, "../../departments", this.id, "logs", "activity.log"
        );

    }


    // Delegates a task to this department's agent(s) and logs the
    // exchange. Single-agent departments (every department, today) just
    // use their one agent; multi-agent departments would need real
    // in-department selection logic here later.
    async run(task, context = {}){

        if(!this.agents.length){
            throw new Error(
                `Department "${this.id}" has no agents assigned`
            );
        }

        const agent = this.agents[0];

        const thought = await this.intelligence.think(agent, { task, context });

        const response = thought.cognition.response.response;

        this.log({
            task,
            agent: agent.name,
            response,
            timestamp: new Date().toISOString()
        });

        return {
            agent: agent.name,
            response,
            thought
        };

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
