const readline = require("readline");


const Router = require("../router");

const loadAgents = require("../agents/loader");

const memory = require("../memory");


const agents = loadAgents();


const router = new Router(agents);



console.log("[BUS] Message Bus Online");



console.log(`

================================

        VERONICA TERMINAL

             ONLINE

================================


Identity:

VERONICA


Agents:

${agents.length}


Commands:


system.status

agents.list

memory.view

remember <memory>

ask <command>

exit


================================

`);




const rl = readline.createInterface({

    input:process.stdin,

    output:process.stdout

});





async function handle(command){



    if(command==="exit"){

        console.log("VERONICA OFFLINE");

        process.exit();

    }



    if(command==="system.status"){

        console.log({

            status:"online",

            agents:agents.length

        });

        return;

    }



    if(command==="agents.list"){


        console.log(
            agents.map(a=>a.name)
        );


        return;

    }




    if(command==="memory.view"){

        console.log(memory.view());

        return;

    }





    if(command.startsWith("remember ")){

        const text =
        command.replace("remember ","");


        console.log(
            memory.remember(text)
        );


        return;

    }





    if(command.startsWith("ask ")){

        const task =
        command.replace("ask ","");


        const result =
        await router.route(task, {
            memories:memory.view()
        });


        console.dir(
            result,
            {
                depth:null
            }
        );


        return;

    }



    console.log("Unknown command");


}





function prompt(){

    rl.question(
        "VERONICA > ",
        async answer=>{

            await handle(answer);

            prompt();

        }

    );

}



prompt();
