// ==================================
// VERONICA VOICE -- SPEECH FORMATTING
// ==================================
//
// Task 3 (Phase 44). Converts a raw agent/Router response into text
// that reads naturally when spoken -- deterministic, rule-based text
// reshaping only, never an LLM call and never new content: "do not
// alter factual meaning, do not invent information, only optimize for
// speech clarity."
//
// Deliberate, honest scope limitation: Phase 44's own example
// ("Agent count: 9. Memory status: healthy. Event bus: active." ->
// "All systems are healthy. Nine agents are online, memory is
// operational, and the event bus is active.") includes an opening
// summary sentence ("All systems are healthy") that is not literally
// present in the input -- producing that reliably for arbitrary future
// agent text would mean either a domain-specific rule for every
// possible status shape (fragile, and wrong the moment one status
// ISN'T healthy) or an actual LLM pass (which "do not invent
// information" argues against for something this structural). This
// formatter instead performs the safe, general, meaning-preserving part
// of that example: turning literal "Label: value." clauses into
// natural "label is value" phrasing and joining multiple clauses with
// natural conjunctions -- real speech-clarity optimization, nothing
// invented. It does not convert digits to word form either -- Piper
// (like any real neural TTS model) already normalizes "9" to "nine"
// itself; doing that here too would risk introducing a second,
// possibly inconsistent rule for something the TTS engine already
// handles correctly.

// Splits into real sentence-shaped clauses. Assumes ". " as a sentence
// boundary (the shape every example and every real status-report
// generator in this codebase already uses -- e.g.
// core/system/healthScore.js's breakdown, core/system/
// operationalReadiness.js's checklist).
function splitClauses(text){

    return text
        .split(/\.\s+/)
        .map(clause => clause.trim().replace(/\.$/, ""))
        .filter(Boolean);

}


// "Agent count: 9" -> "agent count is 9". A real, narrow, meaning-
// preserving rephrase of an explicit "Label: value" shape -- anything
// that isn't that literal shape is left completely untouched, since
// altering it without a clear, verifiable rule risks changing meaning.
function clauseToNatural(clause){

    const match = clause.match(/^([^:]+):\s*(.+)$/);

    if(!match){
        return clause;
    }

    const label = match[1].trim();
    const value = match[2].trim();

    const lowerFirstLabel = label.charAt(0).toLowerCase() + label.slice(1);

    return `${lowerFirstLabel} is ${value}`;

}


// Natural-sounding conjunction joining -- "a, b, and c." instead of
// "a. b. c." (three separate flat sentences read awkwardly aloud).
function joinNaturally(clauses){

    if(clauses.length === 0){
        return "";
    }

    if(clauses.length === 1){
        return clauses[0];
    }

    return `${clauses.slice(0, -1).join(", ")}, and ${clauses[clauses.length - 1]}`;

}


function format(text){

    if(!text || !text.trim()){
        return text;
    }

    const clauses = splitClauses(text).map(clauseToNatural);

    return `${joinNaturally(clauses)}.`;

}


module.exports = { format };
