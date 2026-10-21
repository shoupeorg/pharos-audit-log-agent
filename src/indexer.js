import { LIMITS, NETWORK } from "./constants.js";

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
export async function fetchJson(url, fetchImpl = fetch, attempts = 3) {
  let last;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const response = await fetchImpl(url, { headers: { accept: "application/json", "user-agent": "pharos-audit-log-agent/1.0" }, signal: AbortSignal.timeout(20000) });
      if (response.status === 429 || response.status >= 500) { last = new Error(`Indexer HTTP ${response.status}`); await wait(250 * 2 ** attempt); continue; }
      if (!response.ok) throw new Error(`Indexer HTTP ${response.status}`);
      return { items: await response.json(), cursor: response.headers.get("x-next-cursor") };
    } catch (error) { last = error; if (attempt + 1 < attempts) await wait(250 * 2 ** attempt); }
  }
  throw last;
}

export async function fetchHistorySource(wallet, source, startSec, endSec, options = {}) {
  const fetchImpl = options.fetchImpl || fetch, maxPages = options.maxPages || LIMITS.maxPagesPerSource;
  const base = `${NETWORK.indexerUrl}/api/v2/addresses/${wallet}/${source}`;
  let cursor = null, pages = 0, reachedStart = false; const observations = [];
  while (pages < maxPages) {
    const url = cursor ? `${base}?cursor=${encodeURIComponent(cursor)}` : base;
    const response = await fetchJson(url, fetchImpl); pages += 1;
    if (!Array.isArray(response.items)) throw new Error(`${source} returned a non-array response.`);
    for (const item of response.items) {
      const timestamp = Number(item.ts);
      if (timestamp >= startSec && timestamp < endSec) observations.push(item);
      if (timestamp < startSec) reachedStart = true;
    }
    if (!response.cursor || reachedStart || response.items.length === 0) { reachedStart = true; break; }
    cursor = response.cursor;
  }
  if (!reachedStart) throw new Error(`${source} exceeded the ${maxPages}-page safety limit; choose a shorter or less dense interval.`);
  return { source, observations, pages, complete: true, attributedTo: "Pharos Explorer indexed history API (supplementary discovery source)" };
}

export async function discoverHistory(wallet, startSec, endSec, options = {}) {
  const sources = ["transactions", "token-transfers", "approvals"];
  const settled = await Promise.allSettled(sources.map(source => fetchHistorySource(wallet, source, startSec, endSec, options)));
  const results = {}, failures = [];
  settled.forEach((result, index) => { if (result.status === "fulfilled") results[sources[index]] = result.value; else failures.push({ source: sources[index], error: result.reason.message }); });
  return { results, failures, complete: failures.length === 0 };
}
