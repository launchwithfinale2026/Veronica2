require("dotenv").config();

const Anthropic = require("@anthropic-ai/sdk");

const { buildToolDefinitions } = require("../../tools/anthropicSchema");
const tools = require("../../tools");


const MODEL = "claude-sonnet-4-5";
const MAX_TOKENS = 2000;
const MAX_TOOL_TURNS = 5;


class ClaudeProvider {

    // `client` is injectable so tests can supply a fake Anthropic client
    // instead of hitting the real API for every test of the tool-use loop.
    constructor(client){

        console.log("CLAUDE KEY CHECK:",
            process.env.ANTHROPIC_API_KEY ? "FOUND" : "MISSING"
        );

        this.client = client || new Anthropic({
            apiKey: process.env.ANTHROPIC_API_KEY
        });

        console.log("[CLAUDE BRAIN] Online");

    }


    async generate(prompt, options = {}){

        if(!options.useTools){
            return this.generateOnce(prompt);
        }

        return this.generateWithTools(prompt, options);

    }


    async generateOnce(prompt){

        const response = await this.client.messages.create({
            model: MODEL,
            max_tokens: MAX_TOKENS,
            messages: [{ role: "user", content: prompt }]
        });

        return {
            response: response.content[0].text,
            provider: "claude"
        };

    }


    // Vision (Autonomous Operations follow-on, Phase 16 of this run's own
    // continuation): Claude's Messages API already accepts image content
    // blocks natively -- no new dependency, no OCR library, no separate
    // vision service. Deliberately lives only on ClaudeProvider, not the
    // shared generate()/BrainProvider fallback chain: that chain exists
    // for text-generation resilience (falling back to local/openai when
    // Claude is unavailable), and silently falling back to a non-vision-
    // capable provider for an image task would return a confidently wrong
    // answer instead of a clear "vision isn't available" error. See
    // core/vision/index.js, the one caller of this method.
    async analyzeImage(base64Data, mediaType, prompt){

        const response = await this.client.messages.create({
            model: MODEL,
            max_tokens: MAX_TOKENS,
            messages: [{
                role: "user",
                content: [
                    { type: "image", source: { type: "base64", media_type: mediaType, data: base64Data } },
                    { type: "text", text: prompt }
                ]
            }]
        });

        return {
            response: response.content[0].text,
            provider: "claude"
        };

    }


    // Runs the real Anthropic tool-use loop: offer the tool registry,
    // execute any tool_use blocks Claude returns through the same
    // permission-checked, sandboxed core/tools registry everything else
    // uses, feed the results back, and repeat until Claude gives a final
    // text answer or MAX_TOOL_TURNS is hit (a hard stop against a
    // runaway loop, not expected to be reached in normal use).
    async generateWithTools(prompt, { role = "agent", maxTurns = MAX_TOOL_TURNS } = {}){

        const { definitions, nameToId } = buildToolDefinitions();

        const messages = [{ role: "user", content: prompt }];

        const toolCalls = [];

        for(let turn = 0; turn < maxTurns; turn++){

            const response = await this.client.messages.create({
                model: MODEL,
                max_tokens: MAX_TOKENS,
                tools: definitions,
                messages
            });

            messages.push({ role: "assistant", content: response.content });

            if(response.stop_reason !== "tool_use"){

                const textBlock = response.content.find(block => block.type === "text");

                return {
                    response: textBlock ? textBlock.text : "",
                    provider: "claude",
                    toolCalls
                };

            }

            const toolUseBlocks = response.content.filter(block => block.type === "tool_use");

            const toolResults = [];

            for(const block of toolUseBlocks){

                const toolId = nameToId.get(block.name);

                let resultContent;

                try {

                    const result = await tools.run(toolId, block.input, { role });

                    resultContent = JSON.stringify(result);

                    toolCalls.push({ tool: toolId, input: block.input, ok: true });

                } catch(error){

                    resultContent = JSON.stringify({ error: error.message });

                    toolCalls.push({ tool: toolId, input: block.input, ok: false, error: error.message });

                }

                toolResults.push({
                    type: "tool_result",
                    tool_use_id: block.id,
                    content: resultContent
                });

            }

            messages.push({ role: "user", content: toolResults });

        }

        return {
            response: "(tool use turn limit reached without a final answer)",
            provider: "claude",
            toolCalls
        };

    }

}


module.exports = ClaudeProvider;
