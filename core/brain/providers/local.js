class LocalProvider {

    constructor(){

        console.log("[LOCAL BRAIN] Online");

    }


    async generate(prompt){

        return {

            response:
`
VERONICA INTERNAL REASONING

Input received:

${prompt.substring(0,500)}


Current capability:

- Agent identity loaded
- Memory context loaded
- Mission understood
- Reasoning provider active


Status:

Waiting for advanced cognition provider.

`,

            provider:"local"

        };

    }

}


module.exports = LocalProvider;
