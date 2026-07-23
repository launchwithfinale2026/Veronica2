// ==================================
// VERONICA AUTOMATION WORKFLOW ENGINE
// ==================================
//
// Phase 54 (Automation Engine 2.0). core/automation/engine.js already
// provides a persisted job queue, real retries with backoff, real
// crash recovery, and a real recurring scheduler (see its own header
// comment) -- that's the "run one named job on a cadence" primitive,
// and it stays exactly as it is. What was missing is what this phase
// actually asked for: WHEN -> IF -> CHECK -> APPROVAL -> RUN -> LEARN
// -> REPORT as one composable workflow, with real branching, real
// per-step retries, real rollback, and reusable templates -- not a
// second job queue, a layer that ORCHESTRATES existing primitives:
//
//   WHEN       a schedule (reuses AutomationEngine.schedule(), see
//              scheduleWorkflow() below) or a direct runWorkflow() call
//   IF/CHECK   a step's own condition(context) function
//   APPROVAL   a step's run(context) can itself create and check a
//              core/executive/actionProposal.js proposal -- no new
//              approval mechanism, the existing one used AS a step
//   RUN        the step's real handler
//   LEARN      every step outcome recorded via core/learning/log.js,
//              the same instrumentation every job already gets
//   REPORT     a persisted, queryable memory entry (workflowHistory())
//
// A workflow is a plain, named, reusable template: defineWorkflow()
// registers steps once; runWorkflow(name, context) can be called any
// number of times with different context, exactly what "reusable
// templates" means here -- not a separate template store.

const memory = require("../memory");
const bus = require("../bus");
const learningLog = require("../learning/log");

const WORKFLOW_RUN_TAG = "automation-workflow-run";

// name -> { steps, byId, firstStepId }
const workflows = new Map();


// steps: [{ id, run(context), condition(context)?, onSuccess?, onFailure?,
// rollback(context)?, maxAttempts?, retryDelayMs? }]. `onSuccess`/
// `onFailure` are step ids -- this is the real dependency graph/
// branching: a step can route to a DIFFERENT next step depending on its
// own outcome, not just fall through to the next array entry.
function defineWorkflow(name, steps){

    if(!name){
        throw new Error("A workflow name is required");
    }

    if(!Array.isArray(steps) || !steps.length){
        throw new Error("A workflow needs at least one real step");
    }

    for(const step of steps){
        if(!step.id || typeof step.run !== "function"){
            throw new Error("Every workflow step needs a real \"id\" and a \"run\" function");
        }
    }

    const byId = new Map(steps.map(step => [step.id, step]));

    if(byId.size !== steps.length){
        throw new Error(`Workflow "${name}" has duplicate step ids`);
    }

    workflows.set(name, { steps, byId, firstStepId: steps[0].id });

    return { name, stepCount: steps.length };

}


function getWorkflow(name){

    const workflow = workflows.get(name);

    if(!workflow){
        throw new Error(`Unknown workflow: "${name}"`);
    }

    return workflow;

}


function listWorkflows(){
    return [...workflows.keys()].map(name => ({ name, stepCount: workflows.get(name).steps.length }));
}


// Real, bounded per-step retries -- separate from
// core/automation/engine.js's own job-level retry/backoff (that retries
// an entire job on its NEXT scheduled tick; this retries one step
// immediately, within the same run, before the workflow decides the
// step truly failed).
async function runStepWithRetries(step, context){

    const maxAttempts = step.maxAttempts || 1;
    let lastError;

    for(let attempt = 1; attempt <= maxAttempts; attempt++){

        try {
            return await step.run(context);
        } catch(error){

            lastError = error;

            if(attempt < maxAttempts && step.retryDelayMs){
                await new Promise(resolve => setTimeout(resolve, step.retryDelayMs));
            }

        }

    }

    throw lastError;

}


// The real dependency-graph traversal: starts at the workflow's first
// step, follows onSuccess/onFailure edges until a step has no further
// edge to follow. A step with no explicit onFailure edge and a real
// failure means the whole run failed -- every already-completed step's
// rollback(context) (if it has one) runs, most-recently-completed
// first, same "undo in reverse order" principle any real transaction
// rollback follows.
async function runWorkflow(name, context = {}){

    const workflow = getWorkflow(name);
    const stepResults = [];
    const completedSteps = [];

    let currentId = workflow.firstStepId;
    let overallStatus = "completed";

    while(currentId){

        const step = workflow.byId.get(currentId);

        if(!step){
            throw new Error(`Workflow "${name}" references unknown step "${currentId}"`);
        }

        if(step.condition && !(await step.condition(context))){
            stepResults.push({ id: step.id, status: "skipped" });
            currentId = step.onSuccess || null;
            continue;
        }

        const startedAt = Date.now();

        try {

            const output = await runStepWithRetries(step, context);

            stepResults.push({ id: step.id, status: "success", output });
            completedSteps.push(step);

            learningLog.record({
                kind: "workflow_step",
                job: `${name}:${step.id}`,
                outcome: "success",
                durationMs: Date.now() - startedAt
            });

            currentId = step.onSuccess || null;

        } catch(error){

            stepResults.push({ id: step.id, status: "failed", error: error.message });

            learningLog.record({
                kind: "workflow_step",
                job: `${name}:${step.id}`,
                outcome: "failure",
                durationMs: Date.now() - startedAt,
                error: error.message
            });

            if(step.onFailure){
                currentId = step.onFailure;
                continue;
            }

            overallStatus = "failed";

            for(const completed of [...completedSteps].reverse()){

                if(!completed.rollback){
                    continue;
                }

                try {
                    await completed.rollback(context);
                    stepResults.push({ id: completed.id, status: "rolled_back" });
                } catch(rollbackError){
                    stepResults.push({ id: completed.id, status: "rollback_failed", error: rollbackError.message });
                }

            }

            currentId = null;

        }

    }

    // REPORT: a real, persisted, queryable run record -- same "ordinary
    // memory entry, not a parallel store" convention every other real
    // entity in this codebase already follows.
    const entry = memory.remember({
        content: `Workflow run: ${name}`,
        type: "decisions",
        importance: 3,
        tags: [WORKFLOW_RUN_TAG, `workflow:${name}`],
        source: "automation-workflow",
        metadata: { workflow: name, status: overallStatus, steps: stepResults }
    });

    bus.publish("workflow.completed", { id: entry.id, workflow: name, status: overallStatus });

    return { id: entry.id, workflow: name, status: overallStatus, steps: stepResults };

}


function workflowHistory(name, limit = 20){

    return memory.filter({ tag: WORKFLOW_RUN_TAG })
        .filter(entry => !name || entry.metadata.workflow === name)
        .slice(0, limit)
        .map(entry => ({
            id: entry.id,
            workflow: entry.metadata.workflow,
            status: entry.metadata.status,
            steps: entry.metadata.steps,
            created: entry.created
        }));

}


// WHEN: reuses AutomationEngine.schedule()/registerJob() directly --
// not a second scheduler. `engine` is the caller's already-constructed
// AutomationEngine instance (same "take the caller's real instance,
// don't build a second one" convention core/automation/jobs.js's own
// registerExecutionJob() already follows).
function scheduleWorkflow(engine, name, intervalMs, context = {}){

    const jobName = `workflow:${name}`;

    engine.registerJob(jobName, () => runWorkflow(name, context));
    engine.schedule(jobName, intervalMs);

    return jobName;

}


module.exports = {
    WORKFLOW_RUN_TAG,
    defineWorkflow,
    listWorkflows,
    runWorkflow,
    workflowHistory,
    scheduleWorkflow
};
