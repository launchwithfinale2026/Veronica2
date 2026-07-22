// ==================================
// VERONICA PRIORITY RANKING SYSTEM
// ==================================
//
// Phase 11 (Executive Intelligence Layer). ExecutivePlanner.computePriority()
// already scores a goal once, at plan() time -- importance plus deadline
// urgency evaluated against that day's date. It never recomputes: a
// project planned three weeks out with a modest score doesn't get more
// urgent in the roadmap's eyes as its deadline actually approaches, and
// nothing reflects that a project blocking two other projects deserves
// more attention than its plan-time score implies. This is the live
// re-ranking that planner.js explicitly deferred (see its own "Not
// built" framing) -- same underlying formula and department roster,
// evaluated fresh against today.
//
// Deliberately rule-based, not LLM-scored -- consistent with
// planner.js's own reasoning (cheap, synchronous, deterministic, no
// brain mock needed in tests) and this phase's explicit "all decisions
// must be explainable" requirement: every score comes with the exact
// reasons behind it, not a black-box number.

const ExecutivePlanner = require("./planner");
const ProjectManager = require("./projectManager");

const BLOCKED_BONUS = 3;
const DEPENDENT_WEIGHT = 2;


class PriorityRanking {

    constructor({ planner, projectManager } = {}){

        this.planner = planner || new ExecutivePlanner();
        this.projectManager = projectManager || new ProjectManager({ planner: this.planner });

    }


    // How many OTHER active projects declare this one as a dependency --
    // a project blocking two others deserves more attention than one
    // nothing depends on, even at equal priority.
    countDependents(projectId, roadmap){

        return roadmap.filter(other =>
            other.id !== projectId && (other.dependencies || []).includes(projectId)
        ).length;

    }


    // Recomputes urgency against TODAY (ExecutivePlanner.urgencyScore()
    // takes a deadline and always measures from Date.now()), rather than
    // trusting the frozen `priority` field written at plan() time --
    // that's the actual "live" part of this ranking.
    score(project, roadmap){

        const entry = this.projectManager.requireEntry(project.id);
        const importance = Math.min(5, Math.max(1, entry.importance || 3));

        const reasons = [];

        const freshUrgency = this.planner.urgencyScore(project.deadline);
        let score = importance * 2 + freshUrgency;

        reasons.push(
            `Base: importance ${importance}/5 (x2) + current deadline urgency ${freshUrgency}/4 = ${importance * 2 + freshUrgency}`
        );

        if(project.priority !== score){

            const direction = score > project.priority ? "risen" : "eased";

            reasons.push(
                `Urgency has ${direction} since planning: stored priority was ${project.priority}/10, recomputed against today it's ${score}/10`
            );

        }

        if(project.status === "blocked"){
            score += BLOCKED_BONUS;
            reasons.push(`+${BLOCKED_BONUS}: currently blocked -- needs attention to move again`);
        }

        const dependents = this.countDependents(project.id, roadmap);

        if(dependents > 0){
            score += dependents * DEPENDENT_WEIGHT;
            reasons.push(`+${dependents * DEPENDENT_WEIGHT}: blocks ${dependents} other active project(s) (${dependents} x ${DEPENDENT_WEIGHT})`);
        }

        return { project, score, reasons };

    }


    // Every active (not completed) project, most urgent first by the
    // live-recomputed score -- not the roadmap's own priority-sorted
    // order, which is exactly what this exists to correct.
    rank(){

        const roadmap = this.planner.roadmap().filter(p => p.status !== "completed");

        return roadmap
            .map(project => this.score(project, roadmap))
            .sort((a, b) => b.score - a.score);

    }

}


module.exports = PriorityRanking;
