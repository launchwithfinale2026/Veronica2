// ==================================
// VERONICA TOOL (base)
// ==================================

const learningLog = require("../learning/log");


class Tool {

    constructor({ id, description, permission, inputSchema, handler, packageSource }){

        this.id = id;
        this.description = description;
        this.permission = permission;
        this.inputSchema = inputSchema || { type: "object", properties: {} };
        this.handler = handler;
        // Mirrors Agent's own packageSource field (core/agents/base.js) --
        // null for a built-in tool, the owning package's name for one
        // loaded from an installed capability package. Lets
        // core/capabilities/health.js attribute a live tool back to its
        // package without re-deriving it from paths.
        this.packageSource = packageSource || null;

    }


    // `permissions` is the caller's granted permission list (from
    // identity/roles.json via core/identity). Every tool call is
    // permission-checked and error-wrapped — no tool can be invoked
    // without a documented permission, and no tool failure escapes as a
    // raw, unattributed exception. Every call (including a permission
    // denial) is also recorded to core/learning/log.js for
    // core/learning/engine.js's tool-performance stats -- this is the one
    // place every tool call passes through regardless of caller.
    async execute(args, permissions = []){

        const startedAt = Date.now();

        if(this.permission && !permissions.includes(this.permission)){

            learningLog.record({
                kind: "tool_call",
                tool: this.id,
                outcome: "failure",
                durationMs: Date.now() - startedAt,
                error: "permission_denied"
            });

            throw new Error(
                `Permission denied: tool "${this.id}" requires "${this.permission}"`
            );

        }

        try {

            const result = await this.handler(args);

            learningLog.record({
                kind: "tool_call",
                tool: this.id,
                outcome: "success",
                durationMs: Date.now() - startedAt
            });

            return result;

        } catch(error){

            learningLog.record({
                kind: "tool_call",
                tool: this.id,
                outcome: "failure",
                durationMs: Date.now() - startedAt,
                error: error.message
            });

            throw new Error(
                `Tool "${this.id}" failed: ${error.message}`
            );

        }

    }

}


module.exports = Tool;
