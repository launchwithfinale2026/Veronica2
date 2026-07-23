// ==================================
// VERONICA MEETING SUMMARIES
// ==================================
//
// Phase 46 (Business Operations Division production-readiness). A
// meeting summary is real, structured record of what was discussed and
// decided -- distinct from core/executive/companyManager.js's
// logCommunication() (a free-text summary + channel), which has no
// place for attendees, decisions, or trackable action items. Ordinary
// memory entries, same pattern as everything else.

const memory = require("../memory");

const MEETING_TAG = "operations-meeting";


function toMeeting(entry){

    const meta = entry.metadata || {};

    return {
        id: entry.id,
        title: entry.content,
        attendees: meta.attendees || [],
        decisions: meta.decisions || [],
        actionItems: meta.actionItems || [],
        date: meta.date || entry.created,
        created: entry.created,
        updated: entry.updated
    };

}


function requireEntry(id){

    const entry = memory.view().find(m => m.id === id && (m.tags || []).includes(MEETING_TAG));

    if(!entry){
        throw new Error(`Unknown meeting: "${id}"`);
    }

    return entry;

}


// input: { title, attendees?, decisions?, actionItems?: [{text, owner?}], date? }
function createMeeting(input = {}){

    if(!input.title){
        throw new Error("A meeting title is required");
    }

    const actionItems = (input.actionItems || []).map((item, index) => ({
        id: `action-${index}`,
        text: item.text,
        owner: item.owner || null,
        done: false
    }));

    const entry = memory.remember({
        content: input.title,
        type: "businesses",
        importance: 3,
        tags: [MEETING_TAG],
        source: "operations-meetings",
        metadata: {
            attendees: input.attendees || [],
            decisions: input.decisions || [],
            actionItems,
            date: input.date || new Date().toISOString()
        }
    });

    return toMeeting(entry);

}


function listMeetings(){
    return memory.filter({ tag: MEETING_TAG }).map(toMeeting);
}


function getMeeting(meetingId){
    return toMeeting(requireEntry(meetingId));
}


function completeActionItem(meetingId, actionItemId){

    const entry = requireEntry(meetingId);

    const actionItems = (entry.metadata.actionItems || []).map(item =>
        item.id === actionItemId ? { ...item, done: true } : item
    );

    if(!actionItems.some(item => item.id === actionItemId)){
        throw new Error(`Unknown action item: "${actionItemId}"`);
    }

    const updated = memory.update(meetingId, { metadata: { actionItems } });

    return toMeeting(updated);

}


module.exports = { MEETING_TAG, createMeeting, listMeetings, getMeeting, completeActionItem };
