// ==================================
// VERONICA MESSAGE BUS
// CENTRAL EVENT SYSTEM
// ==================================

const EventEmitter = require("events");


class MessageBus extends EventEmitter {

    constructor(){

        super();

        console.log("[BUS] Message Bus Online");

    }


    publish(event, data){

        console.log(`[BUS] ${event}`);

        this.emit(event, data);

    }


    subscribe(event, callback){

        this.on(event, callback);

    }


    emit(event, data){

        super.emit(event, data);

    }


    on(event, callback){

        return super.on(event, callback);

    }


    status(){

        return {
            online:true,
            events:this.eventNames()
        };

    }

}


module.exports = new MessageBus();
