// ==================================
// VERONICA DEVICE SYNCHRONIZATION
// ==================================
//
// The "synchronization layer" the protocol asks for, scoped to what's
// actually verifiable today: an export/import/merge mechanism, not a
// speculative always-on network daemon. Two VERONICA instances sync by
// one fetching the other's export (e.g. over the dashboard's
// GET /api/sync/export) and feeding it into its own importState() (e.g.
// via POST /api/sync/import) — see dashboard/backend/server.js.

const memoryStore = require("../memory/store");
const knowledge = require("../knowledge");
const device = require("./index");


function exportState(){

    return {
        device: device.currentIdentity(),
        exportedAt: new Date().toISOString(),
        memory: memoryStore.recall(),
        knowledge: knowledge.read()
    };

}


function importState(syncPackage){

    if(!syncPackage || !syncPackage.device){
        throw new Error("Invalid sync package: missing device info");
    }

    const memoryResult = memoryStore.merge(syncPackage.memory || []);

    const knowledgeResult = knowledge.merge(
        syncPackage.knowledge || { entities: [], relationships: [] }
    );

    return {
        fromDevice: syncPackage.device,
        memory: memoryResult,
        knowledge: knowledgeResult
    };

}


module.exports = { exportState, importState };
