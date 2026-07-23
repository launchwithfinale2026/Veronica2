// ==================================
// VERONICA TRADING BACKTESTING ENGINE
// ==================================
//
// Phase 45 (Trading Research Division production-readiness). A real,
// deterministic backtest of a moving-average crossover strategy -- the
// one strategy shape this engine can actually evaluate today (a real,
// well-known, well-defined rule: buy on a golden cross, sell on a death
// cross), not a generic strategy-rule interpreter (that would be a much
// larger, over-engineered scope for what's needed here). There is no
// market data connector in this codebase, so `priceSeries` (real
// historical {date, price} bars) must be supplied by the caller --
// this computes real arithmetic against real data the caller already
// has, it does not fabricate or fetch price history.

function simpleMovingAverage(prices, window, index){

    if(index < window - 1){
        return null;
    }

    const slice = prices.slice(index - window + 1, index + 1);

    return slice.reduce((sum, price) => sum + price, 0) / window;

}


// input: { priceSeries: [{date, price}], shortWindow, longWindow, startingCash }
function backtestMovingAverageCrossover(input = {}){

    const { priceSeries, shortWindow, longWindow, startingCash } = input;

    if(!Array.isArray(priceSeries) || priceSeries.length === 0){
        throw new Error("A real priceSeries (array of {date, price}) is required -- this engine has no market data connector, so historical prices must be supplied by the caller");
    }

    if(!Number.isFinite(shortWindow) || !Number.isFinite(longWindow) || shortWindow >= longWindow){
        throw new Error("shortWindow must be a smaller real number than longWindow");
    }

    if(!Number.isFinite(startingCash) || startingCash <= 0){
        throw new Error("A positive numeric startingCash is required");
    }

    const prices = priceSeries.map(bar => bar.price);

    let cash = startingCash;
    let shares = 0;
    let prevShortMA = null;
    let prevLongMA = null;

    const trades = [];
    const equityCurve = [];

    for(let i = 0; i < prices.length; i++){

        const shortMA = simpleMovingAverage(prices, shortWindow, i);
        const longMA = simpleMovingAverage(prices, longWindow, i);

        if(shortMA !== null && longMA !== null && prevShortMA !== null && prevLongMA !== null){

            const goldenCross = prevShortMA <= prevLongMA && shortMA > longMA;
            const deathCross = prevShortMA >= prevLongMA && shortMA < longMA;

            if(goldenCross && shares === 0){

                const affordableShares = Math.floor(cash / prices[i]);

                if(affordableShares > 0){
                    cash -= affordableShares * prices[i];
                    shares = affordableShares;
                    trades.push({ date: priceSeries[i].date, side: "buy", price: prices[i], shares });
                }

            } else if(deathCross && shares > 0){

                cash += shares * prices[i];
                trades.push({ date: priceSeries[i].date, side: "sell", price: prices[i], shares });
                shares = 0;

            }

        }

        equityCurve.push({ date: priceSeries[i].date, equity: cash + (shares * prices[i]) });

        prevShortMA = shortMA;
        prevLongMA = longMA;

    }

    // Liquidate any still-open position at the last available price so
    // the final return reflects a real, closed outcome.
    if(shares > 0){

        const lastPrice = prices[prices.length - 1];
        cash += shares * lastPrice;
        trades.push({ date: priceSeries[priceSeries.length - 1].date, side: "sell", price: lastPrice, shares });
        shares = 0;

    }

    let wins = 0;
    let completedRoundTrips = 0;

    for(let i = 0; i + 1 < trades.length; i += 2){
        completedRoundTrips++;
        if(trades[i + 1].price > trades[i].price){
            wins++;
        }
    }

    let peak = -Infinity;
    let maxDrawdown = 0;

    for(const point of equityCurve){

        if(point.equity > peak){
            peak = point.equity;
        }

        const drawdown = peak > 0 ? (peak - point.equity) / peak : 0;

        if(drawdown > maxDrawdown){
            maxDrawdown = drawdown;
        }

    }

    return {
        startingCash,
        finalValue: cash,
        totalReturn: (cash - startingCash) / startingCash,
        trades,
        tradeCount: trades.length,
        completedRoundTrips,
        winRate: completedRoundTrips ? wins / completedRoundTrips : null,
        maxDrawdown,
        equityCurve
    };

}


module.exports = { backtestMovingAverageCrossover, simpleMovingAverage };
