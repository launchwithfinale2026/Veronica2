// ==================================
// VERONICA EXECUTIVE PLANNER
// ==================================
//
// Converts goals into scheduled, department-assigned projects and
// maintains the active roadmap. Deliberately rule-based, not LLM-backed —
// see docs/Architecture.md "Executive Planner" for why: department
// assignment, effort estimate, and priority need to be cheap, synchronous,
// and deterministic (no network call, no brain mock needed in tests) on
// every plan() call. Breaking a goal into steps/subtasks is a separate,
// genuinely LLM-shaped problem for a future Goal Decomposition Engine to
// build on top of this.
//
// Projects are stored as ordinary memory entries (type: "goals", tagged
// "executive-project") rather than a second, parallel store -- consistent
// with the project's existing rule against duplicating the memory system
// (see docs/Architecture.md "Memory" section). The roadmap is a derived
// view over those entries, not separate state.

const fs = require("fs");
const path = require("path");

const memory = require("../memory");
const knowledge = require("../knowledge");

const DEPARTMENTS_REGISTRY = path.join(__dirname, "../../registry/departments.json");
const AGENTS_REGISTRY = path.join(__dirname, "../../registry/agents.json");

const EXECUTIVE_TAG = "executive-project";

const DUE_SOON_DAYS = 7;


function clampImportance(value){

    const n = Number.isFinite(value) ? value : 3;

    return Math.min(5, Math.max(1, n));

}


function daysUntil(deadline){

    const ms = new Date(deadline).getTime() - Date.now();

    return ms / (1000 * 60 * 60 * 24);

}


// Coarse t-shirt sizing off an hours estimate -- legible thresholds
// instead of a black-box classifier.
function sizeFromHours(hours){

    if(hours <= 8) return "small";
    if(hours <= 40) return "medium";
    return "large";

}


class ExecutivePlanner {

    // Exposed so core/executive/decomposer.js can size a milestone's
    // rolled-up effort with the same thresholds, instead of duplicating
    // them.
    static sizeFromHours(hours){
        return sizeFromHours(hours);
    }

    // Exposed so core/executive/consolidation.js can find project entries
    // by the same tag, instead of duplicating the string -- same pattern
    // as GoalDecomposer.TAG / CompanyManager.TAG.
    static TAG = EXECUTIVE_TAG;

    constructor(){

        this.departments = this.loadDepartments();
        this.agents = this.loadAgents();

    }


    loadDepartments(){

        return JSON.parse(
            fs.readFileSync(DEPARTMENTS_REGISTRY, "utf8")
        ).departments;

    }


    loadAgents(){

        return JSON.parse(
            fs.readFileSync(AGENTS_REGISTRY, "utf8")
        ).agents;

    }


    // Explicit goal.owners wins; otherwise every agent registered to the
    // assigned department (today, one primary agent per department -- see
    // docs/Architecture.md "Department roster") owns the project by
    // default. No separate human/stakeholder identity system exists yet
    // to assign a non-agent owner to (see "Not built" note below).
    resolveOwners(goal, department){

        if(goal.owners && goal.owners.length){
            return goal.owners;
        }

        return this.agents
            .filter(agent => agent.department === department.id)
            .map(agent => agent.name);

    }


    // Explicit goal.department wins; otherwise score every department's
    // domain against the goal's title/description text and take the best
    // keyword match. Falls back to ARES (Operations & Execution) -- the
    // general-purpose execution department -- when nothing matches.
    assignDepartment(goal){

        if(goal.department){

            const explicit = this.departments.find(dept => dept.id === goal.department);

            if(!explicit){
                throw new Error(`Unknown department: "${goal.department}"`);
            }

            return explicit;

        }

        const text = `${goal.title} ${goal.description || ""}`.toLowerCase();

        let best = null;
        let bestScore = 0;

        for(const dept of this.departments){

            const words = dept.domain.toLowerCase().split(/\s+/);

            const score = words.reduce(
                (sum, word) => sum + (text.includes(word) ? 1 : 0),
                0
            );

            if(score > bestScore){
                bestScore = score;
                best = dept;
            }

        }

        return best || this.departments.find(dept => dept.id === "ares");

    }


    // goal.estimatedHours (explicit) wins; otherwise a coarse heuristic off
    // description length and dependency count. Intentionally rough -- a
    // real estimate needs the goal broken into subtasks first (Phase 2).
    estimateEffort(goal){

        if(Number.isFinite(goal.estimatedHours)){

            return {
                hours: goal.estimatedHours,
                size: sizeFromHours(goal.estimatedHours)
            };

        }

        const words = `${goal.title} ${goal.description || ""}`
            .trim()
            .split(/\s+/)
            .filter(Boolean)
            .length;

        const dependencyCount = (goal.dependencies || []).length;

        const hours = Math.max(
            Math.round(words / 5) + dependencyCount * 4,
            1
        );

        return { hours, size: sizeFromHours(hours) };

    }


    // Weighted sum of explicit importance (1-5, doubled) and deadline
    // urgency (0-4 depending on days remaining), clamped to a legible 1-10
    // scale -- higher always means "act on this sooner."
    computePriority(goal){

        const importance = clampImportance(goal.priority);

        const urgency = this.urgencyScore(goal.deadline);

        return Math.min(10, importance * 2 + urgency);

    }


    urgencyScore(deadline){

        if(!deadline){
            return 0;
        }

        const days = daysUntil(deadline);

        if(days < 0) return 4;
        if(days <= DUE_SOON_DAYS) return 3;
        if(days <= 30) return 1;
        return 0;

    }


    evaluateDeadline(goal){

        if(!goal.deadline){
            return "no_deadline";
        }

        const days = daysUntil(goal.deadline);

        if(days < 0) return "overdue";
        if(days <= DUE_SOON_DAYS) return "due_soon";
        return "on_track";

    }


    // Validates goal.dependencies against the current roadmap (each must
    // already be a known project id) and returns them unchanged for
    // storage in the new entry's `relationships`.
    resolveDependencies(goal){

        const ids = goal.dependencies || [];

        if(!ids.length){
            return [];
        }

        const existing = this.roadmap();

        return ids.map(id => {

            const found = existing.find(project => project.id === id);

            if(!found){
                throw new Error(`Unknown project dependency: "${id}"`);
            }

            return found.id;

        });

    }


    // Converts a goal ({ title, description?, deadline?, priority?,
    // department?, estimatedHours?, dependencies?, tags?, company? }) into
    // a persisted, scheduled project: assigns a department, estimates
    // effort, computes priority, validates dependencies, records it in
    // memory + the knowledge graph, and returns the resulting project.
    // goal.company (a company id from core/executive/companyManager.js) is
    // NOT validated against the company registry here -- doing so would
    // make ExecutivePlanner depend on CompanyManager, which itself depends
    // on ExecutivePlanner to list a company's projects (see
    // docs/Architecture.md "Company Manager"). An unknown company id just
    // means the project won't surface under that company's filtered view;
    // recoverable, not worth a circular dependency to prevent.
    plan(goal){

        if(!goal || !goal.title){
            throw new Error("A goal title is required");
        }

        const department = this.assignDepartment(goal);
        const effort = this.estimateEffort(goal);
        const priority = this.computePriority(goal);
        const deadlineStatus = this.evaluateDeadline(goal);
        const dependencies = this.resolveDependencies(goal);
        const owners = this.resolveOwners(goal, department);

        const entry = memory.remember({
            content: goal.title,
            type: "goals",
            importance: clampImportance(goal.priority),
            tags: [
                EXECUTIVE_TAG,
                department.id,
                ...(goal.company ? [`company:${goal.company}`] : []),
                ...(goal.tags || [])
            ],
            source: "executive-planner",
            relationships: dependencies,
            metadata: {
                description: goal.description || null,
                deadline: goal.deadline || null,
                deadlineStatus,
                effort,
                priority,
                owners,
                company: goal.company || null,
                status: "planned",
                // Populated by core/executive/projectManager.js as the
                // project's lifecycle progresses -- empty at creation, not
                // omitted, so every project entry has a consistent shape
                // from the moment it's planned.
                history: [],
                artifacts: []
            }
        });

        this.linkKnowledge(entry, department, dependencies);

        return this.toProject(entry);

    }


    // Project + department entities, an assignedTo relationship, and a
    // dependsOn relationship per validated dependency -- so the roadmap is
    // discoverable through knowledge.retrieve() as well as memory.filter().
    linkKnowledge(entry, department, dependencies){

        const projectEntity = knowledge.addEntity({ name: entry.content, type: "project" });

        // Matches core/knowledge/seed.js's convention of keying department
        // entities by registry id (e.g. "athena"), not display name.
        const departmentEntity = knowledge.addEntity({ name: department.id, type: "department" });

        knowledge.addRelationship({
            from: projectEntity.name,
            to: departmentEntity.name,
            type: "assignedTo"
        });

        for(const depId of dependencies){

            const depEntry = memory.view().find(m => m.id === depId);

            if(depEntry){

                knowledge.addRelationship({
                    from: projectEntity.name,
                    to: depEntry.content,
                    type: "dependsOn"
                });

            }

        }

    }


    toProject(entry){

        const meta = entry.metadata || {};

        return {
            id: entry.id,
            title: entry.content,
            description: meta.description || null,
            deadline: meta.deadline || null,
            deadlineStatus: meta.deadlineStatus || "no_deadline",
            department: entry.tags.find(tag => this.departments.some(d => d.id === tag)) || null,
            effort: meta.effort || null,
            priority: Number.isFinite(meta.priority) ? meta.priority : 0,
            owners: meta.owners || [],
            company: meta.company || null,
            status: meta.status || "planned",
            dependencies: entry.relationships || [],
            created: entry.created,
            updated: entry.updated
        };

    }


    // Every planned project, most urgent/important first. Pass
    // { company: id } to scope to one company's projects only -- see
    // core/executive/companyManager.js's projects().
    roadmap({ company } = {}){

        return memory.filter({ tag: EXECUTIVE_TAG })
            .map(entry => this.toProject(entry))
            .filter(project => !company || project.company === company)
            .sort((a, b) => b.priority - a.priority);

    }


    // Groups the roadmap by deadline risk -- the "evaluate deadlines"
    // responsibility, read back out instead of recomputed, since it was
    // already decided at plan() time and stored in metadata.
    evaluateDeadlines(){

        const grouped = { overdue: [], due_soon: [], on_track: [], no_deadline: [] };

        for(const project of this.roadmap()){
            grouped[project.deadlineStatus].push(project);
        }

        return grouped;

    }

}


module.exports = ExecutivePlanner;
