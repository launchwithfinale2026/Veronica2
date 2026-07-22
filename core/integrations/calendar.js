// ==================================
// VERONICA CALENDAR CONNECTOR (placeholder)
// ==================================
//
// Interface-only, unlike core/integrations/github.js/discord.js in this
// same directory. "Calendar" isn't one API -- Google Calendar, Outlook/
// Microsoft Graph, and CalDAV all have materially different auth
// (OAuth2 with refresh tokens vs. app passwords) and data models, and
// picking one here would mean guessing at a provider this milestone
// never specified. This still gives the rest of the system a stable
// shape to call (isConfigured()/status(), listEvents()/createEvent())
// and a registry entry to discover it, per the milestone's own framing:
// "prepare connectors... do not require live credentials."
//
// To make this real: pick a provider, implement its OAuth2 flow
// (probably needs a small addition to core/integrations/http.js or a
// sibling for handling token refresh -- today's request() assumes a
// caller already has a valid credential to attach as a header), and
// replace the two NOT_IMPLEMENTED throws below.

const REQUIRED_ENV = ["CALENDAR_PROVIDER", "CALENDAR_ACCESS_TOKEN"];


function isConfigured(){
    return REQUIRED_ENV.every(name => Boolean(process.env[name]));
}


function notImplemented(action){
    throw new Error(
        `Calendar.${action}() is not implemented yet -- this connector is a placeholder awaiting a concrete provider choice (Google Calendar, Microsoft Graph, or CalDAV). See core/integrations/calendar.js.`
    );
}


function listEvents(){
    notImplemented("listEvents");
}


function createEvent(){
    notImplemented("createEvent");
}


function status(){

    return {
        id: "calendar",
        configured: isConfigured(),
        implemented: false,
        requiredEnv: REQUIRED_ENV,
        note: "Placeholder -- no concrete provider chosen yet. See core/integrations/calendar.js."
    };

}


module.exports = { isConfigured, status, listEvents, createEvent };
