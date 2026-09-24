/**
 * Client for the XOOMAR free market data API (https://xoomar.com/markets/api).
 *
 * Every method resolves to the `data` part of the JSON response. The envelope
 * of the last call (`updatedAt`, `source`, `license`, `attribution`) is on
 * `client.lastMeta`. When you republish the data, link to the dataset page on
 * xoomar.com; the terms of use are at https://xoomar.com/terms
 */

export const VERSION = "0.1.8";
const DEFAULT_BASE_URL = "https://xoomar.com";

export type Params = Record<string, string | number | boolean | undefined | null>;

export class XoomarError extends Error {
  constructor(public status: number, public body: string, public url: string) {
    super(`HTTP ${status} from ${url}: ${body.slice(0, 200)}`);
    this.name = "XoomarError";
  }
}

/** 429: 10 requests a minute without a key, 30 with a free key from https://xoomar.com/signup. */
export class XoomarRateLimited extends XoomarError {
  constructor(status: number, body: string, url: string, public retryAfter: number | null) {
    super(status, body, url);
    this.name = "XoomarRateLimited";
  }
}

export interface XoomarOptions {
  apiKey?: string;
  baseUrl?: string;
  /** Milliseconds; default 30000. */
  timeout?: number;
  fetch?: typeof fetch;
}

const flag = (v: boolean | undefined) => (v ? 1 : undefined);

export class Xoomar {
  readonly apiKey?: string;
  readonly baseUrl: string;
  readonly timeout: number;
  private readonly fetchImpl: typeof fetch;
  /** Envelope of the last response: updatedAt, source, docs, license, attribution. */
  lastMeta: Record<string, unknown> = {};

  constructor(opts: XoomarOptions = {}) {
    this.apiKey = opts.apiKey;
    this.baseUrl = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    this.timeout = opts.timeout ?? 30_000;
    this.fetchImpl = opts.fetch ?? globalThis.fetch;
    if (!this.fetchImpl) throw new Error("fetch is not available; pass { fetch } or use Node 18+");
  }

  private url(path: string, params?: Params): string {
    const u = new URL(`${this.baseUrl}/api/markets/${path.replace(/^\//, "")}`);
    for (const [k, v] of Object.entries(params ?? {})) if (v !== undefined && v !== null) u.searchParams.set(k, String(v));
    return u.toString();
  }

  private async request(path: string, params: Params | undefined, accept: string): Promise<Response> {
    const url = this.url(path, params);
    const headers: Record<string, string> = { Accept: accept, "User-Agent": `xoomar-js/${VERSION}` };
    if (this.apiKey) headers["x-api-key"] = this.apiKey;
    const res = await this.fetchImpl(url, { headers, signal: AbortSignal.timeout(this.timeout) });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      if (res.status === 429) {
        const ra = res.headers.get("retry-after");
        throw new XoomarRateLimited(res.status, body, url, ra && /^\d+$/.test(ra) ? Number(ra) : null);
      }
      throw new XoomarError(res.status, body, url);
    }
    return res;
  }

  /** GET /api/markets/<path> with query parameters; resolves to the `data` field. */
  async get<T = unknown>(path: string, params?: Params): Promise<T> {
    const res = await this.request(path, params, "application/json");
    const payload = (await res.json()) as Record<string, unknown>;
    if (payload && typeof payload === "object" && "data" in payload) {
      const { data, ...meta } = payload;
      this.lastMeta = meta;
      return data as T;
    }
    this.lastMeta = {};
    return payload as T;
  }

  /** A CSV download as text, e.g. csv("short-interest/csv"). */
  async csv(path: string, params?: Params): Promise<string> {
    const res = await this.request(path, params, "text/csv");
    return res.text();
  }

  // ── companies (SEC and FINRA) ──
  /** FINRA short interest: a symbol's history newest first, or the latest settlement's highest days to cover. */
  shortInterest(symbol?: string) { return this.get("short-interest", { symbol }); }
  /** FINRA daily short sale volume: a symbol's history oldest first, or the latest day (sort "shares" for largest volumes). */
  /** FINRA daily short sale volume since August 2021: a symbol's history oldest first (from/to ISO dates, limit up to 5,000), or the latest day. */
  shortVolume(symbol?: string, opts: { days?: number; sort?: "shares"; from?: string; to?: string; limit?: number } = {}) { return this.get("short-volume", { symbol, ...opts }); }
  /** SEC fails to deliver: a symbol's history oldest first, or the latest settlement date's largest fails. */
  /** SEC fails to deliver since January 2010: a symbol's history oldest first (from/to ISO dates, limit up to 5,000), or the latest settlement's largest fails. */
  failsToDeliver(symbol?: string, opts: { from?: string; to?: string; limit?: number } = {}) { return this.get("fails-to-deliver", { symbol, ...opts }); }
  /** SEC Form 4 trades: a ticker's history, or the latest across companies. */
  /** SEC Form 4 trades: a ticker's history from filings since 2020 (from/to ISO dates, limit up to 2,000), or the latest across companies (type, window). */
  insiders(ticker?: string, opts: { type?: string; window?: string; from?: string; to?: string; limit?: number } = {}) {
    if (ticker) { const { from, to, limit } = opts; return this.get(`insiders/${ticker.toLowerCase()}`, { from, to, limit }); }
    return this.get("insiders", { type: opts.type, window: opts.window });
  }
  /** SEC Form 144 notices of proposed sale. */
  /** Cluster buying: companies where several different insiders bought on the open market in the window (minInsiders default 3). */
  insiderClusters(opts: { days?: number; minInsiders?: number; minUsd?: number; ticker?: string; limit?: number } = {}) { return this.get("insiders/clusters", opts); }
  /** Regulation SHO threshold securities lists (Nasdaq and Cboe daily files since 2022): one date, one symbol's days on the list, or one market. */
  thresholdList(opts: { date?: string; symbol?: string; market?: "nasdaq" | "cboe" | "nyse"; limit?: number } = {}) { return this.get("threshold-list", opts); }
  plannedSales(symbol?: string, opts: { days?: number } = {}) { return this.get("planned-sales", { symbol, ...opts }); }
  /** Schedule 13D and 13G cover pages. */
  largeHolders(symbol?: string, opts: { form?: "13D" | "13G"; days?: number; new?: boolean; sort?: "filed" | "percent" } = {}) { return this.get("large-holders", { symbol, form: opts.form, days: opts.days, new: flag(opts.new), sort: opts.sort }); }
  /** XBRL quarterly income, annual statements and latest balance sheet for a ticker. */
  financials(symbol: string) { return this.get("financials", { symbol }); }
  /** Largest share repurchases per company in its latest fiscal year. */
  buybacks() { return this.get("buybacks"); }
  /** Tracked 13F managers holding a ticker at their latest filing. */
  fundHolders(ticker: string) { return this.get("funds", { ticker }); }
  /** One tracked manager's latest 13F portfolio, e.g. "berkshire-hathaway". */
  fund(slug: string) { return this.get(`funds/${slug}`); }
  /** SEC 8-K material events. */
  events(opts: { ticker?: string; item?: string; days?: number } = {}) { return this.get("events", opts); }
  /** Earnings calendar from 8-K Item 2.02 filings: the window's rows (default today to +14 days; status "reported" or "estimated"). */
  earnings(opts: { from?: string; to?: string; status?: "reported" | "estimated"; ticker?: string; limit?: number } = {}) { return this.get("earnings", opts); }
  /** One company's reported earnings dates since 2023 and the next estimate (an object with history, next, lastReported). */
  earningsFor(ticker: string) { return this.get(`earnings/${ticker.toLowerCase()}`); }
  /** Bank structured notes from 424B2 and FWP filings. */
  structuredProducts(params: Params = {}) { return this.get("structured-products", params); }
  /** Largest US federal contract actions; by "ticker" sums by listed parent. */
  federalContracts(opts: { ticker?: string; days?: number; by?: "ticker"; listed?: boolean } = {}) { return this.get("federal-contracts", { ticker: opts.ticker, days: opts.days, by: opts.by, listed: flag(opts.listed) }); }

  // ── markets ──
  /** Perpetual futures funding on Binance, Bybit and OKX; a symbol slug gives its history. */
  fundingRates(slug?: string) { return slug ? this.get(`funding-rates/${slug}`) : this.get("funding-rates"); }
  /** Hourly open interest history for a symbol slug. */
  openInterest(slug: string) { return this.get(`open-interest/${slug}`); }
  /** 24-hour liquidation summary: totals, long/short split, hourly buckets, top contracts. */
  liquidations() { return this.get("liquidations"); }
  /** Individual liquidation events, newest first (up to 500); filter by contract (BTC or BTCUSDT), exchange (okx, gate, htx), side and minimum notional. */
  liquidationEvents(opts: { symbol?: string; exchange?: string; side?: "long" | "short"; minUsd?: number; limit?: number } = {}) { return this.get("liquidations/recent", opts); }
  /** Hourly liquidation totals kept permanently (from 15 June 2026), oldest first; one contract with symbol, a window with from/to, up to 5,000 hours. */
  liquidationHistory(opts: { symbol?: string; from?: string; to?: string; limit?: number } = {}) { return this.get("liquidations/history", opts); }
  /** Deribit options: put/call, max pain, DVOL for BTC or ETH. */
  options(currency: "BTC" | "ETH" = "BTC") { return this.get(`options/${currency}`); }
  /** Hyperliquid whale positions, all or for one coin. */
  whales(coin?: string) { return coin ? this.get(`whales/${coin}`) : this.get("whales"); }
  /** CFTC Commitments of Traders: the latest report across markets, or one market's history, e.g. "gold". */
  cot(market?: string) { return market ? this.get(`cot/${market}`) : this.get("cot"); }
  /** Composite sentiment scores, all assets or one asset slug. */
  sentiment(asset?: string, opts: { kind?: string; window?: string } = {}) { return asset ? this.get(`sentiment/${asset}`) : this.get("sentiment", opts); }
  /** Rules-based composite signals. */
  signals(asset?: string) { return asset ? this.get(`signals/${asset}`) : this.get("signals"); }
  /** Spot bitcoin and ether ETF flows. */
  etfFlows(opts: { asset?: "btc" | "eth"; days?: number } = {}) { return this.get("etf-flows", opts); }
  /** Bitcoin held by public companies from their SEC filings. */
  bitcoinTreasuries() { return this.get("bitcoin-treasuries"); }

  // ── macro ──
  /** US Treasury yield curve, spreads, stablecoin supply. */
  macro(opts: { series?: string; from?: string; to?: string } = {}) { return this.get("macro", opts); }
  /** Weekly net liquidity with components, or one FRED series (WALCL, WRESBAL, RRPONTSYD, WTREGEN, SOFR, EFFR, IORB, WSHOSHO). */
  fedLiquidity(opts: { series?: string; limit?: number } = {}) { return this.get("fed-liquidity", opts); }
  /** Central bank policy rates: all economies, or one country code's history, e.g. "us". */
  rates(country?: string) { return country ? this.get(`rates/${country}`) : this.get("rates"); }
  /** US economic calendar with consensus and actuals. */
  calendar(opts: { from?: string; to?: string; importance?: string } = {}) { return this.get("calendar", opts); }
  /** US Treasury auction results and calendar since 2010 (type "Note", "Bond", "TIPS", "FRN", "Bill", "CMB" or "all"; upcoming for announced auctions). */
  treasuryAuctions(opts: { type?: string; term?: string; from?: string; to?: string; upcoming?: boolean; limit?: number } = {}) { return this.get("treasury-auctions", { type: opts.type, term: opts.term, from: opts.from, to: opts.to, upcoming: flag(opts.upcoming), limit: opts.limit }); }

  // ── filings and offerings ──
  /** SEC Form D private placements: largest raises in a window, one issuer by CIK, or sort "recent". */
  formD(opts: { days?: number; funds?: boolean; cik?: string; sort?: "recent"; amendments?: boolean } = {}) { return this.get("startup-funding", { days: opts.days, funds: flag(opts.funds), cik: opts.cik, sort: opts.sort, amendments: flag(opts.amendments) }); }
  /** IPO pipeline filings (form "S-1,F-1", "424B4", "RW", "EFFECT"; new for filers not yet listed). */
  ipos(opts: { form?: string; days?: number; new?: boolean } = {}) { return this.get("ipos", { form: opts.form, days: opts.days, new: flag(opts.new) }); }
}

export default Xoomar;
