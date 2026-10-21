import fs from "node:fs";
import { reportCsv, reportMarkdown } from "../src/exports.js";

const generatedAt = "2026-10-21T19:30:00.000Z";
const jobs = [
  ["swap", "72058700-8e40-40fc-8903-60cde114e6ec", "b3f50f4c-0049-4d88-a694-3bec8c82c05e", "4cde73a5-ad3e-4248-9617-3f442c17a58a"],
  ["approval", "86eaa9e2-762f-495e-b16a-e6f36ffed8ce", "8112c09a-fdf1-4ce0-9009-786cced93ac4", "b60c1038-a36a-44dd-9f1c-7f025da65adc"]
];

for (const [name, sourceId, id, jobId] of jobs) {
  const source = JSON.parse(fs.readFileSync(`evidence/live-${name}-report.json`, "utf8"));
  const swapRows = source.activities.filter(row => row.category === "SWAP");
  const walletHashes = [...new Set(source.activities.filter(row => row.transactionFrom === source.wallet).map(row => row.transactionHash))];
  const report = structuredClone(source);
  report.id = id;
  report.jobId = jobId;
  report.generatedAt = generatedAt;
  report.engineVersion = "audit-log-agent/1.1.0-saved-evidence-derivation";
  report.derivedFrom = { reportId: sourceId, engineVersion: source.engineVersion, method: "Conservative derivation from persisted report only; no chain reads." };
  report.activities = report.activities.filter(row => row.category !== "SWAP");
  report.categoryTotals.swaps = { transactionCount: 0, inputs: [], outputs: [] };
  report.notableTransactions = report.notableTransactions.filter(row => row.category !== "SWAP");
  report.ambiguousSwaps = swapRows.map(row => ({ transactionHash: row.transactionHash, reasons: ["The v1.0.1 report did not retain raw Swap log topics/data, so v1.1.0 cannot validate the emitter ABI and signed deltas from saved evidence alone."], explorerUrl: row.explorerUrl }));
  report.unknownTransactions = [...new Set([...(report.unknownTransactions || []), ...swapRows.map(row => row.transactionHash)])];
  report.summary.ambiguousSwapCandidates = swapRows.length;
  report.summary.unknownOrUnclassified = report.unknownTransactions.length;
  report.categoryTotals.gas = {
    status: "UNKNOWN", symbol: source.categoryTotals.gas.symbol, decimals: source.categoryTotals.gas.decimals,
    raw: null, formatted: null, knownTransactionCount: 0,
    unavailableTransactionCount: walletHashes.length, unavailableTransactionHashes: walletHashes,
    attribution: "The v1.0.1 aggregate is preserved in the source report, but its per-transaction historical fee fields were not retained and cannot be revalidated from saved evidence alone."
  };
  report.coverage.categories.receiptsAndGas = "UNKNOWN";
  report.coverage.status = "PARTIAL";
  report.sources = [...report.sources, { name: "Uniswap V3 pool event interface", url: "https://github.com/Uniswap/v3-core/blob/main/contracts/interfaces/pool/IUniswapV3PoolEvents.sol", purpose: "v1.1.0 Swap-event validation contract; unavailable raw fields caused conservative declassification" }];
  report.limitations = [
    "DERIVED REPORT: computed only from the immutable v1.0.1 saved payload; no chain reads were performed.",
    "The source payload lacks raw receipt Swap data and per-transaction gas fields, so prior swap and gas claims are not carried forward as verified v1.1.0 results.",
    ...report.limitations
  ];
  report.executiveSummary = `${report.wallet} had ${report.summary.uniqueTransactions} unique relevant transactions in the requested UTC interval. This conservative saved-evidence derivation preserves ${report.categoryTotals.approvals.eventCount} approval events and transfer evidence, verifies 0 swaps under v1.1.0, records ${swapRows.length} ambiguous swap candidates, and marks wallet-paid gas UNKNOWN because raw historical fee fields are absent. Coverage is PARTIAL; native internal transfers remain UNKNOWN.`;
  fs.writeFileSync(`evidence/v1.1-derived-${name}-report.json`, `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(`evidence/v1.1-derived-${name}-report.md`, reportMarkdown(report));
  fs.writeFileSync(`evidence/v1.1-derived-${name}-report.csv`, reportCsv(report));
}
