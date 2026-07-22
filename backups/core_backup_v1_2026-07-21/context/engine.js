const memory = require("../memory");


class ContextEngine {


    build(task){

        return {

            task,

            memories:
                memory.view(),

            timestamp:
                new Date().toISOString()

        };

    }


}


module.exports = new ContextEngine();

