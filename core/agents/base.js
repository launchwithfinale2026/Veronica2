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

    async process(task, context = {}) {

        console.log(`[${this.name}] Processing task`);

        return {

            agent: this.name,

            department: this.department,

            role: this.role,

            intelligence: this.intelligence,

            mission: {

                task,

                context

            },

            analysis: {

                identity: this.intelligence.identity,

                mission: this.intelligence.mission,

                systemPrompt: this.intelligence.system,

                capabilities: this.capabilities,

                memories: context.memories || [],

                knowledge: context.knowledge || []

            },

            recommendations: [

                "Retrieve relevant memories",

                "Reason using system prompt",

                "Generate strategic response"

            ],

            response: `${this.name} analyzed "${task}" using its 
specialized intelligence.`,

            timestamp: new Date()

        };

    }

}

module.exports = Agent;
