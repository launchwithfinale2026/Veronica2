// ==================================
// VERONICA EMAIL CONNECTOR (placeholder)
// ==================================
//
// Interface-only, same reasoning as core/integrations/calendar.js:
// "email" could mean raw SMTP, or a transactional API (SendGrid, SES,
// Postmark, Mailgun) -- each with a different auth model and none
// specified by this milestone. This gives the rest of the system a
// stable shape (isConfigured()/status(), send()) and a registry entry,
// without guessing at a provider.
//
// To make this real: pick a provider. An SMTP-based implementation would
// need a new dependency (Node has no built-in SMTP client) -- worth
// flagging explicitly, since this project has otherwise avoided adding
// dependencies beyond what's already in package.json. A transactional-API
// provider (SendGrid/SES/etc.) could instead reuse
// core/integrations/http.js's existing request() the same way
// core/integrations/github.js does, with no new dependency at all --
// that path is more consistent with this codebase's stated conventions.

const credentialManager = require("./credentialManager");

const REQUIRED_ENV = credentialManager.CONNECTORS.email.required;


function isConfigured(){
    return credentialManager.isConfigured("email");
}


function notImplemented(action){
    throw new Error(
        `Email.${action}() is not implemented yet -- this connector is a placeholder awaiting a concrete provider choice. See core/integrations/email.js.`
    );
}


function send(){
    notImplemented("send");
}


function status(){

    return {
        id: "email",
        configured: isConfigured(),
        implemented: false,
        requiredEnv: REQUIRED_ENV,
        note: "Placeholder -- no concrete provider chosen yet. See core/integrations/email.js."
    };

}


module.exports = { isConfigured, status, send };
