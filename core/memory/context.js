// ==================================
// VERONICA MEMORY CONTEXT ENGINE
// ==================================

const store = require("./store");


class MemoryContext {


    retrieve(query){

        return store.search(query);

    }



    remember(input){

        return store.remember(input);

    }


}


module.exports = new MemoryContext();
