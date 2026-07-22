// ==================================
// VERONICA MULTI-AGENT COLLABORATION
// ==================================
//
// Agent-to-agent interaction: communication, delegation, review/critique,
// and consensus voting between departments' agents. Distinct from task
// handoff (core/executive/projectManager.js's reassignDepartment()),
// which transfers ownership of a project rather than agents talking to
// each other.
//
// Constructed with an already-loaded `departments` array (DepartmentManager
// instances with real agents/intelligence attached) rather than being a
// self-contained singleton like core/executive/core/learning/core/
// automation -- same reasoning as core/router/index.js's Router class:
// it needs the caller's already-loaded departments, not a second set
// constructed internally (which would mean 9 more IntelligenceEngine/
// Brain instances alongside the ones terminal.js/dashboard already built).
// See docs/Architecture.md "Multi-Agent Collaboration".
//
// Every operation here is human/dashboard/terminal-triggered, not
// agent-initiated -- an agent doesn't autonomously decide mid-reasoning to
// delegate or call a vote. That would require wiring this into the tool-use
// loop (core/brain/providers/claude.js), a materially bigger and more
// security-sensitive change (agent-initiated multi-agent orchestration)
// than this pass asked for.

const memory = require("../memory");
const knowledge = require("../knowledge");
const bus = require("../bus");

const COLLABORATION_TAG = "collaboration";


function stripFences(text){
    return text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
}


function parseReview(text){

    let parsed;

    try {
        parsed = JSON.parse(stripFences(text));
    } catch(error){
        throw new Error(`Review response was not valid JSON: ${error.message}`);
    }

    if(!parsed || !["approve", "revise", "reject"].includes(parsed.verdict)){
        throw new Error("Review response must have a \"verdict\" of \"approve\", \"revise\", or \"reject\"");
    }

    return {
        verdict: parsed.verdict,
        feedback: Array.isArray(parsed.feedback) ? parsed.feedback : []
    };

}


function parseVote(text){

    let parsed;

    try {
        parsed = JSON.parse(stripFences(text));
    } catch(error){
        throw new Error(`Vote response was not valid JSON: ${error.message}`);
    }

    if(!parsed || !["yes", "no", "abstain"].includes(parsed.vote)){
        throw new Error("Vote response must have a \"vote\" of \"yes\", \"no\", or \"abstain\"");
    }

    return {
        vote: parsed.vote,
        reasoning: typeof parsed.reasoning === "string" ? parsed.reasoning : ""
    };

}


class CollaborationEngine {

    static TAG = COLLABORATION_TAG;

    constructor(departments){

        this.departments = departments || [];

    }


    find(departmentId){

        const department = this.departments.find(dept => dept.id === departmentId);

        if(!department){
            throw new Error(`Unknown department: "${departmentId}"`);
        }

        return department;

    }


    primaryAgentName(department){

        return (department.agents[0] && department.agents[0].name) || department.id;

    }


    record(kind, tags, content, metadata){

        const entry = memory.remember({
            content,
            type: "decisions",
            importance: 3,
            tags: [COLLABORATION_TAG, kind, ...tags],
            source: "collaboration-engine",
            metadata: { kind, ...metadata }
        });

        return entry;

    }


    // Lightweight agent-to-agent communication: a note logged and
    // graph-linked between two agents, no reasoning call -- distinct from
    // delegate() below, which actually invokes the receiving agent.
    sendMessage(fromDepartmentId, toDepartmentId, message){

        if(!message){
            throw new Error("A message is required");
        }

        const from = this.find(fromDepartmentId);
        const to = this.find(toDepartmentId);

        const entry = this.record(
            "message",
            [from.id, to.id],
            message,
            { from: from.id, to: to.id }
        );

        knowledge.addRelationship({
            from: this.primaryAgentName(from),
            to: this.primaryAgentName(to),
            type: "messaged"
        });

        const result = { id: entry.id, from: from.id, to: to.id, message, timestamp: entry.created };

        bus.publish("collaboration.message", result);

        return result;

    }


    // Delegation: fromDepartment hands a task to toDepartment, which
    // actually runs it via real reasoning (DepartmentManager.run(), the
    // same path a direct department run uses) -- the result is attributed
    // back to the delegator, not just logged as a note.
    async delegate(fromDepartmentId, toDepartmentId, task){

        if(!task){
            throw new Error("A task is required");
        }

        const from = this.find(fromDepartmentId);
        const to = this.find(toDepartmentId);

        const outcome = await to.run(task);

        const entry = this.record(
            "delegation",
            [from.id, to.id],
            `${from.id} delegated to ${to.id}: ${task}`,
            { from: from.id, to: to.id, task, response: outcome.response }
        );

        knowledge.addRelationship({
            from: this.primaryAgentName(from),
            to: this.primaryAgentName(to),
            type: "delegatesTo"
        });

        const result = {
            id: entry.id,
            from: from.id,
            to: to.id,
            agent: outcome.agent,
            task,
            response: outcome.response
        };

        bus.publish("collaboration.delegated", result);

        return result;

    }


    // Review/critique: reviewerDepartment's agent evaluates `content`
    // (e.g. another agent's prior output, a document, a plan) via real
    // reasoning, returning a structured verdict + feedback rather than
    // free text -- so a caller can act on it programmatically (e.g. only
    // proceed on "approve").
    async review(reviewerDepartmentId, content, { criteria } = {}){

        if(!content){
            throw new Error("Content to review is required");
        }

        const reviewer = this.find(reviewerDepartmentId);

        const task = `Review the following for quality, correctness, and completeness${criteria ? ` against these criteria: ${criteria}` : ""}. Respond with ONLY a valid JSON object, no prose, matching exactly: {"verdict": "approve"|"revise"|"reject", "feedback": ["string", ...]}.\n\nContent to review:\n${content}`;

        const outcome = await reviewer.run(task);
        const parsed = parseReview(outcome.response);

        const entry = this.record(
            "review",
            [reviewer.id],
            `${reviewer.id} reviewed content: ${parsed.verdict}`,
            { reviewer: reviewer.id, content, ...parsed }
        );

        const result = {
            id: entry.id,
            reviewer: reviewer.id,
            agent: outcome.agent,
            verdict: parsed.verdict,
            feedback: parsed.feedback
        };

        bus.publish("collaboration.reviewed", result);

        return result;

    }


    // Consensus: every named department votes on `proposal` independently
    // (in parallel -- votes shouldn't see each other's reasoning, or it
    // isn't independent consensus, it's the first agent's opinion
    // cascading through the rest), aggregated into a majority decision.
    async consensus(departmentIds, proposal){

        if(!proposal){
            throw new Error("A proposal is required");
        }

        if(!departmentIds || departmentIds.length < 2){
            throw new Error("Consensus requires at least 2 departments");
        }

        const departments = departmentIds.map(id => this.find(id));

        const task = `Vote on this proposal. Respond with ONLY a valid JSON object, no prose, matching exactly: {"vote": "yes"|"no"|"abstain", "reasoning": "string"}.\n\nProposal:\n${proposal}`;

        const votes = await Promise.all(departments.map(async department => {

            const outcome = await department.run(task);
            const parsed = parseVote(outcome.response);

            return { department: department.id, agent: outcome.agent, ...parsed };

        }));

        const tally = {
            yes: votes.filter(v => v.vote === "yes").length,
            no: votes.filter(v => v.vote === "no").length,
            abstain: votes.filter(v => v.vote === "abstain").length
        };

        const decision = tally.yes > tally.no ? "approved" : (tally.no > tally.yes ? "rejected" : "tied");

        const entry = this.record(
            "consensus",
            departmentIds,
            `Consensus on "${proposal}": ${decision}`,
            { proposal, votes, tally, decision }
        );

        const result = { id: entry.id, proposal, votes, tally, decision };

        bus.publish("collaboration.consensus", result);

        return result;

    }


    history(limit = 20){

        return memory.filter({ tag: COLLABORATION_TAG }, { limit })
            .map(entry => ({
                id: entry.id,
                kind: entry.metadata.kind,
                content: entry.content,
                ...entry.metadata,
                created: entry.created
            }));

    }

}


module.exports = CollaborationEngine;
