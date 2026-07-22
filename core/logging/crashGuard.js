// ==================================
// VERONICA PROCESS CRASH GUARDS
// ==================================
//
// Neither entry point (core/interface/terminal.js, dashboard/backend/
// server.js) had a process-level uncaughtException/unhandledRejection
// handler before this -- an unhandled rejection anywhere (e.g. the real
// one this phase found in the SSE endpoint, see docs/Architecture.md
// "Production Hardening") would either crash the process silently or,
// depending on Node version/flags, just print a warning and leave the
// process in an unknown state with zero durable trace of what happened.
//
// unhandledRejection is logged and the process keeps running -- most
// rejected promises in a system like this (a failed fetch inside a
// request handler, a job's own error already being retried by
// core/automation) aren't actually fatal, and taking down a long-running
// dashboard/automation host over one bad promise would be worse than the
// bug that caused it.
//
// uncaughtException is logged and the process exits (non-zero) --
// Node's own guidance is that the process is in an undefined state after
// this and should not keep running. Exiting loudly (with a durable log
// entry explaining why) beats limping on in a broken state.
//
// The handlers are exported as plain functions, not just wired up
// internally, specifically so tests can call them directly rather than
// going through `process.emit("uncaughtException", ...)` -- Node's own
// test runner also listens for those two events to detect real test
// failures, so synthetically emitting them during a test run fights the
// test runner itself rather than exercising this module's logic.

const log = require("./index");


function makeUnhandledRejectionHandler(moduleName){

    return function handleUnhandledRejection(reason){

        const message = reason instanceof Error ? reason.message : String(reason);

        log.error(moduleName, `Unhandled promise rejection: ${message}`, {
            stack: reason instanceof Error ? reason.stack : undefined
        });

    };

}


function makeUncaughtExceptionHandler(moduleName){

    return function handleUncaughtException(error){

        log.error(moduleName, `Uncaught exception, exiting: ${error.message}`, { stack: error.stack });

        process.exit(1);

    };

}


function installCrashGuards(moduleName){

    process.on("unhandledRejection", makeUnhandledRejectionHandler(moduleName));
    process.on("uncaughtException", makeUncaughtExceptionHandler(moduleName));

}


module.exports = { installCrashGuards, makeUnhandledRejectionHandler, makeUncaughtExceptionHandler };
