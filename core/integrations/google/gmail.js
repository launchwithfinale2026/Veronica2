// ==================================
// VERONICA GMAIL CONNECTOR
// ==================================
//
// Phase 19. Read-only, matching this phase's explicit capability list:
// read messages, read attachments, classify (left to the caller --
// core/integrations/eventIngestion.js, reusing Phase 12's memory
// classification, not a second classifier here), ingest into memory,
// never delete, never send without approval. "Send" isn't implemented
// at all in this file -- only what was actually asked for.

const http = require("../http");
const oauth = require("./oauth");

const API_ROOT = "https://gmail.googleapis.com/gmail/v1";


async function call(pathname, options = {}){

    const accessToken = await oauth.getAccessToken();

    const response = await http.request(`${API_ROOT}${pathname}`, {
        ...options,
        headers: {
            Authorization: `Bearer ${accessToken}`,
            ...(options.headers || {})
        }
    });

    if(response.status >= 400){
        throw new Error(`Gmail API error ${response.status}: ${response.body}`);
    }

    return JSON.parse(response.body);

}


// A page of message ids/threadIds -- Gmail's list endpoint doesn't
// return full message content, see getMessage() for that.
function listMessages({ maxResults = 10, q } = {}){

    const params = new URLSearchParams({ maxResults: String(maxResults) });

    if(q){
        params.set("q", q);
    }

    return call(`/users/me/messages?${params.toString()}`);

}


// Declared async (not just returning call()'s promise) so a missing-id
// validation error rejects the returned promise instead of throwing
// synchronously -- same reasoning as core/integrations/http.js's
// request() (see its own header comment): a caller doing
// `await getMessage(...)` or `.catch(...)` shouldn't need a separate
// try/catch just for "bad input" vs. "the request itself failed."
async function getMessage(id){

    if(!id){
        throw new Error("A message id is required");
    }

    return call(`/users/me/messages/${encodeURIComponent(id)}`);

}


// Attachment bytes (base64url-encoded, per Gmail's API) for one
// attachment on one message -- "read attachments" from this phase's
// capability list.
async function getAttachment(messageId, attachmentId){

    if(!messageId || !attachmentId){
        throw new Error("A messageId and attachmentId are required");
    }

    return call(`/users/me/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`);

}


module.exports = { listMessages, getMessage, getAttachment };
