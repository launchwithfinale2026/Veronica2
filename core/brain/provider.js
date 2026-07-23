const LocalProvider = require("./providers/local");
const ClaudeProvider = require("./providers/claude");
const OpenAIProvider = require("./providers/openai");


const PROVIDER_CLASSES = {

    local: LocalProvider,

    claude: ClaudeProvider,

    openai: OpenAIProvider

};


class BrainProvider {


    constructor(){

        this.providers = {};

        for(const [name, ProviderClass] of Object.entries(PROVIDER_CLASSES)){

            try {

                this.providers[name] = new ProviderClass();

            } catch(error){

                console.log(
                    `[BRAIN PROVIDER] Skipped "${name}":`,
                    error.message
                );

            }

        }


        // Order in which providers are tried when the active one fails.
        // "local" is last on purpose — it's a canned-response provider,
        // the fallback of last resort, not a peer to real model providers.
        this.fallbackOrder = ["claude", "openai", "local"];

        this.active =
            process.env.BRAIN_PROVIDER ||
            this.fallbackOrder.find(name => this.providers[name]) ||
            "local";


        if(!this.providers[this.active]){

            this.active =
                this.fallbackOrder.find(name => this.providers[name]) ||
                "local";

        }


        console.log(
            "[BRAIN PROVIDER] Initialized:",
            this.active
        );

    }



    async generate(prompt, options){


        const order = [
            this.active,
            ...this.fallbackOrder.filter(name => name !== this.active)
        ];


        let lastError;

        for(const name of order){

            const provider = this.providers[name];

            if(!provider){
                continue;
            }

            try {

                return await provider.generate(prompt, options);

            } catch(error){

                lastError = error;

                console.log(
                    `[BRAIN PROVIDER] "${name}" failed, trying next:`,
                    error.message
                );

            }

        }


        throw lastError || new Error(
            "Brain provider unavailable: " + this.active
        );


    }



    use(name){


        if(this.providers[name]){

            this.active = name;


            console.log(
                "[BRAIN PROVIDER] Switched:",
                name
            );


            return true;

        }


        console.log(
            "[BRAIN PROVIDER] Unknown provider:",
            name
        );


        return false;


    }



    list(){


        return Object.keys(
            this.providers
        );


    }


    // Phase 36 (Connector Completion -- "report status"): Claude/OpenAI
    // didn't have a way to report their own real state before this --
    // which providers actually initialized (a missing API key means a
    // provider is simply absent from this.providers, per the constructor
    // above), which one is currently active, and the real fallback order
    // this class already uses when the active one fails.
    status(){

        return Object.keys(PROVIDER_CLASSES).map(name => ({
            name,
            configured: Boolean(this.providers[name]),
            active: name === this.active
        }));

    }


}


module.exports = BrainProvider;

