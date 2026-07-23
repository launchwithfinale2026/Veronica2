// ==================================
// VERONICA TRADING ANALYTICS ENGINE
// ==================================
//
// Phase 45 (Trading Research Division production-readiness). Real
// Performance Analytics computed from a portfolio's actual paper trade
// journal -- realized P&L via real FIFO lot matching (a standard
// accounting method, not an approximation), win rate, and real
// execution telemetry reused from core/learning for free (same
// two-kinds-of-analytics split every other division's analytics module
// already established).
//
// `../learning` is required LAZILY (inside executionHealth() below),
// not at module load time -- the same real, found-live circular
// require documented in core/sales/analytics.js's/
// core/research/engine.js's comments (this module is reachable from
// packages/trading-research/tools/trading.portfolio.review.js, a tool
// handler, and core/learning's chain reaches core/tools/index.js).
// Fixed proactively here from the start, having now seen this exact
// bug three times.

const portfolio = require("./portfolio");
const paperTrading = require("./paperTrading");

const TRADING_DEPARTMENT_ID = "trading-dept";


// Real realized profit/loss via FIFO lot matching, per symbol, across
// a portfolio's actual journal -- the standard accounting method for
// matching sells against the specific buy lots they close, not an
// approximation. Only CLOSED (sold) shares count toward realized P&L;
// an open position's unrealized gain/loss belongs to
// core/trading/portfolio.js's portfolioValue(), a different real
// question.
//
// Deliberately a DIFFERENT cost-basis method than portfolio.js's own
// position tracking: portfolio.js uses average-cost-basis (one blended
// avgCost per symbol, the common retail-broker convention) to track an
// OPEN position's ongoing unrealized P&L, while this function uses
// FIFO (a standard tax-lot method) specifically to attribute realized
// P&L to each individual sell. Both are real, legitimate accounting
// methods answering two different real questions -- this is not an
// inconsistency between the two files.
function journalPerformance(portfolioId){

    const trades = paperTrading.journal(portfolioId);

    const openLotsBySymbol = {};
    let realizedPnl = 0;
    let wins = 0;
    let losses = 0;

    for(const trade of trades){

        if(!openLotsBySymbol[trade.symbol]){
            openLotsBySymbol[trade.symbol] = [];
        }

        const lots = openLotsBySymbol[trade.symbol];

        if(trade.side === "buy"){

            lots.push({ quantity: trade.quantity, price: trade.price });

        } else {

            let remaining = trade.quantity;
            let costBasis = 0;

            while(remaining > 0 && lots.length){

                const lot = lots[0];
                const matched = Math.min(remaining, lot.quantity);

                costBasis += matched * lot.price;
                lot.quantity -= matched;
                remaining -= matched;

                if(lot.quantity === 0){
                    lots.shift();
                }

            }

            const proceeds = trade.quantity * trade.price;
            const pnl = proceeds - costBasis;

            realizedPnl += pnl;

            if(pnl > 0){
                wins++;
            } else if(pnl < 0){
                losses++;
            }

        }

    }

    const closedTrades = wins + losses;

    return {
        realizedPnl,
        closedTrades,
        wins,
        losses,
        winRate: closedTrades ? wins / closedTrades : null
    };

}


function executionHealth(){

    const learning = require("../learning");

    return learning.departmentPerformance()
        .find(department => department.department === TRADING_DEPARTMENT_ID) || null;

}


// currentPrices: { SYMBOL: price } -- see portfolio.js's own comment on
// why this is caller-supplied (no market data feed exists).
function tradingOverview(portfolioId, currentPrices = {}){

    return {
        value: portfolio.portfolioValue(portfolioId, currentPrices),
        performance: journalPerformance(portfolioId),
        executionHealth: executionHealth()
    };

}


module.exports = { journalPerformance, executionHealth, tradingOverview };
