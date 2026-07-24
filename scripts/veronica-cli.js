#!/usr/bin/env node
// ==================================
// VERONICA CLI
// ==================================
//
// Phase 46. `veronica status|start|stop|restart|health|diagnose` --
// status/health/diagnose talk to the real running dashboard process
// over its own real HTTP API (no separate data path); start/stop/
// restart manage the real process directly (spawn detached / send a
// real SIGTERM to the real PID recorded in the real PID file
// dashboard/backend/server.js writes at boot).
//
// Deliberately does NOT install/manage a LaunchAgent -- that stays
// scripts/install-launch-agent.sh's own explicit, manual, operator-run
// step (see docs/DEPLOYMENT.md). This CLI is for interacting with an
// already-decided deployment (manual or LaunchAgent-managed), not for
// making that decision.

const fs = require("fs");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");

const recoveryManager = require("../core/system/recoveryManager");

const PID_FILE = path.join(path.dirname(recoveryManager.STATE_FILE), "dashboard.pid");
const SERVER_ENTRY = path.join(__dirname, "..", "dashboard", "backend", "server.js");

const HOST = process.env.DASHBOARD_HOST || "127.0.0.1";
const PORT = process.env.DASHBOARD_PORT || 4000;


function readPidFile(){

    if(!fs.existsSync(PID_FILE)){
        return null;
    }

    const raw = fs.readFileSync(PID_FILE, "utf8").trim();
    const pid = Number(raw);

    return Number.isInteger(pid) && pid > 0 ? pid : null;

}


// Real: signal 0 doesn't kill anything, it just checks whether the PID
// is a real, currently-running process -- a stale PID file left behind
// by a hard crash must be reported honestly as "not running," not
// trusted blindly.
function isProcessAlive(pid){

    try {
        process.kill(pid, 0);
        return true;
    } catch(error){
        return false;
    }

}


function fetchJSON(urlPath){

    return new Promise((resolve, reject) => {

        const req = http.get({ host: HOST, port: PORT, path: urlPath, timeout: 5000 }, res => {

            let body = "";
            res.on("data", chunk => { body += chunk; });
            res.on("end", () => {
                try {
                    resolve({ status: res.statusCode, body: JSON.parse(body) });
                } catch(error){
                    reject(new Error(`Invalid JSON response from ${urlPath}: ${error.message}`));
                }
            });

        });

        req.on("error", reject);
        req.on("timeout", () => { req.destroy(); reject(new Error(`Request to ${urlPath} timed out`)); });

    });

}


async function cmdStatus(){

    const pid = readPidFile();
    const alive = pid && isProcessAlive(pid);

    console.log(`Process: ${alive ? `running (pid ${pid})` : "not running"}`);

    try {
        const { body } = await fetchJSON("/api/system/lifecycle");
        console.log(`Lifecycle state: ${body.lifecycle.state}`);
        console.log(`Operational: ${body.isOperational}`);
        console.log("Services:");
        for(const service of body.services){
            const mark = service.status === "FAILED" ? "✗" : service.status === "DISABLED" ? "⚠" : "✓";
            console.log(`  ${mark} ${service.name} (${service.status})`);
        }
    } catch(error){
        console.log(`Could not reach the dashboard's real API (${error.message}) -- it may not be running, or DASHBOARD_HOST/DASHBOARD_PORT don't match.`);
        process.exitCode = 1;
    }

}


async function cmdHealth(){

    try {

        const { body } = await fetchJSON("/api/system/health-check");

        console.log(`Overall: ${body.overall}`);

        for(const check of body.checks){
            const mark = check.status === "healthy" ? "✓" : check.status === "degraded" ? "⚠" : "✗";
            console.log(`  ${mark} ${check.system}: ${check.status} (${check.latency}ms)`);
        }

    } catch(error){
        console.log(`Could not reach the dashboard's real API (${error.message}).`);
        process.exitCode = 1;
    }

}


async function cmdDiagnose(){

    try {

        const { body } = await fetchJSON("/api/system/diagnose");
        console.log(JSON.stringify(body, null, 2));

    } catch(error){
        console.log(`Could not reach the dashboard's real API (${error.message}).`);
        process.exitCode = 1;
    }

}


function cmdStart(){

    const pid = readPidFile();

    if(pid && isProcessAlive(pid)){
        console.log(`Already running (pid ${pid}).`);
        return;
    }

    const child = spawn(process.execPath, [SERVER_ENTRY], {
        detached: true,
        stdio: "ignore",
        env: process.env
    });

    child.unref();

    console.log(`Starting VERONICA (pid ${child.pid})... run "veronica status" in a few seconds to confirm.`);

}


function cmdStop(){

    return new Promise(resolve => {

        const pid = readPidFile();

        if(!pid || !isProcessAlive(pid)){
            console.log("Not running (no live process found).");
            return resolve();
        }

        console.log(`Sending SIGTERM to pid ${pid} for a real graceful shutdown...`);
        process.kill(pid, "SIGTERM");

        const deadline = Date.now() + 10000;

        const poll = setInterval(() => {

            if(!isProcessAlive(pid)){
                clearInterval(poll);
                console.log("Stopped.");
                return resolve();
            }

            if(Date.now() > deadline){
                clearInterval(poll);
                console.log("Still running after 10s -- graceful shutdown may be stuck; check the dashboard's own logs.");
                resolve();
            }

        }, 300);

    });

}


async function cmdRestart(){
    await cmdStop();
    await new Promise(resolve => setTimeout(resolve, 500));
    cmdStart();
}


async function main(){

    const command = process.argv[2];

    const commands = {
        status: cmdStatus,
        start: cmdStart,
        stop: cmdStop,
        restart: cmdRestart,
        health: cmdHealth,
        diagnose: cmdDiagnose
    };

    if(!command || !commands[command]){
        console.log("Usage: veronica <status|start|stop|restart|health|diagnose>");
        process.exitCode = command ? 1 : 0;
        return;
    }

    await commands[command]();

}


if(require.main === module){
    main();
}

module.exports = { readPidFile, isProcessAlive, fetchJSON };
