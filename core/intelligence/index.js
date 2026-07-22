const Brain = require("../brain");
const memory = require("../memory");


class Intelligence {

    constructor(){

        this.brain = new Brain();

        console.log("[INTELLIGENCE] Online");

    }


    // `options` defaults to real tool access at "agent"-level permissions
    // (read_memory, write_memory, execute_tools — see identity/roles.json)
    // for every agent reasoning call. Callers can override, e.g. to run
    // without tools or under a different role.
    async think(agent, mission, options = {}){


        // Retrieve relevant memories
        const memories = memory.retrieve(
            mission.task
        );


        const prompt = `

You are ${agent.name}.

Role:
${agent.role}


Capabilities:
${agent.capabilities.join(", ")}


Relevant Memories:

${JSON.stringify(
    memories,
    null,
    2
)}


Mission:

${JSON.stringify(
    mission,
    null,
    2
)}


Use the memories when relevant. You have access to tools for memory,
the knowledge graph, and a sandboxed workspace filesystem — use them
when they would genuinely help answer the mission, not by default for
every response.

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

            context: {

                memories,

            },

            cognition: {

                response,

                prompt

            },

            timestamp:new Date()

        };

    }


}


module.exports = Intelligence;
