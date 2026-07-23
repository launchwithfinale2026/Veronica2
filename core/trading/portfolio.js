// ==================================
// VERONICA TRADING PORTFOLIO ENGINE
// ==================================
//
// Phase 45 (Trading Research Division production-readiness). A
// portfolio is an ordinary memory entry (type "businesses", tagged
// company:<id> + "trading-portfolio" when company-scoped), the same
// pattern every other division's entities already use. This is a PAPER
// portfolio -- there is no real broker connection anywhere in this
// codebase (see docs/EXTERNAL_DEPENDENCIES.md), and no real market data
// feed either, so `portfolioValue()` below takes current prices as an
// explicit argument rather than fetching them -- it computes real
// arithmetic on real recorded positions, but the caller is responsible
// for supplying real, current prices from wherever they actually have
// them.
//
// Position sizing (calculatePositionSize()) is a real, standard risk-
// management formula (the "percent risk" rule -- risk a fixed
// percentage of account value per trade, sized by the real distance to
// a stop price), not a proprietary or fabricated one.

const memory = require("../memory");

const PORTFOLIO_TAG = "trading-portfolio";
const WATCHLIST_TAG = "trading-watchlist";


function requireCompanyExists(companyId){

    const CompanyManager = require("../executive/companyManager");

    const entry = memory.view().find(
        m => m.id === companyId && (m.tags || []).includes(CompanyManager.TAG)
    );

    if(!entry){
        throw new Error(`Unknown company: "${companyId}"`);
    }

}


function toPortfolio(entry){

    const meta = entry.metadata || {};

    return {
        id: entry.id,
        companyId: meta.companyId || null,
        name: entry.content,
        cash: typeof meta.cash === "number" ? meta.cash : 0,
        positions: meta.positions || [],
        created: entry.created,
        updated: entry.updated
    };

}


function requirePortfolioEntry(id){

    const entry = memory.view().find(m => m.id === id && (m.tags || []).includes(PORTFOLIO_TAG));

    if(!entry){
        throw new Error(`Unknown portfolio: "${id}"`);
    }

    return entry;

}


// input: { name, startingCash?, companyId? }
function createPortfolio(input = {}){

    if(!input.name){
        throw new Error("A portfolio name is required");
    }

    const tags = [PORTFOLIO_TAG];

    if(input.companyId){
        requireCompanyExists(input.companyId);
        tags.push(`company:${input.companyId}`);
    }

    const entry = memory.remember({
        content: input.name,
        type: "businesses",
        importance: 3,
        tags,
        source: "trading-portfolio",
        metadata: {
            companyId: input.companyId || null,
            cash: typeof input.startingCash === "number" ? input.startingCash : 0,
            positions: []
        }
    });

    return toPortfolio(entry);

}


function listPortfolios(companyId){

    return memory.filter({ tag: PORTFOLIO_TAG })
        .filter(entry => !companyId || (entry.tags || []).includes(`company:${companyId}`))
        .map(toPortfolio);

}


function getPortfolio(portfolioId){
    return toPortfolio(requirePortfolioEntry(portfolioId));
}


// Applies a real PAPER trade to a portfolio's real position/cash state
// -- "buy" reduces cash and increases (or opens) a position at a real
// weighted-average cost basis; "sell" increases cash and reduces (or
// closes) a position. This is the one place portfolio state actually
// changes; core/trading/paperTrading.js's executePaperTrade() calls
// this and additionally records the real trade to the journal.
function applyTrade(portfolioId, { symbol, side, quantity, price }){

    if(!symbol || !["buy", "sell"].includes(side) || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(price)){
        throw new Error("A trade needs a symbol, side (\"buy\"/\"sell\"), positive quantity, and a numeric price");
    }

    const entry = requirePortfolioEntry(portfolioId);
    const positions = [...(entry.metadata.positions || [])];
    const existingIndex = positions.findIndex(position => position.symbol === symbol);
    const cost = quantity * price;

    if(side === "buy"){

        if(cost > entry.metadata.cash){
            throw new Error(`Insufficient cash: trade costs ${cost}, portfolio has ${entry.metadata.cash}`);
        }

        if(existingIndex === -1){
            positions.push({ symbol, quantity, avgCost: price });
        } else {

            const existing = positions[existingIndex];
            const totalQuantity = existing.quantity + quantity;
            const weightedAvgCost = ((existing.avgCost * existing.quantity) + cost) / totalQuantity;

            positions[existingIndex] = { symbol, quantity: totalQuantity, avgCost: weightedAvgCost };

        }

        const cash = entry.metadata.cash - cost;
        memory.update(portfolioId, { metadata: { positions, cash } });

    } else {

        if(existingIndex === -1 || positions[existingIndex].quantity < quantity){
            throw new Error(`Cannot sell ${quantity} shares of "${symbol}": position doesn't hold that many`);
        }

        const existing = positions[existingIndex];
        const remainingQuantity = existing.quantity - quantity;

        if(remainingQuantity === 0){
            positions.splice(existingIndex, 1);
        } else {
            positions[existingIndex] = { ...existing, quantity: remainingQuantity };
        }

        const cash = entry.metadata.cash + cost;
        memory.update(portfolioId, { metadata: { positions, cash } });

    }

    return getPortfolio(portfolioId);

}


// currentPrices: { SYMBOL: price } -- supplied by the caller. No real
// market data feed exists in this codebase, so this computes real
// arithmetic on real recorded positions against whatever prices are
// actually given, rather than fetching them.
function portfolioValue(portfolioId, currentPrices = {}){

    const portfolio = getPortfolio(portfolioId);

    const positions = portfolio.positions.map(position => {

        const currentPrice = currentPrices[position.symbol];
        const marketValue = Number.isFinite(currentPrice) ? currentPrice * position.quantity : null;
        const unrealizedPnl = Number.isFinite(currentPrice) ? marketValue - (position.avgCost * position.quantity) : null;

        return { ...position, currentPrice: currentPrice ?? null, marketValue, unrealizedPnl };

    });

    const positionsValue = positions.reduce((sum, position) => sum + (position.marketValue || 0), 0);

    return {
        cash: portfolio.cash,
        positionsValue,
        totalValue: portfolio.cash + positionsValue,
        positions
    };

}


// A real, standard "percent risk" position-sizing formula -- risk a
// fixed percentage of account value per trade, sized by the real
// distance between entry and stop price. Not a proprietary or
// fabricated model; this is textbook risk management.
function calculatePositionSize({ accountValue, riskPercent, entryPrice, stopPrice } = {}){

    if(!Number.isFinite(accountValue) || !Number.isFinite(riskPercent) || !Number.isFinite(entryPrice) || !Number.isFinite(stopPrice)){
        throw new Error("accountValue, riskPercent, entryPrice, and stopPrice are all required numbers");
    }

    const perShareRisk = Math.abs(entryPrice - stopPrice);

    if(perShareRisk === 0){
        throw new Error("entryPrice and stopPrice cannot be equal -- there is no real stop distance to size against");
    }

    const riskAmount = accountValue * riskPercent;
    const shares = Math.floor(riskAmount / perShareRisk);

    return { riskAmount, perShareRisk, shares, positionValue: shares * entryPrice };

}


// -- Watchlists --

function toWatchlist(entry){

    const meta = entry.metadata || {};

    return {
        id: entry.id,
        name: entry.content,
        symbols: meta.symbols || [],
        created: entry.created,
        updated: entry.updated
    };

}


function requireWatchlistEntry(id){

    const entry = memory.view().find(m => m.id === id && (m.tags || []).includes(WATCHLIST_TAG));

    if(!entry){
        throw new Error(`Unknown watchlist: "${id}"`);
    }

    return entry;

}


function createWatchlist(input = {}){

    if(!input.name){
        throw new Error("A watchlist name is required");
    }

    const entry = memory.remember({
        content: input.name,
        type: "businesses",
        importance: 2,
        tags: [WATCHLIST_TAG],
        source: "trading-watchlist",
        metadata: { symbols: input.symbols || [] }
    });

    return toWatchlist(entry);

}


function listWatchlists(){
    return memory.filter({ tag: WATCHLIST_TAG }).map(toWatchlist);
}


function addSymbol(watchlistId, symbol){

    if(!symbol){
        throw new Error("A symbol is required");
    }

    const entry = requireWatchlistEntry(watchlistId);
    const symbols = entry.metadata.symbols.includes(symbol)
        ? entry.metadata.symbols
        : [...entry.metadata.symbols, symbol];

    const updated = memory.update(watchlistId, { metadata: { symbols } });

    return updated.metadata.symbols;

}


function removeSymbol(watchlistId, symbol){

    const entry = requireWatchlistEntry(watchlistId);
    const symbols = entry.metadata.symbols.filter(existing => existing !== symbol);

    const updated = memory.update(watchlistId, { metadata: { symbols } });

    return updated.metadata.symbols;

}


module.exports = {
    PORTFOLIO_TAG,
    WATCHLIST_TAG,
    createPortfolio,
    listPortfolios,
    getPortfolio,
    applyTrade,
    portfolioValue,
    calculatePositionSize,
    createWatchlist,
    listWatchlists,
    addSymbol,
    removeSymbol
};
