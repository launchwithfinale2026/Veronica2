const bus = require("../bus/index.js");


function attachAgentListeners(agents){

    agents.forEach(agent => {

        bus.subscribe(
            "agent.command",
            (data)=>{

                if(data.agent === agent.name){

                    console.log("");

                    console.log(
                        `[${agent.name}] ACTIVATED`
                    );


                    agent.receive(
                        data.command
                    );


                    bus.publish(
                        "agent.response",
                        {
                            agent: agent.name,
                            response:
                            `${agent.name} completed analysis.`
                        }
                    );

                }

            }
        );

    });

}


module.exports = attachAgentListeners;
