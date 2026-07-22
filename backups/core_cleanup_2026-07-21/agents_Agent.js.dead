// ==================================
// VERONICA AGENT CORE
// ==================================

const bus = require("../bus");


class Agent {


    constructor(config){

        this.name = config.name;
        this.role = config.role;
        this.department = config.department;
        this.status = "offline";

        this.memory = [];


    }



    boot(){

        this.status = "online";

        console.log(`[AGENT ONLINE] ${this.name}`);

        return this;

    }



    receive(command){

        console.log("");

        console.log(`[${this.name}] ACTIVATED`);

        console.log("");

        console.log(`[${this.name}] COMMAND:`);

        console.log(command);


        return this.execute(command);

    }



    execute(command){


        const response = {

            agent:this.name,

            department:this.department,

            role:this.role,

            response:
            `${this.name} completed analysis of: ${command}`,

            timestamp:
            new Date().toISOString()

        };


        this.memory.push({

            command,

            response,

            timestamp:
            new Date().toISOString()

        });



        try {

            bus.emit(
                "agent.response",
                response
            );

        }

        catch(error){

            console.log(
                "[BUS WARNING]",
                error.message
            );

        }


        return response;


    }



    statusReport(){

        return {

            name:this.name,

            role:this.role,

            department:this.department,

            status:this.status,

            memories:this.memory.length

        };

    }


}


module.exports = Agent;
