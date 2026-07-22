// ==================================
// VERONICA VISION
// ==================================
//
// Image understanding via Claude's native multimodal support -- no new
// dependency, no OCR library, no separate vision service (see
// core/brain/providers/claude.js's analyzeImage() for why this is
// Claude-only, not routed through the shared provider fallback chain).
// Same sandboxing pattern as core/tools/handlers/filesystem.js: images
// must live in data/workspace/, the same sandboxed root every other
// filesystem-touching tool already uses -- no new trust boundary
// introduced for this capability.

const fs = require("fs");
const path = require("path");

const ClaudeProvider = require("../brain/providers/claude");
const memory = require("../memory");
const knowledge = require("../knowledge");

const SANDBOX_ROOT = path.join(__dirname, "../../data/workspace");

const MEDIA_TYPES = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp"
};

const DEFAULT_PROMPT = "Describe this image in detail. If it contains text, transcribe it verbatim. If it's a diagram, chart, or screenshot, explain its structure and content.";


function resolveSafePath(relativePath){

    if(typeof relativePath !== "string" || !relativePath){
        throw new Error("A relative image path is required");
    }

    const resolved = path.resolve(SANDBOX_ROOT, relativePath);

    const withinSandbox = resolved === SANDBOX_ROOT || resolved.startsWith(SANDBOX_ROOT + path.sep);

    if(!withinSandbox){
        throw new Error(`Path escapes the sandboxed workspace: "${relativePath}"`);
    }

    return resolved;

}


function mediaTypeFor(filePath){

    const mediaType = MEDIA_TYPES[path.extname(filePath).toLowerCase()];

    if(!mediaType){
        throw new Error(`Unsupported image type: "${path.extname(filePath)}" (supported: ${Object.keys(MEDIA_TYPES).join(", ")})`);
    }

    return mediaType;

}


class Vision {

    // `client` is constructor-injectable (passed straight through to
    // ClaudeProvider), matching every other Claude-backed module's
    // testing pattern -- tests script a fake Anthropic client instead of
    // making a real, paid API call.
    constructor(client){

        this.provider = new ClaudeProvider(client);

    }


    // Analyzes an image already in the sandboxed workspace and records
    // the result the same way every other executive entity does: a
    // memory entry (type "technical knowledge", tagged "vision") holding
    // a summary, plus a knowledge graph entity for the image itself --
    // reachable through memory.search()/the Persistent Context Engine
    // and knowledge.retrieve() like everything else, not a disconnected
    // one-off analysis.
    async analyzeImage(relativePath, prompt = DEFAULT_PROMPT){

        const target = resolveSafePath(relativePath);

        if(!fs.existsSync(target)){
            throw new Error(`Image not found in sandboxed workspace: "${relativePath}"`);
        }

        const mediaType = mediaTypeFor(target);
        const base64Data = fs.readFileSync(target).toString("base64");

        const result = await this.provider.analyzeImage(base64Data, mediaType, prompt);

        const entry = memory.remember({
            content: `Image analysis of ${relativePath}: ${result.response.slice(0, 280)}`,
            type: "technical knowledge",
            importance: 2,
            tags: ["vision", "image"],
            source: "vision",
            metadata: { imagePath: relativePath, fullAnalysis: result.response }
        });

        knowledge.addEntity({ name: relativePath, type: "image" });

        return { path: relativePath, analysis: result.response, memoryEntryId: entry.id };

    }

}


module.exports = Vision;
