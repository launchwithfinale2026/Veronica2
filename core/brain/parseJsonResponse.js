// ==================================
// VERONICA — SHARED LLM JSON RESPONSE PARSER
// ==================================
//
// Strips a markdown code fence (```json ... ``` or ``` ... ```) a model
// sometimes wraps JSON in despite being asked for "JSON only," then
// parses it. This is the shared primitive behind every place in this
// project that expects one structured JSON document back from an LLM
// call: GoalDecomposer, MemoryConsolidation, LearningEngine, and
// CollaborationEngine's review()/consensus() each had this exact same
// ~10 lines duplicated verbatim. Extracted here with zero behavior
// change -- `label` preserves each call site's own error message wording
// (e.g. "Decomposition response was not valid JSON: ...").

function parseJsonResponse(text, label){

    const stripped = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");

    try {
        return JSON.parse(stripped);
    } catch(error){
        throw new Error(`${label} was not valid JSON: ${error.message}`);
    }

}


module.exports = { parseJsonResponse };
