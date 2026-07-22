// ==================================
// VERONICA AUTOMATION ENGINE
// ==================================
//
// A generic, persisted job queue + recurring scheduler -- deliberately
// has zero dependency on core/executive, core/tools, or core/learning's
// engine. Concrete jobs (consolidation, learning recommendations) are
// registered from outside (see core/automation/jobs.js), the same way
// core/tools/loader.js joins registry/tools.json's declarations to
// handlers/*.js's implementations rather than this module knowing what
// jobs exist. This is what keeps it safe to require from anywhere
// (including, eventually, a tool handler) without the class of circular-
// require bug documented in "Goal Decomposition Engine" above.
//
// State (queue + schedules) persists to core/automation/state.json on
// every mutation -- the same "write JSON on every change" pattern
// core/memory/store.js and core/knowledge/index.js already use. A
// "running" entry found at load time (the process crashed mid-job) is
// reset to "pending" so it gets retried -- that's the "failure recovery"
// half of persistent state; the other half is schedules surviving a
// restart without losing track of when they last ran.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const learningLog = require("../learning/log");
const bus = require("../bus");

const STATE_FILE = path.join(__dirname, "state.json");

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_BACKOFF_MS = 60 * 1000;
const DEFAULT_TICK_MS = 30 * 1000;


function load(){

    if(!fs.existsSync(STATE_FILE)){
        return { queue: [], schedules: [] };
    }

    const data = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));

    // Failure recovery: nothing can genuinely be "running" the moment we
    // just booted and loaded this file -- any entry in that state is a
    // crash leftover.
    let recovered = false;

    data.queue = data.queue.map(entry => {

        if(entry.status === "running"){
            recovered = true;
            return { ...entry, status: "pending", updatedAt: new Date().toISOString() };
        }

        return entry;

    });

    if(recovered){
        save(data);
    }

    return data;

}


function save(data){

    fs.writeFileSync(STATE_FILE, JSON.stringify(data, null, 2));

}


class AutomationEngine {

    constructor(){

        this.handlers = new Map();
        this.state = load();
        this.timer = null;

    }


    // name -> async handler. Re-registering the same name overwrites --
    // useful for tests, harmless in real use since job registration only
    // happens once at boot (see core/automation/jobs.js).
    registerJob(name, handler){

        this.handlers.set(name, handler);

    }


    // Adds a pending queue entry for `jobName`, to run as soon as the
    // next tick finds it due (scheduledFor defaults to "now" -- this is
    // the "background execution" capability: fire-and-forget, the caller
    // doesn't await the job itself).
    enqueue(jobName, { scheduledFor, maxAttempts = DEFAULT_MAX_ATTEMPTS } = {}){

        const entry = {
            id: crypto.randomUUID(),
            jobName,
            status: "pending",
            attempts: 0,
            maxAttempts,
            scheduledFor: scheduledFor || new Date().toISOString(),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            lastError: null
        };

        this.state.queue.push(entry);
        save(this.state);

        return entry;

    }


    // Registers (or replaces) a recurring schedule for `jobName`. Existing
    // nextRunAt is preserved across a re-schedule call with the same
    // jobName/intervalMs (e.g. across a process restart re-registering the
    // same built-in jobs) so restarting doesn't reset the clock.
    schedule(jobName, intervalMs){

        const existing = this.state.schedules.find(s => s.jobName === jobName);

        if(existing){
            existing.intervalMs = intervalMs;
            save(this.state);
            return existing;
        }

        const entry = {
            jobName,
            intervalMs,
            nextRunAt: new Date(Date.now() + intervalMs).toISOString()
        };

        this.state.schedules.push(entry);
        save(this.state);

        return entry;

    }


    // Enqueues every schedule whose nextRunAt has passed, advancing it by
    // its own intervalMs (not the tick interval) so the cadence is exact
    // regardless of how often tick() itself runs.
    checkSchedules(){

        const now = Date.now();

        for(const entry of this.state.schedules){

            if(new Date(entry.nextRunAt).getTime() <= now){

                this.enqueue(entry.jobName);

                entry.nextRunAt = new Date(now + entry.intervalMs).toISOString();

            }

        }

        save(this.state);

    }


    // Runs every currently-due "pending" entry, sequentially -- a
    // personal system's job volume never justifies real concurrency, and
    // sequential execution avoids two jobs racing over the same
    // underlying state (e.g. two consolidation runs at once).
    async processQueue(){

        const now = Date.now();

        const due = this.state.queue.filter(entry =>
            entry.status === "pending" && new Date(entry.scheduledFor).getTime() <= now
        );

        for(const entry of due){
            await this.runEntry(entry);
        }

    }


    // Runs a registered job immediately and synchronously, bypassing the
    // queue entirely -- no retry, no persisted entry, just "run it now and
    // give me the outcome." This exists because nothing guarantees a
    // background tick loop is actually running (see
    // docs/Architecture.md "Automation Engine"): enqueue() is a promise
    // that a job WILL run next time something ticks, which is only true
    // if the dashboard server is up. runNow() is for a caller (the
    // terminal, most often) that wants it to happen right now regardless.
    async runNow(jobName){

        const handler = this.handlers.get(jobName);

        if(!handler){
            throw new Error(`No handler registered for job "${jobName}"`);
        }

        const startedAt = Date.now();

        try {

            const result = await handler();

            learningLog.record({
                kind: "automation_job",
                job: jobName,
                outcome: "success",
                durationMs: Date.now() - startedAt
            });

            return result;

        } catch(error){

            learningLog.record({
                kind: "automation_job",
                job: jobName,
                outcome: "failure",
                durationMs: Date.now() - startedAt,
                error: error.message
            });

            throw error;

        }

    }


    async runEntry(entry){

        const handler = this.handlers.get(entry.jobName);

        if(!handler){
            entry.status = "failed";
            entry.lastError = `No handler registered for job "${entry.jobName}"`;
            entry.updatedAt = new Date().toISOString();
            save(this.state);
            return;
        }

        entry.status = "running";
        entry.updatedAt = new Date().toISOString();
        save(this.state);

        const startedAt = Date.now();

        try {

            await handler();

            entry.status = "completed";
            entry.updatedAt = new Date().toISOString();

            learningLog.record({
                kind: "automation_job",
                job: entry.jobName,
                outcome: "success",
                durationMs: Date.now() - startedAt
            });

            bus.publish("automation.jobCompleted", { jobName: entry.jobName, outcome: "success", durationMs: Date.now() - startedAt });

        } catch(error){

            entry.attempts += 1;
            entry.lastError = error.message;
            entry.updatedAt = new Date().toISOString();

            learningLog.record({
                kind: "automation_job",
                job: entry.jobName,
                outcome: "failure",
                durationMs: Date.now() - startedAt,
                error: error.message
            });

            bus.publish("automation.jobCompleted", { jobName: entry.jobName, outcome: "failure", durationMs: Date.now() - startedAt, error: error.message });

            if(entry.attempts < entry.maxAttempts){

                // Backoff scales with attempt count -- a job that keeps
                // failing waits longer between retries instead of
                // hammering whatever's broken.
                entry.status = "pending";
                entry.scheduledFor = new Date(Date.now() + DEFAULT_BACKOFF_MS * entry.attempts).toISOString();

            } else {

                entry.status = "failed";

            }

        }

        save(this.state);

    }


    async tick(){

        this.checkSchedules();
        await this.processQueue();

    }


    // Starts the recurring tick loop. Idempotent -- calling start() again
    // while already running just returns without creating a second timer.
    start(tickMs = DEFAULT_TICK_MS){

        if(this.timer){
            return;
        }

        this.timer = setInterval(() => {
            this.tick().catch(error => console.error("[AUTOMATION] tick() failed:", error.message));
        }, tickMs);

        // Don't make the process wait a full tickMs before the first
        // pass -- e.g. a job enqueued right at boot shouldn't sit idle.
        this.tick().catch(error => console.error("[AUTOMATION] tick() failed:", error.message));

    }


    stop(){

        if(this.timer){
            clearInterval(this.timer);
            this.timer = null;
        }

    }


    status(){

        return {
            running: Boolean(this.timer),
            queue: this.state.queue,
            schedules: this.state.schedules
        };

    }


    history(limit = 20){

        return this.state.queue
            .filter(entry => entry.status === "completed" || entry.status === "failed")
            .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
            .slice(0, limit);

    }

}


module.exports = AutomationEngine;
