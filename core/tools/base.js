// ==================================
// VERONICA TOOL (base)
// ==================================

class Tool {

    constructor({ id, description, permission, inputSchema, handler }){

        this.id = id;
        this.description = description;
        this.permission = permission;
        this.inputSchema = inputSchema || { type: "object", properties: {} };
        this.handler = handler;

    }


    // `permissions` is the caller's granted permission list (from
    // identity/roles.json via core/identity). Every tool call is
    // permission-checked and error-wrapped — no tool can be invoked
    // without a documented permission, and no tool failure escapes as a
    // raw, unattributed exception.
    async execute(args, permissions = []){

        if(this.permission && !permissions.includes(this.permission)){

            throw new Error(
                `Permission denied: tool "${this.id}" requires "${this.permission}"`
            );

        }

        try {

            return await this.handler(args);

        } catch(error){

            throw new Error(
                `Tool "${this.id}" failed: ${error.message}`
            );

        }

    }

}


module.exports = Tool;
