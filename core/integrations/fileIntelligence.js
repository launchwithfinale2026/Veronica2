// ==================================
// VERONICA FILE INTELLIGENCE
// ==================================
//
// The "filesystem intelligence" capability deferred back in Phase 12
// ("External Integrations") pending a concrete need -- Phase 14's
// semantic memory infrastructure now exists, and there's real value in
// indexing/searching arbitrary text-based files (not just Obsidian notes,
// which core/integrations/obsidian.js already handles with its own
// markdown/wikilink-specific logic that this doesn't duplicate or
// replace). Sandboxed the same way every other filesystem-touching tool
// is: data/workspace/ by default, with the same path-escape rejection.
//
// Deliberately grep-based search, not semantic: reusing core/memory/
// embeddings.js's EmbeddingIndex for files would mean a second embeddings
// namespace (file paths, not memory entry ids) sharing or colliding with
// the existing one -- a real design question with no concrete need yet
// to resolve one way or the other. Grep-based content search is simple,
// free (no API call), and already covers "find files mentioning X."

const fs = require("fs");
const path = require("path");

const memory = require("../memory");
const knowledge = require("../knowledge");

const DEFAULT_ROOT = path.join(__dirname, "../../data/workspace");

const INDEXABLE_EXTENSIONS = new Set([
    ".txt", ".md", ".js", ".ts", ".jsx", ".tsx", ".py", ".json",
    ".yaml", ".yml", ".csv", ".html", ".css", ".sh"
]);

const IGNORED_DIRS = new Set(["node_modules", ".git", ".obsidian", "backups"]);

const MAX_INDEXABLE_BYTES = 200 * 1024; // 200KB -- a file bigger than this becomes one unreadably-huge summary; skip rather than truncate silently
const MAX_MATCHING_LINES = 5;


// Connector Hardening: same reasoning as core/integrations/obsidian.js's
// own isConfigured()/status() -- a local filesystem connector's
// "configured" is "does the real sandboxed root actually exist right
// now," not a credential. Lets this connector appear in Connector
// Status (core/integrations/registry.js) instead of being invisible.
function isConfigured(root = DEFAULT_ROOT){
    return fs.existsSync(root);
}


function status(root = DEFAULT_ROOT){

    const configured = isConfigured(root);

    return {
        id: "fileIntelligence",
        implemented: true,
        configured,
        root,
        note: configured
            ? `Real, sandboxed root found at "${root}".`
            : `No directory at "${root}" -- nothing to index yet.`
    };

}


function resolveSafePath(root, relativePath){

    if(typeof relativePath !== "string" || !relativePath){
        throw new Error("A relative file path is required");
    }

    const resolved = path.resolve(root, relativePath);

    const withinRoot = resolved === root || resolved.startsWith(root + path.sep);

    if(!withinRoot){
        throw new Error(`Path escapes the sandboxed root: "${relativePath}"`);
    }

    return resolved;

}


// Recursively lists every indexable file's path relative to `root`,
// skipping dot-directories and node_modules/.git/.obsidian/backups.
function listFiles(root = DEFAULT_ROOT){

    if(!fs.existsSync(root)){
        throw new Error(`Root does not exist: "${root}"`);
    }

    const results = [];

    function walk(dir){

        for(const entry of fs.readdirSync(dir, { withFileTypes: true })){

            if(entry.name.startsWith(".") || IGNORED_DIRS.has(entry.name)){
                continue;
            }

            const fullPath = path.join(dir, entry.name);

            if(entry.isDirectory()){
                walk(fullPath);
                continue;
            }

            if(entry.isFile() && INDEXABLE_EXTENSIONS.has(path.extname(entry.name))){
                results.push(path.relative(root, fullPath));
            }

        }

    }

    walk(root);

    return results;

}


function readFile(relativePath, root = DEFAULT_ROOT){

    const target = resolveSafePath(root, relativePath);

    return fs.readFileSync(target, "utf8");

}


// Every indexable file becomes a `type: "file"` knowledge entity and a
// 280-char-summary memory entry (type "technical knowledge", tagged
// file-intelligence + its extension) -- reachable through
// memory.search()/the Persistent Context Engine, same as every other
// indexed source in this project.
function indexDirectory(root = DEFAULT_ROOT){

    const files = listFiles(root);

    let indexed = 0;
    let skippedTooLarge = 0;
    let memoriesCreated = 0;

    for(const relativePath of files){

        const fullPath = path.resolve(root, relativePath);
        const stats = fs.statSync(fullPath);

        if(stats.size > MAX_INDEXABLE_BYTES){
            skippedTooLarge++;
            continue;
        }

        const content = fs.readFileSync(fullPath, "utf8");
        const summary = content.trim().slice(0, 280);

        knowledge.addEntity({ name: relativePath, type: "file" });

        if(summary){

            memory.remember({
                content: `${relativePath}: ${summary}`,
                type: "technical knowledge",
                importance: 2,
                tags: ["file-intelligence", path.extname(relativePath).slice(1) || "unknown"],
                source: "file-intelligence",
                metadata: { filePath: relativePath, sizeBytes: stats.size }
            });

            memoriesCreated++;

        }

        indexed++;

    }

    return { filesFound: files.length, indexed, skippedTooLarge, memoriesCreated };

}


// Grep-like content search across every indexable file under `root` --
// case-insensitive substring match, returning up to MAX_MATCHING_LINES
// matching lines (with line numbers) per file.
function searchFiles(query, root = DEFAULT_ROOT){

    if(!query){
        throw new Error("A search query is required");
    }

    const needle = query.toLowerCase();
    const files = listFiles(root);

    const matches = [];

    for(const relativePath of files){

        const fullPath = path.resolve(root, relativePath);
        const content = fs.readFileSync(fullPath, "utf8");

        if(!content.toLowerCase().includes(needle)){
            continue;
        }

        const matchingLines = content
            .split("\n")
            .map((line, index) => ({ number: index + 1, line }))
            .filter(entry => entry.line.toLowerCase().includes(needle))
            .slice(0, MAX_MATCHING_LINES);

        matches.push({ path: relativePath, matchingLines });

    }

    return matches;

}


// Phase 57 (Knowledge Acquisition Engine): real, LLM-based structured
// extraction (concepts/entities/relationships/tasks/decisions/
// questions/unknowns) over one already-indexed real file -- distinct
// from indexDirectory()'s plain 280-char summary above, and NOT run
// automatically for every indexed file (that would mean one real LLM
// call per file with no bound); called explicitly, per file, when
// deeper understanding is actually wanted. Lazy require -- see
// core/knowledge/acquisition.js's own header comment on why a top-level
// require here would risk the same circular-load class of bug
// documented throughout this codebase.
async function acquireFromFile(relativePath, root = DEFAULT_ROOT){

    const KnowledgeAcquisitionEngine = require("../knowledge/acquisition");
    const engine = new KnowledgeAcquisitionEngine();

    const content = readFile(relativePath, root);

    return engine.acquire(relativePath, content);

}


module.exports = { listFiles, readFile, indexDirectory, searchFiles, acquireFromFile, isConfigured, status, DEFAULT_ROOT };
