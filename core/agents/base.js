class Agent {

    constructor(config = {}) {

        this.name = config.name;
        this.department = config.department;
        this.role = config.role;

        this.capabilities = config.capabilities || [];
        this.status = "online";

        // Phase 25: which installed capability package this agent came
        // from, if any -- null for every base-roster agent (registry/agents.json).
        this.packageSource = config.packageSource || null;

        // NEW
        this.intelligence = config.intelligence || {
            identity: this.name,
            mission: this.role,
            system: ""
        };

    }

}

module.exports = Agent;
