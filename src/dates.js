export function parseRange(startInput, endInput, inclusiveEndDate = false) {
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/;
  const start = new Date(dateOnly.test(startInput) ? `${startInput}T00:00:00.000Z` : startInput);
  let end = new Date(dateOnly.test(endInput) ? `${endInput}T00:00:00.000Z` : endInput);
  if (inclusiveEndDate && dateOnly.test(endInput)) end = new Date(end.getTime() + 86400000);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) throw new Error("Start and end must be valid UTC dates or timestamps.");
  if (start >= end) throw new Error("Start must be before end.");
  return { startUtc: start.toISOString(), endUtc: end.toISOString(), startMs: start.getTime(), endMs: end.getTime(), semantics: "[start inclusive, end exclusive)", inclusiveEndConverted: inclusiveEndDate && dateOnly.test(endInput) };
}
export async function firstBlockAtOrAfter(call, targetMs, latestNumber) {
  const latest = await call("get_block", { block: String(latestNumber), includeTransactions: false });
  const latestMs = Number(BigInt(latest.timestamp)) * 1000;
  if (targetMs > latestMs) return { block: latestNumber + 1, timestamp: new Date(latestMs).toISOString(), afterTip: true };
  const genesis = await call("get_block", { block: "0", includeTransactions: false });
  const genesisMs = Number(BigInt(genesis.timestamp)) * 1000;
  if (targetMs <= genesisMs) return { block: 0, timestamp: new Date(genesisMs).toISOString(), beforeGenesis: targetMs < genesisMs };
  let low = 0, high = latestNumber;
  while (low < high) { const mid = Math.floor((low + high) / 2); const block = await call("get_block", { block: String(mid), includeTransactions: false }); const ms = Number(BigInt(block.timestamp)) * 1000; if (ms < targetMs) low = mid + 1; else high = mid; }
  const block = await call("get_block", { block: String(low), includeTransactions: false });
  return { block: low, timestamp: new Date(Number(BigInt(block.timestamp)) * 1000).toISOString() };
}
