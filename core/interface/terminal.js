const readline = require("readline");
const fs = require("fs");
const path = require("path");

const { installCrashGuards } = require("../logging/crashGuard");

installCrashGuards("terminal");

const Router = require("../router");
const loadAgents = require("../agents/loader");
const ContextEngine = require("../context/engine");
const memory = require("../memory");
const knowledge = require("../knowledge");
const { seedFromAgents } = require("../knowledge/seed");
const loadDepartments = require("../departments/loader");
const tools = require("../tools");
const device = require("../device");
const sync = require("../device/sync");
const bus = require("../bus");
const log = require("../logging");
const executive = require("../executive");
const learning = require("../learning");
const automation = require("../automation");
const CollaborationEngine = require("../collaboration/engine");


const identity = JSON.parse(
    fs.readFileSync(
        path.join(__dirname, "../veronica/identity.json"),
        "utf8"
    )
);

const agents = loadAgents();

seedFromAgents(agents);

const departments = loadDepartments(agents);

const collaboration = new CollaborationEngine(departments);

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

device.known

executive.roadmap

executive.deadlines

executive.plan <json goal>

executive.decompose <projectId>

executive.project <projectId>

executive.status <id> <status> [note]

executive.artifact <projectId> <artifact>

company.create <json>

company.list

company.get <companyId>

company.employee <companyId> <name>

company.document <companyId> <document>

company.finance <companyId> <json>

company.relationship <companyId> <json>

company.communication <companyId> <summary>

executive.consolidate

executive.consolidations

learning.overview

learning.departments

learning.agents

learning.tools

learning.recommend

learning.recommendations

automation.status

automation.history

automation.run <jobName>

automation.runNow <jobName>

automation.start

executive.handoff <projectId> <toDepartmentId> [note]

collaborate.message <fromDept> <toDept> <text>

collaborate.delegate <fromDept> <toDept> <task>

collaborate.review <reviewerDept> <content>

collaborate.consensus <dept1,dept2,...> <proposal>

collaborate.history

system.errors

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


        // KNOWN DEVICES (multi-device awareness)
        else if (command === "device.known") {

            console.log(sync.knownDevices());

        }


        // EXECUTIVE ROADMAP
        else if (command === "executive.roadmap") {

            console.log(executive.roadmap());

        }


        // EXECUTIVE DEADLINES
        else if (command === "executive.deadlines") {

            console.log(executive.evaluateDeadlines());

        }


        // PLAN A GOAL
        else if (command.startsWith("executive.plan ")) {

            const rawGoal = command.substring(15).trim();

            const goal = JSON.parse(rawGoal);

            console.log(executive.plan(goal));

        }


        // DECOMPOSE A PROJECT INTO MILESTONES/TASKS
        else if (command.startsWith("executive.decompose ")) {

            const projectId = command.substring(20).trim();

            console.log(await executive.decompose(projectId));

        }


        // FULL PROJECT DETAIL
        else if (command.startsWith("executive.project ")) {

            const projectId = command.substring(18).trim();

            console.log(executive.getProject(projectId));

        }


        // UPDATE STATUS OF A PROJECT/MILESTONE/TASK
        else if (command.startsWith("executive.status ")) {

            const rest = command.substring(17).trim();

            const [id, status, ...noteParts] = rest.split(" ");

            console.log(executive.updateStatus(id, status, noteParts.join(" ") || undefined));

        }


        // RECORD AN ARTIFACT ON A PROJECT
        else if (command.startsWith("executive.artifact ")) {

            const rest = command.substring(19).trim();

            const separator = rest.indexOf(" ");

            const projectId = separator === -1 ? rest : rest.substring(0, separator);
            const artifact = separator === -1 ? "" : rest.substring(separator + 1).trim();

            console.log(executive.addArtifact(projectId, artifact));

        }


        // CREATE A COMPANY
        else if (command.startsWith("company.create ")) {

            const rawInput = command.substring(15).trim();

            console.log(executive.createCompany(JSON.parse(rawInput)));

        }


        // LIST COMPANIES
        else if (command === "company.list") {

            console.log(executive.listCompanies());

        }


        // FULL COMPANY DETAIL
        else if (command.startsWith("company.get ")) {

            const companyId = command.substring(12).trim();

            console.log(executive.getCompany(companyId));

        }


        // ADD AN EMPLOYEE
        else if (command.startsWith("company.employee ")) {

            const rest = command.substring(17).trim();

            const separator = rest.indexOf(" ");

            const companyId = separator === -1 ? rest : rest.substring(0, separator);
            const name = separator === -1 ? "" : rest.substring(separator + 1).trim();

            console.log(executive.addEmployee(companyId, name));

        }


        // ADD A DOCUMENT
        else if (command.startsWith("company.document ")) {

            const rest = command.substring(17).trim();

            const separator = rest.indexOf(" ");

            const companyId = separator === -1 ? rest : rest.substring(0, separator);
            const document = separator === -1 ? "" : rest.substring(separator + 1).trim();

            console.log(executive.addDocument(companyId, document));

        }


        // RECORD A FINANCE ENTRY
        else if (command.startsWith("company.finance ")) {

            const rest = command.substring(16).trim();

            const separator = rest.indexOf(" ");

            const companyId = separator === -1 ? rest : rest.substring(0, separator);
            const entry = separator === -1 ? {} : JSON.parse(rest.substring(separator + 1).trim());

            console.log(executive.recordFinance(companyId, entry));

        }


        // RECORD A RELATIONSHIP
        else if (command.startsWith("company.relationship ")) {

            const rest = command.substring(21).trim();

            const separator = rest.indexOf(" ");

            const companyId = separator === -1 ? rest : rest.substring(0, separator);
            const relationship = separator === -1 ? {} : JSON.parse(rest.substring(separator + 1).trim());

            console.log(executive.addCompanyRelationship(companyId, relationship));

        }


        // LOG A COMMUNICATION
        else if (command.startsWith("company.communication ")) {

            const rest = command.substring(22).trim();

            const separator = rest.indexOf(" ");

            const companyId = separator === -1 ? rest : rest.substring(0, separator);
            const summary = separator === -1 ? "" : rest.substring(separator + 1).trim();

            console.log(executive.logCommunication(companyId, { summary }));

        }


        // RUN A CONSOLIDATION PASS
        else if (command === "executive.consolidate") {

            console.log(await executive.consolidate());

        }


        // CONSOLIDATION HISTORY
        else if (command === "executive.consolidations") {

            console.log(executive.consolidationHistory());

        }


        // LEARNING OVERVIEW
        else if (command === "learning.overview") {

            console.log(learning.overview());

        }


        // DEPARTMENT PERFORMANCE
        else if (command === "learning.departments") {

            console.log(learning.departmentPerformance());

        }


        // AGENT PERFORMANCE
        else if (command === "learning.agents") {

            console.log(learning.agentPerformance());

        }


        // TOOL PERFORMANCE
        else if (command === "learning.tools") {

            console.log(learning.toolPerformance());

        }


        // GENERATE OPTIMIZATION RECOMMENDATIONS
        else if (command === "learning.recommend") {

            console.log(await learning.recommend());

        }


        // RECOMMENDATION HISTORY
        else if (command === "learning.recommendations") {

            console.log(learning.recommendationHistory());

        }


        // AUTOMATION STATUS
        else if (command === "automation.status") {

            console.log(automation.status());

        }


        // AUTOMATION HISTORY
        else if (command === "automation.history") {

            console.log(automation.history());

        }


        // ENQUEUE A JOB TO RUN IN THE BACKGROUND ON THE NEXT TICK
        else if (command.startsWith("automation.run ")) {

            const jobName = command.substring(15).trim();

            console.log(automation.enqueue(jobName));

        }


        // RUN A JOB IMMEDIATELY, SYNCHRONOUSLY
        else if (command.startsWith("automation.runNow ")) {

            const jobName = command.substring(18).trim();

            console.log(await automation.runNow(jobName));

        }


        // START THE BACKGROUND TICK LOOP FOR THIS SESSION
        else if (command === "automation.start") {

            automation.start();

            console.log("Automation tick loop started for this terminal session.");

        }


        // TASK HANDOFF: REASSIGN A PROJECT TO A DIFFERENT DEPARTMENT
        else if (command.startsWith("executive.handoff ")) {

            const rest = command.substring(18).trim();

            const [projectId, toDepartmentId, ...noteParts] = rest.split(" ");

            console.log(executive.reassignDepartment(projectId, toDepartmentId, noteParts.join(" ") || undefined));

        }


        // SEND A MESSAGE FROM ONE AGENT TO ANOTHER
        else if (command.startsWith("collaborate.message ")) {

            const rest = command.substring(20).trim();

            const [fromId, toId, ...messageParts] = rest.split(" ");

            console.log(collaboration.sendMessage(fromId, toId, messageParts.join(" ")));

        }


        // DELEGATE A TASK FROM ONE DEPARTMENT TO ANOTHER
        else if (command.startsWith("collaborate.delegate ")) {

            const rest = command.substring(21).trim();

            const [fromId, toId, ...taskParts] = rest.split(" ");

            console.log(await collaboration.delegate(fromId, toId, taskParts.join(" ")));

        }


        // HAVE A DEPARTMENT REVIEW/CRITIQUE SOME CONTENT
        else if (command.startsWith("collaborate.review ")) {

            const rest = command.substring(19).trim();

            const separator = rest.indexOf(" ");

            const reviewerId = separator === -1 ? rest : rest.substring(0, separator);
            const content = separator === -1 ? "" : rest.substring(separator + 1).trim();

            console.log(await collaboration.review(reviewerId, content));

        }


        // CALL A CONSENSUS VOTE ACROSS MULTIPLE DEPARTMENTS
        else if (command.startsWith("collaborate.consensus ")) {

            const rest = command.substring(22).trim();

            const separator = rest.indexOf(" ");

            const departmentIds = (separator === -1 ? rest : rest.substring(0, separator)).split(",");
            const proposal = separator === -1 ? "" : rest.substring(separator + 1).trim();

            console.log(await collaboration.consensus(departmentIds, proposal));

        }


        // COLLABORATION HISTORY
        else if (command === "collaborate.history") {

            console.log(collaboration.history());

        }


        // RECENT ERRORS
        else if (command === "system.errors") {

            console.log(log.readErrors());

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
device.known
executive.roadmap
executive.deadlines
executive.plan <json goal>
executive.decompose <projectId>
executive.project <projectId>
executive.status <id> <status> [note]
executive.artifact <projectId> <artifact>
company.create <json>
company.list
company.get <companyId>
company.employee <companyId> <name>
company.document <companyId> <document>
company.finance <companyId> <json>
company.relationship <companyId> <json>
company.communication <companyId> <summary>
executive.consolidate
executive.consolidations
learning.overview
learning.departments
learning.agents
learning.tools
learning.recommend
learning.recommendations
automation.status
automation.history
automation.run <jobName>
automation.runNow <jobName>
automation.start
executive.handoff <projectId> <toDepartmentId> [note]
collaborate.message <fromDept> <toDept> <text>
collaborate.delegate <fromDept> <toDept> <task>
collaborate.review <reviewerDept> <content>
collaborate.consensus <dept1,dept2,...> <proposal>
collaborate.history
system.errors
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
