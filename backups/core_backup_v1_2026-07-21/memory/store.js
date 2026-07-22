const fs = require("fs");
const path = require("path");


const FILE = path.join(
    __dirname,
    "database.json"
);



function load(){

    const data = fs.readFileSync(
        FILE,
        "utf8"
    );

    return JSON.parse(data);

}



function save(data){

    fs.writeFileSync(
        FILE,
        JSON.stringify(
            data,
            null,
            4
        )
    );

}



function remember(memory){

    const data = load();

    data.memories.push({

        content: memory,

        timestamp:new Date()

    });


    save(data);


    return {
        status:"stored",
        memory
    };

}



function recall(){

    return load().memories;

}



module.exports = {

    remember,

    recall

};
