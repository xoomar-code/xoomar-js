import { test } from "node:test";
import assert from "node:assert/strict";
import { Xoomar, XoomarRateLimited } from "../dist/index.js";

const fakeFetch = (status, body, headers = {}) => async (url, init) => ({
  ok: status < 400, status, headers: new Headers(headers), url, init,
  json: async () => JSON.parse(body), text: async () => body,
});

test("get returns data and keeps meta, sends the key", async () => {
  const calls = [];
  const f = async (url, init) => { calls.push({ url, init }); return fakeFetch(200, JSON.stringify({ data: [{ symbol: "GME" }], source: "xoomar.com", attribution: "Free with attribution" }))(url, init); };
  const x = new Xoomar({ apiKey: "k", fetch: f });
  const rows = await x.shortInterest("GME");
  assert.deepEqual(rows, [{ symbol: "GME" }]);
  assert.equal(x.lastMeta.source, "xoomar.com");
  assert.equal(calls[0].url, "https://xoomar.com/api/markets/short-interest?symbol=GME");
  assert.equal(calls[0].init.headers["x-api-key"], "k");
});

test("path methods and flags", async () => {
  const calls = [];
  const f = async (url, init) => { calls.push(url); return fakeFetch(200, '{"data":[]}')(url, init); };
  const x = new Xoomar({ fetch: f });
  await x.insiders("NVDA");
  await x.largeHolders("HIMS", { form: "13D", new: true });
  assert.equal(calls[0], "https://xoomar.com/api/markets/insiders/nvda");
  assert.equal(calls[1], "https://xoomar.com/api/markets/large-holders?symbol=HIMS&form=13D&new=1");
  await x.failsToDeliver("GME", { from: "2010-01-01", limit: 5000 });
  await x.liquidationEvents({ symbol: "BTC", minUsd: 100000, limit: 5 });
  await x.insiders("AAPL", { from: "2024-01-01" });
  assert.equal(calls[2], "https://xoomar.com/api/markets/fails-to-deliver?symbol=GME&from=2010-01-01&limit=5000");
  assert.equal(calls[3], "https://xoomar.com/api/markets/liquidations/recent?symbol=BTC&minUsd=100000&limit=5");
  assert.equal(calls[4], "https://xoomar.com/api/markets/insiders/aapl?from=2024-01-01");
});

test("429 raises XoomarRateLimited with retryAfter", async () => {
  const x = new Xoomar({ fetch: fakeFetch(429, "slow down", { "retry-after": "12" }) });
  await assert.rejects(() => x.cot(), (e) => e instanceof XoomarRateLimited && e.retryAfter === 12);
});
