# xoomar

JavaScript and TypeScript client for the [XOOMAR](https://xoomar.com/markets) free market data API: 31 datasets from primary sources (SEC EDGAR and XBRL, FINRA, CFTC, the Federal Reserve, USAspending, exchange APIs) as clean JSON, no key needed to start. Zero dependencies; Node 18+ or any runtime with `fetch`.

```bash
npm install xoomar
```

```ts
import { Xoomar } from "xoomar";

const x = new Xoomar();                       // 10 requests a minute; new Xoomar({ apiKey }) for 30 with a free key

(await x.shortInterest("GME"))[0];            // FINRA short interest, newest settlement first
await x.shortVolume("GME", { days: 30 });     // FINRA daily short sale volume (since 2021)
await x.failsToDeliver("GME", { from: "2026-04-01" });   // fails to deliver by settlement date
await x.insiders("NVDA", { from: "2026-06-01" });   // SEC Form 4 trades
await x.liquidationEvents({ symbol: "BTC", minUsd: 100000 });   // individual liquidations, newest first
await x.liquidationHistory({ symbol: "BTC", from: "2026-07-01" });   // hourly totals since June 2026
await x.largeHolders("HIMS");                 // Schedule 13D and 13G holders
(await x.financials("AAPL")).quarterly;       // XBRL income statement by quarter
await x.fundHolders("AMZN");                  // which tracked 13F managers hold it
await x.cot("gold");                          // CFTC positioning history
(await x.fedLiquidity()).at(-1);              // net liquidity, oldest first, so the last row is this week
await x.fundingRates();                       // perpetual funding on six venues
await x.bitcoinTreasuries();                  // bitcoin on public balance sheets
await x.formD({ days: 7 });                   // private placements filed this week
await x.federalContracts({ ticker: "LMT" });  // federal contract actions
await x.insiderClusters({ days: 30 });        // companies where 3+ insiders bought on the open market
await x.thresholdList({ symbol: "GME" });     // Reg SHO threshold list days (Nasdaq and Cboe, since 2022)
await x.treasuryAuctions({ term: "10-Year" }); // Treasury auction results since 2010
(await x.earningsFor("NVDA")).next;             // next expected earnings date (an estimate until confirmed)
await x.earnings({ to: "2026-10-31" });           // the calendar: reported and estimated rows
```

Every method resolves to the `data` part of the response; `x.lastMeta` holds `updatedAt`, `source`, `license` and `attribution` from the last call. History endpoints keep the API's own order (short interest, insiders and COT newest first; short volume, fails to deliver and Fed liquidity oldest first); every row carries its date. `x.get("short-interest", { symbol: "TSLA" })` calls any endpoint directly and `x.csv("short-interest/csv")` fetches a CSV download.

Full endpoint reference, fields and limits: https://xoomar.com/markets/api

## Datasets

Short interest, daily short volume, fails to deliver, insider trades (Form 4), planned sales (Form 144), large holders (13D/13G), 13F fund holdings, company financials and buybacks (XBRL), 8-K events, structured products, federal contracts, Form D private placements, the IPO pipeline, bitcoin treasuries, Reg SHO threshold lists, Treasury auctions, insider cluster buying, CFTC COT, funding rates, open interest, liquidations, options, whale positions, sentiment, signals, ETF flows, Fed liquidity, macro, policy rates, the economic calendar and the earnings calendar (8-K Item 2.02).

## Rate limits and keys

10 requests a minute per IP without a key. A free account at https://xoomar.com/signup gives a key for 30 a minute; pass it as `new Xoomar({ apiKey })`. Keyless and free-key requests return up to six months of history. A 429 rejects with `XoomarRateLimited` carrying `retryAfter`.

## Data terms

When you republish the data, on a site, in an app, in an article, in a dataset or a chart, credit XOOMAR with a visible link to the dataset page on xoomar.com. What you may do with the data is set out at https://xoomar.com/terms.

## License

Apache-2.0 for this client code, XOOMAR. The license covers the code only, not the data.
