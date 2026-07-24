// ==================================
// VERONICA SYSTEM LIFECYCLE -- EVENT NAMES
// ==================================
//
// Phase 46. Symbolic names for the real bus events the system lifecycle
// layer publishes -- actual event strings stay in this codebase's
// established dotted-lowercase bus convention (see core/bus/index.js
// and e.g. "boot.stageCompleted", "runtime.stateChanged",
// core/voice/events.js), the same "one place naming the real strings"
// pattern core/voice/events.js already established, applied at the
// system-lifecycle level.

module.exports = {

    STATE_CHANGED: "system.stateChanged",
    READY: "system.ready",
    DEGRADED: "system.degraded",
    FAILURE: "system.failure",
    SHUTDOWN_STARTED: "system.shutdownStarted",
    OFFLINE: "system.offline",
    RECOVERED: "system.recovered",
    SERVICE_REGISTERED: "system.serviceRegistered",
    SERVICE_STATUS_CHANGED: "system.serviceStatusChanged"

};
