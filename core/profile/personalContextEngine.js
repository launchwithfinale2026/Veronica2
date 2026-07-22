// ==================================
// VERONICA PERSONAL CONTEXT ENGINE
// ==================================
//
// Phase 13 (Personal Operating Profile). Distinct from
// core/context/engine.js's ContextEngine, which assembles per-query
// context for one reasoning call (recent memories, roadmap, knowledge
// neighborhood). This is about the OPERATOR specifically, persistent
// across every call: identity, preferences, working style, important
// relationships, and long-term objectives -- some explicit (stored in
// veronica.profile.json, settable via set()), some derived live from
// systems that already exist (active goals from ExecutivePlanner,
// important context from Phase 12's memory lifecycle, recommended focus
// from Phase 11's priority ranking) rather than duplicated into the
// static file.
//
// veronica.profile.json is NOT tracked in git (see .gitignore) -- same
// reasoning as core/memory/database.json since the Phase 10 security
// audit: this is real, personal operator data, not source.

const fs = require("fs");
const path = require("path");

const memory = require("../memory");
const knowledge = require("../knowledge");
const ExecutivePlanner = require("../executive/planner");
const PriorityRanking = require("../executive/priorityRanking");

const PROFILE_FILE = path.join(__dirname, "veronica.profile.json");

const DEFAULT_PROFILE = {
    identity: { name: null, role: null },
    mission: null,
    preferences: [],
    workingStyle: null,
    importantRelationships: [],
    longTermObjectives: [],
    updated: null
};

const RECENT_DECISIONS_LIMIT = 5;
const ACTIVE_GOALS_LIMIT = 10;
const IMPORTANT_CONTEXT_LIMIT = 5;


class PersonalContextEngine {

    constructor({ planner, priorityRanking } = {}){

        this.planner = planner || new ExecutivePlanner();
        this.priorityRanking = priorityRanking || new PriorityRanking({ planner: this.planner });

    }


    // Bootstraps a default file on first run, same pattern
    // core/memory/store.js's ensureFile()/core/knowledge/index.js's
    // initialize() already established for real-but-untracked data.
    loadProfile(){

        if(!fs.existsSync(PROFILE_FILE)){
            fs.writeFileSync(PROFILE_FILE, JSON.stringify(DEFAULT_PROFILE, null, 2));
        }

        return JSON.parse(fs.readFileSync(PROFILE_FILE, "utf8"));

    }


    saveProfile(profile){

        const withTimestamp = { ...profile, updated: new Date().toISOString() };

        fs.writeFileSync(PROFILE_FILE, JSON.stringify(withTimestamp, null, 2));

        return withTimestamp;

    }


    // Sets one field by dot path (e.g. "identity.name", "workingStyle")
    // -- the explicit, operator-stated half of the profile. Terminal:
    // `veronica.profileSet <path> <value>`.
    set(fieldPath, value){

        const profile = this.loadProfile();
        const keys = fieldPath.split(".");

        let target = profile;

        for(let i = 0; i < keys.length - 1; i++){

            if(typeof target[keys[i]] !== "object" || target[keys[i]] === null){
                target[keys[i]] = {};
            }

            target = target[keys[i]];

        }

        target[keys[keys.length - 1]] = value;

        return this.saveProfile(profile);

    }


    // Appends to one of the array fields (preferences/
    // importantRelationships/longTermObjectives) rather than requiring
    // the caller to set() the whole array.
    add(fieldName, value){

        const profile = this.loadProfile();

        if(!Array.isArray(profile[fieldName])){
            throw new Error(`"${fieldName}" is not a list field on the profile`);
        }

        profile[fieldName].push(value);

        return this.saveProfile(profile);

    }


    // Explicit profile.identity.name always wins. Otherwise, if the
    // knowledge graph has exactly one "person" entity, that's a real,
    // already-recorded fact worth surfacing as a default -- not a guess
    // invented here -- rather than leaving identity blank when the
    // system already knows it. More than one person entity is
    // ambiguous (could be a client/employee, not the operator), so it's
    // left for the operator to set explicitly instead.
    resolvedIdentity(profile){

        if(profile.identity.name){
            return { ...profile.identity, source: "explicit" };
        }

        const people = knowledge.read().entities.filter(entity => entity.type === "person");

        if(people.length === 1){
            return { name: people[0].name, role: profile.identity.role, source: "derived from knowledge graph" };
        }

        return { ...profile.identity, source: "unset" };

    }


    activeGoals(){

        return this.planner.roadmap()
            .filter(project => project.status !== "completed")
            .slice(0, ACTIVE_GOALS_LIMIT)
            .map(project => ({ id: project.id, title: project.title, status: project.status, priority: project.priority }));

    }


    // "Persistent" (Phase 12 memory lifecycle) is VERONICA's own,
    // already-computed judgment of what matters most -- reused here
    // rather than a second importance heuristic.
    importantContext(){

        return memory.view()
            .filter(entry => entry.metadata.lifecycle === "persistent")
            .sort((a, b) => (b.metadata.importanceScore || 0) - (a.metadata.importanceScore || 0))
            .slice(0, IMPORTANT_CONTEXT_LIMIT)
            .map(entry => ({ id: entry.id, content: entry.content, score: entry.metadata.importanceScore }));

    }


    recentDecisions(){

        return memory.filter({ type: "decisions" }, { limit: RECENT_DECISIONS_LIMIT })
            .map(entry => ({ id: entry.id, content: entry.content, created: entry.created }));

    }


    // Reuses Phase 11's live priority ranking rather than a second
    // "what matters most" calculation.
    recommendedFocus(){

        const [top] = this.priorityRanking.rank();

        if(!top){
            return null;
        }

        return { project: top.project.id, title: top.project.title, score: top.score, reasons: top.reasons };

    }


    currentMission(profile){

        if(profile.mission){
            return profile.mission;
        }

        const focus = this.recommendedFocus();

        return focus
            ? `No explicit mission set -- highest current priority is "${focus.title}"`
            : "No explicit mission set, and no active projects to infer one from";

    }


    // The full assembled view -- "Current mission / Active goals /
    // Important context / Recent decisions / Recommended focus" this
    // phase asked for, plus the explicit profile fields alongside it.
    summary(){

        const profile = this.loadProfile();

        return {
            identity: this.resolvedIdentity(profile),
            mission: this.currentMission(profile),
            activeGoals: this.activeGoals(),
            importantContext: this.importantContext(),
            recentDecisions: this.recentDecisions(),
            recommendedFocus: this.recommendedFocus(),
            preferences: profile.preferences,
            workingStyle: profile.workingStyle,
            importantRelationships: profile.importantRelationships,
            longTermObjectives: profile.longTermObjectives,
            profileUpdated: profile.updated
        };

    }

}


module.exports = PersonalContextEngine;
