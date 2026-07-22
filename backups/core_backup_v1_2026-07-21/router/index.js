class Router {

    constructor(agents){

        this.agents = Array.isArray(agents)
            ? agents
            : [];

        console.log("[ROUTER] Online");

    }


    findAgent(command){

        const text = command.toLowerCase();


        let best = null;


        for(const agent of this.agents){

            const matches = agent.capabilities.filter(cap =>
                text.includes(cap.toLowerCase())
            );


            if(matches.length > 0){
                best = agent;
                break;
            }

        }


        if(!best){

            best = this.agents.find(agent =>
                text.includes(agent.department.toLowerCase())
            );

        }


        return best || this.agents[0];

    }



    async route(command, context={}){


        console.log(
            `[ROUTER] Processing command: ${command}`
        );


        const selected = this.findAgent(command);



        if(!selected){

            return {
                error:"No agents available"
            };

        }



        console.log(
            `[ROUTER] Selected agent: ${selected.name}`
        );



        const result = await selected.process({

            task: command,

            context

        });



        return {

            agent:selected.name,

            department:selected.department,

            role:selected.role,

            response:result,

            timestamp:new Date().toISOString()

        };


    }


}


module.exports = Router;
