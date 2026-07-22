const readline = require("readline");
const fs = require("fs");
const path = require("path");

const Router = require("../router");
const loadAgents = require("../agents/loader");
const ContextEngine = require("../context/engine");
const memory = require("../memory");
const knowledge = require("../knowledge");
const { seedFromAgents } = require("../knowledge/seed");
const loadDepartments = require("../departments/loader");
const tools = require("../tools");
const device = require("../device");
const bus = require("../bus");


const identity = JSON.parse(
    fs.readFileSync(
        path.join(__dirname, "../veronica/identity.json"),
        "utf8"
    )
);

const agents = loadAgents();

seedFromAgents(agents);

const departments = loadDepartments(agents);

const context = new ContextEngine();

const router = new Router(
    agents,
    context
);

bus.publish("system.ready", {
    system: identity.name,
    status: "online",
    agents: agents.length,
    departments: departments.length,
    timestamp: new Date().toISOString()
});


const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "VERONICA > "
});


console.log(`
================================

        VERONICA TERMINAL

             ONLINE

================================


Identity:

VERONICA


Agents:

${agents.length}


Commands:

system.status

agents.list

departments.list

memory.view

memory.search <term>

remember <memory>

knowledge.view

knowledge.find <name>

tools.list

tools.run <id> <json args>

device.identity

ask <command>

help

exit


================================
`);


rl.prompt();


rl.on("line", async (input) => {

    const command = input.trim();


    if (!command) {
        rl.prompt();
        return;
    }


    if (command === "exit") {

        console.log("VERONICA OFFLINE");
        process.exit(0);

    }


    try {

        // ASK COMMAND
        if (command.startsWith("ask ")) {

            const query = command.substring(4).trim();

            const result = await router.route(query);


            console.log("\n--------------------------------\n");


            if (
                result &&
                result.result &&
                result.result.cognition &&
                result.result.cognition.response &&
                result.result.cognition.response.response
            ) {

                console.log(
                    result.result.cognition.response.response
                );

            } else {

                console.log(result);

            }


            console.log("\n--------------------------------\n");

        }


        // SYSTEM STATUS
        else if (command === "system.status") {

            console.log({
                identity: identity.name,
                mission: identity.mission,
                status: "ONLINE",
                agents: agents.length,
                departments: departments.length,
                timestamp: new Date()
            });

        }


        // LIST AGENTS
        else if (command === "agents.list") {

            console.log(
                agents.map(agent => ({
                    name: agent.name,
                    role: agent.role
                }))
            );

        }


        // LIST DEPARTMENTS
        else if (command === "departments.list") {

            console.log(
                departments.map(dept => dept.statusReport())
            );

        }


        // VIEW MEMORY
        else if (command === "memory.view") {

            console.log(memory.view());

        }


        // SEARCH MEMORY
        else if (command.startsWith("memory.search ")) {

            const term = command.substring(14).trim();

            console.log(memory.retrieve(term));

        }


        // REMEMBER COMMAND
        else if (command.startsWith("remember ")) {

            const memoryEntry = command.substring(9).trim();

            const stored = memory.remember(memoryEntry);

            console.log(
                "Memory stored:",
                stored
            );

        }


        // VIEW KNOWLEDGE GRAPH
        else if (command === "knowledge.view") {

            console.log(knowledge.read());

        }


        // FIND KNOWLEDGE ENTITY + CONNECTIONS
        else if (command.startsWith("knowledge.find ")) {

            const name = command.substring(15).trim();

            console.log(knowledge.retrieve(name));

        }


        // LIST TOOLS
        else if (command === "tools.list") {

            console.log(tools.list());

        }


        // RUN A TOOL
        else if (command.startsWith("tools.run ")) {

            const rest = command.substring(10).trim();

            const separator = rest.indexOf(" ");

            const toolId = separator === -1 ? rest : rest.substring(0, separator);

            const rawArgs = separator === -1 ? "" : rest.substring(separator + 1).trim();

            const args = rawArgs ? JSON.parse(rawArgs) : {};

            // The terminal represents a trusted human operator, so tool
            // calls made here run with the "executive" role.
            const result = await tools.run(toolId, args, { role: "executive" });

            console.log(result);

        }


        // DEVICE IDENTITY
        else if (command === "device.identity") {

            console.log(device.currentIdentity());

        }


        // HELP
        else if (command === "help") {

            console.log(`
Commands:

system.status
agents.list
departments.list
memory.view
memory.search <term>
remember <memory>
knowledge.view
knowledge.find <name>
tools.list
tools.run <id> <json args>
device.identity
ask <command>
help
exit
`);

        }


        else {

            console.log("Unknown command");

        }


    } catch (error) {

        console.error(
            "\nVERONICA ERROR:",
            error.message
        );

    }


    rl.prompt();

});
