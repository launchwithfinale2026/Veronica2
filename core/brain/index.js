const BrainProvider = require("./provider");


class Brain {


    constructor(){

        this.provider = new BrainProvider();

        console.log("[BRAIN] Online");

    }


    async process(input, options){

        const result =
            await this.provider.generate(input, options);


        return result;

    }


}


module.exports = Brain;
