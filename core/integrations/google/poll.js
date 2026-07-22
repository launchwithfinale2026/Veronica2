// ==================================
// VERONICA GOOGLE WORKSPACE POLLING
// ==================================
//
// Phase 19. Read-only polling across Gmail/Calendar/Drive, each new item
// ingested as an external event through the shared pipeline (see
// ../eventIngestion.js), tagged source:gmail/source:calendar/source:drive
// -- never a second memory system. Same dedupe-by-externalId shape as
// core/integrations/github.js's pollRepository(), so a job that runs on
// an interval (see core/automation/jobs.js) never re-ingests the same
// email/event/file twice.
//
// Gated on oauth.isAuthorized() (a real human has completed Google's
// consent screen), not just isConfigured() -- calling Gmail/Calendar/
// Drive with app credentials but no real token would just throw on the
// first call, so this checks the stronger condition up front and returns
// a clean, non-throwing "not authorized yet" result instead.

const oauth = require("./oauth");
const gmail = require("./gmail");
const calendar = require("./calendar");
const drive = require("./drive");
const eventIngestion = require("../eventIngestion");
const log = require("../../logging");


function alreadyIngestedExternalIds(source){

    return new Set(
        eventIngestion.recentEvents({ source })
            .map(entry => entry.metadata && entry.metadata.externalId)
            .filter(Boolean)
    );

}


// Gmail's list endpoint only returns {id, threadId} -- getMessage() per
// new id is needed for the real snippet/preview text. Costs one extra
// API call per NEW message only (already-ingested ones are skipped
// before ever calling getMessage()).
async function pollGmail({ maxResults = 10 } = {}){

    const seen = alreadyIngestedExternalIds("gmail");
    const list = await gmail.listMessages({ maxResults });
    const ingested = [];

    for(const item of (list.messages || [])){

        const externalId = `gmail:${item.id}`;

        if(seen.has(externalId)){
            continue;
        }

        const full = await gmail.getMessage(item.id);

        ingested.push(eventIngestion.ingest({
            source: "gmail",
            kind: "email",
            summary: `New email: ${full.snippet || "(no preview available)"}`,
            metadata: { externalId, messageId: item.id, threadId: item.threadId }
        }));

    }

    return ingested;

}


async function pollCalendar({ maxResults = 10 } = {}){

    const seen = alreadyIngestedExternalIds("calendar");
    const result = await calendar.listEvents({ maxResults });
    const ingested = [];

    for(const event of (result.items || [])){

        const externalId = `calendar:${event.id}`;

        if(seen.has(externalId)){
            continue;
        }

        const start = (event.start && (event.start.dateTime || event.start.date)) || null;

        ingested.push(eventIngestion.ingest({
            source: "calendar",
            kind: "event",
            summary: `Upcoming event: ${event.summary || "(untitled)"}${start ? ` at ${start}` : ""}`,
            occurredAt: start || undefined,
            metadata: { externalId, eventId: event.id, start, htmlLink: event.htmlLink }
        }));

    }

    return ingested;

}


async function pollDrive({ pageSize = 10 } = {}){

    const seen = alreadyIngestedExternalIds("drive");
    const result = await drive.listFiles({ pageSize });
    const ingested = [];

    for(const file of (result.files || [])){

        const externalId = `drive:${file.id}`;

        if(seen.has(externalId)){
            continue;
        }

        ingested.push(eventIngestion.ingest({
            source: "drive",
            kind: "file",
            summary: `New/changed Drive file: ${file.name}`,
            occurredAt: file.modifiedTime,
            metadata: { externalId, fileId: file.id, name: file.name, webViewLink: file.webViewLink }
        }));

    }

    return ingested;

}


// The single entry point the automation job (core/automation/jobs.js)
// calls -- never throws for "not authorized yet," matching every other
// credential-gated job's fail-closed posture.
async function pollAll(){

    if(!oauth.isAuthorized()){
        return { polled: false, reason: "Google not authorized yet -- complete the OAuth consent flow (see docs/EXTERNAL_INTEGRATIONS.md)." };
    }

    const [gmailEvents, calendarEvents, driveEvents] = await Promise.all([
        pollGmail(),
        pollCalendar(),
        pollDrive()
    ]);

    log.info("google-poll", `Ingested ${gmailEvents.length} email(s), ${calendarEvents.length} calendar event(s), ${driveEvents.length} drive file(s)`);

    return { polled: true, gmail: gmailEvents.length, calendar: calendarEvents.length, drive: driveEvents.length };

}


module.exports = { pollGmail, pollCalendar, pollDrive, pollAll };
