const Brain = require("../brain");
const ContextEngine = require("../context/engine");


class Intelligence {

    constructor(){

        this.brain = new Brain();
        this.context = new ContextEngine();

        console.log("[INTELLIGENCE] Online");

    }


    // `options` defaults to real tool access at "agent"-level permissions
    // (read_memory, write_memory, execute_tools — see identity/roles.json)
    // for every agent reasoning call. Callers can override, e.g. to run
    // without tools or under a different role, or pass `companyId` to
    // scope the injected context to one company (see core/context/engine.js).
    async think(agent, mission, options = {}){


        // Persistent Context Engine: every reasoning call gets the same
        // automatic context injection (recent memory, related knowledge,
        // active goals, recent project activity, department roster,
        // optional company scope, device identity) regardless of caller —
        // core/router (the `ask` command) and core/departments/base.js
        // (department-driven tasks) both converge here, so neither has to
        // build its own context anymore (see docs/Architecture.md
        // "Persistent Context Engine").
        const executiveContext = this.context.retrieve(mission.task, {
            companyId: options.companyId
        });


        const prompt = `

You are ${agent.name}.

Role:
${agent.role}


Capabilities:
${agent.capabilities.join(", ")}


Executive Context:

${JSON.stringify(
    executiveContext,
    null,
    2
)}


Mission:

${JSON.stringify(
    mission,
    null,
    2
)}


Use the context when relevant: recent memories and related knowledge for
background, active goals and recent project activity for what's already
in motion, the department roster and company scope (if present) for who
this affects. You have access to tools for memory, the knowledge graph,
and a sandboxed workspace filesystem — use them when they would genuinely
help answer the mission, not by default for every response.

Provide your analysis.

`;


        const response = await this.brain.process(prompt, {
            useTools: true,
            role: "agent",
            ...options
        });


        return {

            agent: agent.name,

            mission,

            context: executiveContext,

            cognition: {

                response,

                prompt

            },

            timestamp:new Date()

        };

    }


}


module.exports = Intelligence;
