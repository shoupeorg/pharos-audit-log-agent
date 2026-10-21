#!/usr/bin/env node
import fs from "node:fs/promises";
import { initialState, stepPipeline } from "./pipeline.js";
import { createMcpCaller } from "./mcp.js";
import { parseNaturalRequest } from "./agent.js";
import { reportCsv, reportMarkdown } from "./exports.js";

const args = Object.fromEntries(process.argv.slice(2).reduce((rows, value, index, all) => value.startsWith("--") ? [...rows, [value.slice(2), all[index + 1]?.startsWith("--") ? true : all[index + 1]]] : rows, []));
let input = { wallet: args.wallet, start: args.start, end: args.end, inclusiveEndDate: args["inclusive-end"] === "true" };
if (args.request) { const parsed = parseNaturalRequest(args.request); if (parsed.needsClarification) throw new Error("Natural request must include one wallet address and two ISO dates/timestamps."); input = { wallet: parsed.wallet, start: parsed.start, end: parsed.end }; }
let state = initialState({ ...input, jobId: crypto.randomUUID() }), live;
try {
  while (state.status === "RUNNING") {
    console.error(`${state.progress}% ${state.phase}`);
    if (["RESOLVING_DATES", "FETCHING_RECEIPTS"].includes(state.phase) && !live) live = await createMcpCaller();
    state = await stepPipeline(state, { call: live?.call, fetchImpl: fetch });
    if (live && !["FETCHING_RECEIPTS"].includes(state.phase)) { await live.close(); live = null; }
  }
} finally { if (live) await live.close(); }
const output = args.out || "pharos-wallet-statement";
await Promise.all([fs.writeFile(`${output}.json`, JSON.stringify(state.report, null, 2)), fs.writeFile(`${output}.md`, reportMarkdown(state.report)), fs.writeFile(`${output}.csv`, reportCsv(state.report))]);
console.log(JSON.stringify({ reportId: state.report.id, coverage: state.report.coverage.status, files: [`${output}.json`, `${output}.md`, `${output}.csv`] }, null, 2));
