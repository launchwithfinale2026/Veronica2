// ==================================
// VERONICA CLOUD STORAGE CONNECTOR (placeholder)
// ==================================
//
// Interface-only, same reasoning as core/integrations/calendar.js and
// core/integrations/email.js: S3, Google Cloud Storage, and Dropbox each
// have different auth (signed requests vs. OAuth2 vs. simple bearer
// tokens) and none was specified by this milestone. Note that
// core/integrations/fileIntelligence.js already covers the LOCAL
// filesystem case (indexing data/workspace/ into memory) -- this
// connector is specifically for a REMOTE cloud store, a distinct
// capability.
//
// To make this real: pick a provider. Dropbox's API is the simplest fit
// for this codebase's "no new dependencies" convention (a bearer token
// over plain HTTPS, reachable through core/integrations/http.js's
// existing request() the same way core/integrations/github.js does). S3/
// GCS both need request-signing that a plain HTTP client doesn't provide
// for free, which would likely mean a new dependency or hand-rolled
// signing code -- worth weighing against that convention before picking
// one of those instead.

const credentialManager = require("./credentialManager");

const REQUIRED_ENV = credentialManager.CONNECTORS.cloudStorage.required;


function isConfigured(){
    return credentialManager.isConfigured("cloudStorage");
}


function notImplemented(action){
    throw new Error(
        `CloudStorage.${action}() is not implemented yet -- this connector is a placeholder awaiting a concrete provider choice. See core/integrations/cloudStorage.js.`
    );
}


function listFiles(){
    notImplemented("listFiles");
}


function uploadFile(){
    notImplemented("uploadFile");
}


function status(){

    return {
        id: "cloudStorage",
        configured: isConfigured(),
        implemented: false,
        requiredEnv: REQUIRED_ENV,
        note: "Placeholder -- no concrete provider chosen yet. See core/integrations/cloudStorage.js."
    };

}


module.exports = { isConfigured, status, listFiles, uploadFile };
