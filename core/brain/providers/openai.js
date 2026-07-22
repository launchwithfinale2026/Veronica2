require("dotenv").config();

const OpenAI = require("openai");

class OpenAIProvider {

constructor(){

console.log("OPENAI KEY CHECK:",
process.env.OPENAI_API_KEY ? "FOUND" : "MISSING"
);

this.client = new OpenAI({
apiKey: process.env.OPENAI_API_KEY
});
console.log("[OPENAI BRAIN] Online");

}


async generate(prompt){

const response =
await this.client.chat.completions.create({

model:"gpt-4o",

messages:[
{
role:"user",
content:prompt
}
]

});


return {

response:
response.choices[0].message.content,

provider:"openai"

};


}


}


module.exports = OpenAIProvider;
