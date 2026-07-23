// ==================================
// VERONICA GIT OBSERVER
// ==================================
//
// Phase 52 (Continuous Observation Engine). Real, local git observation
// -- no credentials, no network call, just the same `git` binary any
// commit in this repo already used. Detects new commits on HEAD since
// the last check and publishes one real "git.commit" bus event per
// commit found, in the order they were actually made.
//
// The FIRST ever check establishes a baseline (this repo's real,
// current HEAD) without fabricating "new" events for the entire
// pre-existing commit history -- only commits made SINCE the last
// recorded check are ever reported, the same "don't invent a past that
// didn't happen under observation" principle every other real-data
// bootstrap in this codebase already follows (see
// core/device/deviceManager.js's ensureFile()).
//
// Per-machine, real state -- gitignored, same treatment as
// core/device/network.json.

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const bus = require("../bus");

const STATE_FILE = path.join(__dirname, "gitObserverState.json");
const REPO_ROOT = path.join(__dirname, "..", "..");

const MAX_COMMITS_PER_CHECK = 20;
const FIELD_SEPARATOR = "\x1f";


function loadState(stateFile){

    if(!fs.existsSync(stateFile)){
        return { lastSeenSha: null };
    }

    return JSON.parse(fs.readFileSync(stateFile, "utf8"));

}


function saveState(stateFile, state){
    fs.writeFileSync(stateFile, JSON.stringify(state, null, 2) + "\n");
}


// Fails closed (returns null), not throwing -- a machine without git on
// PATH, or a checkout that isn't a git repository at all, should mean
// "can't observe," not "crash the automation job that calls this."
function currentHead(cwd){

    try {
        return execFileSync("git", ["rev-parse", "HEAD"], { cwd, encoding: "utf8" }).trim();
    } catch(error){
        return null;
    }

}


function commitsSince(cwd, sha){

    const range = sha ? `${sha}..HEAD` : "HEAD";
    const format = `%H${FIELD_SEPARATOR}%an${FIELD_SEPARATOR}%aI${FIELD_SEPARATOR}%s`;

    let output;

    try {
        output = execFileSync(
            "git",
            ["log", `--max-count=${MAX_COMMITS_PER_CHECK}`, `--format=${format}`, range],
            { cwd, encoding: "utf8" }
        );
    } catch(error){
        return [];
    }

    return output.split("\n").filter(Boolean).map(line => {

        const [hash, author, date, subject] = line.split(FIELD_SEPARATOR);

        return { hash, author, date, subject };

    });

}


// Real, bounded observation -- callable from an automation job tick
// (see core/automation/jobs.js), not a background watcher, matching
// every other "poll on a schedule" job already in this system rather
// than adding a new always-on process class.
//
// `cwd`/`stateFile` are optional overrides (default to this real repo
// and its real state file) -- the same dependency-injection convention
// core/executive/actionProposal.js's `departments` override already
// established (Phase 50), here so a test can observe a real, disposable
// temp git repo instead of ever touching this actual repository's own
// history.
function checkForNewCommits({ cwd = REPO_ROOT, stateFile = STATE_FILE } = {}){

    const head = currentHead(cwd);

    if(!head){
        return { checked: false, reason: "not a git repository, or git is unavailable on this machine" };
    }

    const state = loadState(stateFile);

    if(!state.lastSeenSha){
        saveState(stateFile, { lastSeenSha: head });
        return { checked: true, baseline: true, newCommits: [] };
    }

    if(state.lastSeenSha === head){
        return { checked: true, newCommits: [] };
    }

    // git log lists newest-first; publish oldest-first so subscribers
    // see events in the order the commits actually happened.
    const commits = commitsSince(cwd, state.lastSeenSha).reverse();

    for(const commit of commits){
        bus.publish("git.commit", commit);
    }

    saveState(stateFile, { lastSeenSha: head });

    return { checked: true, newCommits: commits };

}


module.exports = { checkForNewCommits };
