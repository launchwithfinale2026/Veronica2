// ==================================
// VERONICA GOOGLE CALENDAR CONNECTOR
// ==================================
//
// Phase 19. Distinct from core/integrations/calendar.js (the older,
// provider-agnostic placeholder from Phase 7 -- see that file's own
// updated header comment): this is a concrete, real implementation
// specifically for Google Calendar, now that Google was the provider
// actually chosen and built. Read-only: read calendar / upcoming events
// / deadlines / reminders / schedule awareness, per this phase's
// capability list -- no createEvent() here (writing to someone's real
// calendar has real consequences and wasn't asked for).

const http = require("../http");
const oauth = require("./oauth");

const API_ROOT = "https://www.googleapis.com/calendar/v3";


async function call(pathname){

    const accessToken = await oauth.getAccessToken();

    const response = await http.request(`${API_ROOT}${pathname}`, {
        headers: { Authorization: `Bearer ${accessToken}` }
    });

    if(response.status >= 400){
        throw new Error(`Google Calendar API error ${response.status}: ${response.body}`);
    }

    return JSON.parse(response.body);

}


// timeMin defaults to now -- "upcoming events," not the whole history.
function listEvents({ calendarId = "primary", maxResults = 10, timeMin } = {}){

    const params = new URLSearchParams({
        maxResults: String(maxResults),
        timeMin: timeMin || new Date().toISOString(),
        singleEvents: "true",
        orderBy: "startTime"
    });

    return call(`/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`);

}


module.exports = { listEvents };
