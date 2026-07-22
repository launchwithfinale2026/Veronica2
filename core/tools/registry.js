const identity = require("../identity");


class ToolRegistry {

    constructor(){

        this.tools = new Map();

    }


    register(tool){

        this.tools.set(tool.id, tool);

    }


    list(){

        return [...this.tools.values()].map(tool => ({
            id: tool.id,
            description: tool.description,
            permission: tool.permission,
            inputSchema: tool.inputSchema
        }));

    }


    // `role` identifies the caller (an identity/roles.json id, e.g.
    // "agent", "department_manager", "executive") — the permission check
    // happens inside Tool.execute() using that role's granted
    // permissions.
    async run(toolId, args, { role = "agent" } = {}){

        const tool = this.tools.get(toolId);

        if(!tool){
            throw new Error(`Unknown tool: "${toolId}"`);
        }

        const permissions = identity.permissionsForRole(role);

        return tool.execute(args, permissions);

    }

}


module.exports = ToolRegistry;
