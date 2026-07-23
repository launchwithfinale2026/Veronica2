// ==================================
// VERONICA AUTOMATION — BUILT-IN JOBS
// ==================================
//
// Registers the jobs earlier phases explicitly deferred scheduling for
// ("Not scheduled -- trigger manually... until Phase 8 adds real
// scheduling"). This is the one file in core/automation that's allowed to
// depend on core/executive/core/learning -- the engine itself
// (core/automation/engine.js) stays generic on purpose (see its header
// comment), so this wiring lives separately.

const SelfMonitor = require("../executive/selfMonitor");
const ExecutiveOrchestrator = require("../executive/orchestrator");
const log = require("../logging");

// Phase 25: a package's automations aren't hardcoded here -- see
// core/capabilities/activation.js's packageAutomationConfigs().
const activation = require("../capabilities/activation");

// Default cadence for a package automation that doesn't specify its own
// intervalMs -- hourly, the same conservative default this file already
// uses for self-monitor.
const DEFAULT_PACKAGE_AUTOMATION_INTERVAL_MS = 60 * 60 * 1000;

const CONSOLIDATE_INTERVAL_MS = 24 * 60 * 60 * 1000; // nightly, per the milestone's own framing
const RECOMMEND_INTERVAL_MS = 24 * 60 * 60 * 1000;
const SELF_MONITOR_INTERVAL_MS = 60 * 60 * 1000; // hourly -- cheap to run (skips the real API call entirely when nothing's wrong)

// Phase 11 (Executive Intelligence Layer) -- daily/weekly cadence,
// matching what they're named for. Both are fully rule-based (no LLM
// call, see each module's own header comment), so -- like consolidate/
// learning-recommend/self-monitor above, and unlike execute-tasks below
// -- there's no unattended-cost or unattended-action risk in always
// scheduling them.
const DAILY_BRIEFING_INTERVAL_MS = 24 * 60 * 60 * 1000;
const WEEKLY_REPORT_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

// Phase 14 (Daily Operating System) -- the evening half of the daily
// cycle. Same 24h cadence as daily-briefing: core/automation/engine.js's
// scheduler is purely interval-based (no time-of-day concept), so there
// is no real "morning" vs. "evening" clock distinction to wire yet --
// both just run every 24h from whenever each was first registered. See
// core/executive/dailyCycle.js's header comment.
const DAILY_REVIEW_INTERVAL_MS = 24 * 60 * 60 * 1000;

// Every 5 minutes -- unlike the three jobs above, each run of this one
// can make a real, billed department.run() call (a genuine LLM
// reasoning pass) if any task is ready. Conservative on purpose: this is
// the first job in the system that spends money and takes real-world
// action autonomously, not just reads/summarizes existing state.
const EXECUTE_TASKS_INTERVAL_MS = 5 * 60 * 1000;

// Phase 19 (External Integration). GitHub's own rate limits (5000
// req/hr authenticated) comfortably tolerate this; 15 minutes is
// frequent enough for "new PR/issue" to reach the daily briefing same-day
// without hammering the API on every tick.
const GITHUB_POLL_INTERVAL_MS = 15 * 60 * 1000;

// Same reasoning as GitHub's poll interval above -- Gmail/Calendar/
// Drive's own rate limits comfortably tolerate this cadence.
const GOOGLE_POLL_INTERVAL_MS = 15 * 60 * 1000;

// Phase 52 (Continuous Observation Engine): both are cheap, purely
// local checks (a `git rev-parse`, a re-read of already-computed
// connector status) -- frequent enough to feel "continuous" without
// meaningfully adding to the automation engine's own tick overhead.
const GIT_OBSERVER_INTERVAL_MS = 5 * 60 * 1000;
const CONNECTOR_HEALTH_INTERVAL_MS = 5 * 60 * 1000;


function registerBuiltInJobs(engine){

    // Required here, not at module top level -- core/executive depends on
    // core/intelligence -> core/brain -> core/tools, and if this module
    // were ever required from a tool handler (it isn't today, but
    // core/automation/index.js is a plain facade that could be), a
    // top-level require would risk the same circular-load class of bug
    // documented in "Goal Decomposition Engine." Cheap insurance for a
    // function that only runs once at boot anyway.
    const executive = require("../executive");
    const learning = require("../learning");

    engine.registerJob("consolidate", () => executive.consolidate());
    engine.registerJob("learning-recommend", () => learning.recommend());
    engine.registerJob("daily-briefing", () => executive.dailyBriefing());
    engine.registerJob("weekly-report", () => executive.weeklyOperatingReport());
    engine.registerJob("daily-review", () => executive.dailyReview());

    // `engine` here is the live AutomationEngine instance this very
    // function was called with -- passed directly to SelfMonitor rather
    // than letting it require("../automation") itself, which would
    // re-enter core/automation/index.js while it's still mid-load (this
    // function runs from inside that module's own top-level execution).
    // See core/executive/selfMonitor.js's constructor comment.
    const selfMonitor = new SelfMonitor({ executive, learning, automationEngine: engine });

    engine.registerJob("self-monitor", () => selfMonitor.runSelfCheck());

    // Not gated behind isConfigured() at registration time (env vars can
    // change between now and when the job actually ticks) -- the gate is
    // inside the job body itself, so a still-unconfigured GitHub just
    // means this tick is a cheap no-op, not a startup failure.
    engine.registerJob("github-poll", () => pollWatchedGithubRepos());

    // Same fail-closed-inside-the-job-body posture as github-poll above --
    // core/integrations/google/poll.js's pollAll() itself checks
    // oauth.isAuthorized() and returns a clean, non-throwing result when
    // Google isn't authorized yet.
    engine.registerJob("google-poll", () => require("../integrations/google/poll").pollAll());

    // Phase 52 (Continuous Observation Engine): both fail closed inside
    // their own module (no git repo / registry read error just means a
    // no-op check), same posture as github-poll/google-poll above.
    engine.registerJob("git-observer", () => require("../system/gitObserver").checkForNewCommits());
    engine.registerJob("connector-health", () => require("../system/connectorHealth").checkConnectorHealth());

    registerPackageJobs(engine);

    engine.schedule("consolidate", CONSOLIDATE_INTERVAL_MS);
    engine.schedule("learning-recommend", RECOMMEND_INTERVAL_MS);
    engine.schedule("self-monitor", SELF_MONITOR_INTERVAL_MS);
    engine.schedule("daily-briefing", DAILY_BRIEFING_INTERVAL_MS);
    engine.schedule("weekly-report", WEEKLY_REPORT_INTERVAL_MS);
    engine.schedule("daily-review", DAILY_REVIEW_INTERVAL_MS);
    engine.schedule("github-poll", GITHUB_POLL_INTERVAL_MS);
    engine.schedule("google-poll", GOOGLE_POLL_INTERVAL_MS);
    engine.schedule("git-observer", GIT_OBSERVER_INTERVAL_MS);
    engine.schedule("connector-health", CONNECTOR_HEALTH_INTERVAL_MS);

}


// Registers (and schedules) every automation an ACTIVE, installed
// capability package declares in its manifest -- "Automations
// Registered" from Phase 25's own activation pipeline. A handler
// module that fails to load, or doesn't export a function under the
// declared name, is logged and skipped rather than crashing the whole
// boot -- one broken package automation should never take down every
// other job.
function registerPackageJobs(engine){

    for(const { automationConfig, handlerPath, packageName } of activation.packageAutomationConfigs()){

        let handler;

        try {
            const handlerModule = require(handlerPath);
            handler = handlerModule[automationConfig.name];
        } catch(error){
            log.error("capabilities", `Package "${packageName}" automation "${automationConfig.name}" failed to load: ${error.message}`);
            continue;
        }

        if(typeof handler !== "function"){
            log.error("capabilities", `Package "${packageName}" automation "${automationConfig.name}" does not export a function named "${automationConfig.name}" from ${handlerPath} -- skipped`);
            continue;
        }

        const jobName = `pkg:${packageName}:${automationConfig.name}`;

        engine.registerJob(jobName, handler);
        engine.schedule(jobName, automationConfig.intervalMs || DEFAULT_PACKAGE_AUTOMATION_INTERVAL_MS);

    }

}


// Which repos to watch isn't a credential, so it doesn't belong in
// credentialManager -- GITHUB_WATCHED_REPOS is a plain, optional,
// comma-separated "owner/repo" list (e.g.
// "jakeuser/veronica,jakeuser/other-repo"). No repos configured (or
// GITHUB_TOKEN missing) means this job silently does nothing -- it never
// throws, matching every other credential-gated job's fail-closed
// posture.
async function pollWatchedGithubRepos(){

    const github = require("../integrations/github");

    if(!github.isConfigured()){
        return { polled: [], reason: "GitHub not configured" };
    }

    const watched = (process.env.GITHUB_WATCHED_REPOS || "")
        .split(",")
        .map(entry => entry.trim())
        .filter(Boolean);

    if(watched.length === 0){
        return { polled: [], reason: "No repos configured -- set GITHUB_WATCHED_REPOS (\"owner/repo,owner/repo\")" };
    }

    const results = [];

    for(const entry of watched){

        const [owner, repo] = entry.split("/");

        if(!owner || !repo){
            continue;
        }

        const ingested = await github.pollRepository(owner, repo);
        results.push({ repo: entry, ingestedCount: ingested.length });

    }

    return { polled: results };

}


// Registers the autonomous task-execution job. Deliberately NOT called
// from registerBuiltInJobs()/module load like the three jobs above --
// this one needs real DepartmentManager instances (with real agents/
// intelligence attached), which only exist once a host (dashboard/
// backend/server.js, core/interface/terminal.js) has loaded them. A host
// that never calls this explicitly gets every other automation
// capability with zero risk of unattended department execution; opting
// in is a deliberate, visible line in that host's own boot code, not
// something that happens just by requiring core/automation.
//
// Returns the ExecutiveOrchestrator instance so the caller (e.g. the
// dashboard) can also expose it directly for manual pursue()/report()
// calls, without constructing a second one.
function registerExecutionJob(engine, departments){

    const orchestrator = new ExecutiveOrchestrator({ departments });

    engine.registerJob("execute-tasks", () => orchestrator.runNextReadyTask());
    engine.schedule("execute-tasks", EXECUTE_TASKS_INTERVAL_MS);

    return orchestrator;

}


module.exports = { registerBuiltInJobs, registerExecutionJob, pollWatchedGithubRepos };
