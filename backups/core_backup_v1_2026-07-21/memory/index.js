// ==================================
// VERONICA MEMORY INTERFACE
// ==================================

const store = require("./store");



function remember(input){

    return store.remember(input);

}



function view(){

    return store.recall();

}



module.exports = {

    remember,

    view

};
