// ==================================
// VERONICA KNOWLEDGE ENGINE
// ==================================


const memory = require("../memory");


class Knowledge {



    analyze(input){


        const result = {


            query: input,


            analysis:
            "Knowledge analysis complete",


            timestamp:
            new Date().toISOString()


        };


        memory.remember(
            "events",
            input
        );


        return result;


    }



    search(term){


        const memories =
        memory.recall("events");


        return memories.filter(
            item =>
            item.content
            .toLowerCase()
            .includes(
                term.toLowerCase()
            )
        );


    }



}


module.exports = new Knowledge();
const fs = require("fs");
const path = require("path");


class KnowledgeGraph {


constructor(){


this.file =
path.join(__dirname,"graph.json");


this.initialize();


}



initialize(){


if(!fs.existsSync(this.file)){


fs.writeFileSync(

this.file,

JSON.stringify({

entities:[],

relationships:[]

},null,2)

);


}


}




addEntity(entity){


let graph=this.read();



graph.entities.push(entity);



this.write(graph);



console.log(
"[KNOWLEDGE] Entity created"
);



return entity;



}





addRelationship(connection){


let graph=this.read();



graph.relationships.push(connection);



this.write(graph);



console.log(
"[KNOWLEDGE] Relationship created"
);



return connection;



}





find(name){


let graph=this.read();



return graph.entities.filter(entity=>

entity.name
.toLowerCase()
.includes(
name.toLowerCase()
)

);



}





read(){


return JSON.parse(

fs.readFileSync(
this.file
)

);


}





write(data){


fs.writeFileSync(

this.file,

JSON.stringify(
data,
null,
2
)

);


}



}




module.exports = new KnowledgeGraph();
