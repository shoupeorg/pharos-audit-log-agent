import { ENGINE_VERSION, LIMITS } from "./constants.js";
import { parseRange, firstBlockAtOrAfter } from "./dates.js";
import { discoverHistory } from "./indexer.js";
import { enrichBatch } from "./enrich.js";
import { buildReport } from "./engine.js";

export function initialState(input, now = new Date()) {
  if (!/^0x[a-fA-F0-9]{40}$/.test(input.wallet || "")) throw new Error("Wallet must be a valid EVM address.");
  const range = parseRange(input.start, input.end, Boolean(input.inclusiveEndDate));
  if (range.endMs - range.startMs > LIMITS.maxIntervalMs) throw new Error("Maximum supported interval is 24 hours. No truncation was applied; choose a shorter range.");
  if (range.startMs > now.getTime()) throw new Error("Start time is in the future.");
  return { jobId: input.jobId, wallet: input.wallet.toLowerCase(), range, status: "RUNNING", phase: "RESOLVING_DATES", progress: 5, createdAt: now.toISOString(), updatedAt: now.toISOString(), engineVersion: ENGINE_VERSION };
}

export async function stepPipeline(state, dependencies) {
  const now = dependencies.now ? dependencies.now() : new Date();
  if (state.status !== "RUNNING") return state;
  if (state.phase === "RESOLVING_DATES") {
    const latestRaw = await dependencies.call("get_block_number", {}), latest = Number(BigInt(latestRaw.blockNumber));
    const firstIncluded = await firstBlockAtOrAfter(dependencies.call, state.range.startMs, latest);
    const firstExcluded = await firstBlockAtOrAfter(dependencies.call, state.range.endMs, latest);
    if (firstIncluded.beforeGenesis) state.beforeGenesis = true;
    return { ...state, boundaries: { firstIncluded, firstExcluded, latestAtAnalysis: latest }, phase: "FETCHING_HISTORY", progress: 20, updatedAt: now.toISOString() };
  }
  if (state.phase === "FETCHING_HISTORY") {
    const discovery = await discoverHistory(state.wallet, Math.floor(state.range.startMs / 1000), Math.floor(state.range.endMs / 1000), { fetchImpl: dependencies.fetchImpl });
    return { ...state, discovery, phase: "FETCHING_RECEIPTS", progress: 40, updatedAt: now.toISOString() };
  }
  if (state.phase === "FETCHING_RECEIPTS") {
    const next = await enrichBatch(dependencies.call, state);
    const progress = next.hashes.length ? 40 + Math.floor(45 * next.enrichCursor / next.hashes.length) : 85;
    return { ...next, phase: next.enrichmentComplete ? "CLASSIFYING" : "FETCHING_RECEIPTS", progress, updatedAt: now.toISOString() };
  }
  if (state.phase === "CLASSIFYING") return { ...state, phase: "GENERATING_REPORT", progress: 92, updatedAt: now.toISOString() };
  if (state.phase === "GENERATING_REPORT") {
    const report = buildReport(state, now);
    return { ...state, status: "COMPLETE", phase: "COMPLETE", progress: 100, report, updatedAt: now.toISOString() };
  }
  throw new Error(`Unknown job phase ${state.phase}.`);
}
