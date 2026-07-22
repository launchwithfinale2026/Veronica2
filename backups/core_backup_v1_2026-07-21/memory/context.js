// ==================================
// VERONICA MEMORY CONTEXT ENGINE
// ==================================

const memory = require("./store");


class MemoryContext {


    retrieve(query){

        const memories = memory.recall();


        if(!query){
            return memories;
        }


        const words = query
            .toLowerCase()
            .split(" ");


        return memories.filter(item=>{

            const text = item.content.toLowerCase();


            return words.some(word =>
                text.includes(word)
            );

        });


    }



    remember(content){

        return memory.remember(content);

    }


}


module.exports = new MemoryContext();

