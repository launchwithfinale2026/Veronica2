// ==================================
// VERONICA KNOWLEDGE GRAPH — BASELINE SEED
// ==================================
//
// Populates the graph with what VERONICA already factually knows about
// its own creator, itself, its AI provider(s), and its agent roster.
// addEntity()/addRelationship() are idempotent by name/triple, so this is
// safe to call on every boot — it keeps the graph in sync with the agent
// registry without creating duplicates.

const knowledge = require("./index");


function seedFromAgents(agents){

    knowledge.addEntity({ name: "Jacob", type: "person" });
    knowledge.addEntity({ name: "VERONICA", type: "system" });
    knowledge.addEntity({ name: "Claude", type: "technology" });

    knowledge.addRelationship({ from: "Jacob", to: "VERONICA", type: "builds" });
    knowledge.addRelationship({ from: "VERONICA", to: "Claude", type: "uses" });

    for(const agent of agents){

        knowledge.addEntity({
            name: agent.name,
            type: "agent",
            attributes: { role: agent.role }
        });

        knowledge.addRelationship({
            from: "VERONICA",
            to: agent.name,
            type: "contains"
        });

        if(agent.department){

            knowledge.addEntity({
                name: agent.department,
                type: "department"
            });

            knowledge.addRelationship({
                from: agent.name,
                to: agent.department,
                type: "belongsTo"
            });

        }

    }

}


module.exports = { seedFromAgents };
