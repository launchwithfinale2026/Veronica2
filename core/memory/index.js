const store = require("./store");
const context = require("./context");

module.exports = {

    remember(memory){
        return store.remember(memory);
    },

    view(){
        return store.recall();
    },

    retrieve(query){
        return context.retrieve(query);
    },

    search(query, options){
        return store.search(query, options);
    },

    filter(criteria, options){
        return store.filter(criteria, options);
    },

    types: store.TYPES

};
