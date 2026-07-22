class Agent {

    constructor(config = {}) {

        this.name = config.name;
        this.department = config.department;
        this.role = config.role;

        this.capabilities = config.capabilities || [];
        this.status = "online";

        // NEW
        this.intelligence = config.intelligence || {
            identity: this.name,
            mission: this.role,
            system: ""
        };

    }

}

module.exports = Agent;
