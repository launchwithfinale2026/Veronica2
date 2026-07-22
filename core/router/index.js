const IntelligenceEngine = require("../intelligence");

class Router {

    constructor(agents, context) {

        this.agents = agents;
        this.context = context;
        this.intelligence = new IntelligenceEngine();

        console.log("[ROUTER] Online");

    }

    // Scores how well an agent matches a command's intent. Higher weight
    // for stronger signals (explicit name mention, exact capability
    // phrase) than weak ones (a single word from the role/department).
    scoreAgent(agent, text) {

        let score = 0;

        if (text.includes(agent.name.toLowerCase())) {
            score += 10;
        }

        for (const capability of agent.capabilities || []) {

            const cap = capability.toLowerCase();

            if (text.includes(cap)) {
                score += 5;
                continue;
            }

            for (const word of cap.split(/\s+/)) {
                if (word.length > 3 && text.includes(word)) {
                    score += 2;
                }
            }

        }

        if (agent.department && text.includes(agent.department.toLowerCase())) {
            score += 3;
        }

        for (const word of (agent.role || "").toLowerCase().split(/\s+/)) {
            if (word.length > 3 && text.includes(word)) {
                score += 1;
            }
        }

        return score;

    }

    // Highest-scoring agent wins. Ties (including the zero-match case)
    // resolve to whichever agent appears first in the registry, i.e.
    // registry order is the priority order.
    findAgent(command) {

        const text = command.toLowerCase();

        let best = this.agents[0];
        let bestScore = -1;

        for (const agent of this.agents) {

            const score = this.scoreAgent(agent, text);

            if (score > bestScore) {
                bestScore = score;
                best = agent;
            }

        }

        return best;

    }

    async route(command) {

        console.log("[ROUTER] Processing command:", command);

        const agent = this.findAgent(command);

        console.log("[ROUTER] Selected agent:", agent.name);

        const context = this.context.retrieve(command);

        const mission = {

            task: command,

            context

        };

        const result = await this.intelligence.think(

            agent,

            mission

        );

        return {

            agent: agent.name,

            result,

            timestamp: new Date()

        };

    }

}

module.exports = Router;
