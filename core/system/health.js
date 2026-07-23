// ==================================
// VERONICA SYSTEM HEALTH
// ==================================
//
// Phase 34 (Production Dashboard). Real CPU/RAM/disk/running-services
// figures -- genuinely new data this codebase didn't report before, not
// a redesign of anything existing. Uses only Node's built-in `os`/`fs`
// modules (os.cpus()/loadavg()/totalmem()/freemem(), fs.statfs()) --
// zero new dependencies, same principle this project has held since
// Phase 1.
//
// "Running Services" deliberately reports VERONICA's OWN internal
// services (automation engine, Discord bot, dashboard process uptime),
// not a host-wide OS process list -- that's what "service" actually
// means for a personal AI operating system, and it avoids either
// shelling out to `ps`/`tasklist` (platform-specific, fragile) or
// fabricating a generic "system services" concept this project has no
// real visibility into.

const os = require("os");
const fs = require("fs");


function cpuHealth(){

    const cpus = os.cpus();
    const [load1, load5, load15] = os.loadavg();

    return {
        cores: cpus.length,
        model: cpus[0]?.model || null,
        loadAverage: { "1m": load1, "5m": load5, "15m": load15 },
        // Load relative to core count -- a load average of 4 means
        // "fully loaded" on a 4-core machine, but "75% loaded" on an
        // 8-core one; reporting the raw number alone is misleading
        // without this context.
        loadPercent1m: cpus.length ? Math.round((load1 / cpus.length) * 100) : null
    };

}


function memoryHealth(){

    const total = os.totalmem();
    const free = os.freemem();
    const used = total - free;

    return {
        totalBytes: total,
        freeBytes: free,
        usedBytes: used,
        usedPercent: Math.round((used / total) * 100)
    };

}


// Real, asynchronous (fs.statfs has no sync counterpart) -- a rejected
// promise (e.g. an unreadable path) surfaces as a real error, not a
// fabricated "0 bytes" placeholder.
function diskHealth(targetPath = "/"){

    return new Promise((resolve, reject) => {

        fs.statfs(targetPath, (error, stats) => {

            if(error){
                return reject(error);
            }

            const totalBytes = stats.blocks * stats.bsize;
            const freeBytes = stats.bavail * stats.bsize;
            const usedBytes = totalBytes - freeBytes;

            resolve({
                path: targetPath,
                totalBytes,
                freeBytes,
                usedBytes,
                usedPercent: totalBytes ? Math.round((usedBytes / totalBytes) * 100) : null
            });

        });

    });

}


// VERONICA's own internal services -- real status from each one's own
// existing status()/state, not a fabricated "all green" placeholder.
function runningServices({ automation, discordBot } = {}){

    automation = automation || require("../automation");
    discordBot = discordBot || require("../integrations/discordBot");

    const automationStatus = automation.status();
    const discordStatus = discordBot.status();

    return [
        { name: "automation-engine", running: automationStatus.running },
        { name: "discord-bot", running: discordStatus.connected, configured: discordStatus.configured },
        { name: "dashboard-process", running: true, uptimeSeconds: Math.round(process.uptime()) }
    ];

}


async function generate({ diskPath = "/", automation, discordBot } = {}){

    const [disk] = await Promise.allSettled([diskHealth(diskPath)]);

    return {
        generatedAt: new Date().toISOString(),
        cpu: cpuHealth(),
        memory: memoryHealth(),
        disk: disk.status === "fulfilled" ? disk.value : { error: disk.reason.message },
        services: runningServices({ automation, discordBot })
    };

}


module.exports = { cpuHealth, memoryHealth, diskHealth, runningServices, generate };
