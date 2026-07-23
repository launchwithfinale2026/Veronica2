// ==================================
// VERONICA STARTUP MANAGER
// ==================================
//
// Phase 21 (Mac Resident System). The process a real macOS LaunchAgent
// (~/Library/LaunchAgents/com.veronica.agent.plist -- see
// config/com.veronica.agent.plist, and scripts/install-launch-agent.sh
// for the one manual step to actually register it) invokes at login: a
// thin, user-level supervisor that starts the dashboard server as a
// child process, restarts it on crash (bounded, with backoff), and
// periodically health-checks it over real HTTP.
//
// Explicitly does NOT touch sleep/shutdown/battery/power management or
// any system-level (root/LaunchDaemon) configuration -- a LaunchAgent
// under ~/Library/LaunchAgents/ is inherently a normal, per-user,
// unprivileged startup mechanism (this is the entire reason this phase
// asked for a LaunchAgent specifically, not a LaunchDaemon), and this
// file only ever spawns/monitors one already-existing, already-tested
// entry point (dashboard/backend/server.js) -- it introduces no new
// capability of its own beyond "keep that process running."

const { spawn } = require("child_process");
const path = require("path");
const http = require("http");

const log = require("../logging");

const DEFAULT_ENTRY = path.join(__dirname, "..", "..", "dashboard", "backend", "server.js");
const DEFAULT_MAX_RESTARTS = 5;
const DEFAULT_RESTART_WINDOW_MS = 10 * 60 * 1000; // restarts older than this don't count against the limit
const DEFAULT_HEALTH_CHECK_INTERVAL_MS = 60 * 1000;
const DEFAULT_BACKOFF_BASE_MS = 1000;
const DEFAULT_BACKOFF_MAX_MS = 30 * 1000;


class StartupManager {

    constructor({
        entry = DEFAULT_ENTRY,
        maxRestarts = DEFAULT_MAX_RESTARTS,
        restartWindowMs = DEFAULT_RESTART_WINDOW_MS,
        healthCheckIntervalMs = DEFAULT_HEALTH_CHECK_INTERVAL_MS,
        backoffBaseMs = DEFAULT_BACKOFF_BASE_MS,
        backoffMaxMs = DEFAULT_BACKOFF_MAX_MS,
        host = process.env.DASHBOARD_HOST || "127.0.0.1",
        port = Number(process.env.DASHBOARD_PORT) || 4000,
        spawnFn = spawn
    } = {}){

        this.entry = entry;
        this.maxRestarts = maxRestarts;
        this.restartWindowMs = restartWindowMs;
        this.healthCheckIntervalMs = healthCheckIntervalMs;
        this.backoffBaseMs = backoffBaseMs;
        this.backoffMaxMs = backoffMaxMs;
        this.host = host;
        this.port = port;
        this.spawnFn = spawnFn;

        this.restarts = [];
        this.child = null;
        this.healthTimer = null;
        this.restartTimer = null;
        this.stopped = true;
        this.lastHealth = null;
        this.lastStartupDiagnostics = null;

    }


    // Restarts within the window count toward the limit; older ones age
    // out -- a dashboard that's been stable for the window duration gets
    // a fresh restart budget rather than being permanently penalized for
    // one bad hour weeks ago.
    recentRestartCount(){

        const cutoff = Date.now() - this.restartWindowMs;
        this.restarts = this.restarts.filter(timestamp => timestamp >= cutoff);

        return this.restarts.length;

    }


    start(){

        this.stopped = false;
        this.spawnChild();

        this.healthTimer = setInterval(() => this.checkHealth(), this.healthCheckIntervalMs);
        this.healthTimer.unref?.();

        // Project B (Resident Personal Operating System) / Project F
        // (Self Diagnostics): a real, unified startup health report --
        // NOT awaited, so a slow CPU/disk read never delays actually
        // spawning the dashboard child process above, which is the real
        // priority at boot. Logged, not thrown -- a diagnostics failure
        // (e.g. this machine's disk stats being briefly unreadable right
        // at boot) should never prevent VERONICA from starting.
        this.runStartupDiagnostics();

        return { started: true, pid: this.child.pid };

    }


    async runStartupDiagnostics(){

        try {

            const healthScore = require("./healthScore");
            const result = await healthScore.score();

            log.info("startup-manager", `Startup diagnostics: ${result.status.toUpperCase()} (${result.score}/100)`);

            for(const entry of result.breakdown){
                log.warn("startup-manager", `Startup diagnostics: [${entry.category}] ${entry.detail}`);
            }

            this.lastStartupDiagnostics = result;

        } catch(error){
            log.error("startup-manager", `Startup diagnostics failed: ${error.message}`);
        }

    }


    spawnChild(){

        log.info("startup-manager", `Starting: ${process.execPath} ${this.entry}`);

        this.child = this.spawnFn(process.execPath, [this.entry], { stdio: "inherit" });

        this.child.on("exit", (code, signal) => this.onChildExit(code, signal));

    }


    onChildExit(code, signal){

        if(this.stopped){
            return; // a deliberate stop(), not a crash -- no restart
        }

        log.error("startup-manager", `Process exited unexpectedly (code ${code}, signal ${signal})`);

        if(this.recentRestartCount() >= this.maxRestarts){
            log.error("startup-manager", `Restart limit reached (${this.maxRestarts} within ${this.restartWindowMs / 1000}s) -- giving up. A human needs to investigate and restart manually.`);
            return;
        }

        this.restarts.push(Date.now());

        const backoffMs = Math.min(this.backoffMaxMs, this.backoffBaseMs * (2 ** (this.restarts.length - 1)));

        log.info("startup-manager", `Restarting in ${backoffMs}ms (attempt ${this.restarts.length}/${this.maxRestarts})`);

        this.restartTimer = setTimeout(() => {
            if(!this.stopped){
                this.spawnChild();
            }
        }, backoffMs);
        this.restartTimer.unref?.();

    }


    // A real HTTP call to the dashboard's own health endpoint -- not a
    // "is the process alive" check (the exit handler above already knows
    // that), but "is it actually answering requests."
    checkHealth(){

        return new Promise(resolve => {

            const req = http.get({ host: this.host, port: this.port, path: "/api/status", timeout: 5000 }, res => {

                const healthy = res.statusCode === 200;

                if(!healthy){
                    log.warn("startup-manager", `Health check returned status ${res.statusCode}`);
                }

                res.resume();
                this.lastHealth = { healthy, statusCode: res.statusCode, checkedAt: new Date().toISOString() };
                resolve(this.lastHealth);

            });

            req.on("error", error => {
                log.warn("startup-manager", `Health check failed: ${error.message}`);
                this.lastHealth = { healthy: false, error: error.message, checkedAt: new Date().toISOString() };
                resolve(this.lastHealth);
            });

            req.on("timeout", () => {
                req.destroy();
                this.lastHealth = { healthy: false, error: "timeout", checkedAt: new Date().toISOString() };
                resolve(this.lastHealth);
            });

        });

    }


    status(){

        return {
            running: Boolean(this.child && !this.child.killed),
            pid: this.child ? this.child.pid : null,
            restarts: this.restarts.length,
            lastHealth: this.lastHealth,
            lastStartupDiagnostics: this.lastStartupDiagnostics || null
        };

    }


    stop(){

        this.stopped = true;

        if(this.healthTimer){
            clearInterval(this.healthTimer);
            this.healthTimer = null;
        }

        if(this.restartTimer){
            clearTimeout(this.restartTimer);
            this.restartTimer = null;
        }

        if(this.child){
            this.child.kill();
        }

        return { stopped: true };

    }

}


module.exports = StartupManager;


// Scoped to the real-invocation path, not module top level -- this file
// is also require()d by tests to get the StartupManager class itself
// (same convention as dashboard/backend/server.js's own
// `require.main === module` guard).
if(require.main === module){

    const manager = new StartupManager();
    manager.start();

    const shutdown = () => {
        manager.stop();
        process.exit(0);
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);

}
