const IntelligenceEngine = require("../intelligence");
const bus = require("../bus");

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

        // Intelligence.think() now retrieves its own executive context
        // automatically on every call (see docs/Architecture.md
        // "Persistent Context Engine") -- this.context is kept as a
        // constructor param for backward compatibility and any caller
        // that wants a direct context.retrieve(), but route() no longer
        // needs to pre-fetch it itself.
        const mission = { task: command };

        const result = await this.intelligence.think(

            agent,

            mission

        );

        // Real, additive observability only -- never changes routing
        // behavior. Phase 45 (Mission Control): the one real signal the
        // dashboard's "Router" event category and Agent Activity panel
        // both need, which nothing previously published.
        bus.publish("router.dispatched", { agent: agent.name, command, timestamp: new Date().toISOString() });

        return {

            agent: agent.name,

            result,

            timestamp: new Date()

        };

    }

}

module.exports = Router;
