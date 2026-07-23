// ==================================
// VERONICA KNOWLEDGE GRAPH
// ==================================

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const bus = require("../bus");


class KnowledgeGraph {


    constructor(){

        this.file =
        path.join(__dirname, "graph.json");

        this.initialize();

    }



    initialize(){

        if(!fs.existsSync(this.file)){

            fs.writeFileSync(

                this.file,

                JSON.stringify({

                    entities:[],

                    relationships:[]

                }, null, 2)

            );

        }

    }


    // Creates an entity, e.g. { name: "VERONICA", type: "system" }.
    // Idempotent by name (case-insensitive) — calling this again for an
    // entity that already exists returns the existing one instead of
    // creating a duplicate.
    addEntity({ name, type = "concept", attributes = {} }){

        let graph = this.read();

        const existing = graph.entities.find(entity =>
            entity.name.toLowerCase() === name.toLowerCase()
        );

        if(existing){
            return existing;
        }

        const entity = {

            id: crypto.randomUUID(),

            name,

            type,

            attributes,

            created: new Date().toISOString()

        };

        graph.entities.push(entity);

        this.write(graph);

        console.log(
            "[KNOWLEDGE] Entity created:", name
        );

        // Only on the genuine-create branch, not the idempotent-reuse
        // one above -- a live dashboard viewer doesn't need a "knowledge
        // updated" notification for a call that changed nothing.
        bus.publish("knowledge.updated", { action: "entityCreated", entity });

        return entity;

    }


    // Creates a directed relationship between two entities by name, e.g.
    // { from: "Jacob", to: "VERONICA", type: "builds" }. Idempotent on
    // the (from, type, to) triple.
    addRelationship({ from, to, type }){

        let graph = this.read();

        const existing = graph.relationships.find(rel =>
            rel.from.toLowerCase() === from.toLowerCase() &&
            rel.to.toLowerCase() === to.toLowerCase() &&
            rel.type.toLowerCase() === type.toLowerCase()
        );

        if(existing){
            return existing;
        }

        const relationship = {

            id: crypto.randomUUID(),

            from,

            to,

            type,

            created: new Date().toISOString()

        };

        graph.relationships.push(relationship);

        this.write(graph);

        console.log(
            "[KNOWLEDGE] Relationship created:",
            `${from} -${type}-> ${to}`
        );

        bus.publish("knowledge.updated", { action: "relationshipCreated", relationship });

        return relationship;

    }


    find(name){

        let graph = this.read();

        return graph.entities.filter(entity=>

            entity.name
            .toLowerCase()
            .includes(
                name.toLowerCase()
            )

        );

    }


    // Every relationship touching this entity, in either direction —
    // the "connections" a name is linked to.
    connections(name){

        let graph = this.read();

        const lower = name.toLowerCase();

        return graph.relationships.filter(rel =>
            rel.from.toLowerCase() === lower ||
            rel.to.toLowerCase() === lower
        );

    }


    // Project H (Knowledge Graph Explorer): every entity of a given
    // type -- an exact (case-insensitive) match, unlike find()'s name
    // substring search. The `type` field already existed on every
    // entity (addEntity()'s own default is "concept"); this is the
    // first real query filtering by it.
    findByType(type){

        const graph = this.read();
        const lower = type.toLowerCase();

        return graph.entities.filter(entity => (entity.type || "").toLowerCase() === lower);

    }


    // Project H: real breadth-first expansion from a starting entity,
    // `hops` steps out. connections() above is exactly 1 hop; this
    // generalizes it to N, never revisiting an entity already reached
    // at a closer distance. Returns the same { entities, relationships }
    // shape retrieve() does, for a consistent "graph slice" contract a
    // caller can render identically either way.
    expand(name, hops = 1){

        const graph = this.read();
        const lowerStart = name.toLowerCase();

        const visitedNames = new Set([lowerStart]);
        const collectedRelationships = [];
        let frontier = [lowerStart];

        for(let step = 0; step < hops && frontier.length; step++){

            const nextFrontier = [];

            for(const current of frontier){

                const touching = graph.relationships.filter(rel =>
                    rel.from.toLowerCase() === current || rel.to.toLowerCase() === current
                );

                for(const rel of touching){

                    if(!collectedRelationships.some(r => r.id === rel.id)){
                        collectedRelationships.push(rel);
                    }

                    const otherName = rel.from.toLowerCase() === current ? rel.to.toLowerCase() : rel.from.toLowerCase();

                    if(!visitedNames.has(otherName)){
                        visitedNames.add(otherName);
                        nextFrontier.push(otherName);
                    }

                }

            }

            frontier = nextFrontier;

        }

        const entities = graph.entities.filter(entity => visitedNames.has(entity.name.toLowerCase()));

        return { entities, relationships: collectedRelationships };

    }


    // Project H: real shortest-path search (breadth-first, unweighted,
    // direction-agnostic -- a relationship connects two entities
    // regardless of which side is `from`/`to` for the purpose of "can I
    // reach one from the other") between two named entities. Returns
    // the real sequence of entity names and the real relationships
    // used to connect them, or `found: false` if no path exists within
    // `maxDepth` -- never a fabricated or partial path.
    findPath(fromName, toName, { maxDepth = 6 } = {}){

        const graph = this.read();
        const lowerFrom = fromName.toLowerCase();
        const lowerTo = toName.toLowerCase();

        if(lowerFrom === lowerTo){
            return { found: true, path: [fromName], relationships: [] };
        }

        const cameFrom = new Map();
        const visited = new Set([lowerFrom]);

        let frontier = [lowerFrom];
        let depth = 0;

        while(frontier.length && depth < maxDepth){

            const nextFrontier = [];

            for(const current of frontier){

                const touching = graph.relationships.filter(rel =>
                    rel.from.toLowerCase() === current || rel.to.toLowerCase() === current
                );

                for(const rel of touching){

                    const otherName = rel.from.toLowerCase() === current ? rel.to.toLowerCase() : rel.from.toLowerCase();

                    if(visited.has(otherName)){
                        continue;
                    }

                    visited.add(otherName);
                    cameFrom.set(otherName, { from: current, relationship: rel });

                    if(otherName === lowerTo){

                        const relationships = [];
                        const pathNamesLower = [otherName];
                        let walk = otherName;

                        while(walk !== lowerFrom){
                            const step = cameFrom.get(walk);
                            relationships.unshift(step.relationship);
                            pathNamesLower.unshift(step.from);
                            walk = step.from;
                        }

                        const path = pathNamesLower.map(lower =>
                            (graph.entities.find(e => e.name.toLowerCase() === lower) || {}).name || lower
                        );

                        return { found: true, path, relationships };

                    }

                    nextFrontier.push(otherName);

                }

            }

            frontier = nextFrontier;
            depth++;

        }

        return { found: false, path: [], relationships: [] };

    }


    // Knowledge retrieval: matching entities plus every relationship
    // touching any of them, for injecting into agent context.
    retrieve(query){

        const entities = this.find(query);

        const relationships = entities
            .flatMap(entity => this.connections(entity.name))
            .filter((rel, index, all) =>
                all.findIndex(r => r.id === rel.id) === index
            );

        return { entities, relationships };

    }



    // Merges entities/relationships from another device's export (see
    // core/device/sync.js). Reuses addEntity()/addRelationship()'s
    // existing name-based idempotency rather than a separate merge
    // strategy — a remote entity with the same name as a local one is
    // treated as the same entity, matching how this graph already
    // dedupes locally.
    merge(remoteGraph){

        const before = this.read();

        for(const entity of (remoteGraph.entities || [])){
            this.addEntity(entity);
        }

        for(const relationship of (remoteGraph.relationships || [])){
            this.addRelationship(relationship);
        }

        const after = this.read();

        return {
            entitiesAdded: after.entities.length - before.entities.length,
            relationshipsAdded: after.relationships.length - before.relationships.length
        };

    }



    read(){

        return JSON.parse(

            fs.readFileSync(
                this.file
            )

        );

    }



    write(data){

        fs.writeFileSync(

            this.file,

            JSON.stringify(
                data,
                null,
                2
            )

        );

    }



}


module.exports = new KnowledgeGraph();
