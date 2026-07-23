// Lazy-required inside the handler, not at module load time -- same
// reason as core/tools/handlers/executive.js/company.js:
// core/system/selfKnowledge.js requires core/executive/organizationOverview.js,
// which pulls in MissionEngine -> GoalDecomposer -> core/intelligence ->
// core/brain -> core/tools, closing a circular loop back to this exact
// file. See docs/Architecture.md "Goal Decomposition Engine" for the
// full trace.

module.exports = {

    // Phase 40 (Personal Operating System): lets VERONICA introspect her
    // own full state -- projects, missions, companies, departments,
    // devices, knowledge, memories, capabilities/packages, automations,
    // connectors, planning, executive recommendations -- as part of
    // reasoning about a request, not just as a dashboard view a human
    // reads separately.
    "system.understand": () => require("../../system/selfKnowledge").understand()

};
