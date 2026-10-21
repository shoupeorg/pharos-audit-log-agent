import { LIMITS } from "./constants.js";

export function transactionHashes(discovery) {
  const hashes = new Set();
  for (const result of Object.values(discovery.results || {})) for (const item of result.observations) hashes.add((item.tx_hash || item.hash).toLowerCase());
  return [...hashes];
}

export async function enrichBatch(call, state, count = LIMITS.enrichPerStep) {
  const hashes = state.hashes || transactionHashes(state.discovery);
  if (hashes.length > LIMITS.maxTransactions) throw new Error(`Interval contains ${hashes.length} relevant transactions; maximum supported is ${LIMITS.maxTransactions}. Choose a shorter interval.`);
  const enriched = state.enriched || {}, codes = state.codes || {}; let cursor = state.enrichCursor || 0;
  for (const hash of hashes.slice(cursor, cursor + count)) {
    const item = { hash, source: "Official Pharos Chain MCP", errors: [] };
    try { item.transaction = await call("get_transaction", { hash }); } catch (error) { item.errors.push(`transaction: ${error.message}`); }
    try { item.receipt = await call("get_transaction_receipt", { hash }); } catch (error) { item.errors.push(`receipt: ${error.message}`); }
    const to = item.transaction?.to?.toLowerCase();
    if (to && !(to in codes)) { try { codes[to] = (await call("get_code", { address: to, block: item.transaction.blockNumber })).code; } catch (error) { codes[to] = null; item.errors.push(`code: ${error.message}`); } }
    enriched[hash] = item; cursor += 1;
  }
  return { ...state, hashes, enriched, codes, enrichCursor: cursor, enrichmentComplete: cursor >= hashes.length };
}
