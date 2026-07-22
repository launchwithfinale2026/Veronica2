const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

const DB_PATH = path.join(__dirname, "..", "core", "memory", "database.json");
const DB_BACKUP = path.join(os.tmpdir(), `veronica-database-backup-profile-${process.pid}.json`);

const GRAPH_PATH = path.join(__dirname, "..", "core", "knowledge", "graph.json");
const GRAPH_BACKUP = path.join(os.tmpdir(), `veronica-graph-backup-profile-${process.pid}.json`);

// veronica.profile.json is real per-operator data (gitignored, see
// .gitignore), bootstrapped fresh if missing -- same real-file backup/
// restore discipline as every other piece of real state this test suite
// touches, so a real profile (if one exists on this machine) is never
// clobbered by running these tests.
const PROFILE_PATH = path.join(__dirname, "..", "core", "profile", "veronica.profile.json");
const PROFILE_EXISTED_BEFORE = fs.existsSync(PROFILE_PATH);
const PROFILE_BACKUP = path.join(os.tmpdir(), `veronica-profile-backup-${process.pid}.json`);

test.before(() => {
    fs.copyFileSync(DB_PATH, DB_BACKUP);
    fs.copyFileSync(GRAPH_PATH, GRAPH_BACKUP);
    if(PROFILE_EXISTED_BEFORE){
        fs.copyFileSync(PROFILE_PATH, PROFILE_BACKUP);
    }
});

test.after(() => {
    fs.copyFileSync(DB_BACKUP, DB_PATH);
    fs.unlinkSync(DB_BACKUP);
    fs.copyFileSync(GRAPH_BACKUP, GRAPH_PATH);
    fs.unlinkSync(GRAPH_BACKUP);
    if(PROFILE_EXISTED_BEFORE){
        fs.copyFileSync(PROFILE_BACKUP, PROFILE_PATH);
        fs.unlinkSync(PROFILE_BACKUP);
    } else if(fs.existsSync(PROFILE_PATH)){
        fs.unlinkSync(PROFILE_PATH);
    }
});

const knowledge = require("../core/knowledge");
const ExecutivePlanner = require("../core/executive/planner");
const PriorityRanking = require("../core/executive/priorityRanking");
const PersonalContextEngine = require("../core/profile/personalContextEngine");

function scopedPlanner(realPlanner, allowedIds){
    return {
        departments: realPlanner.departments,
        agents: realPlanner.agents,
        plan: (goal) => realPlanner.plan(goal),
        toProject: (entry) => realPlanner.toProject(entry),
        estimateEffort: (goal) => realPlanner.estimateEffort(goal),
        urgencyScore: (deadline) => realPlanner.urgencyScore(deadline),
        roadmap: (opts) => realPlanner.roadmap(opts).filter(p => allowedIds.includes(p.id)),
        evaluateDeadlines(){
            const grouped = { overdue: [], due_soon: [], on_track: [], no_deadline: [] };
            for(const project of realPlanner.roadmap().filter(p => allowedIds.includes(p.id))){
                grouped[project.deadlineStatus].push(project);
            }
            return grouped;
        }
    };
}


test("loadProfile() bootstraps a default profile when none exists", () => {

    if(fs.existsSync(PROFILE_PATH)){
        fs.unlinkSync(PROFILE_PATH);
    }

    const engine = new PersonalContextEngine();
    const profile = engine.loadProfile();

    assert.deepStrictEqual(profile.identity, { name: null, role: null });
    assert.deepStrictEqual(profile.preferences, []);
    assert.strictEqual(profile.mission, null);

});


test("set() writes a field by dot path and persists it", () => {

    const engine = new PersonalContextEngine();

    engine.set("identity.name", "Test Operator XQZPROF1");
    engine.set("workingStyle", "terse and direct");

    const profile = engine.loadProfile();

    assert.strictEqual(profile.identity.name, "Test Operator XQZPROF1");
    assert.strictEqual(profile.workingStyle, "terse and direct");
    assert.ok(profile.updated);

});


test("add() appends to a list field and rejects a non-list field", () => {

    const engine = new PersonalContextEngine();

    engine.add("preferences", "likes concise answers XQZPROF2");
    engine.add("importantRelationships", "Alex, co-founder XQZPROF2");

    const profile = engine.loadProfile();

    assert.ok(profile.preferences.includes("likes concise answers XQZPROF2"));
    assert.ok(profile.importantRelationships.includes("Alex, co-founder XQZPROF2"));

    assert.throws(() => engine.add("mission", "not a list"), /not a list field/);

});


test("resolvedIdentity() prefers an explicit profile name over the knowledge graph", () => {

    const engine = new PersonalContextEngine();

    engine.set("identity.name", "Explicit Name XQZPROF3");

    const profile = engine.loadProfile();
    const identity = engine.resolvedIdentity(profile);

    assert.strictEqual(identity.name, "Explicit Name XQZPROF3");
    assert.strictEqual(identity.source, "explicit");

});


test("resolvedIdentity() derives from a single knowledge-graph person entity when no explicit name is set", () => {

    if(fs.existsSync(PROFILE_PATH)){
        fs.unlinkSync(PROFILE_PATH);
    }

    // Isolate from any real "person" entities already in the graph (e.g.
    // the real operator's own) by using a scoped read -- simplest here
    // is to just assert against whatever the real graph resolves to,
    // matching its own person-entity count exactly.
    const people = knowledge.read().entities.filter(e => e.type === "person");

    const engine = new PersonalContextEngine();
    const profile = engine.loadProfile();
    const identity = engine.resolvedIdentity(profile);

    if(people.length === 1){
        assert.strictEqual(identity.name, people[0].name);
        assert.strictEqual(identity.source, "derived from knowledge graph");
    } else {
        assert.strictEqual(identity.source, "unset");
    }

});


test("activeGoals() reflects the real (scoped) active roadmap", () => {

    const realPlanner = new ExecutivePlanner();
    const project = realPlanner.plan({ title: "Profile active goal XQZPROF4", department: "ares", priority: 4 });

    const scoped = scopedPlanner(realPlanner, [project.id]);
    const engine = new PersonalContextEngine({ planner: scoped, priorityRanking: new PriorityRanking({ planner: scoped }) });

    const goals = engine.activeGoals();

    assert.strictEqual(goals.length, 1);
    assert.strictEqual(goals[0].title, "Profile active goal XQZPROF4");

});


test("recommendedFocus() reuses the live priority ranking's top item", () => {

    const realPlanner = new ExecutivePlanner();
    const project = realPlanner.plan({ title: "Profile focus project XQZPROF5", department: "ares", priority: 5 });

    const scoped = scopedPlanner(realPlanner, [project.id]);
    const ranking = new PriorityRanking({ planner: scoped });
    const engine = new PersonalContextEngine({ planner: scoped, priorityRanking: ranking });

    const focus = engine.recommendedFocus();

    assert.strictEqual(focus.project, project.id);
    assert.strictEqual(focus.title, "Profile focus project XQZPROF5");
    assert.ok(Array.isArray(focus.reasons));

});


test("currentMission() falls back to the recommended focus when no explicit mission is set", () => {

    if(fs.existsSync(PROFILE_PATH)){
        fs.unlinkSync(PROFILE_PATH);
    }

    const realPlanner = new ExecutivePlanner();
    const project = realPlanner.plan({ title: "Profile mission fallback project XQZPROF6", department: "ares", priority: 5 });

    const scoped = scopedPlanner(realPlanner, [project.id]);
    const ranking = new PriorityRanking({ planner: scoped });
    const engine = new PersonalContextEngine({ planner: scoped, priorityRanking: ranking });

    const profile = engine.loadProfile();
    const mission = engine.currentMission(profile);

    assert.match(mission, /Profile mission fallback project XQZPROF6/);

    engine.set("mission", "Ship the thing XQZPROF6");
    const updatedProfile = engine.loadProfile();

    assert.strictEqual(engine.currentMission(updatedProfile), "Ship the thing XQZPROF6");

});


test("summary() assembles the full profile view in one call", () => {

    const realPlanner = new ExecutivePlanner();
    const project = realPlanner.plan({ title: "Profile summary project XQZPROF7", department: "ares" });

    const scoped = scopedPlanner(realPlanner, [project.id]);
    const engine = new PersonalContextEngine({ planner: scoped, priorityRanking: new PriorityRanking({ planner: scoped }) });

    const summary = engine.summary();

    assert.ok("identity" in summary);
    assert.ok("mission" in summary);
    assert.ok(Array.isArray(summary.activeGoals));
    assert.ok(Array.isArray(summary.importantContext));
    assert.ok(Array.isArray(summary.recentDecisions));
    assert.ok("recommendedFocus" in summary);
    assert.ok(Array.isArray(summary.preferences));
    assert.ok(Array.isArray(summary.importantRelationships));
    assert.ok(Array.isArray(summary.longTermObjectives));

});
