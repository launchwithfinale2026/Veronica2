const bus = require("../bus");


bus.subscribe(
"system.ready",
(data)=>{
    console.log(
    "VERONICA received:",
    data
    );
});


bus.publish(
"system.ready",
{
message:"Executive Core online"
});
