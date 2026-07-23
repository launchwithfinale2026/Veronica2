// ==================================
// VERONICA PAPER TRADING ENGINE + JOURNAL
// ==================================
//
// Phase 45 (Trading Research Division production-readiness). Executes
// a real, explicitly SIMULATED trade: applies it to the portfolio's
// real position/cash state (core/trading/portfolio.js's applyTrade())
// and records it as a permanent journal entry. There is no real broker
// connection anywhere in this codebase (see
// docs/EXTERNAL_DEPENDENCIES.md) -- real trade execution remains
// approval-gated and unimplemented until a real broker credential
// exists. This is genuinely useful without one: a trader can practice
// and journal real decisions against real (self-supplied) prices.

const memory = require("../memory");
const portfolio = require("./portfolio");

const TRADE_TAG = "trading-paper-trade";


function toTrade(entry){

    const meta = entry.metadata || {};

    return {
        id: entry.id,
        portfolioId: meta.portfolioId,
        symbol: meta.symbol,
        side: meta.side,
        quantity: meta.quantity,
        price: meta.price,
        strategyId: meta.strategyId || null,
        notes: meta.notes || null,
        timestamp: entry.created
    };

}


// Validates and applies the trade to the real portfolio FIRST
// (core/trading/portfolio.js's applyTrade() throws on insufficient
// cash/shares) -- a journal entry is only ever written for a trade that
// genuinely happened, never a failed one.
function executePaperTrade({ portfolioId, symbol, side, quantity, price, strategyId, notes } = {}){

    const updatedPortfolio = portfolio.applyTrade(portfolioId, { symbol, side, quantity, price });

    const entry = memory.remember({
        content: `${String(side).toUpperCase()} ${quantity} ${symbol} @ ${price} (paper)`,
        type: "businesses",
        importance: 3,
        tags: [TRADE_TAG, `portfolio:${portfolioId}`],
        source: "trading-paper-trading",
        metadata: {
            portfolioId,
            symbol,
            side,
            quantity,
            price,
            strategyId: strategyId || null,
            notes: notes || null
        }
    });

    return { trade: toTrade(entry), portfolio: updatedPortfolio };

}


// The real Journal -- every paper trade for a portfolio, oldest first,
// with whatever real notes/strategy attribution was recorded at the
// time.
function journal(portfolioId){

    return memory.filter({ tag: TRADE_TAG })
        .filter(entry => (entry.tags || []).includes(`portfolio:${portfolioId}`))
        .map(toTrade)
        .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

}


module.exports = { TRADE_TAG, executePaperTrade, journal };
