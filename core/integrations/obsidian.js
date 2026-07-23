// ==================================
// VERONICA OBSIDIAN INTEGRATION
// ==================================
//
// Reads/writes/indexes Markdown notes in an Obsidian vault. Vault path is
// configurable (OBSIDIAN_VAULT_PATH), defaulting to the repo root -- the
// repo already has a real, if empty, `.obsidian/` config directory at its
// root (Obsidian creates that the moment any folder is opened as a
// vault), which is genuine evidence this exact directory was used as a
// vault at least once, not a guessed path. If OBSIDIAN_VAULT_PATH points
// somewhere without a `.obsidian/` directory, every operation here fails
// closed with a clear error rather than silently treating an arbitrary
// folder as a vault.
//
// Same path-sandboxing pattern as core/tools/handlers/filesystem.js --
// every note path is resolved against the vault root and rejected if it
// would escape it.

const fs = require("fs");
const path = require("path");

const memory = require("../memory");
const knowledge = require("../knowledge");

const DEFAULT_VAULT_PATH = path.join(__dirname, "../../");

const WIKILINK_PATTERN = /\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/g;

const IGNORED_DIRS = new Set(["node_modules", ".git", ".obsidian", "backups"]);


function vaultPath(){

    return path.resolve(process.env.OBSIDIAN_VAULT_PATH || DEFAULT_VAULT_PATH);

}


function requireVault(){

    const root = vaultPath();

    if(!fs.existsSync(path.join(root, ".obsidian"))){
        throw new Error(
            `"${root}" doesn't look like an Obsidian vault (no .obsidian/ directory). Set OBSIDIAN_VAULT_PATH to a real vault.`
        );
    }

    return root;

}


function resolveSafePath(root, relativePath){

    if(typeof relativePath !== "string" || !relativePath){
        throw new Error("A relative note path is required");
    }

    const resolved = path.resolve(root, relativePath);

    const withinVault = resolved === root || resolved.startsWith(root + path.sep);

    if(!withinVault){
        throw new Error(`Path escapes the vault: "${relativePath}"`);
    }

    return resolved;

}


// Recursively lists every .md file's path relative to the vault root,
// skipping dot-directories and node_modules/backups (a vault living in
// this repo would otherwise "discover" the whole codebase as notes).
function listNotes(){

    const root = requireVault();

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

            if(entry.isFile() && entry.name.endsWith(".md")){
                results.push(path.relative(root, fullPath));
            }

        }

    }

    walk(root);

    return results;

}


function readNote(relativePath){

    const root = requireVault();
    const target = resolveSafePath(root, relativePath);

    return fs.readFileSync(target, "utf8");

}


function writeNote(relativePath, content){

    const root = requireVault();
    const target = resolveSafePath(root, relativePath.endsWith(".md") ? relativePath : `${relativePath}.md`);

    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content ?? "");

    return { status: "written", path: path.relative(root, target) };

}


function titleFromPath(relativePath){

    return path.basename(relativePath, ".md");

}


// Every note becomes a knowledge entity (type "note"); [[wikilinks]]
// inside it become "links" relationships to other note titles -- the
// same graph structure Obsidian itself uses, extracted rather than
// duplicated. Note content is summarized (first 280 chars) into a memory
// entry (type "technical knowledge") so it's reachable through
// memory.search()/the Persistent Context Engine, not just the graph.
function indexVault(){

    const notes = listNotes();

    let entitiesCreated = 0;
    let relationshipsCreated = 0;
    let memoriesCreated = 0;

    for(const relativePath of notes){

        const title = titleFromPath(relativePath);
        const content = readNote(relativePath);

        knowledge.addEntity({ name: title, type: "note", attributes: { path: relativePath } });
        entitiesCreated++;

        const links = [...content.matchAll(WIKILINK_PATTERN)].map(match => match[1].trim());

        for(const linkedTitle of links){

            knowledge.addEntity({ name: linkedTitle, type: "note" });

            knowledge.addRelationship({ from: title, to: linkedTitle, type: "links" });
            relationshipsCreated++;

        }

        const summary = content.trim().slice(0, 280);

        if(summary){

            memory.remember({
                content: `${title}: ${summary}`,
                type: "technical knowledge",
                importance: 2,
                tags: ["obsidian", "note"],
                source: "obsidian-integration",
                metadata: { notePath: relativePath }
            });

            memoriesCreated++;

        }

    }

    return { notesIndexed: notes.length, entitiesCreated, relationshipsCreated, memoriesCreated };

}


// Phase 57 (Knowledge Acquisition Engine): same real, LLM-based
// structured extraction as core/integrations/fileIntelligence.js's
// acquireFromFile() above, applied to one real Obsidian note -- called
// explicitly per note, not automatically for the whole vault.
async function acquireFromNote(relativePath){

    const KnowledgeAcquisitionEngine = require("../knowledge/acquisition");
    const engine = new KnowledgeAcquisitionEngine();

    const content = readNote(relativePath);

    return engine.acquire(relativePath, content);

}


module.exports = { vaultPath, listNotes, readNote, writeNote, indexVault, acquireFromNote };
