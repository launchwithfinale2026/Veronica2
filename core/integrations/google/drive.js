// ==================================
// VERONICA GOOGLE DRIVE CONNECTOR
// ==================================
//
// Phase 19. File discovery, metadata, and (via
// core/integrations/eventIngestion.js) document indexing/folder
// monitoring, per this phase's capability list -- read-only, no upload/
// delete/modify.

const http = require("../http");
const oauth = require("./oauth");

const API_ROOT = "https://www.googleapis.com/drive/v3";


async function call(pathname){

    const accessToken = await oauth.getAccessToken();

    // Phase 36 ("retry safely"): this connector is entirely GET/read-only.
    const response = await http.requestWithRetry(`${API_ROOT}${pathname}`, {
        headers: { Authorization: `Bearer ${accessToken}` }
    });

    if(response.status >= 400){
        throw new Error(`Google Drive API error ${response.status}: ${response.body}`);
    }

    return JSON.parse(response.body);

}


// q: a real Drive query string (e.g. "'<folderId>' in parents") --
// "folder monitoring" from this phase's capability list is this same
// call, scoped to a folder id, run periodically (see the automation
// job in core/automation/jobs.js).
function listFiles({ pageSize = 20, q } = {}){

    const params = new URLSearchParams({
        pageSize: String(pageSize),
        fields: "files(id,name,mimeType,modifiedTime,size,parents,webViewLink)"
    });

    if(q){
        params.set("q", q);
    }

    return call(`/files?${params.toString()}`);

}


// async so a missing-fileId validation error rejects the returned
// promise instead of throwing synchronously (same reasoning as
// gmail.js's getMessage()/getAttachment() -- see that file's comment).
async function getFileMetadata(fileId){

    if(!fileId){
        throw new Error("A fileId is required");
    }

    return call(`/files/${encodeURIComponent(fileId)}?fields=id,name,mimeType,modifiedTime,size,parents,webViewLink`);

}


module.exports = { listFiles, getFileMetadata };
