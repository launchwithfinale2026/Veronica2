// ==================================
// VERONICA TRADING STRATEGY STORAGE
// ==================================
//
// Phase 45 (Trading Research Division production-readiness). A
// strategy is a real, named, described set of trading rules -- ordinary
// memory entries, same pattern as everything else in this division.
// This module only stores strategies; core/trading/backtest.js is what
// actually evaluates one against real price data.

const memory = require("../memory");

const STRATEGY_TAG = "trading-strategy";


function toStrategy(entry){

    const meta = entry.metadata || {};

    return {
        id: entry.id,
        name: entry.content,
        description: meta.description || null,
        rules: meta.rules || null,
        created: entry.created,
        updated: entry.updated
    };

}


function requireEntry(id){

    const entry = memory.view().find(m => m.id === id && (m.tags || []).includes(STRATEGY_TAG));

    if(!entry){
        throw new Error(`Unknown strategy: "${id}"`);
    }

    return entry;

}


// input: { name, description?, rules? } -- `rules` is a plain object
// describing the strategy's real parameters (e.g. a moving-average
// crossover's short/long window lengths, for core/trading/backtest.js
// to actually evaluate) -- free-form, since different strategy shapes
// need different real parameters.
function createStrategy(input = {}){

    if(!input.name){
        throw new Error("A strategy name is required");
    }

    const entry = memory.remember({
        content: input.name,
        type: "businesses",
        importance: 3,
        tags: [STRATEGY_TAG],
        source: "trading-strategies",
        metadata: {
            description: input.description || null,
            rules: input.rules || null
        }
    });

    return toStrategy(entry);

}


function listStrategies(){
    return memory.filter({ tag: STRATEGY_TAG }).map(toStrategy);
}


function getStrategy(strategyId){
    return toStrategy(requireEntry(strategyId));
}


module.exports = { STRATEGY_TAG, createStrategy, listStrategies, getStrategy };
