// ==================================
// VERONICA KNOWLEDGE GRAPH
// ==================================

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");


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
